import test from 'node:test';import assert from 'node:assert/strict';
import {createLocationTracking} from '../shared/locationTracking.mjs';

function setup(){
  const positions=[],locations=[],errors=[],cleared=[],watches=[];
  const gps={watchPosition(success,error,options){watches.push({success,error,options});return watches.length;},clearWatch(id){cleared.push(id);}};
  const tracking=createLocationTracking({onPosition:p=>positions.push(p),onLocate:p=>locations.push(p),onError:e=>errors.push(e)});
  const fix=(lon,lat=25)=>({coords:{longitude:lon,latitude:lat,accuracy:5},timestamp:Date.now()});
  return {tracking,gps,positions,locations,errors,cleared,watches,fix};
}

test('GPS 持續更新標記與距離，但只在按定位時移動地圖一次',()=>{
  const s=setup();assert.equal(s.tracking.request(s.gps),true);
  s.watches[0].success(s.fix(121));assert.equal(s.locations.length,1);
  s.watches[0].success(s.fix(121.01));s.watches[0].success(s.fix(121.02));
  assert.equal(s.positions.length,3);assert.equal(s.locations.length,1);
  assert.equal(s.tracking.request(s.gps),false);assert.equal(s.locations.length,2);assert.equal(s.locations[1].lon,121.02);
  assert.equal(s.watches.length,1);s.watches[0].success(s.fix(121.03));assert.equal(s.locations.length,2);
});

test('取得首筆 GPS 前選點、搜尋地標或拖曳，延遲回傳不得搶回地圖',()=>{
  const s=setup();s.tracking.request(s.gps);s.tracking.cancelFocus();
  s.watches[0].success(s.fix(121));s.watches[0].success(s.fix(121.01));
  assert.equal(s.positions.length,2);assert.equal(s.locations.length,0);
  s.tracking.request(s.gps);assert.equal(s.locations.length,1);
});

test('登出後的舊回呼不更新位置，定位失敗可重試而不累積監聽',()=>{
  const s=setup();s.tracking.request(s.gps);s.tracking.stop();
  s.watches[0].success(s.fix(121));s.watches[0].error({code:1});
  assert.equal(s.positions.length,0);assert.equal(s.errors.length,0);assert.deepEqual(s.cleared,[1]);
  s.tracking.request(s.gps);s.watches[1].error({code:2});assert.equal(s.errors.length,1);assert.deepEqual(s.cleared,[1,2]);
  s.tracking.request(s.gps);s.watches[1].success(s.fix(121));assert.equal(s.locations.length,0);
  s.watches[2].success(s.fix(121.1));assert.equal(s.locations.length,1);
});
