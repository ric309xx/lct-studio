import test from 'node:test';import assert from 'node:assert/strict';
import {approximatePoint,measuredPoint,isApproximate,fieldCapture} from '../shared/fieldPoints.mjs';
import {recordFields} from '../shared/pointRecord.mjs';
test('概略 GPS 使用 WGS84 並保留精度，不承襲圖層 TWD97[2010] 或憑空填高程',()=>{
  const p=approximatePoint({code:'F1',lon:121.2,lat:25,positionMethod:'gps',accuracy:12,positionTimestamp:1000},{id:'d',epsg:3826,metadata:{coordinateSystem:'TWD97[2010]'}},1000);
  assert.equal(p.epsg,4326);assert.equal(p.height,null);assert.equal(p.lat,25);assert.equal(isApproximate(p),true);assert.equal(fieldCapture(p).initialLocation.accuracy,12);
  assert.match(recordFields(p).find(r=>r[0]==='坐標品質')[1],/概略/);assert.ok(recordFields(p).some(r=>r[0]==='經度（°）'));
  assert.throws(()=>approximatePoint({code:'F1',lon:121.2,lat:25,positionMethod:'gps',accuracy:12,positionTimestamp:1000},{id:'d'},999999),/過期/);
});
test('地圖概略點補上測量後保留 ID 與原概略位置，年代、高程與來源明確',()=>{
  const p=approximatePoint({code:'F1',lon:121.2,lat:25,positionMethod:'map'},{id:'d'},1000);
  const measurement={epsg:3826,coordinateSystem:'TWD97[2010]',north:2770000,east:250000,height:null,height_type:'正高',height_datum:'TWVD2001',source:'現場測量',measured_at:'2026-10-12'};
  const updated=measuredPoint(measurement,p);assert.equal(updated.id,p.id);assert.equal(updated.dataset_id,p.dataset_id);assert.equal(isApproximate(updated),false);assert.match(updated.crs,/\[2010\]/);assert.equal(updated.height,null);assert.equal(updated.height_datum,'TWVD2001');assert.deepEqual(fieldCapture(updated).initialLocation,fieldCapture(p).initialLocation);
  assert.throws(()=>measuredPoint(measurement,{...p,raw:'{}'}),/來源成果/);
});
