import test from 'node:test';import assert from 'node:assert/strict';
import {preparePhotoBatch,pendingVisitPoints,displayPointStatus} from '../shared/fieldWorkflow.mjs';
import {createScreenLock} from '../shared/screenLock.mjs';
const items=count=>Array.from({length:count},(_,i)=>({id:'photo-'+i,file:new File(['photo'],'image'+i+'.jpg',{type:'image/jpeg'}),capturedAt:'2026-10-12T06:00:00Z',position:{lon:121.2,lat:25,accuracy:8}}));
test('近照三張、遠照四張各自成批，保留同一巡查關聯及每張的拍攝位置',async()=>{
  const near=await preparePhotoBatch(items(3),{id:'D018',code:'D018'},{category:'近照',visitId:'visit',thumbnail:async()=>undefined});
  const far=await preparePhotoBatch(items(4),{id:'D018',code:'D018'},{category:'遠照',visitId:'visit',thumbnail:async()=>undefined});
  assert.equal(near.length,3);assert.equal(far.length,4);assert.ok(near.every(q=>q.payload.category==='近照'));assert.ok(far.every(q=>q.payload.category==='遠照'));assert.equal(near[0].payload.visit_id,'visit');assert.equal(near[0].payload.position.accuracy,8);assert.equal(near[0].id,'photo-0');
  await assert.rejects(()=>preparePhotoBatch(items(2),{id:'p',code:'p'},{category:'近照',thumbnail:async()=>{throw new Error('容量不足');}}),/容量不足/);
  await assert.rejects(()=>preparePhotoBatch(items(1),{id:'p',code:'p'},{category:'錯誤',thumbnail:async()=>undefined}),/類別/);
});
test('現場找到點立即顯示待同步，同號不同來源不受影響；同步清空後使用正式點況',()=>{
  const points=[{id:'a',code:'5004',status:'未巡查'},{id:'b',code:'5004',status:'未巡查'}],queue=[{kind:'visit',pointId:'a',payload:{visited_at:'2026-10-12T06:00:00Z',status:'點位存在'}}];
  const shown=pendingVisitPoints(points,queue);assert.equal(shown[0].status,'點位存在');assert.equal(shown[0].pending_visit,true);assert.equal(shown[1].status,'未巡查');assert.equal(points[0].status,'未巡查');assert.match(displayPointStatus(shown[0].status),/已巡查/);
  assert.equal(pendingVisitPoints(points,[])[0].pending_visit,undefined);
});
test('固定直向僅在原生API成功時成立，不支援不要求全螢幕，失敗會還原',async()=>{
  let fullscreen=0,exits=0,calls=0,unlocks=0;
  const doc={fullscreenElement:null,documentElement:{requestFullscreen:async()=>{fullscreen++;}},exitFullscreen:async()=>{exits++;}};
  const unsupported=createScreenLock({orientation:{},document:doc});assert.equal((await unsupported.lock()).locked,false);assert.equal(fullscreen,0);
  const supported=createScreenLock({orientation:{lock:async()=>{calls++;if(calls===1)throw new Error();},unlock:()=>unlocks++},document:doc});assert.equal((await supported.lock()).locked,true);assert.equal(fullscreen,1);await supported.unlock();assert.equal(exits,1);assert.equal(unlocks,1);
  const failure=createScreenLock({orientation:{lock:async()=>{throw new Error();}},document:doc});assert.equal((await failure.lock()).locked,false);assert.equal(exits,2);
});
