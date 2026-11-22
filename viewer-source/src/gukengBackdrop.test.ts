import {afterEach,expect,it,vi} from 'vitest';
import {Cartesian3,ClippingPolygonCollection,Matrix4,Transforms,type Viewer} from 'cesium';
import {installGukengBackdrop} from './gukengBackdrop';

afterEach(()=>vi.restoreAllMocks());
const ring=[[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,0]];
const rings=()=>({completed:[ring],unperformed:[ring.map(([x,y,z])=>[x+30,y,z])]});
const frame=()=>Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(120,23,500));
function viewer(){return {isDestroyed:()=>false,canvas:{dataset:{}},scene:{globe:{show:true,clippingPolygons:undefined},requestRender:vi.fn()}} as unknown as Viewer;}

it('clips only the inside of displayed survey footprints, without moving the source model or hiding the globe',()=>{
  vi.spyOn(ClippingPolygonCollection,'isSupported').mockReturnValue(true);
  const v=viewer(),m=frame(),before=Matrix4.clone(m),input=rings(),original=JSON.stringify(input),control=installGukengBackdrop(v,m,input)!;
  control.update(true,['completed','unperformed']);
  const collection=v.scene.globe.clippingPolygons!;
  expect(collection.inverse).toBe(false);expect(collection.enabled).toBe(true);expect(collection.length).toBe(2);
  expect(Cartesian3.distance(collection.get(0).positions[0],Matrix4.multiplyByPoint(m,Cartesian3.ZERO,new Cartesian3()))).toBeLessThan(1e-6);
  control.update(true,['completed']);expect(collection.length).toBe(1);
  control.update(true,[]);expect(collection.enabled).toBe(false);
  control.update(false,['completed','unperformed']);expect(collection.enabled).toBe(false);
  expect(v.scene.globe.show).toBe(true);expect(m).toEqual(before);expect(JSON.stringify(input)).toBe(original);
  control.dispose();expect(v.scene.globe.clippingPolygons).toBeUndefined();expect(collection.isDestroyed()).toBe(true);
  expect(v.canvas.dataset.gukengBackdrop).toBeUndefined();control.dispose();
});
it('leaves unsupported or already owned background clipping unchanged',()=>{
  const supported=vi.spyOn(ClippingPolygonCollection,'isSupported').mockReturnValue(false),v=viewer();
  expect(installGukengBackdrop(v,frame(),rings())).toBeNull();expect(v.scene.globe.clippingPolygons).toBeUndefined();
  supported.mockReturnValue(true);const other=new ClippingPolygonCollection();v.scene.globe.clippingPolygons=other;
  expect(installGukengBackdrop(v,frame(),rings())).toBeNull();expect(v.scene.globe.clippingPolygons).toBe(other);expect(other.isDestroyed()).toBe(false);other.destroy();
});
it('cleanup never removes a background collection installed later by another feature',()=>{
  vi.spyOn(ClippingPolygonCollection,'isSupported').mockReturnValue(true);
  const v=viewer(),control=installGukengBackdrop(v,frame(),rings())!,old=v.scene.globe.clippingPolygons!;
  const other=new ClippingPolygonCollection();v.scene.globe.clippingPolygons=other;control.dispose();
  expect(v.scene.globe.clippingPolygons).toBe(other);expect(other.isDestroyed()).toBe(false);expect(old.isDestroyed()).toBe(true);other.destroy();
});
