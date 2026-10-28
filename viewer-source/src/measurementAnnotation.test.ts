import {Cartesian2,Cartesian3,Event as CesiumEvent,SceneTransforms,type Viewer} from 'cesium';
import {afterEach,expect,it,vi} from 'vitest';
import {createMeasurementAnnotation} from './measurementAnnotation';
afterEach(()=>{vi.restoreAllMocks();document.body.replaceChildren();});
function setup(){
  const container=document.createElement('div'),canvas=document.createElement('canvas');container.appendChild(canvas);document.body.appendChild(container);
  Object.defineProperties(canvas,{clientWidth:{value:1000},clientHeight:{value:800}});
  const postRender=new CesiumEvent(),requestRender=vi.fn();
  const viewer={canvas,container,scene:{postRender,requestRender},camera:{positionWC:new Cartesian3(0,0,0),directionWC:new Cartesian3(1,0,0)},isDestroyed:()=>false} as unknown as Viewer;
  const project=vi.spyOn(SceneTransforms,'worldToWindowCoordinates').mockReturnValue(new Cartesian2(100,100));
  return {viewer,postRender,project};
}
it('places both kinds of labels in a non-interactive DOM layer above the WebGL canvas',()=>{
  const {viewer,postRender}=setup();
  const clearArea=createMeasurementAnnotation(viewer,'area',()=>new Cartesian3(10,0,0),()=> '平面面積 1\n10.00 m²');
  const clearDistance=createMeasurementAnnotation(viewer,'distance',()=>new Cartesian3(10,0,0),()=> '距離 5.00 m');
  const layer=document.querySelector<HTMLElement>('.measurement-label-layer')!;
  expect(layer.style.zIndex).toBe('10');expect(layer.style.pointerEvents).toBe('none');expect(layer.children).toHaveLength(2);
  const area=layer.querySelector<HTMLElement>('.measurement-scene-label-area')!;
  expect(area.textContent).toBe('平面面積 1\n10.00 m²');expect(area.style.color).toBe('rgb(86, 199, 255)');
  expect(area.style.backgroundColor).toBe('');expect(area.style.boxShadow).toBe('');
  expect(area.style.webkitTextStroke).toContain('3px');expect(area.style.paintOrder).toBe('stroke fill');
  expect(area.style.top).toBe('82px');expect(area.style.fontSize).toBe('12px');
  clearArea();expect(layer.children).toHaveLength(1);clearDistance();clearDistance();
  expect(document.querySelector('.measurement-label-layer')).toBeNull();expect(postRender.numberOfListeners).toBe(0);
});
it('moves and updates text after point editing, hides offscreen/behind-camera anchors and cleans up listeners',()=>{
  const {viewer,postRender,project}=setup();let value='距離 5.00 m',position=new Cartesian3(10,0,0);
  const clear=createMeasurementAnnotation(viewer,'distance',()=>position,()=>value),label=document.querySelector<HTMLElement>('.measurement-scene-label-distance')!;
  value='距離 7.00 m';project.mockReturnValue(new Cartesian2(200,220));postRender.raiseEvent();
  expect(label.textContent).toBe(value);expect(label.style.left).toBe('200px');expect(label.style.top).toBe('202px');
  position=new Cartesian3(-10,0,0);postRender.raiseEvent();expect(label.hidden).toBe(true);
  position=new Cartesian3(10,0,0);project.mockReturnValue(new Cartesian2(2000,220));postRender.raiseEvent();expect(label.hidden).toBe(true);
  project.mockReturnValue(new Cartesian2(200,220));postRender.raiseEvent();expect(label.hidden).toBe(false);clear();
});
