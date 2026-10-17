import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import catalog from './taoyuan1013Cl2Parcels.json';
import original from './taoyuan1013Parcels.json';
describe('1013-2 independent model and cadastral source',()=>{
 it('adds only parcel174 and preserves all seven 1013-1 source routes',()=>{
  expect(catalog).toHaveLength(1);expect(catalog[0].key).toBe('shuangling-174');
  expect(catalog[0].tilesetPath).toBe('1013-cl2/tileset.json');
  expect(original).toHaveLength(7);expect(original.every(p=>p.tilesetPath==='1013-v2/tileset.json')).toBe(true);
 });
 it('keeps exact source land area and does not turn poles into occupancy',()=>{
  const p=catalog[0];const geo=JSON.parse(readFileSync('public/'+p.overlayUrl,'utf8'));
  expect(p.info.cadastralAreaM2).toBe(29.51);expect(p.info.geometryAreaM2).toBeCloseTo(29.514487,6);
  expect(p.info.analysisStatus).toBe('awaiting-building-confirmation');expect(p.info).not.toHaveProperty('occupiedAreaM2');
  expect(geo.features.map((f:any)=>f.properties.kind)).toEqual(['cadastral-fill','cadastral-boundary']);
  expect(geo.features[0].id).toBe(p.fillEntityId);expect(geo.features[0].properties.parcelKey).toBe(p.key);
  expect(geo.features[0].geometry.coordinates[0][0]).toEqual(geo.features[0].geometry.coordinates[0].at(-1));
 });
});
