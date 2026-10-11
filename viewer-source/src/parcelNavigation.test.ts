import { describe, expect, it, vi } from "vitest";
import { CameraEventType, Cartesian3, Ellipsoid, Event as CesiumEvent, Matrix4, Transforms, type Camera, type Viewer } from "cesium";
import { focusParcelOrbit, keepCameraLevel, tuneParcelNavigation } from "./parcelNavigation";
const basis = () => ({positionWC:Cartesian3.fromDegrees(121.217,24.962,160),directionWC:new Cartesian3(1,0,0),transform:Matrix4.IDENTITY,right:new Cartesian3(),up:new Cartesian3()});

describe("parcel orbit navigation", () => {
  it("centers a clicked surface and uses it as the next middle-button pivot", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const target = Cartesian3.fromDegrees(121.217, 24.962, 135);
    const transform = vi.fn(), flight = vi.fn();
    const controller = { enableInputs: true, enableCollisionDetection: true };
    const viewer = { canvas, camera: { ...basis(), cancelFlight: vi.fn(), lookAtTransform: transform,
      flyToBoundingSphere: flight, positionWC: Cartesian3.fromDegrees(121.217, 24.962, 160), heading: 0.3, pitch: -0.8 },
      scene: { postUpdate:new CesiumEvent(), screenSpaceCameraController: controller, pickPositionSupported: true,
        pickPosition: () => target, requestRender: vi.fn() }
    } as unknown as Viewer;
    let allowed = false;
    const dispose = tuneParcelNavigation(viewer, () => null, () => allowed);
    const click = () => {
      canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true }));
    };
    click();
    expect(flight).not.toHaveBeenCalled();
    allowed = true;
    click();
    expect(flight.mock.calls[0][0].center).toEqual(target);
    expect(flight.mock.calls[0][1].offset.range).toBeCloseTo(25);
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true }));
    expect(transform.mock.calls.at(-1)![0]).not.toEqual(Matrix4.IDENTITY);
    expect(controller.enableCollisionDetection).toBe(false);
    dispose();
    expect(controller.enableCollisionDetection).toBe(true);
    canvas.remove();
  });
  it("preserves the original controls and uses the parcel frame only while middle is pressed", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const controller = { enableInputs: true, rotateEventTypes: CameraEventType.LEFT_DRAG,
      tiltEventTypes: CameraEventType.MIDDLE_DRAG, inertiaSpin: 0.9, zoomFactor: 5, inertiaZoom: 0.8 };
    const transform = vi.fn();
    const viewer = { canvas, camera: { ...basis(), cancelFlight: vi.fn(), lookAtTransform: transform },
      scene: { postUpdate:new CesiumEvent(), screenSpaceCameraController: controller, requestRender: vi.fn() }
    } as unknown as Viewer;
    const dispose = tuneParcelNavigation(viewer, () => Cartesian3.fromDegrees(121.217,24.962,128));
    expect(controller.rotateEventTypes).toBe(CameraEventType.LEFT_DRAG);
    expect(controller.zoomFactor).toBe(5);
    expect(controller.inertiaZoom).toBe(0.8);
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true }));
    expect(controller.rotateEventTypes).toBe(CameraEventType.MIDDLE_DRAG);
    expect(transform).toHaveBeenCalledOnce();
    document.dispatchEvent(new MouseEvent("mouseup", { button: 1, bubbles: true }));
    expect(controller.rotateEventTypes).toBe(CameraEventType.LEFT_DRAG);
    expect(controller.tiltEventTypes).toBe(CameraEventType.MIDDLE_DRAG);
    expect(controller.inertiaSpin).toBe(0.9);
    expect(transform).toHaveBeenLastCalledWith(Matrix4.IDENTITY);
    // Continuous correction stays registered after release, not just on click.
    expect(viewer.scene.postUpdate.numberOfListeners).toBe(1);
    dispose();
    expect(viewer.scene.postUpdate.numberOfListeners).toBe(0);
    canvas.remove();
  });
  it("levels a tilted camera in world and temporary parcel frames without moving it",()=>{
    const position=Cartesian3.fromDegrees(121.217,24.962,160);
    const normal=Ellipsoid.WGS84.geodeticSurfaceNormal(position,new Cartesian3());
    const direction=Cartesian3.normalize(Cartesian3.add(Cartesian3.negate(normal,new Cartesian3()),Cartesian3.UNIT_Z,new Cartesian3()),new Cartesian3());
    for(const transform of [Matrix4.IDENTITY,Transforms.eastNorthUpToFixedFrame(position)]) {
      const camera={...basis(),positionWC:position,directionWC:direction,transform} as unknown as Camera;
      keepCameraLevel(camera);
      const worldRight=Matrix4.multiplyByPointAsVector(transform,camera.right,new Cartesian3());
      const worldUp=Matrix4.multiplyByPointAsVector(transform,camera.up,new Cartesian3());
      expect(Cartesian3.dot(normal,worldRight)).toBeCloseTo(0,12);
      expect(Cartesian3.dot(direction,worldUp)).toBeCloseTo(0,12);
      expect(Cartesian3.dot(normal,worldUp)).toBeGreaterThan(0);
      expect(camera.positionWC).toEqual(position);expect(camera.directionWC).toEqual(direction);
    }
  });
  it("restores the original frame and controls when focus is lost during an orbit",()=>{
    const canvas=document.createElement("canvas");document.body.appendChild(canvas);
    const controller={enableInputs:true,rotateEventTypes:CameraEventType.LEFT_DRAG,inertiaSpin:.9};
    const transform=vi.fn();
    const viewer={canvas,camera:{...basis(),cancelFlight:vi.fn(),lookAtTransform:transform},
      scene:{postUpdate:new CesiumEvent(),screenSpaceCameraController:controller,requestRender:vi.fn()}} as unknown as Viewer;
    const dispose=tuneParcelNavigation(viewer,()=>Cartesian3.fromDegrees(121.217,24.962,128));
    canvas.dispatchEvent(new MouseEvent("mousedown",{button:1,bubbles:true}));
    window.dispatchEvent(new Event("blur"));
    expect(transform).toHaveBeenLastCalledWith(Matrix4.IDENTITY);
    expect(controller.rotateEventTypes).toBe(CameraEventType.LEFT_DRAG);expect(controller.inertiaSpin).toBe(.9);
    dispose();canvas.remove();
  });
  it("frames the parcel then returns to the original camera controls", () => {
    const target = Cartesian3.fromDegrees(121.21695555, 24.961801831, 128.5);
    const transform = vi.fn();
    const flight = vi.fn();
    const render = vi.fn();
    const viewer = { isDestroyed: () => false,
      camera: { cancelFlight: vi.fn(), lookAtTransform: transform, flyToBoundingSphere: flight },
      scene: { requestRender: render }
    } as unknown as Viewer;
    focusParcelOrbit(viewer, target);
    expect(transform).toHaveBeenCalledWith(Matrix4.IDENTITY);
    const [sphere, options] = flight.mock.calls[0];
    expect(Cartesian3.distance(sphere.center, target)).toBeLessThan(0.001);
    options.complete();
    expect(Matrix4.equals(transform.mock.calls.at(-1)![0], Matrix4.IDENTITY)).toBe(true);
    expect(render).toHaveBeenCalledOnce();
  });
  it("does not reattach a flight to a destroyed viewer", () => {
    const transform = vi.fn(), flight = vi.fn();
    const viewer = { isDestroyed: () => true,
      camera: { cancelFlight: vi.fn(), lookAtTransform: transform, flyToBoundingSphere: flight },
      scene: { requestRender: vi.fn() }
    } as unknown as Viewer;
    focusParcelOrbit(viewer, Cartesian3.fromDegrees(121.217, 24.962, 128));
    flight.mock.calls[0][1].complete();
    expect(transform).toHaveBeenCalledTimes(1);
  });
});
