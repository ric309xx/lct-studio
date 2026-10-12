import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readAllPages,readBackup} from '../shared/pages.mjs';

test('7301 full records: bounded pages preserve attributes, dataset identity, trash and backup',async()=>{
  const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({name:'pages',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{APP_ENV:'test'},serviceBindings:{ASSETS:()=>new Response('app')}}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
    await db.prepare('INSERT INTO sessions VALUES (?,?)').bind(createHash('sha256').update('pages-test').digest('hex'),Math.floor(Date.now()/1000)+600).run();
    for(const id of ['a','b'])await db.prepare("INSERT INTO datasets(id,name,crs,epsg,height_type,imported_at) VALUES (?,?,'TWD97',3826,'橢球高','2026-10-13')").bind(id,id).run();
    const raw=JSON.stringify({source:'原始資料',attributes:'測量屬性'.repeat(400)});
    const stmt=db.prepare("INSERT INTO points(id,dataset_id,code,original_code,north,east,lon,lat,crs,epsg,height_type,raw,updated_at,deleted_at) VALUES (?,?,?,'duplicate-original',2770000,250000,121,25,'TWD97',3826,'橢球高',?,'2026-10-13',?)");
    for(let offset=0;offset<7302;offset+=100)await db.batch(Array.from({length:Math.min(100,7302-offset)},(_,j)=>{const n=offset+j;return stmt.bind(String(n).padStart(6,'0'),n%2?'a':'b','CL'+n,raw,n===7301?'2026-10-13':null);}));
    const request=path=>mf.dispatchFetch('http://localhost'+path,{headers:{Cookie:'lct_points_session=pages-test'}});
    const pages=[];const json=async path=>{const response=await request(path);assert.equal(response.status,200);const data=await response.json();if(data.items){assert.ok(data.items.length<=200);pages.push(data.items.length);}return data;};
    assert.equal((await mf.dispatchFetch('http://localhost/api/points?paged=1')).status,401);
    const progress=[],points=await readAllPages(json,'/api/points',n=>progress.push(n));
    assert.equal(points.length,7301);assert.equal(pages.length,37);assert.equal(progress.at(-1),7301);assert.equal(new Set(points.map(p=>p.id)).size,7301);
    assert.ok(points.every(p=>p.raw===raw&&p.original_code==='duplicate-original'));
    assert.equal((await readAllPages(json,'/api/points?dataset=a')).length,3650);
    assert.equal((await readAllPages(json,'/api/points?trash=1')).length,1);
    for(const limit of ['0','201','x'])assert.equal((await request('/api/points?paged=1&limit='+limit)).status,400);
    assert.equal((await request('/api/backup?table=sessions')).status,400);
    const backup=await readBackup(json);assert.equal(backup.points.length,7302);assert.equal(backup.datasets.length,2);assert.equal(backup.version,1);
    const offline=await json('/api/offline?metadata=1&dataset=a');assert.equal(offline.points.length,0);assert.equal(offline.datasets.length,1);
  }finally{await mf.dispose();}
});

test('failed or inconsistent pages reject the whole read',async()=>{
  let calls=0;
  await assert.rejects(readAllPages(async()=>{if(calls++)throw new Error('connection lost');return {items:[{id:'a'}],next:'a'};},'/api/points'),/connection lost/);
  await assert.rejects(readAllPages(async()=>({items:[{id:'a'}],next:'a'}),'/api/points'),/不一致/);
  await assert.rejects(readAllPages(async()=>({items:[],next:'a'}),'/api/points'),/未前進/);
});
