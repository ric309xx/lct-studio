import { BoundingSphere, CameraEventType, Cartesian3, Ellipsoid, HeadingPitchRange, Math as CesiumMath, Matrix4, ScreenSpaceEventHandler, ScreenSpaceEventType, Transforms, type Camera, type Viewer } from "cesium";

/** Remove roll without changing position, look direction, pitch or orbit pivot.
 * Use world geodetic up, then convert back into the current camera frame.
 * Setting roll=0 in a temporary ENU frame is not the same as a level horizon.
 */
export function keepCameraLevel(camera: Camera): void {
  const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(camera.positionWC, new Cartesian3());
  const right = Cartesian3.cross(camera.directionWC, normal, new Cartesian3());
  // At exact nadir the horizon/roll is undefined: preserve the current heading.
  if (Cartesian3.magnitudeSquared(right) < 1e-8) return;
  Cartesian3.normalize(right, right);
  const up = Cartesian3.normalize(Cartesian3.cross(right, camera.directionWC, new Cartesian3()), new Cartesian3());
  const inverse = Matrix4.inverseTransformation(camera.transform, new Matrix4());
  Matrix4.multiplyByPointAsVector(inverse, right, camera.right);
  Matrix4.multiplyByPointAsVector(inverse, up, camera.up);
}

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
  const original = { rotate: controller.rotateEventTypes, tilt: controller.tiltEventTypes, inertia: controller.inertiaSpin, axis: viewer.camera.constrainedAxis };
  const handler = new ScreenSpaceEventHandler(viewer.canvas);
  // Photogrammetry roofs and trees contribute to globeHeight. Collision
  // correction otherwise pushes the inspection camera above these surfaces.
  const collision = controller.enableCollisionDetection;
  controller.enableCollisionDetection = false;
  let selectedTarget: Cartesian3 | null = null;
  let orbiting = false;
  const removeLevelListener = viewer.scene.postUpdate.addEventListener(() => keepCameraLevel(viewer.camera));
  const releaseOrbit = () => {
    if (!orbiting) return;
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.constrainedAxis = original.axis;
    controller.rotateEventTypes = original.rotate;
    controller.tiltEventTypes = original.tilt;
    controller.inertiaSpin = original.inertia;
    orbiting = false;
    keepCameraLevel(viewer.camera);
    viewer.scene.requestRender();
  };
  // A release outside the canvas or a focus loss must not strand the local frame.
  const releaseOutside = (event: MouseEvent) => { if (event.button === 1) releaseOrbit(); };
  window.addEventListener("mouseup", releaseOutside);
  window.addEventListener("blur", releaseOrbit);
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
    viewer.camera.constrainedAxis = Cartesian3.UNIT_Z;
    // Only middle-drag uses the parcel frame. Left drag, right drag, wheel,
    // touch and their speeds otherwise retain Cesium's original controls.
    controller.rotateEventTypes = CameraEventType.MIDDLE_DRAG;
    controller.tiltEventTypes = undefined;
    controller.inertiaSpin = 0;
    orbiting = true;
  }, ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(releaseOrbit, ScreenSpaceEventType.MIDDLE_UP);
  return () => {
    removeLevelListener();
    window.removeEventListener("mouseup", releaseOutside);
    window.removeEventListener("blur", releaseOrbit);
    // Viewer teardown may already have destroyed the camera/scene.
    controller.rotateEventTypes = original.rotate;
    controller.tiltEventTypes = original.tilt;
    controller.inertiaSpin = original.inertia;
    viewer.camera.constrainedAxis = original.axis;
    controller.enableCollisionDetection = collision;
    handler.destroy();
  };
}
