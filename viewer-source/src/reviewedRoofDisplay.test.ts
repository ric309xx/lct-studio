import {it,expect} from 'vitest';
import {Cartesian3,Cartographic,Entity,JulianDate,PolygonHierarchy,type Viewer} from 'cesium';
import {reviewedRoofHierarchy,reviewedRoofHeight,suppressRawRoofAnalysis} from './reviewedRoofDisplay';
import {createOccupancyUnderlay} from './occupancyUnderlay';
const time=JulianDate.now();
const original=new PolygonHierarchy(Cartesian3.fromDegreesArray([121.2,24.9,121.2001,24.9,121.2001,24.9001,121.2,24.9001]));
const coords=[[[121.2,24.9],[121.20008,24.9],[121.20008,24.90008],[121.2,24.90008],[121.2,24.9]],[[121.20002,24.90002],[121.20003,24.90002],[121.20002,24.90003],[121.20002,24.90002]]];
const make=()=>new Entity({polygon:{hierarchy:original},properties:{displaySmoothCoordinates:coords,displayRoofPlane:[121.2,24.9,137.5,.1,.2],displayRoofOnly:true,
  modelRoofSamples:[[121.2,24.9,137.5]],modelGroundAnchors:[[121.2,24.9,135],[121.2001,24.9,135]]}});
it('uses the smoothed display ring and holes only with explicit approval, never mutating measured XY',()=>{
  const b=make();
  expect(reviewedRoofHierarchy(b,time)).toBe(original);
  expect(reviewedRoofHeight(b,Cartographic.fromDegrees(121.2,24.9))).toBeNull();
  b.properties!.addProperty('displayCleanRoofSurface',true);
  const shown=reviewedRoofHierarchy(b,time);
  expect(shown.positions).toHaveLength(4);expect(shown.holes).toHaveLength(1);
  expect(shown.holes[0].positions).toHaveLength(3);
  expect(b.polygon!.hierarchy!.getValue(time)).toBe(original);
  expect(reviewedRoofHeight(b,Cartographic.fromDegrees(121.2,24.9))).toBe(137.5);
});
it('draws a fitted sheet without extruded teeth, even when mesh repair was enabled',async()=>{
  const b=make();b.properties!.addProperty('displayCleanRoofSurface',true);b.properties!.addProperty('displayMeshHeightRepair',true);
  let calls=0;
  const viewer={clock:{currentTime:time},isDestroyed:()=>false,scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>{calls++;return points.map(p=>{p.height=135.02;return p;});}}} as unknown as Viewer;
  const result=await createOccupancyUnderlay(viewer,b,135.02,()=>false,{actualSurface:true});
  expect(calls).toBe(1);
  const polygon=result[0].polygon!,h=polygon.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(polygon.extrudedHeight?.getValue(time)).toBeUndefined();
  expect(h.holes).toHaveLength(1);
  h.positions.forEach(p=>{const c=Cartographic.fromCartesian(p);expect(c.height).toBeCloseTo(reviewedRoofHeight(b,c)!+.02+.12,4);});
  expect(b.polygon!.hierarchy!.getValue(time)).toBe(original);
});
it('does not draw explicitly suppressed isolated display fragments',async()=>{
  const b=make();b.properties!.addProperty('displaySuppressSmallFragment',true);
  expect(await createOccupancyUnderlay({} as Viewer,b,135,()=>false)).toEqual([]);
});
it('suppresses only explicitly opted-in analysis duplicates, not other cases or display sheets',()=>{
  const raw=new Entity({properties:{analysisOnly:true}});
  expect(suppressRawRoofAnalysis(raw)).toBe(false);
  raw.properties!.addProperty('displaySuppressRawAnalysis',true);
  expect(suppressRawRoofAnalysis(raw)).toBe(true);
  expect(suppressRawRoofAnalysis(new Entity({properties:{displaySuppressRawAnalysis:true,analysisOnly:false}}))).toBe(false);
});
