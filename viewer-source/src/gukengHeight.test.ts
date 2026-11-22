import {expect,it} from 'vitest';
import {Cartesian3,Cartographic,Matrix4,type Cesium3DTileset} from 'cesium';
import {GUKENG_HEIGHT,resolveGukengHeight,resolvedTilesetHeight,renderToOrthometricHeight} from './heightReference';

const point=()=>Cartesian3.fromDegrees(120.7074,23.5759,567.949);
const tileset=()=>({modelMatrix:Matrix4.clone(Matrix4.IDENTITY),boundingSphere:{center:point()}} as Cesium3DTileset);
it('rejects unknown model versions without moving geometry or publishing orthometric heights',()=>{
  for(const hash of [null,'wrong']){const t=tileset(),r=resolveGukengHeight(t,hash);
    expect(r.status).toBe('pending');expect(t.modelMatrix).toEqual(Matrix4.IDENTITY);expect(renderToOrthometricHeight(600,r)).toBeNull();}
});
it('converts the verified Gukeng source once and preserves lengths and source orthometric heights',()=>{
  const t=tileset(),a=point(),b=Cartesian3.add(a,new Cartesian3(12,8,20),new Cartesian3());
  const r=resolveGukengHeight(t,GUKENG_HEIGHT.rootSha256),movedA=Matrix4.multiplyByPoint(t.modelMatrix,a,new Cartesian3()),movedB=Matrix4.multiplyByPoint(t.modelMatrix,b,new Cartesian3());
  expect(r.status).toBe('converted-geoid-grid');expect(r.appliedOffsetM).toBeCloseTo(23.7870858048,8);
  expect(Cartesian3.distance(movedA,movedB)).toBeCloseTo(Cartesian3.distance(a,b),8);
  expect(renderToOrthometricHeight(Cartographic.fromCartesian(movedA).height,r)).toBeCloseTo(567.949,6);
  const once=Matrix4.clone(t.modelMatrix);expect(resolveGukengHeight(t,GUKENG_HEIGHT.rootSha256)).toBe(r);
  expect(t.modelMatrix).toEqual(once);expect(resolvedTilesetHeight(t)).toBe(r);
  expect(()=>resolveGukengHeight(t,'changed-root')).toThrow(/不同高程版本/);
});
