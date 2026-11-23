import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import parcels from './taoyuan1111Parcels.json';
import {buildCaseOverview} from './caseOverview';
import {caseCaptureDate} from './caseCaptureDate';

describe('成功段680 地籍-only import',()=>{
  it('keeps registered 76 as the area basis and never substitutes DXF area or a reference T-shed',()=>{
    expect(parcels).toHaveLength(1);const p=parcels[0];
    expect(p.key).toBe('chenggong-680');expect(p.info.cadastralAreaM2).toBe(76);
    expect(p.info.geometryAreaM2).toBeCloseTo(72.04000296,6);
    expect(p.info.analysisStatus).toBe('not-analyzed');expect(p.info).not.toHaveProperty('occupiedAreaM2');expect(p.info).not.toHaveProperty('occupancyPercent');
    expect(p.info.coordinateSystem).toContain('TWD67');expect(p.info.integrationCoordinateSystem).toContain('TWD97');
    expect(p.info.analysisNote).toContain('分母採登記76m²');
    const overlay=JSON.parse(fs.readFileSync(path.resolve('public',p.overlayUrl),'utf8'));
    expect(overlay.features.map((f:any)=>f.properties.kind).sort()).toEqual(['cadastral-boundary','cadastral-fill']);
    expect(overlay.features.every((f:any)=>f.properties.sourceDxfHandle==='2D4'&&f.properties.cadastralAreaM2===76)).toBe(true);
    expect(JSON.stringify(overlay)).not.toMatch(/occupancy-building|2DB|2C8|12012/);
  });
  it('has real map rings, the fixed private Pix4D source and EXIF-verified capture date',()=>{
    const p=parcels[0],cases=buildCaseOverview(parcels);
    expect(p.tilesetPath).toBe('1111-cl/20261111CL-cesium_mesh.json');
    expect(cases).toHaveLength(1);expect(cases[0].title).toBe('成功段｜680');
    expect(cases[0].rings).toHaveLength(1);expect(cases[0].rings[0]).toHaveLength(5);
    expect(caseCaptureDate(p)).toBe('2026/11/11');
    expect(p.info.sourceImages).toHaveLength(5);
    for(const image of p.info.sourceImages)expect(fs.existsSync(path.resolve('public',image.url))).toBe(true);
  });
});
