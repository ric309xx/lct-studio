import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import worker from '../src/index.js';
import {createCadastralToken,readCadastralToken} from '../src/cadastral-access.mjs';

const origin='https://lctstudio.tw',project='gukeng-20261019',base='https://worker.test';
const hash=s=>createHash('sha256').update(s).digest('hex');
const env={SESSION_SECRET:randomUUID(),SITE_ADMIN_PASSWORD_HASH:hash('synthetic-admin'),SITE_VIEWER_PASSWORD_HASH:hash('synthetic-viewer'),
  LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},MODELS:{get:async()=>{throw Error('Unexpected read');},head:async()=>{throw Error('Unexpected read');}}};
const call=(path,options={},settings=env)=>worker.fetch(new Request(base+path,options),settings);
const post=(action,body,token)=>call('/api/site-access/'+action,{method:'POST',headers:{origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
async function login(role,password){const r=await post('login',{project:'taoyuan-20261006',role,password});assert.equal(r.status,200);return r.json();}

test('only an existing website admin session may exchange for Gukeng, without extending its lifetime',async()=>{
  const admin=await login('admin','synthetic-admin');
  const r=await post('exchange',{project},admin.sessionToken);assert.equal(r.status,200);
  const result=await r.json();assert.equal(result.role,'admin');assert.equal(result.project,project);
  assert.equal(result.sessionExpiresAt,admin.sessionExpiresAt);
  const scope=await readCadastralToken(new Request(base,{headers:{Authorization:'Bearer '+result.token}}),env.SESSION_SECRET);
  assert.equal(scope.role,'viewer');assert.equal(scope.projectId,project);assert.ok(scope.exp<=admin.sessionExpiresAt);
  assert.equal((await post('refresh',{project},result.sessionToken)).status,200);
  assert.equal((await post('refresh',{project:'taoyuan-20261006'},result.sessionToken)).status,401);
  const viewer=await login('viewer','synthetic-viewer');
  for(const token of [undefined,viewer.sessionToken,admin.token,admin.sessionToken+'x'])
    assert.equal((await post('exchange',{project},token)).status,403);
  assert.equal((await post('exchange',{project:'taoyuan-20261006'},admin.sessionToken)).status,403);
  assert.equal((await post('login',{project,role:'admin',password:'synthetic-admin'})).status,403);
});

test('Gukeng asset reads use the fixed compatibility alias and reject other scopes, paths and mutations',async()=>{
  const access=await createCadastralToken(project,env.SESSION_SECRET),other=await createCadastralToken('taoyuan-20261006',env.SESSION_SECRET);
  const tile='/projects/'+project+'/tiles/';let reads=[];
  const settings={...env,MODELS:{get:async key=>{reads.push(key);return {body:'{}',size:2,httpEtag:'"test"'};},head:async key=>{reads.push(key);return {size:2,httpEtag:'"test"'};}}};
  const options=token=>({headers:{origin,...(token?{Authorization:'Bearer '+token}:{})}});
  assert.equal((await call(tile+'output/results-manifest.json',options(),settings)).status,401);
  assert.equal((await call(tile+'output/results-manifest.json',options(other.token),settings)).status,403);
  for(const path of ['settings/private.json','output/unknown.json','compat/results-manifest-cf7dadbfda7cfa18cef7.json'])
    assert.equal((await call(tile+path,options(access.token),settings)).status,404);
  assert.equal((await call(tile+'output/results-manifest.json',{...options(access.token),method:'PUT'},settings)).status,405);
  assert.equal(reads.length,0);
  const r=await call(tile+'output/results-manifest.json',options(access.token),settings);
  assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(reads[0],'survey-results/gukeng-20261019/20261021-v7/compat/results-manifest-cf7dadbfda7cfa18cef7.json');
  const head=await call(tile+'model/tileset.json',{...options(access.token),method:'HEAD'},settings);
  assert.equal(head.status,200);assert.equal(await head.text(),'');
});
