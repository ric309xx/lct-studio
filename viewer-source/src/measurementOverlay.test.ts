import {Cartesian3,Primitive,PrimitiveCollection,type Viewer,type GeometryInstance,PolylineGeometry} from 'cesium';
import {expect,it,vi} from 'vitest';
import {createMeasurementOverlay} from './measurementOverlay';
function setup(kind:'distance'|'area'){
  const primitives=new PrimitiveCollection(),requestRender=vi.fn();
  const viewer={isDestroyed:()=>false,scene:{primitives,requestRender}} as unknown as Viewer;
  const overlay=createMeasurementOverlay(viewer,kind),collection=primitives.get(0) as PrimitiveCollection;
  return {overlay,collection,primitives,requestRender};
}
const points=()=>[Cartesian3.fromDegrees(121.2,25,140),Cartesian3.fromDegrees(121.2001,25,141),Cartesian3.fromDegrees(121.2,25.0001,142)];
it('renders area fill and a closed straight outline through model/terrain without modifying coordinates',()=>{
  const {overlay,collection}=setup('area'),p=points(),before=p.map(p=>p.clone());overlay.update(p);
  expect(collection.length).toBe(2);
  for(let i=0;i<collection.length;i++){
    const primitive=collection.get(i) as Primitive;
    expect(primitive.allowPicking).toBe(false);
    expect(primitive.appearance!.renderState).toMatchObject({depthTest:{enabled:false},depthMask:false,cull:{enabled:false}});
  }
  const line=collection.get(1) as Primitive,instance=line.geometryInstances as GeometryInstance;
  expect(instance.geometry).toBeInstanceOf(PolylineGeometry);
  const geometry=PolylineGeometry.createGeometry(instance.geometry as unknown as PolylineGeometry)!;
  expect(geometry).toBeDefined();expect(p).toEqual(before);
  overlay.dispose();
});
it('replaces geometry on undo or distance endpoint edits rather than accumulating overlays',()=>{
  const {overlay,collection,primitives}=setup('distance'),p=points();overlay.update(p.slice(0,2));
  const previous=collection.get(0) as Primitive;expect(collection.length).toBe(1);
  overlay.update(p);expect(previous.isDestroyed()).toBe(true);expect(collection.length).toBe(1);
  overlay.update(p.slice(0,1));expect(collection.length).toBe(0);
  overlay.dispose();overlay.dispose();expect(primitives.length).toBe(0);
});
it('supports selection highlight and safely clears after the scene is destroyed',()=>{
  const {overlay,collection,primitives}=setup('area');overlay.update(points());
  const previous=collection.get(0) as Primitive;overlay.highlight(true);
  expect(previous.isDestroyed()).toBe(true);expect(collection.length).toBe(2);
  const current=collection.get(0);overlay.highlight(true);expect(collection.get(0)).toBe(current);
  primitives.destroy();expect(()=>{overlay.dispose();overlay.update(points());}).not.toThrow();
});
it('does not create a fill for fewer than three points or a degenerate ring',()=>{
  const {overlay,collection}=setup('area'),p=points();overlay.update(p.slice(0,2));expect(collection.length).toBe(1);
  overlay.update([p[0],p[0],p[0]]);expect(collection.length).toBeLessThanOrEqual(1);overlay.dispose();
});
