import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import worker from '../src/index.js';
import {readCadastralToken} from '../src/cadastral-access.mjs';
const project='taoyuan-20261006',origin='http://127.0.0.1:5500',base='/api/site-access/';
const hash=v=>createHash('sha256').update(v).digest('hex');
let reads=0;
const env={LOGIN_RATE_LIMITER:{async limit(){return {success:true};}},ADMIN_PASSWORD_HASH:hash('synthetic-admin'),PROJECT_PASSWORD_HASH:hash('synthetic-viewer'),SITE_LONGDONG_SERVICE_PASSWORD_HASH:hash('synthetic-longdong-service-credential'),SESSION_SECRET:randomUUID(),MODELS:{async get(){reads++;throw Error('Unexpected read');},async put(){throw Error('Unexpected write');}}};
const call=(path,options={})=>worker.fetch(new Request('https://worker.test'+path,options),env);
const post=(path,data,token)=>call(base+path,{method:'POST',headers:{origin,'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
const login=async(role='admin',password='synthetic-admin')=>{const r=await post('login',{project,role,password});assert.equal(r.status,200);return r.json();};
const decode=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url'));
const signed=data=>{const p=Buffer.from(JSON.stringify(data)).toString('base64url');return p+'.'+createHmac('sha256',env.SESSION_SECRET).update(p).digest('hex');};
test('unified login requires a trusted origin and supports CORS without cookies',async()=>{
  for(const headers of [{},{origin:'https://evil.test'}])assert.equal((await call(base+'login',{method:'POST',headers,body:'{}'})).status,403);
  const r=await call(base+'login',{method:'OPTIONS',headers:{origin}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(r.headers.get('access-control-allow-credentials'),null);
  assert.equal((await call(base+'login',{headers:{origin}})).status,405);assert.equal(reads,0);
});
test('Longdong site token is confined to its own mesh and cannot refresh a Taoyuan session',async()=>{
  const mesh='longdong-pix4d-mesh-20260805';
  const result=await post('login',{project:mesh,role:'viewer',password:'synthetic-longdong-service-credential'});
  assert.equal(result.status,200);
  const access=await result.json();
  const payload=await readCadastralToken(new Request('https://worker.test',{headers:{authorization:'Bearer '+access.token}}),env.SESSION_SECRET);
  assert.equal(payload.projectId,mesh);
  assert.equal((await post('refresh',{project},access.sessionToken)).status,401);
  assert.equal((await call(`/projects/${project}/tiles/tileset.json`,{headers:{origin,authorization:'Bearer '+access.token}})).status,403);
  const preflight=await call(`/projects/${mesh}/tiles/tileset.json`,{method:'OPTIONS',headers:{origin}});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
});
test('server passwords only; viewer cannot request an admin website role',async()=>{
  for(const [role,password] of [['admin','synthetic-viewer'],['admin',env.ADMIN_PASSWORD_HASH],['viewer','wrong']]) {
    assert.equal((await post('login',{project,role,password})).status,401);
  }
  assert.equal((await login('viewer','synthetic-viewer')).role,'viewer');
  assert.equal((await login('viewer')).role,'viewer');
});
test('admin website session is project-scoped readonly and cannot serve tiles directly',async()=>{
  const data=await login();assert.equal(data.role,'admin');
  const session=decode(data.sessionToken);assert.equal(session.role,'viewer');assert.equal(session.projectId,project);assert.equal(session.aud,'lct-site-cadastral-session');
  const tile=await readCadastralToken(new Request('https://worker.test',{headers:{authorization:'Bearer '+data.token}}),env.SESSION_SECRET);
  assert.equal(tile.role,'viewer');assert.equal(tile.projectId,project);assert.ok(tile.exp<=Date.now()/1000+3601);
  assert.equal((await call(`/projects/${project}/tiles/tileset.json`,{headers:{origin,authorization:'Bearer '+data.sessionToken}})).status,401);
  assert.equal((await call('/projects/nanya/tiles/tileset.json',{headers:{origin,authorization:'Bearer '+data.token}})).status,401);
  assert.equal((await call(`/projects/${project}/tiles/a.b3dm`,{method:'PUT',headers:{origin,authorization:'Bearer '+data.token}})).status,405);assert.equal(reads,0);
});
test('refresh reuses the same non-sliding session and does not require a second password',async()=>{
  const first=await login();const r=await post('refresh',{project},first.sessionToken);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  const next=await r.json();assert.equal(next.sessionToken,first.sessionToken);assert.equal(next.sessionExpiresAt,first.sessionExpiresAt);assert.equal(next.role,'admin');assert.notEqual(next.token,first.token);
  assert.equal((await post('refresh',{project:'nanya'},first.sessionToken)).status,403);
});
test('refresh rejects tampering, expiration, wrong audience/project/role and tile tokens',async()=>{
  const good=await login(),claims=decode(good.sessionToken);
  for(const token of [undefined,good.token,good.sessionToken+'x',signed({...claims,exp:1}),signed({...claims,aud:'cadastral-tiles'}),signed({...claims,projectId:'nanya'}),signed({...claims,role:'admin'})]) {
    assert.equal((await post('refresh',{project},token)).status,401);
  }
  assert.equal(reads,0);
});
test('read tokens never outlive the website session',async()=>{
  const now=Math.floor(Date.now()/1000),session={role:'viewer',uiRole:'viewer',projectId:project,aud:'lct-site-cadastral-session',iat:now+60-43200,exp:now+60};
  const r=await post('refresh',{project},signed(session));assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.expiresAt,session.exp);
});
test('invalid and oversized requests are rejected',async()=>{
  assert.equal((await post('login',{project,role:'admin',password:'x'.repeat(5000)})).status,413);
  assert.equal((await call(base+'login',{method:'POST',headers:{origin},body:'not json'})).status,400);
  assert.equal((await post('login',{project,role:'admin',password:''})).status,400);
});

test('website-specific passwords override legacy credentials without changing Worker login',async()=>{
  const configured={...env,SITE_ADMIN_PASSWORD_HASH:hash('website-admin'),SITE_VIEWER_PASSWORD_HASH:hash('website-viewer')};
  const website=(role,password)=>worker.fetch(new Request('https://worker.test'+base+'login',{
    method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({project,role,password})
  }),configured);
  for(const [role,password] of [['viewer','synthetic-viewer'],['admin','synthetic-admin'],['admin','website-viewer']]) {
    assert.equal((await website(role,password)).status,401);
  }
  const viewer=await website('viewer','website-viewer');assert.equal(viewer.status,200);assert.equal((await viewer.json()).role,'viewer');
  const admin=await website('admin','website-admin');assert.equal(admin.status,200);assert.equal((await admin.json()).role,'admin');
  const legacy=await worker.fetch(new Request('https://worker.test/login',{
    method:'POST',headers:{origin:'https://worker.test'},body:new URLSearchParams({project,password:'synthetic-admin'})
  }),configured);
  assert.equal(legacy.status,303);assert.ok(legacy.headers.get('set-cookie'));
});

test('Taoyuan customer and Longdong service credentials cannot enter each other or admin',async()=>{
 const mesh='longdong-pix4d-mesh-20260805';
 const servicePassword='synthetic-longdong-service-credential';
 const configured={...env,SITE_LONGDONG_SERVICE_PASSWORD_HASH:hash(servicePassword)};
 const attempt=(target,role,password)=>worker.fetch(new Request('https://worker.test'+base+'login',{
   method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({project:target,role,password})
 }),configured);
 const response=await attempt(mesh,'viewer',servicePassword);assert.equal(response.status,200);
 const access=await response.json();assert.equal(access.role,'viewer');assert.equal(access.project,mesh);
 const claims=await readCadastralToken(new Request('https://worker.test',{headers:{authorization:'Bearer '+access.token}}),env.SESSION_SECRET);
 assert.equal(claims.projectId,mesh);assert.equal(claims.role,'viewer');
 for(const [target,role] of [[project,'viewer'],[project,'admin'],[mesh,'admin']]){
   assert.equal((await attempt(target,role,servicePassword)).status,401);
 }
 for(const role of ['viewer','admin']){
   assert.equal((await attempt(mesh,role,'synthetic-viewer')).status,401);
 }
 for(const [target,role,password] of [[project,'viewer','synthetic-viewer'],[project,'admin','synthetic-admin'],[mesh,'admin','synthetic-admin'],[mesh,'viewer','synthetic-admin']]){
   assert.equal((await attempt(target,role,password)).status,200);
 }
 const legacy=await worker.fetch(new Request('https://worker.test/login',{
   method:'POST',headers:{origin:'https://worker.test'},body:new URLSearchParams({project,password:'synthetic-admin'})
 }),configured);
 assert.equal(legacy.status,303);
 const wrongContext=await worker.fetch(new Request('https://worker.test/login',{
   method:'POST',headers:{origin:'https://worker.test'},body:new URLSearchParams({project,password:servicePassword})
 }),configured);
 assert.equal(wrongContext.headers.get('set-cookie'),null);
 assert.notEqual(wrongContext.headers.get('location'),'/viewer?project='+project);
});

test('missing or malformed Longdong service hash does not weaken existing authentication',async()=>{
 for(const serviceHash of [undefined,'','not-a-sha256-hash']){
  const configured={...env,SITE_LONGDONG_SERVICE_PASSWORD_HASH:serviceHash};
  const request=password=>new Request('https://worker.test'+base+'login',{
    method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({project:'longdong-pix4d-mesh-20260805',role:'viewer',password})
  });
  assert.equal((await worker.fetch(request('synthetic-viewer'),configured)).status,401);
  assert.equal((await worker.fetch(request('synthetic-longdong-service-credential'),configured)).status,401);
 }
});

test('Longteng website read token is scoped and rejects customer/admin/service cross-use',async()=>{
 const target='longteng-20260906',password='synthetic-longdong-service-credential';
 const configured={...env,SITE_LONGDONG_SERVICE_PASSWORD_HASH:hash(password)};
 const attempt=(project,role,password)=>worker.fetch(new Request('https://worker.test'+base+'login',{
   method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({project,role,password})
 }),configured);
 const result=await attempt(target,'viewer',password);assert.equal(result.status,200);
 const access=await result.json();
 const claims=await readCadastralToken(new Request('https://worker.test',{headers:{authorization:'Bearer '+access.token}}),env.SESSION_SECRET);
 assert.equal(claims.projectId,target);assert.equal(claims.role,'viewer');
 assert.equal((await attempt(target,'admin',password)).status,401);
 assert.equal((await attempt(target,'viewer','synthetic-viewer')).status,401);
 assert.equal((await attempt('nanya','viewer',password)).status,403);
 const denied=await worker.fetch(new Request('https://worker.test/projects/longdong-pix4d-mesh-20260805/tiles/tileset.json',{headers:{origin,authorization:'Bearer '+access.token}}),configured);
 assert.equal(denied.status,403);
});
