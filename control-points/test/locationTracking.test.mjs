import test from 'node:test';import assert from 'node:assert/strict';
import {createLocationTracking} from '../shared/locationTracking.mjs';

function setup(){
  const positions=[],locations=[],initials=[],follows=[],states=[],errors=[],cleared=[],watches=[];
  const gps={watchPosition(success,error,options){watches.push({success,error,options});return watches.length;},clearWatch(id){cleared.push(id);}};
  const tracking=createLocationTracking({onPosition:p=>positions.push(p),onLocate:(p,initial,follow)=>{locations.push(p);initials.push(initial);follows.push(follow);},onState:state=>states.push(state),onError:e=>errors.push(e)});
  const fix=(lon,lat=25)=>({coords:{longitude:lon,latitude:lat,accuracy:5},timestamp:Date.now()});
  return {tracking,gps,positions,locations,initials,follows,states,errors,cleared,watches,fix};
}

test('跟隨模式每筆 GPS 都置中，僅首筆設定初始比例，再次啟動沿用同一個監聽',()=>{
  const s=setup();assert.equal(s.tracking.request(s.gps,'follow'),true);
  assert.equal(s.states.at(-1),'locating');
  s.watches[0].success(s.fix(121));assert.equal(s.locations.length,1);
  s.watches[0].success(s.fix(121.01));s.watches[0].success(s.fix(121.02));
  assert.equal(s.positions.length,3);assert.equal(s.locations.length,3);
  assert.deepEqual(s.initials,[true,false,false]);assert.equal(s.states.at(-1),'following');
  assert.equal(s.tracking.request(s.gps,'follow'),false);assert.equal(s.locations.length,4);assert.equal(s.locations[3].lon,121.02);
  assert.equal(s.watches.length,1);s.watches[0].success(s.fix(121.03));assert.equal(s.locations.length,5);
  assert.deepEqual(s.initials,[true,false,false,true,false]);
});

test('暫停跟隨後 GPS 繼續更新距離但不移動地圖，恢復後持續跟隨',()=>{
  const s=setup();s.tracking.request(s.gps,'follow');s.watches[0].success(s.fix(121));s.tracking.cancelFocus();
  assert.equal(s.states.at(-1),'idle');s.watches[0].success(s.fix(121.1));
  assert.equal(s.positions.length,2);assert.equal(s.locations.length,1);assert.deepEqual(s.cleared,[]);
  s.tracking.request(s.gps,'follow');assert.equal(s.locations.at(-1).lon,121.1);s.watches[0].success(s.fix(121.2));
  assert.equal(s.locations.at(-1).lon,121.2);assert.equal(s.locations.length,3);assert.equal(s.watches.length,1);
});

test('預設單次定位只移動一次，切換持續跟隨／單次定位不新增監聽',()=>{
  const s=setup();s.tracking.request(s.gps);s.watches[0].success(s.fix(121));s.watches[0].success(s.fix(121.1));
  assert.equal(s.locations.length,1);assert.equal(s.states.at(-1),'idle');assert.deepEqual(s.follows,[false]);
  s.tracking.request(s.gps,'follow');s.watches[0].success(s.fix(121.2));assert.equal(s.locations.length,3);assert.equal(s.states.at(-1),'following');
  s.tracking.request(s.gps,'single');assert.equal(s.locations.length,4);assert.equal(s.locations.at(-1).lon,121.2);assert.equal(s.states.at(-1),'idle');
  s.watches[0].success(s.fix(121.3));assert.equal(s.positions.length,4);assert.equal(s.locations.length,4);assert.equal(s.watches.length,1);
  assert.deepEqual(s.follows,[false,true,true,false]);
});

test('等待首筆定位時切換模式，以最新選擇為準且可取消',()=>{
  const s=setup();s.tracking.request(s.gps,'follow');s.tracking.request(s.gps,'single');s.watches[0].success(s.fix(121));
  s.watches[0].success(s.fix(121.1));assert.equal(s.locations.length,1);assert.deepEqual(s.follows,[false]);assert.equal(s.watches.length,1);
  const pending=setup();pending.tracking.request(pending.gps,'single');pending.tracking.request(pending.gps,'follow');pending.tracking.cancelFocus();
  pending.watches[0].success(pending.fix(121));assert.equal(pending.locations.length,0);assert.equal(pending.positions.length,1);assert.equal(pending.states.at(-1),'idle');
});

test('取得首筆 GPS 前選點、搜尋地標或拖曳，延遲回傳不得搶回地圖',()=>{
  const s=setup();s.tracking.request(s.gps);s.tracking.cancelFocus();
  assert.equal(s.states.at(-1),'idle');
  s.watches[0].success(s.fix(121));s.watches[0].success(s.fix(121.01));
  assert.equal(s.positions.length,2);assert.equal(s.locations.length,0);
  s.tracking.request(s.gps);assert.equal(s.locations.length,1);
});

test('登出後的舊回呼不更新位置，定位失敗可重試而不累積監聽',()=>{
  const s=setup();s.tracking.request(s.gps);s.tracking.stop();
  s.watches[0].success(s.fix(121));s.watches[0].error({code:1});
  assert.equal(s.positions.length,0);assert.equal(s.errors.length,0);assert.deepEqual(s.cleared,[1]);
  s.tracking.request(s.gps);s.watches[1].error({code:2});assert.equal(s.errors.length,1);assert.deepEqual(s.cleared,[1,2]);
  assert.equal(s.states.at(-1),'idle');
  s.tracking.request(s.gps);s.watches[1].success(s.fix(121));assert.equal(s.locations.length,0);
  s.watches[2].success(s.fix(121.1));assert.equal(s.locations.length,1);
});
