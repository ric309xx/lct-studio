import { BoundingSphere, CameraEventType, Cartesian3, HeadingPitchRange, Math as CesiumMath, Matrix4, ScreenSpaceEventHandler, ScreenSpaceEventType, Transforms, type Viewer } from "cesium";

/** Keep the parcel as the orbit/zoom origin instead of the globe or a picked roof. */
export function focusParcelOrbit(viewer: Viewer, target: Cartesian3, heading = 0, pitch = -65, range = 85) {
  viewer.camera.cancelFlight();
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 25), {
    duration: 0.9,
    offset: new HeadingPitchRange(heading, CesiumMath.toRadians(pitch), range),
    complete: () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.lookAtTransform(Matrix4.IDENTITY);
        viewer.scene.requestRender();
      }
    }
  });
}

export function tuneParcelNavigation(viewer: Viewer, getTarget: () => Cartesian3 | null = () => null, canFocus: () => boolean = () => true) {
  const controller = viewer.scene.screenSpaceCameraController;
  const original = { rotate: controller.rotateEventTypes, tilt: controller.tiltEventTypes, inertia: controller.inertiaSpin };
  const handler = new ScreenSpaceEventHandler(viewer.canvas);
  // Photogrammetry roofs and trees contribute to globeHeight. Collision
  // correction otherwise pushes the inspection camera above these surfaces.
  const collision = controller.enableCollisionDetection;
  controller.enableCollisionDetection = false;
  let selectedTarget: Cartesian3 | null = null;
  let orbiting = false;
  handler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
    if (!controller.enableInputs || orbiting || !canFocus()) return;
    let target: Cartesian3 | undefined;
    if (viewer.scene.pickPositionSupported) target = viewer.scene.pickPosition(event.position);
    if (!target) {
      const ray = viewer.camera.getPickRay(event.position);
      if (ray) target = viewer.scene.globe.pick(ray, viewer.scene);
    }
    if (!target || !Number.isFinite(Cartesian3.magnitude(target))) return;
    selectedTarget = Cartesian3.clone(target);
    const range = Math.max(0.5, Cartesian3.distance(viewer.camera.positionWC, target));
    focusParcelOrbit(viewer, target, viewer.camera.heading, CesiumMath.toDegrees(viewer.camera.pitch), range);
  }, ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(() => {
    const target = selectedTarget ?? getTarget();
    if (!target || !controller.enableInputs) return;
    viewer.camera.cancelFlight();
    viewer.camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(target));
    // Only middle-drag uses the parcel frame. Left drag, right drag, wheel,
    // touch and their speeds otherwise retain Cesium's original controls.
    controller.rotateEventTypes = CameraEventType.MIDDLE_DRAG;
    controller.tiltEventTypes = undefined;
    controller.inertiaSpin = 0;
    orbiting = true;
  }, ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(() => {
    if (!orbiting) return;
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    controller.rotateEventTypes = original.rotate;
    controller.tiltEventTypes = original.tilt;
    controller.inertiaSpin = original.inertia;
    orbiting = false;
    viewer.scene.requestRender();
  }, ScreenSpaceEventType.MIDDLE_UP);
  return () => {
    controller.enableCollisionDetection = collision;
    handler.destroy();
  };
}
