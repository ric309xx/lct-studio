import {expect,it} from "vitest";
import {Cartesian3,Cartographic,Entity,JulianDate,PolygonHierarchy,type Viewer} from "cesium";
import {createOccupancyUnderlay} from "./occupancyUnderlay";
const time=JulianDate.now();
const ring=(x:number,y:number,size:number)=>Cartesian3.fromDegreesArray([x,y,x+size,y,x+size,y+size,x,y+size]);
const hierarchy=()=>new PolygonHierarchy(ring(121.217,24.962,.0001),[new PolygonHierarchy(ring(121.21703,24.96203,.00002))]);
const building=(continuous=false)=>new Entity({id:"roof",properties:{displayWallContinuity:continuous},polygon:{hierarchy:hierarchy()}});
const viewer=(fn:(points:Cartographic[])=>(Cartographic|undefined)[])=>({clock:{currentTime:time},isDestroyed:()=>false,
  scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>fn(points)}} as unknown as Viewer);
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
