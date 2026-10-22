import {it,expect} from 'vitest';
import {Cartographic,Entity,JulianDate,PolygonHierarchy} from 'cesium';
import {roofProjectionPrism} from './roofProjectionPrism';
const rings=[[[121.2,24.9,137.5],[121.20005,24.9,137.6],[121.20005,24.90005,137.7],[121.2,24.90005,137.6],[121.2,24.9,137.5]],
  [[121.20001,24.90001,137.55],[121.20002,24.90001,137.55],[121.20001,24.90002,137.55],[121.20001,24.90001,137.55]]];
const make=()=>new Entity({id:'roof',properties:{displayGroundProjectionVolume:true,displayGroundProjectionRings:rings,parcelKey:'255-149'}});
it('projects clean outside/inside walls to the same local road surface, not a constant zero or raw source datum',()=>{
  const b=make(),before=JSON.stringify(rings),time=JulianDate.now();
  const road=(lon:number,lat:number)=>135.3+(lon-121.2*Math.PI/180)*10000+(lat-24.9*Math.PI/180)*5000;
  const result=roofProjectionPrism(b,.02,road);
  expect(result).toHaveLength(3);
  for(const e of result.slice(0,-1)){
    const w=e.wall!,p=w.positions!.getValue(time),min=w.minimumHeights!.getValue(time),max=w.maximumHeights!.getValue(time);
    expect(p.length).toBeGreaterThan(4);
    p.forEach((v:Parameters<typeof Cartographic.fromCartesian>[0],i:number)=>{const c=Cartographic.fromCartesian(v);expect(min[i]).toBeCloseTo(road(c.longitude,c.latitude),8);expect(max[i]).toBeGreaterThan(min[i]+1);});
    expect(e.properties!.kind.getValue()).toBe('occupancy-roof-underlay');
    expect(e.properties!.projectedAreaM2).toBeUndefined();
  }
  const bottom=result.at(-1)!.polygon!,h=bottom.hierarchy!.getValue(time) as PolygonHierarchy;
  expect(h.holes).toHaveLength(1);
  for(const p of h.positions){const c=Cartographic.fromCartesian(p);expect(c.height).toBeCloseTo(road(c.longitude,c.latitude)+.015,5);}
  expect(JSON.stringify(rings)).toBe(before);
});
it('requires explicit approval and valid below-roof ground heights',()=>{
  expect(roofProjectionPrism(new Entity(),0,()=>135)).toEqual([]);
  expect(roofProjectionPrism(make(),NaN,()=>135)).toEqual([]);
  expect(roofProjectionPrism(make(),0,()=>NaN)).toEqual([]);
  expect(roofProjectionPrism(make(),0,()=>140)).toEqual([]);
});
