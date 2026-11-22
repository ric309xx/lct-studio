import {afterEach,expect,it,vi} from 'vitest';
import {Camera,CameraEventType,Cartesian3,EntityCollection,GeographicProjection,Matrix4,OrthographicFrustum,SceneMode,Transforms,type Viewer} from 'cesium';
import {focusGukengPoint,installGukengNavigation,isGukengFocusClick} from './gukengNavigation';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();document.body.replaceChildren();});
function setup(){
  const canvas=document.createElement('canvas');document.body.append(canvas);
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800} as DOMRect);
  Object.defineProperties(canvas,{clientWidth:{value:1000},clientHeight:{value:800}});
  const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:1000,drawingBufferHeight:800,pixelRatio:1,mapProjection:new GeographicProjection()} as never);
  camera.setView({destination:Cartesian3.fromDegrees(120.6,23.6,250),orientation:{heading:.2,pitch:-.6,roll:0}});
  const target=Cartesian3.fromDegrees(120.6001,23.6001,160);
  const controller={enableInputs:true,enableCollisionDetection:true,rotateEventTypes:CameraEventType.LEFT_DRAG,zoomEventTypes:CameraEventType.WHEEL,inertiaSpin:.9,inertiaZoom:.8};
  const viewer={camera,canvas,isDestroyed:()=>false,entities:new EntityCollection(),scene:{screenSpaceCameraController:controller,pickPositionSupported:true,pickTranslucentDepth:false,
    pick:vi.fn(()=>({primitive:{}})),pickPosition:vi.fn(()=>target),requestRender:vi.fn()}} as unknown as Viewer;
  return {viewer,camera,canvas,target,controller};
}
function pointer(target:EventTarget,type:string,x:number,y:number,button=0){
  const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{clientX:x,clientY:y,button,pointerId:1,isPrimary:true,pointerType:'mouse'});target.dispatchEvent(event);return event;
}
it('aims at the picked point while preserving camera position, zoom and the subsequent orbit pivot',()=>{
  const {viewer,camera,target}=setup(),position=Cartesian3.clone(camera.positionWC),range=Cartesian3.distance(position,target);
  focusGukengPoint(viewer,target,{duration:0});
  expect(Cartesian3.distance(camera.positionWC,position)).toBeLessThan(1e-7);
  expect(Cartesian3.distance(Matrix4.getTranslation(camera.transform,new Cartesian3()),target)).toBeLessThan(1e-7);
  const expected=Cartesian3.normalize(Cartesian3.subtract(target,position,new Cartesian3()),new Cartesian3());
  expect(Cartesian3.dot(camera.directionWC,expected)).toBeCloseTo(1,10);
  camera.rotateRight(.3);
  expect(Cartesian3.distance(camera.positionWC,target)).toBeCloseTo(range,6);
  expect(Cartesian3.distance(camera.positionWC,position)).toBeGreaterThan(1);
});
it('keeps orthographic zoom when setting a new rotation centre',()=>{
  const {viewer,camera,target}=setup();camera.frustum=new OrthographicFrustum({width:120,aspectRatio:1.25});
  focusGukengPoint(viewer,target,{duration:0});expect((camera.frustum as OrthographicFrustum).width).toBe(120);
});
it('accepts a left tap, rejects a drag returning to its origin, and yields to measurement tools',()=>{
  vi.stubGlobal('matchMedia',()=>({matches:true}));const {viewer,canvas,controller}=setup();let allowed=true;
  const notice=vi.fn(),nav=installGukengNavigation(viewer,()=>allowed,notice);
  pointer(canvas,'pointerdown',400,300);pointer(window,'pointerup',400,300);
  expect(viewer.scene.pickPosition).toHaveBeenCalledTimes(1);expect(viewer.entities.values).toHaveLength(1);
  expect(notice).toHaveBeenLastCalledWith('已對準點選位置，拖曳即可繞此點旋轉。');
  pointer(canvas,'pointerdown',400,300);pointer(canvas,'pointermove',700,600);pointer(window,'pointerup',400,300);
  expect(viewer.scene.pickPosition).toHaveBeenCalledTimes(1);
  allowed=false;pointer(canvas,'pointerdown',400,300);pointer(window,'pointerup',400,300);
  expect(viewer.scene.pickPosition).toHaveBeenCalledTimes(1);
  nav.dispose();expect(controller.enableCollisionDetection).toBe(true);expect(controller.inertiaSpin).toBe(.9);expect(viewer.entities.values).toHaveLength(0);
});
it('right drag pans the camera and pivot together without changing their distance or firing point focus',()=>{
  const {viewer,camera,target,canvas}=setup();camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(target));
  const distance=Cartesian3.distance(camera.positionWC,target),before=Cartesian3.clone(camera.positionWC),nav=installGukengNavigation(viewer);
  pointer(canvas,'pointerdown',400,300,2);pointer(canvas,'pointermove',450,330,2);pointer(window,'pointerup',450,330,2);
  const pivot=Matrix4.getTranslation(camera.transform,new Cartesian3());
  expect(Cartesian3.distance(camera.positionWC,pivot)).toBeCloseTo(distance,6);
  expect(Cartesian3.distance(camera.positionWC,before)).toBeGreaterThan(1);expect(viewer.scene.pickPosition).not.toHaveBeenCalled();nav.dispose();
});
it('does not mistake a large movement for a click even if the release point matches',()=>{
  expect(isGukengFocusClick([1,2],[1,2],100)).toBe(false);expect(isGukengFocusClick([1,2],[2,3],2)).toBe(true);
});
