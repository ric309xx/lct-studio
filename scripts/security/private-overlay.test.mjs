import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverlayHandler} from '../../netlify/functions/private-overlay.mjs';
const base='https://lctstudio.tw/3d-viewer/overlays/';
test('未登入不得讀取桃園 GeoJSON',async()=>{
  let reads=0;const handler=createOverlayHandler(async()=>new Response(null,{status:401}),async()=>{reads++;return Buffer.from('{}');});
  const r=await handler(new Request(base+'taoyuan-building-overlay.geojson'));assert.equal(r.status,401);assert.equal(reads,0);
});
test('授權後僅提供固定桃園路徑，且保留 HEAD 與禁止快取',async()=>{
  let reads=0;const handler=createOverlayHandler(async r=>{assert.equal(r.headers.get('cookie'),'synthetic-cookie');return Response.json({project:'taoyuan-20261006'});},async relative=>{reads++;assert.equal(relative,'taoyuan-1006/221.geojson');return Buffer.from('{"type":"FeatureCollection","features":[]}');});
  for(const method of ['GET','HEAD']){
    const r=await handler(new Request(base+'taoyuan-1006/221.geojson',{method,headers:{cookie:'synthetic-cookie'}}));
    assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/geo\+json/);
    if(method==='HEAD')assert.equal(await r.text(),'');
  }
  assert.equal(reads,2);
});
test('非法路徑與方法在驗證或讀檔前即拒絕',async()=>{
  const handler=createOverlayHandler(()=>{throw Error('Unexpected authentication');},()=>{throw Error('Unexpected read');});
  for(const relative of ['unknown-project.geojson','taoyuan-1006/%2e%2e%2fsecret.geojson','taoyuan-unknown/221.geojson'])assert.equal((await handler(new Request(base+relative))).status,404);
  assert.equal((await handler(new Request(base+'taoyuan-building-overlay.geojson',{method:'POST'}))).status,405);
});
test('已登入的桃園覆核圖片仍可取得，且不公開快取',async()=>{
 const handler=createOverlayHandler(async()=>new Response(null,{status:200}),async()=>Buffer.from([1,2,3]));
 const r=await handler(new Request(base+'taoyuan-1010-v1/review/17-1.jpg'));assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(r.headers.get('cache-control'),'no-store');
});
test('成功段680地籍與官方截圖仍須桃園登入；匿名不可碰磁碟',async()=>{
  for(const relative of ['taoyuan-1111-v1/parcel-680.geojson','taoyuan-1111-v1/review/680-land-info.jpg']){
    let reads=0;
    const denied=createOverlayHandler(async()=>new Response(null,{status:401}),async()=>{reads++;return Buffer.from('private');});
    assert.equal((await denied(new Request(base+relative))).status,401);
    assert.equal(reads,0);
    const allowed=createOverlayHandler(async()=>new Response(null,{status:200}),async()=>Buffer.from('private'));
    const response=await allowed(new Request(base+relative));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
