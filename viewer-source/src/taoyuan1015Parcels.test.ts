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
});
