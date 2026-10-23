import {expect,it} from "vitest";
import {Cartesian3,Cartographic,Entity,JulianDate,PolygonHierarchy,type Viewer} from "cesium";
import {createOccupancyUnderlay,retainsReviewedRoofSkin} from "./occupancyUnderlay";
const time=JulianDate.now();
const ring=(x:number,y:number,size:number)=>Cartesian3.fromDegreesArray([x,y,x+size,y,x+size,y+size,x,y+size]);
const hierarchy=()=>new PolygonHierarchy(ring(121.217,24.962,.0001),[new PolygonHierarchy(ring(121.21703,24.96203,.00002))]);
const building=(continuous=false)=>new Entity({id:"roof",properties:{displayWallContinuity:continuous},polygon:{hierarchy:hierarchy()}});
const viewer=(fn:(points:Cartographic[])=>(Cartographic|undefined)[])=>({clock:{currentTime:time},isDestroyed:()=>false,
  scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>fn(points)}} as unknown as Viewer);
it('keeps reviewed thin roof skins with mesh classification, without lifting them to a tree canopy',async()=>{
  const b=new Entity({id:'255-roof',polygon:{hierarchy:hierarchy()},properties:{displayWallContinuity:true,displayRoofOnly:true,displayContinuousRoofSkin:true,displayMeshHeightRepair:true,
    modelGroundAnchors:[[121.217,24.962,100],[121.2171,24.962,100],[121.217,24.9621,100]],modelRoofSamples:[[121.217,24.962,104],[121.2171,24.9621,104]]}});
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=points.length===3?120:150;return p;})),b,120,()=>false,{actualSurface:true});
  expect(retainsReviewedRoofSkin(b)).toBe(true);
  const skin=result[0].polygon!,h=skin.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.holes).toHaveLength(1);
  for(const p of h.positions)expect(Cartographic.fromCartesian(p).height).toBeCloseTo(124.2,4);
  expect(skin.extrudedHeight!.getValue(time)).toBeCloseTo(123.82,4);
  expect(retainsReviewedRoofSkin(new Entity({properties:{displayContinuousRoofSkin:true,displayRoofOnly:false}}))).toBe(false);
});
it("keeps pole exclusion holes empty in the repair volume",async()=>{
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=138;return p;})),building(),128,()=>false);
  const polygon=result[0].polygon!,h=polygon.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.holes).toHaveLength(1);expect(h.holes[0].positions).toHaveLength(4);
  expect(polygon.extrudedHeight!.getValue(time)).toBe(128);
  for(const p of [...h.positions,...h.holes[0].positions])expect(Cartographic.fromCartesian(p).height).toBeCloseTo(137.94,4);
});
it("densifies and bridges recess hits only for the requested wall-continuity targets",async()=>{
  const result=await createOccupancyUnderlay(viewer(points=>points.map((p,i)=>{p.height=i%3===0?128:138;return p;})),building(true),128,()=>false);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.positions.length).toBeGreaterThan(4);expect(h.holes).toHaveLength(1);
  // Every original exclusion remains, with continuous levels instead of ground spikes.
  for(const p of h.positions)expect(Cartographic.fromCartesian(p).height).toBeCloseTo(137.94,4);
});
it("does not add a repair volume when no roof is supported or a switch cancels sampling",async()=>{
  const v=viewer(points=>points.map(p=>{p.height=128;return p;}));
  expect(await createOccupancyUnderlay(v,building(true),128,()=>false)).toEqual([]);
  expect(await createOccupancyUnderlay(v,building(),128,()=>true)).toEqual([]);
});
it("uses nearby upper roofs above a low awning without moving footprint vertices or holes",async()=>{
  const b=building(true),v=viewer(points=>points.map(p=>{
    // The known footprint edge only sees the awning; nearby inward rays see roof.
    const h=b.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
    const edge=Cartographic.fromCartesian(h.positions[0]);
    p.height=p.longitude < edge.longitude - 0.00000001 ? 146 : 132;
    return p;
  }));
  const before=await createOccupancyUnderlay(v,b,128,()=>false);
  const after=await createOccupancyUnderlay(v,b,128,()=>false,{nearbyRoofProbeMeters:2});
  const oldRing=before[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  const newRing=after[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(newRing.holes).toHaveLength(oldRing.holes.length);
  for(const [ring,old] of [[newRing,oldRing],[newRing.holes[0],oldRing.holes[0]]]) {
    expect(ring.positions).toHaveLength(old.positions.length);
    ring.positions.forEach((position,index)=>{
      const a=Cartographic.fromCartesian(position),b=Cartographic.fromCartesian(old.positions[index]);
      expect(a.longitude).toBeCloseTo(b.longitude,12);expect(a.latitude).toBeCloseTo(b.latitude,12);
    });
  }
  expect(Cartographic.fromCartesian(newRing.positions[0]).height).toBeCloseTo(146.05,4);
  expect(Cartographic.fromCartesian(oldRing.positions[0]).height).toBeCloseTo(131.94,4);
});
it("ignores a single isolated tall nearby hit",async()=>{
  const b=building(true);
  const v=viewer(points=>points.map((p,i)=>{p.height=i===points.length-1?160:132;return p;}));
  const result=await createOccupancyUnderlay(v,b,128,()=>false,{nearbyRoofProbeMeters:2});
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  for(const p of h.positions)expect(Cartographic.fromCartesian(p).height).toBeCloseTo(132.05,4);
});
it("低棚只採樣地面校準，不讓上方樹冠抬高屋頂且保留平面孔洞",async()=>{
  const b=building(true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120],[121.2171,24.9621,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118],[121.2162,24.961,118]]);
  let calls=0;
  const v=viewer(points=>{calls++;expect(points).toHaveLength(3);return points.map(p=>{p.height=140;return p;});});
  const result=await createOccupancyUnderlay(v,b,140,()=>false);
  expect(calls).toBe(1);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.holes).toHaveLength(1);
  for(const p of h.positions)expect(Cartographic.fromCartesian(p).height).toBeCloseTo(142.12,4);
});
it("模型屋頂校準不可靠時不擅自改用最高樹冠",async()=>{
  const b=building(true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  expect(await createOccupancyUnderlay(viewer(points=>points.map((p,i)=>{p.height=i?150:140;return p;})),b,140,()=>false)).toEqual([]);
});
it("confirmed low awnings get a closed roof skin without colouring the ground-to-roof wall",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120],[121.2171,24.9621,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=140;return p;})),b,140,()=>false);
  const polygon=result[0].polygon!,h=polygon.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(polygon.closeTop!.getValue(time)).toBe(true);
  expect(polygon.closeBottom!.getValue(time)).toBe(true);
  expect(polygon.extrudedHeight!.getValue(time)).toBeCloseTo(141.82,4);
  for(const point of h.positions)expect(Cartographic.fromCartesian(point).height).toBeCloseTo(142.12,4);
});
it("keeps a confirmed skin when a minority of road probes hit vehicles",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",Array.from({length:5},(_,i)=>[121.216+i*.0001,24.961,118]));
  const hits=[140,140.1,139.9,144,145];
  const result=await createOccupancyUnderlay(viewer(points=>points.map((p,i)=>{p.height=hits[i];return p;})),b,140,()=>false);
  expect(result).toHaveLength(1);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(Cartographic.fromCartesian(h.positions[0]).height).toBeCloseTo(142.12,4);
});
it("reconciles reviewed repair heights with nearby mesh without changing XY or exclusions",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayMeshHeightRepair",true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  let calls=0;
  const v=viewer(points=>{calls++;return points.map(p=>{p.height=calls===1?140:142.5;return p;});});
  const result=await createOccupancyUnderlay(v,b,140,()=>false);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(calls).toBe(2);expect(h.holes).toHaveLength(1);
  for(const point of [...h.positions,...h.holes[0].positions])expect(Cartographic.fromCartesian(point).height).toBeCloseTo(142.7,4);
  const original=b.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(Cartographic.fromCartesian(h.positions[0]).longitude).toBeCloseTo(Cartographic.fromCartesian(original.positions[0]).longitude,12);
  expect(Cartographic.fromCartesian(h.positions[0]).latitude).toBeCloseTo(Cartographic.fromCartesian(original.positions[0]).latitude,12);
});
it("does not raise a low canopy to an unrelated roof or sign hit",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayMeshHeightRepair",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  let calls=0;
  const result=await createOccupancyUnderlay(viewer(points=>{calls++;return points.map(p=>{p.height=calls===1?140:145;return p;});}),b,140,()=>false);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  for(const point of h.positions)expect(Cartographic.fromCartesian(point).height).toBeCloseTo(142.2,4);
});
it("calibrates the real-surface stencil without resampling unrelated roofs",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("displayMeshHeightRepair",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  let calls=0;
  const result=await createOccupancyUnderlay(viewer(points=>{calls++;expect(points).toHaveLength(2);return points.map(p=>{p.height=140;return p;});}),b,140,()=>false,{actualSurface:true});
  expect(calls).toBe(1);
  expect(result[0].properties!.classificationFloorHeight.getValue()).toBeCloseTo(141.1,4);
  expect(result[0].properties!.classificationCeilingHeight.getValue()).toBeCloseTo(142.8,4);
});
it("uses reviewed sign source heights with the same datum offset, not the awning plane",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  b.properties!.addProperty("displayHeightRangeSourceZ",[119.3,121.2]);
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=140;return p;})),b,140,()=>false,{actualSurface:true});
  expect(result[0].properties!.classificationFloorHeight.getValue()).toBeCloseTo(141.3,4);
  expect(result[0].properties!.classificationCeilingHeight.getValue()).toBeCloseTo(143.2,4);
  const h=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.holes).toHaveLength(1);
});
it("rejects inverted display ranges and falls back to calibrated supported heights",async()=>{
  const b=building(true);
  b.properties!.addProperty("displayRoofOnly",true);
  b.properties!.addProperty("modelRoofSamples",[[121.217,24.962,120]]);
  b.properties!.addProperty("modelGroundAnchors",[[121.216,24.961,118],[121.2161,24.961,118]]);
  b.properties!.addProperty("displayHeightRangeSourceZ",[125,119]);
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=140;return p;})),b,140,()=>false,{actualSurface:true});
  expect(result[0].properties!.classificationFloorHeight.getValue()).toBeCloseTo(141.1,4);
  expect(result[0].properties!.classificationCeilingHeight.getValue()).toBeCloseTo(142.8,4);
});
it('lowers only the reviewed fascia stencil, not its roof skin or horizontal hierarchy',async()=>{
  const b=building(true);
  b.properties!.addProperty('displayRoofOnly',true);
  b.properties!.addProperty('modelRoofSamples',[[121.217,24.962,137.5]]);
  b.properties!.addProperty('modelGroundAnchors',[[121.216,24.961,135.28],[121.2161,24.961,135.28]]);
  b.properties!.addProperty('displayHeightRangeSourceZ',[135.6,138.7]);
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=135.3;return p;})),b,135.3,()=>false,{actualSurface:true});
  expect(result[0].properties!.classificationFloorHeight.getValue()).toBeCloseTo(135.62,4);
  expect(result[0].properties!.classificationCeilingHeight.getValue()).toBeCloseTo(138.72,4);
  const polygon=result[0].polygon!,h=polygon.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(polygon.extrudedHeight!.getValue(time)).toBeCloseTo(137.34,4);
  expect(h.holes).toHaveLength(1);
  const original=b.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  const a=Cartographic.fromCartesian(h.positions[0]),before=Cartographic.fromCartesian(original.positions[0]);
  expect(a.longitude).toBeCloseTo(before.longitude,12);expect(a.latitude).toBeCloseTo(before.latitude,12);
});
it('includes the lower building only for an explicitly reviewed ground projection, keeping roof and XY unchanged',async()=>{
  const b=building(true);
  b.properties!.addProperty('displayClassifyToGround',true);
  b.properties!.addProperty('modelRoofSamples',[[121.217,24.962,120]]);
  b.properties!.addProperty('modelGroundAnchors',[[121.216,24.961,118],[121.2161,24.961,118]]);
  const before=b.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  const result=await createOccupancyUnderlay(viewer(points=>points.map(p=>{p.height=140;return p;})),b,140,()=>false,{actualSurface:true});
  expect(result[0].properties!.classificationFloorHeight.getValue()).toBeCloseTo(140.02,4);
  expect(result[0].properties!.classificationCeilingHeight.getValue()).toBeCloseTo(142.8,4);
  const after=result[0].polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  const a=Cartographic.fromCartesian(before.positions[0]),c=Cartographic.fromCartesian(after.positions[0]);
  expect(c.longitude).toBeCloseTo(a.longitude,12);expect(c.latitude).toBeCloseTo(a.latitude,12);
  expect(c.height).toBeCloseTo(142.12,4);
});
