import test from 'node:test';import assert from 'node:assert/strict';
import {compassHeading,createCompass} from '../shared/compass.mjs';
import {routeProgress,stepInstruction,nearestVisiblePoints} from '../shared/finding.mjs';
import {createWalkingRoute,parseWalkingRoute} from '../worker/walkingRoute.mjs';
const origin=[121.51,25.04],target=[121.52,25.04];
const data=()=>({code:'Ok',routes:[{geometry:{type:'LineString',coordinates:[origin,target]},distance:1008,duration:720,legs:[{steps:[{name:'中山路',distance:1008,maneuver:{type:'depart'}},{distance:0,maneuver:{type:'arrive'}}]}]}]});
test('附近點只取勾選圖層最近八點，未勾選與全部取消均不出現',()=>{
  const points=Array.from({length:12},(_,i)=>({dataset_id:'selected',code:String(i),lon:121.2+i*.001,lat:25}));points.push({dataset_id:'hidden',code:'NEAREST',lon:121.2,lat:25});
  const result=nearestVisiblePoints(points,['selected'],{lon:121.2,lat:25});assert.equal(result.length,8);assert.equal(result[0].point.code,'0');assert.ok(result.every(r=>r.point.dataset_id==='selected'));assert.equal(nearestVisiblePoints(points,[],{lon:121.2,lat:25}).length,0);
});
test('羅盤拒絕可重試，只有真北讀值可用；停止後延遲權限不得啟動感測',async()=>{
  assert.equal(compassHeading({alpha:30,absolute:false}),null);assert.equal(compassHeading({alpha:30,absolute:true}),330);assert.equal(compassHeading({webkitCompassHeading:90,webkitCompassAccuracy:-1}),null);
  let permission='denied',state,heading;const listeners=new Map(),scope={isSecureContext:true,DeviceOrientationEvent:{requestPermission:async()=>permission},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),setTimeout:()=>1,clearTimeout:()=>{}};
  const c=createCompass({scope,onState:v=>state=v,onHeading:v=>heading=v});await c.enable();assert.equal(state,'denied');assert.equal(listeners.size,0);
  permission='granted';await c.enable();listeners.get('deviceorientationabsolute')({absolute:true,alpha:20});assert.equal(state,'ready');assert.equal(heading,340);c.stop();assert.equal(listeners.size,0);assert.equal(heading,null);
  let resolve;scope.DeviceOrientationEvent.requestPermission=()=>new Promise(r=>resolve=r);const pending=c.enable();c.stop();resolve('granted');await pending;assert.equal(listeners.size,0);
});
test('路線回覆驗證與偏離／剩餘路程區分，直線不假稱道路',()=>{
  const route=parseWalkingRoute(data(),origin,target);assert.equal(route.steps.length,2);assert.match(route.steps[1].instruction,/標石/);assert.match(stepInstruction({name:'中正路',maneuver:{modifier:'left'}}),/左轉/);
  const progress=routeProgress(route.coordinates,{lon:121.515,lat:25.04});assert.ok(progress.offRoute<1);assert.ok(progress.remaining>450&&progress.remaining<550);
  assert.ok(routeProgress(route.coordinates,{lon:121.515,lat:25.042}).offRoute>200);
  assert.throws(()=>parseWalkingRoute({code:'NoRoute'},origin,target),/沒有可規劃/);
  const bad=data();bad.routes[0].geometry.coordinates=[[0,0],target];assert.throws(()=>parseWalkingRoute(bad,origin,target),/異常/);
});
test('步行路線驗證範圍、使用步行端點、限制請求頻率及網路失敗可退回直線',async()=>{
  let url,clock=1000;const plan=createWalkingRoute({time:()=>clock,fetcher:async u=>{url=u;return Response.json(data());}});
  await plan(origin,target);assert.match(url.pathname,/routed-foot\/route\/v1\/foot/);assert.equal(url.searchParams.get('steps'),'true');
  await assert.rejects(()=>plan(origin,target),/頻繁/);clock+=1500;await assert.rejects(()=>plan([0,0],target),/有效定位/);
  const offline=createWalkingRoute({fetcher:async()=>{throw new Error();}});await assert.rejects(()=>offline(origin,target),/直線找點/);
});
