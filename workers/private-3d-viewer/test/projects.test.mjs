import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import vm from 'node:vm';
import worker from '../src/index.js';
import {PROJECTS} from '../src/projects.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const keys=[];
const env={PROJECT_PASSWORD_HASH:hash('test-viewer'),ADMIN_PASSWORD_HASH:hash('test-admin'),SESSION_SECRET:randomUUID(),MODELS:{
  async get(key){ keys.push(key); if(key.startsWith('settings/'))return null; return {body:new Uint8Array([1,2,3,4]),size:4,httpEtag:'"test"',range:{offset:0,length:4},writeHttpMetadata:h=>h.set('content-type',key.endsWith('.json')?'application/json':'model/vnd.b3dm')}; },
  async head(key){keys.push(key);return {size:4,httpEtag:'"test"',writeHttpMetadata:h=>h.set('content-type','model/vnd.b3dm')};},
  async put(){throw Error('Unexpected storage write');}
}};
const call=(url,options={})=>worker.fetch(new Request('https://viewer.test'+url,options),env);
async function login(password='test-viewer',project='longteng-20260906'){
  const response=await call('/login',{method:'POST',body:new URLSearchParams({password,project})});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/viewer?project='+project);
  return response.headers.get('set-cookie').split(';')[0];
}
test('private routes reject unauthenticated requests before storage access',async()=>{
  for(const url of ['/tiles/tileset.json','/projects/longteng-20260906/tiles/tileset.json','/api/landmarks?project=longteng-20260906'])assert.equal((await call(url)).status,401);
  assert.equal(keys.length,0);
});
test('deep link survives login redirect and form',async()=>{
  const r=await call('/viewer?project=longteng-20260906');
  assert.equal(r.headers.get('location'),'/?project=longteng-20260906');
  assert.match(await (await call('/?project=longteng-20260906')).text(),/name="project" value="longteng-20260906"/);
});
test('both projects and legacy Nanya URLs resolve only fixed prefixes',async()=>{
  const cookie=await login('test-admin');
  for(const [url,key] of [['/tiles/tileset.json',PROJECTS.nanya.prefix+'tileset.json'],['/projects/nanya/tiles/Block/a.b3dm',PROJECTS.nanya.prefix+'Block/a.b3dm'],['/projects/longteng-20260906/tiles/Block/a.b3dm',PROJECTS['longteng-20260906'].prefix+'Block/a.b3dm'],['/projects/heping-seawall-20260922/tiles/Block/a.b3dm',PROJECTS['heping-seawall-20260922'].prefix+'Block/a.b3dm']]){
    const r=await call(url,{headers:{cookie}});assert.equal(r.status,200);assert.equal(keys.at(-1),key);
  }
});
test('unknown project and encoded traversal never access storage',async()=>{
  const cookie=await login('test-admin'),before=keys.length;
  for(const url of ['/projects/__proto__/tiles/a','/projects/nope/tiles/a','/projects/longteng-20260906/tiles/%2e%2e%2fsecret','/projects/longteng-20260906/tiles/%252e%252e%252fsecret','/tiles/%5csecret','/tiles/%00secret','/viewer?project=nope','/api/landmarks?project=constructor'])assert.ok([400,404].includes((await call(url,{headers:{cookie}})).status),url);
  assert.equal(keys.length,before);
});
test('GET, HEAD, Range and method restriction retain private response headers',async()=>{
  const cookie=await login('test-admin');
  const r=await call('/projects/longteng-20260906/tiles/a.b3dm',{headers:{cookie,range:'bytes=0-3'}});
  assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 0-3/4');assert.equal(r.headers.get('content-type'),'model/vnd.b3dm');assert.match(r.headers.get('cache-control'),/^private/);
  const head=await call('/tiles/a.b3dm',{method:'HEAD',headers:{cookie}});assert.equal(head.status,200);assert.equal(head.body,null);
  assert.equal((await call('/tiles/a.b3dm',{method:'POST',headers:{cookie}})).status,405);
});
test('project landmarks are isolated and viewers cannot write',async()=>{
  const cookie=await login('test-admin');
  for(const p of Object.values(PROJECTS).filter(project=>project.landmarks!==false)){
    assert.equal((await call('/api/landmarks?project='+p.id,{headers:{cookie}})).status,200);assert.equal(keys.at(-1),p.landmarksKey);
    assert.equal((await call('/api/landmarks?project='+p.id,{method:'PUT',headers:{cookie}})).status,403);
  }
  assert.equal((await call('/api/landmarks?project=heping-seawall-20260922',{headers:{cookie}})).status,404);
});
test('both roles get project selection and generated client JavaScript parses',async()=>{
  for(const password of ['test-viewer','test-admin']){
    for(const p of Object.values(PROJECTS)){
      const cookie=await login(password,p.id);
      const html=await (await call('/viewer?project='+p.id,{headers:{cookie}})).text();
      assert.ok(html.includes('<h1>'+p.name+'</h1>'));assert.match(html,/releases\/1\.143\//);
      assert.equal(html.includes('value="'+p.id+'" selected'),password==='test-admin');
      assert.equal(html.includes('id="project-select"'),password==='test-admin');
      if(p.measurementOnly){assert.ok(!html.includes('id="sun-button"'));assert.ok(!html.includes('id="cadastral-button"'));assert.ok(html.includes('/projects/'+p.id+'/cover'));}
      if(p.id === 'heping-seawall-20260922'){
        assert.deepEqual(p.camera.position, [-3062344.449672097, 4944636.656337088, 2609222.143359909]);
        assert.equal(p.camera.direction.length, 3);
        assert.equal(p.camera.up.length, 3);
      }
    }
  }
  const js=await (await call('/app.js')).text();new vm.Script(js);
  assert.match(js,/dataset\.role === "admin"/);
  assert.ok(!js.includes(PROJECTS['longteng-20260906'].prefix));
});
test('viewer session is restricted to its login project',async()=>{
  const cookie=await login('test-viewer','heping-seawall-20260922');
  assert.equal((await call('/viewer?project=nanya',{headers:{cookie}})).status,403);
  assert.equal((await call('/tiles/tileset.json',{headers:{cookie}})).status,403);
  assert.equal((await call('/projects/longteng-20260906/tiles/tileset.json',{headers:{cookie}})).status,403);
  assert.equal((await call('/projects/heping-seawall-20260922/tiles/tileset.json',{headers:{cookie}})).status,200);
});
