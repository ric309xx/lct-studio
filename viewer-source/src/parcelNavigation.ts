import { BoundingSphere, CameraEventType, Cartesian3, Ellipsoid, HeadingPitchRange, Math as CesiumMath, Matrix4, OrthographicFrustum, ScreenSpaceEventHandler, ScreenSpaceEventType, Transforms, type Camera, type Viewer } from "cesium";

/** Cesium recalculates orthographic width when switching orbit frames. Keep
 * the current zoom on both middle-down and release, including the first use.
 */
export function setOrbitFrame(camera:Camera,frame:Matrix4):void{
  const frustum=camera.frustum;
  const width=frustum instanceof OrthographicFrustum?frustum.width:undefined;
  camera.lookAtTransform(frame);
  if(width!==undefined&&(frustum instanceof OrthographicFrustum))frustum.width=width;
}

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

export function tuneParcelNavigation(viewer: Viewer, getTarget: () => Cartesian3 | null = () => null, canFocus: () => boolean = () => true, onManualInput:()=>void=()=>{}) {
  const controller = viewer.scene.screenSpaceCameraController;
  const original = { rotate: controller.rotateEventTypes, tilt: controller.tiltEventTypes, inertia: controller.inertiaSpin, axis: viewer.camera.constrainedAxis };
  const handler = new ScreenSpaceEventHandler(viewer.canvas);
  // Photogrammetry roofs and trees contribute to globeHeight. Collision
  // correction otherwise pushes the inspection camera above these surfaces.
  const collision = controller.enableCollisionDetection;
  controller.enableCollisionDetection = false;
  const wheel=(event:WheelEvent)=>{
    const camera=viewer.camera,frustum=camera.frustum;
    if(!(frustum instanceof OrthographicFrustum)||!controller.enableInputs||controller.enableZoom===false||!frustum.width||!frustum.aspectRatio)return;
    const rect=viewer.canvas.getBoundingClientRect();
    if(!rect.width||!rect.height||!Number.isFinite(event.deltaY)||event.deltaY===0)return;
    // Native orthographic zoom re-estimates width from roof/ground depth on
    // the first wheel tick. Change only the existing frustum instead, so no
    // intermediate pose, roof-height snap, or competing native inertia occurs.
    event.preventDefault();event.stopImmediatePropagation();onManualInput();camera.cancelFlight();
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
    const width=Math.max(2,Math.min(1e7,frustum.width*Math.exp(Math.max(-.35,Math.min(.35,pixels*.0015)))));
    const delta=frustum.width-width;
    const x=(event.clientX-rect.left)/rect.width-.5,y=.5-(event.clientY-rect.top)/rect.height;
    const shift=Cartesian3.add(Cartesian3.multiplyByScalar(camera.rightWC,x*delta,new Cartesian3()),
      Cartesian3.multiplyByScalar(camera.upWC,y*delta/frustum.aspectRatio,new Cartesian3()),new Cartesian3());
    const local=Matrix4.multiplyByPointAsVector(Matrix4.inverseTransformation(camera.transform,new Matrix4()),shift,new Cartesian3());
    Cartesian3.add(camera.position,local,camera.position);frustum.width=width;
    viewer.scene.requestRender();
  };
  viewer.canvas.addEventListener('wheel',wheel,{capture:true,passive:false});
  viewer.canvas.addEventListener('pointerdown',onManualInput);
  let selectedTarget: Cartesian3 | null = null;
  let selectedParcelTarget = getTarget();
  let orbiting = false;
  const removeLevelListener = viewer.scene.postUpdate.addEventListener(() => keepCameraLevel(viewer.camera));
  const releaseOrbit = () => {
    if (!orbiting) return;
    setOrbitFrame(viewer.camera,Matrix4.IDENTITY);
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
    selectedParcelTarget = getTarget();
    const range = Math.max(0.5, Cartesian3.distance(viewer.camera.positionWC, target));
    focusParcelOrbit(viewer, target, viewer.camera.heading, CesiumMath.toDegrees(viewer.camera.pitch), range);
  }, ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(() => {
    // 同區換地號不重建 Viewer；清除上一筆地號的臨時旋轉中心。
    if (getTarget() !== selectedParcelTarget) {
      selectedTarget = null;
      selectedParcelTarget = getTarget();
    }
    const target = selectedTarget ?? getTarget();
    if (!target || !controller.enableInputs) return;
    viewer.camera.cancelFlight();
    setOrbitFrame(viewer.camera,Transforms.eastNorthUpToFixedFrame(target));
    viewer.camera.constrainedAxis = Cartesian3.UNIT_Z;
    // Only middle-drag uses the parcel frame. Orthographic wheel zoom above
    // preserves the projection; other input modes retain native controls.
    controller.rotateEventTypes = CameraEventType.MIDDLE_DRAG;
    controller.tiltEventTypes = undefined;
    controller.inertiaSpin = 0;
    orbiting = true;
  }, ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(releaseOrbit, ScreenSpaceEventType.MIDDLE_UP);
  const dispose = () => {
    viewer.canvas.removeEventListener('wheel',wheel,true);
    viewer.canvas.removeEventListener('pointerdown',onManualInput);
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
  return Object.assign(dispose,{resetFocus:()=>{
    releaseOrbit();
    selectedTarget=null;selectedParcelTarget=getTarget();
    viewer.camera.cancelFlight();
  }});
}
