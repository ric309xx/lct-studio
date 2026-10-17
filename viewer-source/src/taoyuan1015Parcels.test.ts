import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import catalog from './taoyuan1015Parcels.json';

describe('1015 兩批模型八地號', () => {
  it('keeps two model sources, four groups, registered areas and source CRS distinct', () => {
    expect(catalog).toHaveLength(8);
    expect(new Set(catalog.map(p => p.key)).size).toBe(8);
    expect(new Set(catalog.map(p => p.groupKey)).size).toBe(4);
    expect([...new Set(catalog.map(p => p.tilesetPath))]).toEqual(['1015-cl1/tileset.json','1015-cl2/tileset.json']);
    expect(catalog.map(p => p.info.cadastralAreaM2)).toEqual([397.4,185.67,206.34,51.27,79.28,9.84,153.46,50.21]);
    for (const p of catalog) {
      expect(p.info.integrationCoordinateSystem).toContain('TWD97');
      expect(p.info.coordinateSystem).toContain('TWD67');
      expect(p.info.analysisNote).toContain('待複核');
      expect(p.focus.longitude).toBeGreaterThan(121.2);
      expect(p.focus.latitude).toBeGreaterThan(24.9);
    }
  });
  it('links each parcel to correct geometry and sums only horizontal model footprints', () => {
    for (const p of catalog) {
      const fc=JSON.parse(readFileSync(new URL('../public/'+p.overlayUrl,import.meta.url),'utf8'));
      const fill=fc.features.find((f: any)=>f.id===p.fillEntityId);
      expect(fill.properties.parcelKey).toBe(p.key);
      expect(fill.geometry.coordinates[0][0]).toEqual(fill.geometry.coordinates[0].at(-1));
      const buildings=fc.features.filter((f: any)=>f.properties.parcelKey===p.key && f.properties.kind==='occupancy-building');
      const sum=buildings.reduce((s:number,f:any)=>s+f.properties.projectedAreaM2,0);
      if (p.info.occupiedAreaM2!==undefined) {
        expect(sum).toBeCloseTo(p.info.occupiedAreaM2,3);
        expect(p.info.occupancyPercent).toBeCloseTo(sum/p.info.cadastralAreaM2*100,3);
      } else {
        expect(p.info.analysisStatus).toBe('awaiting-building-confirmation');
        expect(p.info.analysisNote).toContain('不代表確認無占用');
      }
      for(const f of buildings) {
        expect(f.properties.modelRoofSamples.length).toBeGreaterThan(0);
        expect(f.properties.modelGroundAnchors.length).toBeGreaterThanOrEqual(2);
        expect(f.properties.projectedAreaM2).toBeGreaterThan(0);
      }
      expect(readFileSync(new URL('../public/'+p.info.reviewImageUrl,import.meta.url)).length).toBeGreaterThan(1000);
    }
  });
  it('keeps 617-1 low canopy heights separate from the adjacent upper roof', () => {
    const parcel=catalog.find(p=>p.key==='dongliao-617-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const buildings=fc.features.filter((f:any)=>f.properties.parcelKey==='dongliao-617-1'&&f.properties.kind==='occupancy-building');
    expect(buildings).toHaveLength(1);
    const heights=buildings[0].properties.modelRoofSamples.map((p:number[])=>p[2]);
    expect(Math.max(...heights)).toBeLessThan(168.1);
    expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(.5);
    expect(buildings[0].properties.continuousOccupancy).toBe(true);
    expect(buildings[0].properties.projectedAreaM2).toBeCloseTo(1.372,3);
  });
  it('includes the reviewed corner low awnings but not a ground-to-wall volume',()=>{
    const parcel=catalog.find(p=>p.key==='dongliao-1507-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const buildings=fc.features.filter((f:any)=>f.properties.kind==='occupancy-building');
    expect(buildings.some((f:any)=>f.properties.analysisRegion==='dongliao-corner-curved-awning-03')).toBe(true);
    for(const f of buildings){
      expect(f.properties.displayRoofOnly).toBe(true);
      expect(f.properties.displayMeshHeightRepair).toBe(true);
    }
    expect(catalog.find(p=>p.key==='dongliao-1507-1')!.info.occupiedAreaM2).toBeGreaterThan(28.38);
    for(const f of buildings)expect(f.properties.displayActualSurface).toBe(true);
  });
  it('keeps full display height layers without counting overlapping projections again',()=>{
    const parcel=catalog.find(p=>p.key==='futai-120-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const display=fc.features.filter((f:any)=>f.properties.kind==='occupancy-display'&&f.properties.parcelKey===parcel.key);
    expect(display.length).toBeGreaterThan(0);
    expect(display.some((f:any)=>f.properties.analysisRegion==='futai-east-main-roofs')).toBe(true);
    expect(display.some((f:any)=>f.properties.analysisRegion==='futai-east-awning-01')).toBe(true);
    for(const f of display){expect(f.properties.projectedAreaM2).toBe(0);expect(f.properties.analysisOnly).toBe(false);}
    expect(display.reduce((sum:number,f:any)=>sum+f.properties.displayOnlyProjectionM2,0)).toBeGreaterThan(parcel.info.occupiedAreaM2);
    const analysis=fc.features.filter((f:any)=>f.properties.kind==='occupancy-building'&&f.properties.parcelKey===parcel.key);
    for(const f of analysis)expect(f.properties.analysisOnly).toBe(true);
  });
  it('shows the complete rental sign separately from measured occupancy and adds the neighbour roof only inside the parcel',()=>{
    const parcel=catalog.find(p=>p.key==='dongliao-1507-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const sign=fc.features.filter((f:any)=>f.properties.analysisRegion==='dongliao-1507-rental-sign-context');
    expect(sign.length).toBeGreaterThan(0);
    for(const f of sign) {
      expect(f.properties.kind).toBe('occupancy-display');expect(f.properties.projectedAreaM2).toBe(0);
      expect(f.properties.displayObjectContext).toBe(true);expect(f.properties.analysisOnly).toBe(false);
      expect(f.properties.displayHeightRangeSourceZ).toEqual([169.3,171.2]);
    }
    const roof=fc.features.filter((f:any)=>f.properties.analysisRegion==='dongliao-1507-neighbour-sheet-roof'&&f.properties.kind==='occupancy-building');
    expect(roof.length).toBeGreaterThan(0);
    expect(roof.reduce((sum:number,f:any)=>sum+f.properties.projectedAreaM2,0)).toBeGreaterThan(0);
    expect(catalog.filter(p=>p.key!=='dongliao-1507-1').map(p=>p.info.occupiedAreaM2)).toEqual([64.762,1.4811,24.5387,1.372,2.5961,.5151,16.2945]);
  });
  it('colours the reviewed curved front fascia without counting its vertical face again',()=>{
    const parcel=catalog.find(p=>p.key==='dongliao-1507-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const fascia=fc.features.filter((f:any)=>f.properties.analysisRegion==='dongliao-1507-front-fascia-display');
    expect(fascia.length).toBeGreaterThan(0);
    for(const f of fascia){
      expect(f.properties.kind).toBe('occupancy-display');
      expect(f.properties.projectedAreaM2).toBe(0);
      expect(f.properties.analysisOnly).toBe(false);
      expect(f.properties.displayObjectContext).not.toBe(true);
      expect(f.properties.displayHeightRangeSourceZ).toEqual([168.9,171.6]);
    }
    expect(parcel.info.occupiedAreaM2).toBe(33.7834);
  });
  it('keeps the user-confirmed rear awning complete for display without changing measured projection',()=>{
    const parcel=catalog.find(p=>p.key==='dongliao-1507-1')!;
    const fc=JSON.parse(readFileSync(new URL('../public/'+parcel.overlayUrl,import.meta.url),'utf8'));
    const roof=fc.features.filter((f:any)=>f.properties.analysisRegion==='dongliao-1507-rear-awning-context');
    expect(roof.length).toBeGreaterThan(0);
    for(const f of roof){
      expect(f.properties.kind).toBe('occupancy-display');
      expect(f.properties.projectedAreaM2).toBe(0);
      expect(f.properties.displayObjectContext).toBe(true);
      expect(f.properties.displayHeightRangeSourceZ).toEqual([169.3,172.2]);
      expect(f.properties.displayObjectNote).toContain('不增加占用面積');
    }
    expect(parcel.info.occupiedAreaM2).toBe(33.7834);
  });
});
