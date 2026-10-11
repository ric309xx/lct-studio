import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import worker from '../src/index.js';
import {PROJECTS} from '../src/projects.mjs';
import {createCadastralToken,readCadastralToken} from '../src/cadastral-access.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const project='taoyuan-20261006', origin='http://127.0.0.1:5500', keys=[];
const env={PROJECT_PASSWORD_HASH:hash('test-password'),ADMIN_PASSWORD_HASH:hash('test-admin'),SESSION_SECRET:randomUUID(),MODELS:{
  async get(key){keys.push(key);return {body:new Uint8Array([1,2,3,4]),size:4,httpEtag:'"test"',range:{offset:0,length:4},writeHttpMetadata:h=>h.set('content-type',key.endsWith('.json')?'application/json':'model/vnd.b3dm')};},
  async head(key){keys.push(key);return {size:4,httpEtag:'"test"',writeHttpMetadata:h=>h.set('content-type','model/vnd.b3dm')};},
  async put(){throw Error('Unexpected write');}
}};
const call=(path,options={})=>worker.fetch(new Request('https://worker.test'+path,options),env);
const connect=`/connect?project=${project}&origin=${encodeURIComponent(origin)}&state=${randomUUID()}`;
async function login(id=project,returnTo=connect){
  const r=await call('/login',{method:'POST',body:new URLSearchParams({project:id,password:'test-password',returnTo})});
  assert.equal(r.status,303);return {response:r,cookie:r.headers.get('set-cookie').split(';')[0]};
}
test('connect accepts only explicit origins, cadastral project and nonce',async()=>{
  assert.equal((await call(connect)).status,200);
  for(const path of [connect.replace(encodeURIComponent(origin),encodeURIComponent('https://evil.test')),connect.replace(project,'nanya'),connect.replace(/state=[^&]+/,'state=bad')])assert.equal((await call(path)).status,400);
  const initial=await(await call(connect)).text();assert.match(initial,/cadastral-connect.js/);
  const html=await(await call(connect+'&login=1')).text();assert.match(html,/name="returnTo"/);assert.match(html,/&amp;origin=/);
});
test('successful login returns to connect and issues short-lived project-scoped read token',async()=>{
  const {cookie,response}=await login();assert.equal(response.headers.get('location'),connect);
  const result=await call('/api/cadastral-access?project='+project,{headers:{cookie}});assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
  const data=await result.json(),session=await readCadastralToken(new Request('https://worker.test',{headers:{authorization:'Bearer '+data.token}}),env.SESSION_SECRET);
  assert.equal(session.projectId,project);assert.equal(session.role,'viewer');assert.ok(data.expiresAt>Date.now()/1000);
  const html=await(await call(connect,{headers:{cookie}})).text();assert.match(html,/cadastral-connect.js/);assert.ok(!html.includes(data.token));
});
test('token API requires cookie and rejects a different viewer project',async()=>{
  assert.equal((await call('/api/cadastral-access?project='+project)).status,401);
  const {cookie}=await login('nanya','');assert.equal((await call('/api/cadastral-access?project='+project,{headers:{cookie}})).status,403);
});
test('CORS preflight does not read storage and denies unknown origins',async()=>{
  const before=keys.length,path=`/projects/${project}/tiles/tileset.json`;
  const ok=await call(path,{method:'OPTIONS',headers:{origin}});assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-origin'),origin);
  assert.equal((await call(path,{method:'OPTIONS',headers:{origin:'https://evil.test'}})).status,403);assert.equal(keys.length,before);
});
test('bearer tile access uses fixed prefix and preserves Range/HEAD/privacy headers',async()=>{
  const {token}=await createCadastralToken(project,env.SESSION_SECRET),headers={origin,authorization:'Bearer '+token,range:'bytes=0-3'};
  const response=await call(`/projects/${project}/tiles/Block/a.b3dm`,{headers});assert.equal(response.status,206);
  assert.equal(keys.at(-1),PROJECTS[project].prefix+'Block/a.b3dm');assert.equal(response.headers.get('content-range'),'bytes 0-3/4');assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.match(response.headers.get('cache-control'),/^private/);assert.match(response.headers.get('vary'),/Authorization/);
  assert.equal((await call(`/projects/${project}/tiles/a.b3dm`,{method:'HEAD',headers})).status,200);
  assert.equal((await call(`/projects/${project}/tiles/a.b3dm`,{method:'PUT',headers})).status,405);
  assert.equal((await call('/projects/nanya/tiles/tileset.json',{headers})).status,401);
  assert.equal((await call(`/projects/${project}/tiles/%2e%2e%2fsecret`,{headers})).status,400);
});
test('tampered, expired and wrong audience tokens fail before storage',async()=>{
  const {token}=await createCadastralToken(project,env.SESSION_SECRET);
  const signed=data=>{const p=Buffer.from(JSON.stringify(data)).toString('base64url');return p+'.'+createHmac('sha256',env.SESSION_SECRET).update(p).digest('hex');};
  const before=keys.length;
  for(const t of [token.slice(0,-1)+(token.endsWith('a')?'b':'a'),signed({role:'viewer',projectId:project,aud:'cadastral-tiles',exp:1}),signed({role:'viewer',projectId:project,aud:'wrong',exp:Date.now()/1000+300})])assert.equal((await call(`/projects/${project}/tiles/tileset.json`,{headers:{authorization:'Bearer '+t,origin}})).status,401);
  assert.equal(keys.length,before);
});
test('login ignores external return redirects',async()=>{
  const {response}=await login(project,'https://evil.test/');assert.equal(response.headers.get('location'),'/viewer?project='+project);
});
