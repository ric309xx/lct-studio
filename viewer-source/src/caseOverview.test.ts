import {describe,it,expect} from 'vitest';
import p1006 from './taoyuan1006Parcels.json';
import p1010 from './taoyuan1010Parcels.json';
import p1013 from './taoyuan1013Parcels.json';
import p1013cl2 from './taoyuan1013Cl2Parcels.json';
import p1015 from './taoyuan1015Parcels.json';
import geometry from './caseMapGeometry.json';
import {buildCaseOverview,clusterMapMarkers,caseMapBounds} from './caseOverview';
import fs from 'node:fs';
import path from 'node:path';

describe('map-first cases',()=>{
  it('keeps six scattered Sanzuwu parcels separate despite sharing a tileset',()=>{
    const cases=buildCaseOverview(p1006);
    expect(cases).toHaveLength(6);
    expect(new Set(cases.map(c=>c.key)).size).toBe(6);
    expect(cases.every(c=>c.parcels.length===1&&c.rings.length>0&&c.date==='2026/10/06')).toBe(true);
  });
  it('retains confirmed groups, all parcel identities and dates',()=>{
    const parcels=[...p1006,...p1010,...p1013,...p1013cl2,...p1015];
    const cases=buildCaseOverview(parcels);
    expect(cases).toHaveLength(17);
    expect(cases.flatMap(c=>c.parcels.map(p=>p.key)).sort()).toEqual(parcels.map(p=>p.key).sort());
    expect(cases.find(c=>c.parcels.some(p=>p.info.parcelNo==='1028'))?.parcels.map(p=>p.info.parcelNo)).toEqual(['1028','1039']);
    expect(cases.find(c=>c.parcels.some(p=>p.info.parcelNo==='1507-1'))?.title).toContain('等2筆地號');
    expect(cases.every(c=>c.bounds.every(Number.isFinite)&&c.longitude>120&&c.latitude>24)).toBe(true);
  });
  it('uses only original cadastral outer rings, not model or occupancy footprints',()=>{
    for(const [key,value] of Object.entries(geometry)){
      const overlay=JSON.parse(fs.readFileSync(path.resolve('public',value.source),'utf8'));
      const expected=overlay.features.filter((f:any)=>f.properties?.kind==='cadastral-fill'&&f.properties?.parcelKey===key)
        .flatMap((f:any)=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[])
        .map((p:any)=>p[0].map(([x,y]:number[])=>[x,y]));
      expect(value.rings).toEqual(expected);
    }
  });
  it('clusters display positions only without mutating case membership',()=>{
    const cases=buildCaseOverview(p1006);
    const grouped=clusterMapMarkers([{x:20,y:20,items:[cases[0]]},{x:25,y:25,items:[cases[1]]},{x:200,y:200,items:[cases[2]]}]);
    expect(grouped.map(g=>g.items.length)).toEqual([2,1]);
    expect(cases[0].parcels).toHaveLength(1);
  });
  it('reclusters previously opened cases on zoom out and expands again on zoom in without stale exemptions',()=>{
    const cases=buildCaseOverview(p1006);
    const points=(spacing:number)=>cases.slice(0,3).map((item,i)=>({x:100+i*spacing,y:100,items:[item]}));
    const close=clusterMapMarkers(points(300));
    expect(close).toHaveLength(3);
    expect(close.every(marker=>marker.items.length===1)).toBe(true);
    const far=clusterMapMarkers(points(20));
    expect(far).toHaveLength(1);expect(far[0].items).toHaveLength(3);
    expect(far[0].items.map(item=>item.key)).toEqual(cases.slice(0,3).map(item=>item.key));
    expect(clusterMapMarkers(points(300))).toEqual(close);
    expect(cases.slice(0,3).every(item=>item.parcels.length===1)).toBe(true);
  });
  it('zooms closer on cluster drill-down while retaining both cadastral bounds',()=>{
    const pair=buildCaseOverview(p1006).filter(item=>['221','239-1'].includes(item.parcels[0].info.parcelNo));
    const overview=caseMapBounds(pair),detail=caseMapBounds(pair,true);
    expect(detail[2]-detail[0]).toBeLessThan(overview[2]-overview[0]);
    expect(detail[3]-detail[1]).toBeLessThan(overview[3]-overview[1]);
    for(const item of pair){
      expect(detail[0]).toBeLessThan(item.bounds[0]);expect(detail[1]).toBeLessThan(item.bounds[1]);
      expect(detail[2]).toBeGreaterThan(item.bounds[2]);expect(detail[3]).toBeGreaterThan(item.bounds[3]);
    }
  });
});
