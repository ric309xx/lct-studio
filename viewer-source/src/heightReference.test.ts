import {expect,it,vi} from 'vitest';
import {Cartesian3,Cartographic,Matrix4,type Cesium3DTileset} from 'cesium';
import {webcrypto} from 'node:crypto';
import {HEIGHT_PROFILES,classifyHeightFrame,heightProfileForPath,heightProfileForModel,resolveModelHeight,orthometricToRenderHeight,renderToOrthometricHeight,sha256ArrayBuffer,type HeightProfile} from './heightReference';

const profile=():HeightProfile=>({...HEIGHT_PROFILES[0],renderFrame:'orthometric-as-ellipsoid'});
const tileset=()=>({modelMatrix:Matrix4.clone(Matrix4.IDENTITY),boundingSphere:{center:Cartesian3.fromDegrees(121.2078,24.9628,128)}} as Cesium3DTileset);
it('all private and ion Taoyuan models have provenance, controls and a local offset; no universal +20',()=>{
  expect(HEIGHT_PROFILES).toHaveLength(8);expect(new Set(HEIGHT_PROFILES.map(p=>p.tilesetPath)).size).toBe(8);
  for(const p of HEIGHT_PROFILES){expect(p.sourceVerticalDatum).toBe('EPSG:8904');expect(p.pairedControls).toBeGreaterThanOrEqual(3);expect(p.rootTilesetSha256).toMatch(/^[a-f0-9]{64}$/);}
  expect(heightProfileForPath('1015-cl2/tileset.json')?.id).toBe('1015-cl2');
  expect(heightProfileForPath('new-model/tileset.json')).toBeUndefined();
  expect(heightProfileForPath(undefined)?.id).toBe('1006');
  expect(new Set(HEIGHT_PROFILES.map(p=>p.offsetM)).size).toBeGreaterThanOrEqual(7);
});
it('includes 102-45 ion identity without an overlay URL and never falls back to the 1006 model',()=>{
  const p=heightProfileForModel({type:'cesium-ion',assetId:6000372});
  expect(p?.id).toBe('1007-ion-6000372');expect(p?.offsetM).toBeCloseTo(19.681,6);
  expect(p?.renderFrame).toBe('orthometric-as-ellipsoid');
  expect(heightProfileForModel({type:'cesium-ion',assetId:123})).toBeUndefined();
  expect(heightProfileForModel({type:'tileset-url',tilesetUrl:'known'},'1013-cl2/tileset.json')?.id).toBe('1013-cl2');
  const t=tileset(),r=resolveModelHeight(t,p,p!.rootTilesetSha256);
  expect(r.status).toBe('converted-local-controls');
  expect(renderToOrthometricHeight(orthometricToRenderHeight(128.3827,r)!,r)).toBeCloseTo(128.3827,6);
});
it('distinguishes raw orthometric tiles from already converted tiles and rejects mixed/insufficient observations',()=>{
  const refs=Array.from({length:5},(_,i)=>({orthometric:120+i,ellipsoidal:140+i}));
  expect(classifyHeightFrame(refs.map(p=>({...p,height:p.orthometric+.1})))).toBe('orthometric-as-ellipsoid');
  expect(classifyHeightFrame(refs.map(p=>({...p,height:p.ellipsoidal-.2})))).toBe('ellipsoidal');
  expect(classifyHeightFrame(refs.map((p,i)=>({...p,height:i<3?p.orthometric:p.ellipsoidal})))).toBe('unverified');
  expect(classifyHeightFrame(refs.map(p=>({...p,height:null})))).toBe('unverified');
  expect(classifyHeightFrame(refs.slice(0,2).map(p=>({...p,height:p.orthometric})))).toBe('unverified');
});
it('verifies model version, applies one rigid display correction, and round-trips public heights back to orthometric',()=>{
  const p=profile(),t=tileset(),source=Matrix4.clone(t.modelMatrix);
  const r=resolveModelHeight(t,p,p.rootTilesetSha256);expect(r.status).toBe('converted-local-controls');
  expect(r.appliedOffsetM).toBeCloseTo(19.6555,7);
  expect(renderToOrthometricHeight(orthometricToRenderHeight(128.5,r)!,r)).toBeCloseTo(128.5,9);
  expect(orthometricToRenderHeight(0,r)).toBeCloseTo(19.6555,7);
  const once=Matrix4.clone(t.modelMatrix);expect(resolveModelHeight(t,p,p.rootTilesetSha256)).toBe(r);expect(t.modelMatrix).toEqual(once);
  const a=Cartesian3.fromDegrees(121.2078,24.9628,128),b=Cartesian3.fromDegrees(121.2079,24.9629,135);
  const movedA=Matrix4.multiplyByPoint(t.modelMatrix,a,new Cartesian3()),movedB=Matrix4.multiplyByPoint(t.modelMatrix,b,new Cartesian3());
  expect(Cartesian3.distance(movedA,movedB)).toBeCloseTo(Cartesian3.distance(a,b),7);
  expect(Cartographic.fromCartesian(movedA).height-Cartographic.fromCartesian(a).height).toBeCloseTo(r.appliedOffsetM,5);
  expect(source).toEqual(Matrix4.IDENTITY);expect(Matrix4.getScale(t.modelMatrix,new Cartesian3())).toEqual(new Cartesian3(1,1,1));
  expect(()=>resolveModelHeight(t,{...p,gcpSha256:'other'},p.rootTilesetSha256)).toThrow(/不同高程版本/);
  expect(()=>resolveModelHeight(t,p,'changed-root')).toThrow(/不同高程版本/);
});
it('does not double-convert an ellipsoidal model, but can still display and export orthometric heights',()=>{
  const p={...profile(),renderFrame:'ellipsoidal' as const},t=tileset(),before=Matrix4.clone(t.modelMatrix);
  const r=resolveModelHeight(t,p,p.rootTilesetSha256);expect(r.status).toBe('already-ellipsoidal');expect(t.modelMatrix).toEqual(before);
  expect(r.appliedOffsetM).toBe(0);expect(renderToOrthometricHeight(150,r)).toBeCloseTo(130.3445,7);
});
it('missing evidence/unknown source/model mismatch stays pending, never substitutes a zero or +20',()=>{
  const p=profile();
  for(const [candidate,sha] of [[undefined,null],[p,'wrong'],[{...p,renderFrame:'unverified'},p.rootTilesetSha256],[{...p,pairedControls:2},p.rootTilesetSha256],[{...p,offsetM:NaN},p.rootTilesetSha256]] as Array<[HeightProfile|undefined,string|null]>){
    const t=tileset(),before=Matrix4.clone(t.modelMatrix),r=resolveModelHeight(t,candidate,sha);
    expect(r.status).toBe('pending');expect(t.modelMatrix).toEqual(before);
    expect(renderToOrthometricHeight(150,r)).toBeNull();expect(orthometricToRenderHeight(0,r)).toBeNull();
  }
  expect(renderToOrthometricHeight(150,null)).toBeNull();
  for(const candidate of [{...p,rangeM:NaN},{...p,rangeM:-1},{...p,pairedControls:NaN},{...p,conversionMethod:'unknown'},{...p,frameEvidence:''}]){
    expect(resolveModelHeight(tileset(),candidate,p.rootTilesetSha256).status).toBe('pending');
  }
});
it('uses a real SHA-256 of the fetched root bytes for the source-version guard',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  try{expect(await sha256ArrayBuffer(new TextEncoder().encode('abc').buffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');}
  finally{vi.unstubAllGlobals();}
});
