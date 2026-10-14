import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointCache} from '../shared/pointCache.mjs';
const saved={format:1,revision:'generation:1',datasets:[{id:'a'}],points:[{id:'old',raw:'完整屬性'}]};
function fixture(overrides={}){
  const calls=[],shown=[],writes=[];
  const loader=createPointCache({read:async()=>structuredClone(saved),write:async(_key,data)=>writes.push(data),onData:data=>shown.push(data),request:async path=>{calls.push(path);if(path==='/api/points-revision')return {revision:saved.revision};throw new Error('unexpected full read');},...overrides});
  return {loader,calls,shown,writes};
}
test('cached startup displays saved points before the tiny version request; unchanged means zero point pages',async()=>{
  let finish;const gate=new Promise(resolve=>finish=resolve),shown=[];
  const f=fixture({onData:data=>shown.push(data),request:async path=>{assert.equal(path,'/api/points-revision');assert.equal(shown.length,1);await gate;return {revision:saved.revision};}});
  const opened=f.loader.open();assert.equal(f.loader.refresh(),opened,'background and manual requests deduplicate');finish();await opened;
  assert.deepEqual(shown[0],saved);assert.equal(f.writes.length,0);
});
test('changed data replaces and persists the complete snapshot after a stable version check',async()=>{
  const shown=[],writes=[],calls=[];
  const f=fixture({onData:data=>shown.push(data),write:async(_key,data)=>writes.push(data),request:async path=>{calls.push(path);if(path==='/api/points-revision')return {revision:'generation:2'};if(path==='/api/datasets')return [{id:'a',name:'115年資料'}];return {items:[{id:'new',raw:'完整屬性'}],next:null};}});
  await f.loader.open();assert.equal(shown[0].points[0].id,'old');assert.equal(shown[1].points[0].id,'new');assert.equal(writes[0].revision,'generation:2');
  calls.length=0;await f.loader.refresh();assert.deepEqual(calls,['/api/points-revision']);
});
test('failed download keeps the saved map and never writes partial data',async()=>{
  const f=fixture({request:async path=>{if(path==='/api/points-revision')return {revision:'generation:2'};if(path==='/api/datasets')return [];if(path.includes('after='))throw new Error('network lost');return {items:[{id:'a'}],next:'a'};}});
  await assert.rejects(f.loader.open(),/network lost/);assert.equal(f.shown.length,1);assert.deepEqual(f.shown[0],saved);assert.equal(f.writes.length,0);
});
test('updates during pagination retry; an unstable snapshot is never stored',async()=>{
  let revision=2;
  const f=fixture({request:async path=>path==='/api/points-revision'?{revision:'generation:'+revision++}:path==='/api/datasets'?[]:{items:[{id:'a'}],next:null}});
  await assert.rejects(f.loader.open(),/正在更新/);assert.equal(f.shown.length,1);assert.equal(f.writes.length,0);
});
test('unavailable or outdated browser storage still permits a complete network startup',async()=>{
  let storageErrors=0;
  const f=fixture({read:async()=>({format:0}),write:async()=>{throw new Error('quota');},onStorageError:()=>storageErrors++,request:async path=>path==='/api/points-revision'?{revision:'g:0'}:path==='/api/datasets'?[]:{items:[],next:null}});
  await f.loader.open();assert.equal(f.shown.length,1);assert.equal(f.shown[0].points.length,0);assert.equal(storageErrors,1);
});
test('logout cancels a pending startup and must not display cached private points afterward',async()=>{
  let finish;const gate=new Promise(resolve=>finish=resolve);
  const f=fixture({read:async()=>{await gate;return saved;}});
  const pending=f.loader.open();f.loader.cancel();finish();await pending;assert.equal(f.shown.length,0);assert.equal(f.calls.length,0);
});

test('巡查寫入與背景版本檢查重疊時，寫入後仍重新取得最新點況',async()=>{
  let finish;const gate=new Promise(resolve=>finish=resolve);let revision=1,checks=0;
  const f=fixture({request:async path=>{
    if(path==='/api/points-revision'){const value=revision;if(++checks===1)await gate;return {revision:'generation:'+value};}
    if(path==='/api/datasets')return [{id:'a'}];
    return {items:[{id:'old',status:'點位存在'}],next:null};
  }});
  const opened=f.loader.open();await new Promise(resolve=>setImmediate(resolve));revision=2;
  const changed=f.loader.afterWrite();finish();await Promise.all([opened,changed]);
  assert.equal(f.shown.at(-1).points[0].status,'點位存在');assert.equal(f.writes.at(-1).revision,'generation:2');
});
