import {expect,it,vi} from 'vitest';
import {Cartesian2,Cartesian3,Cartographic,EntityCollection,JulianDate,ScreenSpaceEventHandler,ScreenSpaceEventType,Event as CesiumEvent,type Viewer,type Cesium3DTileset} from 'cesium';
import {pickSurveyPosition,selectSurveyPoint} from './surveyPicking';
const model={show:true} as Cesium3DTileset;
function fixture(){
  const overlay={show:true},hidden={show:false},entity={},cadastral={},primitives=[model,overlay,hidden];
  return {overlay,hidden,entity,cadastral,isDestroyed:()=>false,
    entities:{values:[entity]},dataSources:{length:1,get:()=>({entities:{values:[cadastral]}})},
    scene:{drillPick:vi.fn(),pick:vi.fn(()=>({primitive:model})),pickPositionSupported:true,
      pickPosition:vi.fn(()=>Cartesian3.fromDegrees(121,25,120)),
      pickFromRay:vi.fn(()=>({object:{primitive:model},position:Cartesian3.fromDegrees(121,25,150)})),
      primitives:{length:primitives.length,get:(i:number)=>primitives[i]},requestRender:vi.fn(),
      globe:{show:true,pick:vi.fn(()=>Cartesian3.fromDegrees(121,25,120))}},camera:{getPickRay:vi.fn(()=>({}))}};
}
it('uses the actual camera-ray surface rather than a flat/depth-buffer position',()=>{
  const v=fixture(),p=pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)!;
  expect(p.source).toBe('model');expect(p.model).toBe(model);
  expect(Cartographic.fromCartesian(p.position).height).toBeCloseTo(150,6);
  expect(v.scene.pickPosition).not.toHaveBeenCalled();expect(v.scene.drillPick).not.toHaveBeenCalled();
  v.scene.pickFromRay.mockReturnValue({object:{primitive:model},position:Cartesian3.fromDegrees(121,25,135)});
  const road=pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)!;
  expect(Cartographic.fromCartesian(p.position).height-Cartographic.fromCartesian(road.position).height).toBeCloseTo(15,6);
});
it('requires loaded model ownership and never measures a background reference as a model',()=>{
  const v=fixture();v.scene.pickFromRay.mockReturnValue({object:{primitive:{} as Cesium3DTileset},position:Cartesian3.fromDegrees(121,25,150)});
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)).toBeUndefined();
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model])?.source).toBe('terrain');
});
it('supports tile content owners but rejects invalid surface coordinates',()=>{
  const v=fixture();v.scene.pickFromRay.mockReturnValue({object:{content:{tileset:model}},position:Cartesian3.fromDegrees(121,25,150)} as never);
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)?.source).toBe('model');
  v.scene.pickFromRay.mockReturnValue({object:{primitive:model},position:new Cartesian3(NaN,0,0)});
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)).toBeUndefined();
});
it('never treats sky or failed picking as a zero coordinate',()=>{
  const v=fixture();v.camera.getPickRay.mockReturnValue(undefined as never);
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model])).toBeUndefined();
  v.camera.getPickRay.mockReturnValue({});v.scene.pickFromRay.mockImplementation(()=>{throw Error('depth unavailable');});
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model])).toBeUndefined();
  expect(v.scene.globe.show).toBe(true);expect(v.overlay.show).toBe(true);expect(v.hidden.show).toBe(false);expect(model.show).toBe(true);
});
it('picks through cadastral/green underlays and labels without changing their final visibility',()=>{
  const v=fixture();v.scene.pickFromRay.mockImplementation((_ray?:unknown,excluded?:unknown[])=>{
    expect(v.scene.globe.show).toBe(false);expect(v.overlay.show).toBe(false);expect(v.hidden.show).toBe(false);expect(model.show).toBe(true);
    expect(excluded).toEqual(expect.arrayContaining([v.entity,v.cadastral,v.scene.globe]));
    return {object:{primitive:model},position:Cartesian3.fromDegrees(121,25,150)};
  });
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)?.source).toBe('model');
  expect(v.scene.globe.show).toBe(true);expect(v.overlay.show).toBe(true);expect(v.hidden.show).toBe(false);
  expect(v.scene.pickPosition).not.toHaveBeenCalled();
});
it('keeps a parent collection containing a model visible during offscreen sampling',()=>{
  const v=fixture(),nested={show:true,length:1,get:()=>model};v.scene.primitives={length:1,get:()=>nested} as never;
  v.scene.pickFromRay.mockImplementation(()=>{expect(nested.show).toBe(true);expect(model.show).toBe(true);return {object:{primitive:model},position:Cartesian3.fromDegrees(121,25,150)};});
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)?.model).toBe(model);expect(nested.show).toBe(true);
});
it('guards the private API and reads public depth before the pick pass on older engines',()=>{
  const v=fixture();Object.assign(v.scene,{pickFromRay:undefined});
  v.scene.pick.mockImplementation(()=>{v.scene.pickPosition.mockReturnValue(Cartesian3.fromDegrees(121,25,50));return {primitive:model};});
  const p=pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)!;
  expect(Cartographic.fromCartesian(p.position).height).toBeCloseTo(120,6);
  v.scene.pick.mockReturnValue({primitive:{} as Cesium3DTileset});
  expect(pickSurveyPosition(v as unknown as Viewer,new Cartesian2(),[model],true)).toBeUndefined();
});
it('pins exactly one marker on click and ignores mouse motion, camera changes and leaving the canvas',()=>{
  const canvas=document.createElement('canvas'),changed=new CesiumEvent(),point=vi.fn(),entities=new EntityCollection();
  const v=fixture(),viewer={...v,canvas,entities,camera:{...v.camera,changed}} as unknown as Viewer;
  const set=vi.spyOn(ScreenSpaceEventHandler.prototype,'setInputAction'),destroy=vi.spyOn(ScreenSpaceEventHandler.prototype,'destroy');
  try{
    let allowed=true;const controller=selectSurveyPoint(viewer,()=>[model],point,()=>allowed);
    expect(set.mock.calls.some(call=>call[1]===ScreenSpaceEventType.MOUSE_MOVE)).toBe(false);
    const click=set.mock.calls.find(call=>call[1]===ScreenSpaceEventType.LEFT_CLICK)![0] as (event:{position:Cartesian2})=>void;
    click({position:new Cartesian2(100,100)});expect(point).toHaveBeenCalledOnce();expect(entities.values).toHaveLength(1);
    const marker=entities.values[0],initial=marker.position!.getValue(JulianDate.now());expect(marker.name).toBe('座標選取點');expect(marker.point?.pixelSize?.getValue()).toBe(13);
    canvas.dispatchEvent(new MouseEvent('mousemove'));changed.raiseEvent();canvas.dispatchEvent(new Event('mouseleave'));
    expect(point).toHaveBeenCalledOnce();expect(marker.position!.getValue(JulianDate.now())).toEqual(initial);
    allowed=false;click({position:new Cartesian2(200,200)});expect(point).toHaveBeenCalledOnce();
    allowed=true;v.scene.pickFromRay.mockReturnValue({object:{primitive:model},position:Cartesian3.fromDegrees(121,25,160)});
    click({position:new Cartesian2(200,200)});expect(entities.values).toEqual([marker]);expect(point).toHaveBeenCalledTimes(2);
    expect(Cartographic.fromCartesian(marker.position!.getValue(JulianDate.now())!).height).toBeCloseTo(160,6);
    v.scene.pickFromRay.mockReturnValue(undefined as never);click({position:new Cartesian2(300,300)});
    expect(point).toHaveBeenLastCalledWith(undefined);expect(entities.values).toEqual([marker]);
    controller.clear();expect(entities.values).toHaveLength(0);
    controller.dispose();controller.dispose();expect(destroy).toHaveBeenCalledOnce();expect(changed.numberOfListeners).toBe(0);
  }finally{vi.restoreAllMocks();}
});
it('removes the selected marker when the mode closes',()=>{
  const v=fixture(),entities=new EntityCollection(),viewer={...v,canvas:document.createElement('canvas'),entities} as unknown as Viewer;
  const set=vi.spyOn(ScreenSpaceEventHandler.prototype,'setInputAction');
  try{
    const controller=selectSurveyPoint(viewer,()=>[model],vi.fn());
    const click=set.mock.calls.find(call=>call[1]===ScreenSpaceEventType.LEFT_CLICK)![0] as (event:{position:Cartesian2})=>void;
    click({position:new Cartesian2()});expect(entities.values).toHaveLength(1);
    controller.dispose();expect(entities.values).toHaveLength(0);
  }finally{vi.restoreAllMocks();}
});
