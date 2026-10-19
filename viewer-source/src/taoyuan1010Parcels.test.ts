import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import catalog from './taoyuan1010Parcels.json';
import old1006 from './taoyuan1006Parcels.json';
import old1013 from './taoyuan1013Parcels.json';
import old1013Cl2 from './taoyuan1013Cl2Parcels.json';
import old1015 from './taoyuan1015Parcels.json';
describe('1010 models with user-confirmed cadastral parcels',()=>{
  it('keeps three confirmed groups and excludes the historical 255-86 lookup',()=>{
    expect(catalog).toHaveLength(6);
    expect(new Set(catalog.map(p=>p.key)).size).toBe(6);
    const keys=[...old1006,...old1013,...old1013Cl2,...old1015,...catalog].map(p=>p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(catalog.map(p=>p.groupKey)).size).toBe(3);
    expect(catalog.filter(p=>p.groupKey==='1010-cl2-02').map(p=>p.info.parcelNo)).toEqual(['255-41','255-42','255-39','255-149']);
    expect(catalog.some(p=>p.info.parcelNo==='255-86')).toBe(false);
    expect(catalog[0].info.parcelNo).toBe('17-1');
    expect(catalog[0].tilesetPath).toBe('1010-cl1/tileset.json');
    expect(catalog.slice(1).every(p=>p.tilesetPath==='1010-cl2/tileset.json')).toBe(true);
  });
  it('publishes actual CAD components with reviewed model occupancy',()=>{
    for(const p of catalog){
      expect(p.info.occupiedAreaM2).toBeGreaterThanOrEqual(0);
      expect(p.info.occupancyPercent).toBeCloseTo(p.info.occupiedAreaM2/p.info.cadastralAreaM2*100,3);
      const source=readFileSync(new URL('../public/'+p.overlayUrl,import.meta.url),'utf8');
      const geo=JSON.parse(source);
      const feature=geo.features.find((f: {id:string})=>f.id===p.fillEntityId);
      expect(feature).toBeDefined();
      expect(p.boundaryStatus).toBe('available');
      expect(p.info.analysisStatus).toBe('model-derived');
      expect(p.info.analysisVersion).toBe('20261019-1010-model-occupancy-v4');
      expect(feature.geometry.type).toBe('Polygon');
      expect(feature.properties.sourceCrs).toBe('EPSG:3826');
      expect(source).toBe(readFileSync(new URL('../../3d-viewer/'+p.overlayUrl,import.meta.url),'utf8'));
    }
  });
  it('counts union XY once and keeps display-only layers out of measured area',()=>{
    for(const p of catalog){
      const geo=JSON.parse(readFileSync(new URL('../public/'+p.overlayUrl,import.meta.url),'utf8'));
      const own=geo.features.filter((f:any)=>f.properties.parcelKey===p.key);
      const measured=own.filter((f:any)=>f.properties.kind==='occupancy-building');
      const display=own.filter((f:any)=>f.properties.kind==='occupancy-display');
      expect(measured.reduce((sum:number,f:any)=>sum+f.properties.projectedAreaM2,0)).toBeCloseTo(p.info.occupiedAreaM2,3);
      for(const f of measured)expect(f.properties.analysisOnly).toBe(true);
      for(const f of display){
        expect(f.properties.projectedAreaM2).toBe(0);
        expect(f.properties.displayRoofOnly).toBe(true);
        expect(f.properties.displayActualSurface).toBe(true);
        expect(f.properties.modelGroundAnchors.length).toBeGreaterThanOrEqual(3);
        expect(f.properties.modelRoofSamples.length).toBeGreaterThan(0);
      }
      expect(measured.length>0).toBe(p.info.occupiedAreaM2>0);
      expect(display.length>0).toBe(p.info.occupiedAreaM2>0);
      const image=readFileSync(new URL('../public/'+p.info.reviewImageUrl,import.meta.url));
      expect(image.equals(readFileSync(new URL('../../3d-viewer/'+p.info.reviewImageUrl,import.meta.url)))).toBe(true);
    }
  });
  it('qualifies zero intersections and never claims an independent accuracy check',()=>{
    for(const p of catalog.filter(p=>p.info.occupiedAreaM2===0)){
      expect(p.info.analysisNote).toContain('不代表全筆已清查');
    }
    const audit=JSON.parse(readFileSync(resolve(process.cwd(),'../analysis/20261019-taoyuan-1010/occupancy-audit.json'),'utf8'));
    expect(audit.cadSurveyUsedAsOccupiedFootprint).toBe(false);
    expect(audit.registrationAreaNotRescaled).toBe(true);
    expect(audit.modelCadAccuracyValidated).toBe(false);
    expect(audit.parcels).toHaveLength(6);
  });
  it('preserves the six confirmed registered areas without scaling geometry',()=>{
    expect(catalog.map(p=>p.info.cadastralAreaM2)).toEqual([2857,64,99,202,525,81]);
    expect(catalog.every(p=>p.info.coordinateSystem==='地籍坐標（原始成圖）')).toBe(true);
  });
  it('keeps multiple components and flags large CAD versus registered differences',()=>{
    const first=catalog[0];
    const geo=JSON.parse(readFileSync(new URL('../public/'+first.overlayUrl,import.meta.url),'utf8'));
    const fills=geo.features.filter((f:any)=>f.properties.kind==='cadastral-fill');
    expect(fills).toHaveLength(4);
    expect(fills.reduce((sum:number,f:any)=>sum+f.properties.componentAreaM2,0)).toBeCloseTo(2906.8881547,5);
    expect(catalog.find(p=>p.info.parcelNo==='255-41')!.info.analysisNote).toContain('差異較大');
    expect(catalog.find(p=>p.info.parcelNo==='255-42')!.info.analysisNote).toContain('差異較大');
  });
});
