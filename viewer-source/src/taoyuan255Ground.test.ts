import {describe,it,expect} from 'vitest';
import {Cartographic,type Viewer} from 'cesium';
import {taoyuan255Ground as data,taoyuan255Position,sampleTaoyuan255Offset} from './taoyuan255Ground';
import {readFileSync} from 'node:fs';
import {heightProfileForModel} from './heightReference';
import parcels from './taoyuan1010Parcels.json';
describe('255 four-parcel road surface',()=>{
  it('keeps 255-149 road heights in the converted 1010-cl2 model frame without applying N twice',async()=>{
    const parcel=parcels.find(p=>p.key==='sanzuwu-jiushe-255-149')!;
    const profile=heightProfileForModel({type:'tileset-url',tilesetUrl:'verified-private-model'},parcel.tilesetPath)!;
    expect(profile.id).toBe('1010-cl2');expect(profile.offsetM).toBeCloseTo(19.681,6);
    const before=JSON.stringify(data),n=profile.offsetM!;
    const viewer={scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>points.map((p,i)=>{p.height=data.probes[i][2]+n;return p;})}} as unknown as Viewer;
    const offset=await sampleTaoyuan255Offset(viewer),source=data.probes[0];
    expect(offset).toBeCloseTo(n,6);
    expect(Cartographic.fromCartesian(taoyuan255Position(source,offset)).height).toBeCloseTo(source[2]+n+data.displayLiftM,5);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('preserves each CAD area while replacing one flat height with local road cells',()=>{
    expect(data.components).toHaveLength(6);expect(data.nodes.length).toBeGreaterThan(100);
    expect(Math.max(...data.nodes.map(p=>p[2]))-Math.min(...data.nodes.map(p=>p[2]))).toBeGreaterThan(1);
    for(const area of Object.values(data.areas))expect(area.partitionAreaM2).toBeCloseTo(area.originalAreaM2,6);
    for(const c of data.components){expect(c.boundary[0]).toEqual(c.boundary.at(-1));expect(c.pieces.length).toBeGreaterThan(0);}
  });
  it('calibrates mesh/source heights with majority consensus and rejects sparse probes',async()=>{
    const mock=(sparse=false)=>({scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>points.map((p,i)=>{p.height=sparse&&i>2?NaN:data.probes[i][2]+(i<4?25:20);return p;})}} as unknown as Viewer);
    expect(await sampleTaoyuan255Offset(mock())).toBe(20);
    await expect(sampleTaoyuan255Offset(mock(true))).rejects.toThrow('採樣不足');
    const p=data.probes[0];expect(Cartographic.fromCartesian(taoyuan255Position(p,20)).height).toBeCloseTo(p[2]+20.35,5);
  });
  it('enables thin skins only on reviewed roofs and keeps source/published overlays identical',()=>{
    const relative='overlays/taoyuan-1010-v1/1010-cl2-02.geojson';
    const source=readFileSync(new URL('../public/'+relative,import.meta.url),'utf8');
    expect(source).toBe(readFileSync(new URL('../../3d-viewer/'+relative,import.meta.url),'utf8'));
    const roofs=JSON.parse(source).features.filter((f:any)=>f.properties.kind==='occupancy-display');
    expect(roofs).toHaveLength(5);
    for(const f of roofs){expect(f.properties.displayContinuousRoofSkin).toBe(true);expect(f.properties.displayRoofOnly).toBe(true);expect(f.properties.projectedAreaM2).toBe(0);}
  });
  it('extends the reviewed 255-149 metal side above road while keeping its own display area unmeasured',()=>{
    const relative='overlays/taoyuan-1010-v1/1010-cl2-02.geojson';
    const data=JSON.parse(readFileSync(new URL('../public/'+relative,import.meta.url),'utf8'));
    const targets=data.features.filter((f:any)=>f.properties.displayHeightRangeSourceZ);
    expect(targets).toHaveLength(1);
    const target=targets[0];
    expect(target.properties.analysisRegion).toBe('255-149-gray-awning-front-extension');
    expect(target.properties.displayHeightRangeSourceZ).toEqual([135.6,138.3]);
    expect(target.properties.projectedAreaM2).toBe(0);
    expect(target.properties.displayOnlyProjectionM2).toBeCloseTo(.9714601114740598,10);
    expect(135.6-Math.max(...target.properties.modelGroundAnchors.map((p:number[])=>p[2]))).toBeGreaterThan(.3);
  });
  it('keeps clean 255-149 display geometry separate from measured polygons and hides only the small visual sliver',()=>{
    const relative='overlays/taoyuan-1010-v1/1010-cl2-02.geojson';
    const json=JSON.parse(readFileSync(new URL('../public/'+relative,import.meta.url),'utf8'));
    const roofs=json.features.filter((f:any)=>f.properties.kind==='occupancy-display'&&f.properties.parcelNo==='255-149');
    for(const f of roofs){expect(f.properties.displayCleanRoofSurface).toBe(true);expect(f.properties.displayRoofPlane).toHaveLength(5);expect(f.properties.displayMeshHeightRepair).toBe(false);}
    expect(roofs.filter((f:any)=>f.properties.displaySuppressSmallFragment).map((f:any)=>f.id)).toEqual(['display-1010-255-149-3']);
    for(const f of json.features.filter((f:any)=>f.properties.kind==='occupancy-building'))expect(f.properties.displaySmoothCoordinates).toBeUndefined();
    for(const f of json.features.filter((f:any)=>f.properties.kind==='occupancy-building'&&f.properties.parcelNo==='255-149'))expect(f.properties.displaySuppressRawAnalysis).toBe(true);
    const prisms=roofs.filter((f:any)=>f.properties.displayGroundProjectionVolume);
    expect(prisms.map((f:any)=>f.id)).toEqual(['display-1010-255-149-7']);
    expect(prisms[0].properties.displayGroundProjectionRings).toHaveLength(1);
  });
});
