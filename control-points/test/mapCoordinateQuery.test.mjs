import test from 'node:test';import assert from 'node:assert/strict';
import {mapCoordinates} from '../shared/mapCoordinateQuery.mjs';

test('地圖經緯度換算對應 TWD97 兩分帶，保留查詢原始位置',()=>{
  const position={lon:121.25790746,lat:24.94301422};
  const result=mapCoordinates(position.lon,position.lat);
  assert.ok(Math.abs(result.north-2759490.461)<.01);assert.ok(Math.abs(result.east-276045.229)<.01);
  assert.deepEqual({lon:result.lon,lat:result.lat},position);assert.equal(result.epsg,3826);
  const west=mapCoordinates(position.lon-2,position.lat,3825);
  assert.ok(Math.abs(west.north-result.north)<.001);assert.ok(Math.abs(west.east-result.east)<.001);assert.equal(west.epsg,3825);
  assert.throws(()=>mapCoordinates(NaN,25));assert.throws(()=>mapCoordinates(121,90));assert.throws(()=>mapCoordinates(181,25));assert.throws(()=>mapCoordinates(121,25,4326));
});
