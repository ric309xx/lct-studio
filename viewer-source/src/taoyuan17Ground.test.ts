import {describe,it,expect} from 'vitest';
import {Cartographic,type Viewer} from 'cesium';
import {taoyuan17Ground,taoyuan17ProfileHeight,taoyuan17Position,sampleTaoyuan17Offset} from './taoyuan17Ground';
import oldParcels from './taoyuan1013Parcels.json';

describe('17-1 road-following display without changing cadastral XY',()=>{
  it('partitions all four original CAD components and retains total area',()=>{
    expect(taoyuan17Ground.components).toHaveLength(4);
    expect(taoyuan17Ground.components.reduce((n,c)=>n+c.pieces.length,0)).toBeGreaterThan(100);
    expect(taoyuan17Ground.partitionAreaM2).toBeCloseTo(taoyuan17Ground.originalAreaM2,6);
    const heights=taoyuan17Ground.profile.map(p=>p[1]);
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(3);
    for(const [lat,h] of taoyuan17Ground.profile)expect(taoyuan17ProfileHeight(lat)).toBeCloseTo(h,6);
    for(const component of taoyuan17Ground.components)expect(component.boundary[0]).toEqual(component.boundary.at(-1));
  });
  it('applies calibrated height datum and small display clearance, not raw TWVD2001',async()=>{
    const viewer={scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>points.map((p,i)=>{p.height=taoyuan17Ground.probes[i][2]+(i<4?25:20);return p;})}} as unknown as Viewer;
    const offset=await sampleTaoyuan17Offset(viewer);expect(offset).toBe(20);
    const p=taoyuan17Ground.probes[0],c=Cartographic.fromCartesian(taoyuan17Position(p,offset));
    expect(c.height).toBeCloseTo(p[2]+20+.35,5);
  });
  it('rejects sparse calibration rather than accepting a vehicle/roof probe',async()=>{
    const viewer={scene:{sampleHeightMostDetailed:async(points:Cartographic[])=>points.map((p,i)=>{p.height=i<3?taoyuan17Ground.probes[i][2]+20:Number.NaN;return p;})}} as unknown as Viewer;
    await expect(sampleTaoyuan17Offset(viewer)).rejects.toThrow('採樣不足');
  });
  it('retains the user-confirmed combined 1028 and 1039 case',()=>{
    const p=oldParcels.find(p=>p.info.parcelNo==='1028')!,q=oldParcels.find(p=>p.info.parcelNo==='1039')!;
    expect(p.groupKey).toBe(q.groupKey);
  });
});
