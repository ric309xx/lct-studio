import test from 'node:test';
import assert from 'node:assert/strict';
import {createIonProxy} from '../../netlify/lib/ion-proxy.mjs';
import {writeSession} from '../../netlify/lib/viewer-auth.mjs';
const origin='https://lctstudio.tw';
const env={VIEWER_SESSION_SECRET:'synthetic-session-secret'.repeat(3),CESIUM_ION_ACCESS_TOKEN:'synthetic-master'};
const cookie=writeSession({role:'viewer',accessId:'Y8nA4rK2mP7x'},env).cookie;
const request=(path,extra={})=>new Request(origin+path,{headers:{cookie,...extra}});
test('未登入與跨專案資產不會觸及上游',async()=>{
 let calls=0;const handler=createIonProxy({env:()=>env,fetchUpstream:()=>{calls++;throw Error('Unexpected');}});
 assert.equal((await handler(new Request(origin+'/api/viewer-ion/v1/assets/5124638/endpoint'))).status,401);
 assert.equal((await handler(request('/api/viewer-ion/v1/assets/5105006/endpoint'))).status,403);assert.equal(calls,0);
});
test('ion endpoint 不洩漏任何真實權杖，且子 tileset URL 改走同網域',async()=>{
 const calls=[];const handler=createIonProxy({env:()=>env,fetchUpstream:async(url,options)=>{
   calls.push({url:String(url),options});
   if(String(url).includes('/endpoint')){assert.equal(options.headers.Authorization,'Bearer synthetic-master');return Response.json({type:'3DTILES',url:'https://assets.cesium.com/5124638/tileset.json',accessToken:'synthetic-endpoint-token'});}
   assert.equal(options.headers.Authorization,'Bearer synthetic-endpoint-token');return Response.json({asset:{version:'1.1'},root:{content:{uri:'sub/model.glb'},children:[{content:{url:'https://assets.cesium.com/5124638/sub/tileset.json'}}]}});
 }});
 const endpoint=await handler(request('/api/viewer-ion/v1/assets/5124638/endpoint'));const description=await endpoint.json();
 assert.equal(description.accessToken,'cookie-session');assert.equal(description.url,origin+'/api/viewer-assets/5124638/tileset.json');assert.doesNotMatch(JSON.stringify(description),/synthetic-master|synthetic-endpoint-token/);
 const tile=await handler(request('/api/viewer-assets/5124638/tileset.json?access_token=attacker'));const data=await tile.json();
 assert.equal(data.root.content.uri,origin+'/api/viewer-assets/5124638/sub/model.glb');assert.equal(data.root.children[0].content.url,origin+'/api/viewer-assets/5124638/sub/tileset.json');
 assert.equal(tile.headers.get('cache-control'),'no-store');assert.doesNotMatch(calls.at(-1).url,/attacker/);
});
test('拒絕目錄跳脫與不受信任的來源，無任意 URL 代理',async()=>{
 let reads=0;const handler=createIonProxy({env:()=>env,fetchUpstream:async url=>{
  reads++;return Response.json({type:'3DTILES',url:'https://127.0.0.1/private/tileset.json',accessToken:'private'});
 }});
 assert.equal((await handler(request('/api/viewer-ion/v1/assets/5124638/endpoint'))).status,502);assert.equal(reads,1);
 const safe=createIonProxy({env:()=>env,fetchUpstream:async url=>{if(!String(url).includes('/endpoint'))throw Error('Unexpected tile');return Response.json({type:'3DTILES',url:'https://assets.cesium.com/5124638/tileset.json',accessToken:'scoped'});}});
 for(const tail of ['https%3A%2F%2Fevil.test%2Fx','%252e%252e/secret.bin','sub%5Csecret.bin'])assert.equal((await safe(request('/api/viewer-assets/5124638/'+tail))).status,400);
});
test('二進位 Range 請求保留 206 且不以公開快取提供',async()=>{
 const handler=createIonProxy({env:()=>env,fetchUpstream:async(url,options)=>{
  if(String(url).includes('/endpoint'))return Response.json({type:'3DTILES',url:'https://assets.cesium.com/5124638/tileset.json',accessToken:'scoped'});
  assert.equal(options.headers.Range,'bytes=0-3');return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'Content-Range':'bytes 0-3/10','Content-Type':'model/gltf-binary'}});
 }});
 const r=await handler(request('/api/viewer-assets/5124638/sub/model.glb',{range:'bytes=0-3'}));assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 0-3/10');assert.equal((await r.arrayBuffer()).byteLength,4);
});
test('地形 tiles 與 parentUrl 不可繞過代理，查詢字串不外洩權杖',async()=>{
 const handler=createIonProxy({env:()=>env,fetchUpstream:async url=>String(url).includes('/endpoint')
   ?Response.json({type:'TERRAIN',url:'https://assets.cesium.com/1/',accessToken:'private-endpoint'})
   :Response.json({tiles:['https://assets.cesium.com/1/{z}/{x}/{y}.terrain?v={version}&access_token=must-not-leak'],parentUrl:'https://assets.cesium.com/1/parent/'})});
 const response=await handler(request('/api/viewer-assets/1/layer.json'));assert.equal(response.status,200);
 const body=await response.json();assert.ok(body.tiles[0].startsWith(origin+'/api/viewer-assets/1/'));assert.ok(body.parentUrl.startsWith(origin+'/api/viewer-assets/1/'));
 assert.doesNotMatch(JSON.stringify(body),/must-not-leak|private-endpoint/);
});
test('上游已知過大檔案與沒有 Content-Length 的過大索引均拒絕',async()=>{
 for(const kind of ['binary','json']){
  const handler=createIonProxy({env:()=>env,fetchUpstream:async url=>{
   if(String(url).includes('/endpoint'))return Response.json({type:'3DTILES',url:'https://assets.cesium.com/5124638/tileset.json',accessToken:'scoped'});
   return kind==='binary'?new Response('not-read',{headers:{'Content-Length':String(21*1024*1024)}}):new Response(' '.repeat(5*1024*1024+1));
  }});
  const r=await handler(request('/api/viewer-assets/5124638/'+(kind==='binary'?'large.glb':'large.json')));assert.equal(r.status,kind==='binary'?413:502);
 }
});
test('路徑中的編碼查詢字串不得變成上游參數',async()=>{
 const handler=createIonProxy({env:()=>env,fetchUpstream:async()=>Response.json({type:'3DTILES',url:'https://assets.cesium.com/5124638/tileset.json',accessToken:'scoped'})});
 assert.equal((await handler(request('/api/viewer-assets/5124638/model.glb%3Faccess_token%3Devil'))).status,400);
});
