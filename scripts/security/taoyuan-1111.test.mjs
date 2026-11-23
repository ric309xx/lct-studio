import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));

test('成功段680只含原地籍，登記面積76不被CAD面積取代，舊案地籍未修改',()=>{
  const [parcel]=read('viewer-source/src/taoyuan1111Parcels.json');
  assert.equal(parcel.info.cadastralAreaM2,76);assert.ok(Math.abs(parcel.info.geometryAreaM2-72.04000296)<1e-6);
  assert.equal(parcel.info.analysisStatus,'not-analyzed');assert.equal(parcel.info.occupiedAreaM2,undefined);assert.equal(parcel.info.occupancyPercent,undefined);
  assert.match(parcel.info.analysisNote,/分母採登記76/);
  const overlay=read('viewer-source/public/'+parcel.overlayUrl);
  assert.equal(overlay.features.length,2);
  assert.deepEqual(overlay.features.map(f=>f.properties.kind).sort(),['cadastral-boundary','cadastral-fill']);
  assert.ok(overlay.features.every(f=>f.properties.sourceDxfHandle==='2D4'));
  assert.doesNotMatch(JSON.stringify(overlay),/2C8|2DB|2DC|occupancy-building/);
  assert.deepEqual(read('3d-viewer/'+parcel.overlayUrl),overlay);
  const map=read('viewer-source/src/caseMapGeometry.json');assert.equal(Object.keys(map).length,30);
  assert.deepEqual(map[parcel.key].rings,[overlay.features[0].geometry.coordinates[0]]);
  for(const item of parcel.info.sourceImages)assert.ok(fs.existsSync(path.join(root,'3d-viewer',item.url)));
});

test('新地籍清單僅由已授權bootstrap注入，不打包原始私有JSON',()=>{
  for(const name of ['netlify/lib/viewer-gateway.mjs','viewer-source/vite.config.ts']){
    assert.match(fs.readFileSync(path.join(root,name),'utf8'),/taoyuan1111Parcels/);
  }
  const profile=read('viewer-source/src/taoyuanHeightProfiles.json').find(p=>p.id==='1111-cl');
  assert.equal(profile.renderFrame,'ellipsoidal');assert.equal(profile.conversionMethod,'verified-ellipsoid-geoid-grid');
  assert.equal(profile.pairedControls,0);assert.equal(profile.rootTilesetSha256,'4d83e9421c894c811e41ca5326ac5f0068c346816b991beec5f56c696e722aef');
});
