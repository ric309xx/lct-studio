import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {readFileSync} from 'node:fs';import {pbkdf2Sync} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {createLoginProof} from '../shared/loginProof.mjs';

test('巡查可保存滅失，修改歷史巡查不覆蓋較新點況，修改最新巡查立即更新點況',async()=>{
  const salt='status-test-salt',password='isolated-status-test-only',bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({name:'point-status-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:()=>new Response('test')}}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));let cookie='';
    const request=async(path,options={})=>{const req=new Request('http://localhost'+path,{...options,headers:{Cookie:cookie,...options.headers}});return mf.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers),body:req.body?await req.arrayBuffer():undefined});};
    const j=(data,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const challenge=await(await request('/api/login/challenge',{method:'POST'})).json();const response=await request('/api/login',j(await createLoginProof(password,challenge)));assert.equal(response.status,200);cookie=response.headers.get('set-cookie').split(';')[0];
    const form=new FormData();form.set('source',new File(['isolated status fixture'],'status.txt'));form.set('payload',JSON.stringify({dataset:{id:'status-test',name:'點況測試',epsg:3826,height_type:'正高'},records:[{code:'QA-STATUS',north:2762745.231,east:271372.362,height:118.12}]}));assert.equal((await request('/api/import',{method:'POST',body:form})).status,200);
    const p=(await(await request('/api/points?dataset=status-test')).json())[0],visits=[];
    for(const [i,status] of ['新設點位','找不到','滅失','完好'].entries()){
      const visit={id:crypto.randomUUID(),status,note:status+'測試',visited_at:`2026-10-15T15:00:0${i}Z`};visits.push(visit);
      assert.equal((await request(`/api/points/${p.id}/visits`,j(visit))).status,200);
      assert.equal((await(await request('/api/points/'+p.id)).json()).status,status);
    }
    const edit=async(v,status,note)=>request(`/api/points/${p.id}/visits/${v.id}`,j({status,note,expectedStatus:v.status,expectedNote:v.note},'PATCH'));
    assert.equal((await edit(visits[0],'滅失','早期補記')).status,200);assert.equal((await(await request('/api/points/'+p.id)).json()).status,'完好');
    assert.equal((await edit(visits[3],'滅失','最新確認滅失')).status,200);assert.equal((await(await request('/api/points/'+p.id)).json()).status,'滅失');
    const history=await(await request(`/api/points/${p.id}/visits`)).json();assert.equal(history.length,4);assert.equal(history.find(v=>v.id===visits[3].id).note,'最新確認滅失');
  }finally{await mf.dispose();}
});
