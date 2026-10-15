import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {normalizeRecords} from '../shared/coordinates.mjs';

test('同名實測成果自動確認附近原點，保留異地同號及人工點況，重試不重複寫入',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'presence-rule-test',modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-10-01',d1Databases:['DB']}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
    for(const id of ['original','measured','other'])await db.prepare('INSERT INTO datasets(id,name,crs,epsg,height_type,imported_at) VALUES(?,?,?,?,?,?)').bind(id,id,'TWD97 / TM2 121 分帶',3826,'正高','2026-10-15T00:00:00Z').run();
    async function add(dataset,code,north,east,{status='未巡查',survey=false}={}){
      const raw=survey?{__survey:{version:1,sourceHash:'a'.repeat(64),results:[{originalCode:code+'.20261015.001',date:'2026-10-15',systems:[{name:'TWD97 / TM2 121 分帶',epsg:3826,north,east,orthometricHeight:10}]}]}}:{};
      const point=normalizeRecords([{code,north,east,height:10,raw}],{id:dataset,epsg:3826,height_type:'正高'}).points[0];
      const keys=Object.keys(point);await db.prepare(`INSERT INTO points(${keys.join(',')},status,updated_at) VALUES(${keys.map(()=>'?').join(',')},?,?)`).bind(...keys.map(k=>point[k]??null),status,'2026-10-15T00:00:00Z').run();return point;
    }
    const original=await add('original','GLD5',2762745.231,271372.362),far=await add('other','GLD5',2762845.231,271472.362);
    const measured=await add('measured','GLD5',2762745.25,271372.4,{survey:true});
    const get=id=>db.prepare('SELECT * FROM points WHERE id=?').bind(id).first();
    assert.equal((await get(original.id)).status,'點位存在');assert.equal((await get(original.id)).version,2);assert.equal((await get(far.id)).status,'未巡查');assert.equal((await get(measured.id)).status,'未巡查');
    const audit=await db.prepare("SELECT * FROM audits WHERE point_id=? AND action='measurement_presence'").bind(original.id).all();assert.equal(audit.results.length,1);assert.equal(JSON.parse(audit.results[0].after_json).measurementPointId,measured.id);
    await db.prepare('UPDATE points SET raw=raw WHERE id=?').bind(measured.id).run();assert.equal((await db.prepare('SELECT COUNT(*) total FROM audits').first()).total,1);
    for(const [i,status] of ['找不到','滅失','損壞','無法進入','新設點位'].entries()){
      const code='KEEP'+i,p=await add('original',code,2762745.231+i*20,271372.362,{status});await add('measured',code,2762745.231+i*20,271372.362,{survey:true});assert.equal((await get(p.id)).status,status);
    }
    await add('measured','LATER',2762745.231,271372.362,{survey:true});const later=await add('original','LATER',2762745.231,271372.362);assert.equal((await get(later.id)).status,'點位存在','後匯入的原點亦能確認');
    const plain=await add('original','NO-GPS-PROOF',2762745.231,271372.362);await add('measured','NO-GPS-PROOF',2762745.231,271372.362);assert.equal((await get(plain.id)).status,'未巡查','僅有同號坐標、缺少測量成果不自動確認');
  }finally{await mf.dispose();}
});
