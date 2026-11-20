import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {createGateway} from '../../netlify/lib/viewer-gateway.mjs';
import {createIonProxy} from '../../netlify/lib/ion-proxy.mjs';
import {catalog,writeSession,readSession,scopeFor,allowedAsset} from '../../netlify/lib/viewer-auth.mjs';

const origin='https://lctstudio.tw';
const retired=[['K8mQ4xT7cN2v','linkou-factory',5094702],['R9wP3sL6dA5z','sanxia-solar',5100866]];
const password='synthetic-retired-share-password',salt='b'.repeat(32);
const verifier={algorithm:'pbkdf2-sha256',iterations:600000,salt,hash:pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex')};
const env={VIEWER_SESSION_SECRET:randomBytes(32).toString('hex'),VIEWER_ACCESS_CREDENTIALS:JSON.stringify(Object.fromEntries(retired.map(([id])=>[id,verifier])))};
const request=(action,accessId,cookie)=>new Request(origin+'/api/viewer-session/'+action,{method:'POST',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({accessId,password})});

test('retired shares reject login even while their old credential verifier is retained',async()=>{
 let upstreamCalls=0;const gateway=createGateway({env:()=>env,fetchUpstream:()=>{upstreamCalls++;throw Error('Unexpected upstream');}});
 for(const [id,projectId,assetId] of retired){
  assert.equal(catalog.retiredEntries[id].assetId,assetId);
  assert.equal(Object.hasOwn(catalog.entries,id),false);
  assert.equal(catalog.projects.some(p=>p.id===projectId),false);
  assert.equal((await gateway(request('login',id))).status,404);
 }
 assert.equal(upstreamCalls,0);
});

test('validly signed retired share cookies cannot restore or read their old ion assets; admins also lose retired asset access',async()=>{
 let upstreamCalls=0;const fetchUpstream=()=>{upstreamCalls++;throw Error('Unexpected upstream');};
 const gateway=createGateway({env:()=>env,fetchUpstream});
 const proxy=createIonProxy({env:()=>env,fetchUpstream});
 const adminCookie=writeSession({role:'admin',accessId:'admin'},env).cookie;
 for(const [id,,assetId] of retired){
  const cookie=writeSession({role:'viewer',accessId:id},env).cookie;
  assert.equal(readSession(new Request(origin,{headers:{cookie}}),env),null);
  assert.equal(scopeFor({role:'viewer',accessId:id}),null);
  assert.equal((await gateway(request('refresh',id,cookie))).status,401);
  assert.equal((await proxy(new Request(origin+`/api/viewer-ion/v1/assets/${assetId}/endpoint`,{headers:{cookie}}))).status,401);
  assert.equal((await proxy(new Request(origin+`/api/viewer-ion/v1/assets/${assetId}/endpoint`,{headers:{cookie:adminCookie}}))).status,403);
  assert.equal(allowedAsset({role:'admin',accessId:'admin'},assetId),false);
 }
 assert.equal(upstreamCalls,0);
});

test('retired tabs can still clear only their own cookie through normal logout',async()=>{
 const gateway=createGateway({env:()=>env});
 for(const [id] of retired){
  const response=await gateway(request('logout',id));assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.ok(response.headers.get('set-cookie').startsWith('__Host-lct-viewer-v3-'+id+'=;'));
  assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  assert.doesNotMatch(response.headers.get('set-cookie'),/v3-admin=/);
 }
 assert.equal((await gateway(request('logout','unknown'))).status,400);
});
