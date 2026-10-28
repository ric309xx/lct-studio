import {Cartesian2,Cartesian3,Entity,Matrix4,SceneTransforms,Transforms,type Viewer} from 'cesium';
import {afterEach,expect,it,vi} from 'vitest';
import {createMeasurementEditor,validMeasurementEdit,type EditableMeasurement} from './measurementEditor';
afterEach(()=>{vi.restoreAllMocks();});
const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(121.2,25,140));
const point=(x:number,y:number,z=0)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,z),new Cartesian3());
it('rejects overlapping, degenerate and self-crossing area edits but accepts concave rings',()=>{
  const p=(xy:number[][])=>xy.map(([x,y])=>point(x,y));
  expect(validMeasurementEdit('area',p([[0,0],[10,0],[10,10],[0,10]]))).toBe(true);
  expect(validMeasurementEdit('area',p([[0,0],[10,10],[10,0],[0,10]]))).toBe(false);
  expect(validMeasurementEdit('area',p([[0,0],[10,0],[20,0]]))).toBe(false);
  expect(validMeasurementEdit('area',p([[0,0],[10,0],[10,2],[2,2],[2,10],[0,10]]))).toBe(true);
  expect(validMeasurementEdit('distance',[point(0,0),point(0,0)])).toBe(false);
  expect(validMeasurementEdit('distance',[point(0,0),point(0,0,10)])).toBe(true);
});
function setup(kind:'distance'|'area',enabled=true){
  const positions=kind==='area'?[point(0,0),point(10,0),point(0,10)]:[point(0,0),point(10,0)];
  const record:EditableMeasurement={kind,index:0,positions,points:positions.map(position=>new Entity({position}))};
  vi.spyOn(SceneTransforms,'worldToWindowCoordinates').mockImplementation((_scene,p)=>new Cartesian2(p===positions[0]?100:200,100));
  let release:FrameRequestCallback|undefined;
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(fn=>{release=fn;return 1;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
  const camera={position:point(20,20,30),direction:new Cartesian3(0,0,-1),up:new Cartesian3(0,1,0),right:new Cartesian3(1,0,0),cancelFlight:vi.fn()};
  const controller={enableInputs:true,inertiaSpin:.9,inertiaTranslate:.8,inertiaZoom:.7};
  const canvas=document.createElement('canvas'),requestRender=vi.fn();document.body.appendChild(canvas);
  const viewer={canvas,camera,scene:{screenSpaceCameraController:controller,requestRender},isDestroyed:()=>false} as unknown as Viewer;
  const options={records:()=>[record],enabled:()=>enabled,pick:vi.fn(()=>point(-2,-2)),onChange:vi.fn(),onFinish:vi.fn(),onInvalid:vi.fn()};
  const editor=createMeasurementEditor(viewer,options);
  const pointer=(type:string,x=110,y=110,target:EventTarget=canvas)=>{
    const event=new MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true});
    Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event);return event;
  };
  const down=(x=104)=>pointer('pointerdown',x,100),move=()=>pointer('pointermove'),up=()=>pointer('pointerup');
  return {editor,record,controller,options,canvas,camera,pointer,down,move,up,release:()=>release?.(0)};
}
it.each(['area','distance'] as const)('edits a completed %s point, updates results and restores camera input after release',kind=>{
  const p=setup(kind),before=p.record.positions[0].clone();p.down();
  expect(p.editor.isDragging()).toBe(true);expect(p.controller.enableInputs).toBe(false);
  p.move();expect(p.record.positions[0]).not.toEqual(before);expect(p.options.onChange).toHaveBeenCalledWith(p.record);
  p.up();expect(p.options.onFinish).toHaveBeenCalledWith(p.record);p.release();
  expect(p.editor.isDragging()).toBe(false);expect(p.controller).toEqual({enableInputs:true,inertiaSpin:.9,inertiaTranslate:.8,inertiaZoom:.7});
  p.editor.dispose();
});
it('leaves navigation alone when away from a point or another drawing tool is active',()=>{
  const p=setup('area');p.down(300);expect(p.editor.isDragging()).toBe(false);expect(p.controller.enableInputs).toBe(true);p.editor.dispose();
  const blocked=setup('distance',false);blocked.down();expect(blocked.editor.isDragging()).toBe(false);blocked.editor.dispose();
});
it('keeps the last valid point on a sky hit or an invalid edit, and unlocks on release outside the canvas',()=>{
  const p=setup('area'),before=p.record.positions[0].clone();p.down();
  p.options.pick.mockReturnValueOnce(undefined as unknown as Cartesian3);p.move();expect(p.record.positions[0]).toEqual(before);
  p.options.pick.mockReturnValueOnce(p.record.positions[1]);p.move();expect(p.options.onInvalid).toHaveBeenCalledOnce();expect(p.record.positions[0]).toEqual(before);
  p.pointer('pointerup',110,110,window);p.release();expect(p.controller.enableInputs).toBe(true);
  p.down();p.editor.dispose();expect(p.controller.enableInputs).toBe(true);p.down();expect(p.editor.isDragging()).toBe(false);
});
it('isolates point edits from the camera event listeners, while unrelated pointer input still reaches them',()=>{
  const p=setup('distance'),nativeCamera=vi.fn();p.canvas.addEventListener('pointerdown',nativeCamera);
  p.down(300);expect(nativeCamera).toHaveBeenCalledOnce();p.down();expect(nativeCamera).toHaveBeenCalledOnce();
  const saved=p.camera.position.clone();p.camera.position.x+=1;p.move();expect(p.camera.position).toEqual(saved);
  p.up();p.release();p.editor.dispose();p.canvas.remove();
});
