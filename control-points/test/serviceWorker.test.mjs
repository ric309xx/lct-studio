import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const origin='https://points.example';
const cacheName='lct-points-shell-test-build';
function worker({status=200,offline=false}={}){
  const handlers={},navigations=[],requests=[],deleted=[];
  const shell=new Map([['/',new Response('current offline shell')]]);
  const client={type:'window',url:origin+'/?field=1',navigate:async url=>navigations.push(url)};
  const cache={match:async key=>shell.get(key),put:async(key,value)=>shell.set(key,value),addAll:async()=>{}};
  const self={location:{origin},addEventListener:(name,handler)=>{handlers[name]=handler;},skipWaiting:async()=>{},clients:{claim:async()=>{},get:async id=>id==='old-tab'?client:undefined}};
  runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8').replace('__BUILD__','test-build'),{
    self,URL,
    fetch:async(request,options)=>{requests.push({request,options});if(offline)throw new Error('offline');return new Response('server response',{status});},
    caches:{open:async name=>{assert.equal(name,cacheName);return cache;},keys:async()=>['lct-points-shell-old',cacheName,'lct-points-photos'],delete:async name=>deleted.push(name),match:async()=>undefined}
  });
  async function dispatch(path,{method='GET',mode='cors',clientId='old-tab'}={}){
    const pending=[];let response;
    handlers.fetch({request:{url:new URL(path,origin).href,method,mode},clientId,respondWith:value=>{response=Promise.resolve(value);},waitUntil:value=>pending.push(value)});
    const result=await response;await Promise.all(pending);return result;
  }
  return {dispatch,handlers,navigations,requests,deleted};
}

test('an old mobile login receiving 409 reloads only its own tab with a fresh URL',async()=>{
  const w=worker({status:409}),response=await w.dispatch('/api/login',{method:'POST'});
  assert.equal(response.status,409);
  assert.equal(w.navigations.length,1);
  const target=new URL(w.navigations[0]);
  assert.equal(target.origin,origin);assert.equal(target.searchParams.get('field'),'1');
  assert.equal(target.searchParams.get('app-update'),cacheName);
  assert.equal(w.requests.length,1,'login request is never replayed');
});

test('normal login, wrong passwords, network failure and other API conflicts never reload',async()=>{
  for(const status of [200,401,429,500]){
    const w=worker({status});assert.equal((await w.dispatch('/api/login',{method:'POST'})).status,status);assert.deepEqual(w.navigations,[]);
  }
  const missing=worker({status:409});await missing.dispatch('/api/login',{method:'POST',clientId:''});assert.deepEqual(missing.navigations,[]);
  const offline=worker({offline:true});await assert.rejects(offline.dispatch('/api/login',{method:'POST'}),/offline/);assert.deepEqual(offline.navigations,[]);
  for(const path of ['/api/points/one','/api/login/challenge','/files/photo','https://other.example/api/login']){
    const w=worker({status:409});assert.equal(await w.dispatch(path,{method:'POST'}),undefined);assert.equal(w.requests.length,0);assert.deepEqual(w.navigations,[]);
  }
});

test('navigation bypasses HTTP cache online and uses the current offline shell offline',async()=>{
  const online=worker();assert.equal(await(await online.dispatch('/?app-update=new',{mode:'navigate'})).text(),'server response');
  assert.equal(online.requests[0].options.cache,'no-store');
  const offline=worker({offline:true});assert.equal(await(await offline.dispatch('/',{mode:'navigate'})).text(),'current offline shell');
});

test('activation removes only obsolete app shells without navigating working tabs',async()=>{
  const w=worker(),pending=[];w.handlers.activate({waitUntil:p=>pending.push(p)});await Promise.all(pending);
  assert.deepEqual(w.deleted,['lct-points-shell-old']);assert.deepEqual(w.navigations,[]);
});
