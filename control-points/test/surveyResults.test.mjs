import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {build} from 'esbuild';
import {surveyResults,isSurveyReport} from '../shared/surveyResults.mjs';
import {sourceAttributes} from '../shared/attributes.mjs';
test('dual coordinates stay distinct and structured observations do not flood source attributes',()=>{
  const survey={version:1,results:[{systems:[{name:'EGNSS2025',north:2762000},{name:'TWD97',north:2762000.2}]}]};
  assert.deepEqual(surveyResults(JSON.stringify({__survey:survey})),survey);assert.equal(surveyResults('{bad'),null);
  assert.deepEqual(sourceAttributes({N:1,__survey:survey}),[{label:'N',value:1,text:'1'}]);assert.equal(isSurveyReport({category:'GPS測量報告'}),true);assert.equal(isSurveyReport({category:'遠照'}),false);
  assert.equal(surveyResults('{"other":"source fields"}'),null);
});
test('revised survey source and coordinates preserve point IDs, notes, photos, visits and archived sources',async()=>{
  const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const mf=new Miniflare(convertV4MiniflareOptions({name:'survey',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{APP_ENV:'test'},serviceBindings:{ASSETS:()=>new Response('app')}}));
  try{
    const db=await mf.getD1Database('DB'),files=await mf.getR2Bucket('FILES');await db.exec(readFileSync('schema.sql','utf8'));
    const oldHash='a'.repeat(64);await db.prepare("INSERT INTO datasets VALUES('survey','115年測量控制點','TWD97',3826,'橢球高',NULL,'old.xlsx',?,'old-source','2026-10-11','{\"color\":\"yellow\"}')").bind(oldHash).run();await files.put('old-source','old workbook');
    await db.prepare("INSERT INTO points(id,dataset_id,code,original_code,north,east,height,lon,lat,crs,epsg,height_type,notes,status,favorite,raw,updated_at) VALUES('p','survey','CL11','old.001',2762845.902,271609.721,136.894,121.2140384,24.97337793,'TWD97',3826,'橢球高','現場私人備註','完好',1,'{}','2026-10-11')").run();
    await db.prepare("INSERT INTO visits VALUES('v','p','完好','巡查備註','2026-10-12',NULL,'2026-10-12')").run();
    await db.prepare("INSERT INTO attachments VALUES('photo','p',NULL,'photo-object',NULL,'CL11.jpg','image/jpeg',3,'近照',NULL,NULL,'ready',NULL,'2026-10-12')").run();await files.put('photo-object','jpg');
    await db.prepare('INSERT INTO sessions VALUES(?,?)').bind(createHash('sha256').update('survey-test').digest('hex'),Math.floor(Date.now()/1000)+600).run();
    const req=async(path,options={})=>{const r=new Request('http://localhost'+path,{...options,headers:{Cookie:'lct_points_session=survey-test',...options.headers}});return mf.dispatchFetch(r.url,{method:r.method,headers:Object.fromEntries(r.headers),body:r.body?await r.arrayBuffer():undefined});};
    const source=()=>{const f=new FormData();f.set('source',new File([new Uint8Array([80,75,3,4,5])],'new.xlsx'));f.set('payload',JSON.stringify({expected_source_hash:oldHash,metadata:{surveySystems:['EGNSS2025','TWD97']}}));return f;};
    assert.equal((await mf.dispatchFetch('http://localhost/api/datasets/survey/revisions',{method:'POST',body:source()})).status,401);
    assert.equal((await req('/api/datasets/survey/revisions',{method:'POST',body:source(),headers:{Origin:'https://evil.example'}})).status,403);
    const revised=await req('/api/datasets/survey/revisions',{method:'POST',body:source()});assert.equal(revised.status,200);const {hash}=await revised.json();
    const d=await db.prepare("SELECT * FROM datasets WHERE id='survey'").first();assert.equal(d.height_type,'正高');assert.equal(JSON.parse(d.metadata).color,'yellow');assert.equal(JSON.parse(d.metadata).sourceRevisions[0].hash,oldHash);assert.equal(await(await files.get('old-source')).text(),'old workbook');
    assert.equal((await(await req('/api/datasets/survey/revisions',{method:'POST',body:source()})).json()).duplicate,true);
    assert.equal(await(await req('/api/datasets/survey/source?hash='+oldHash)).text(),'old workbook');assert.equal((await req('/api/datasets/survey/source?hash=missing')).status,404);
    const record={code:'CL11',original_code:'new.002',north:2762846.131,east:271609.234,height:117.271,source_row:35,source_sheet:'工作表1',raw:{N:2762846.131,__survey:{version:1,sourceHash:hash,results:[{originalCode:'new.002',systems:[{name:'EGNSS2025',north:2762845.913,east:271609.719},{name:'TWD97',north:2762846.131,east:271609.234}]}]}}};
    const update=data=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await req('/api/points/p/measurements',update({version:0,source_hash:hash,record}))).status,409);
    assert.equal((await req('/api/points/p/measurements',update({version:1,source_hash:oldHash,record}))).status,409);
    assert.equal((await req('/api/points/p/measurements',update({version:1,source_hash:hash,record:{...record,east:270000}}))).status,409);
    const result=await req('/api/points/p/measurements',update({version:1,source_hash:hash,record}));assert.equal(result.status,200,await result.clone().text());
    const p=await db.prepare("SELECT * FROM points WHERE id='p'").first();assert.equal(p.id,'p');assert.equal(p.notes,'現場私人備註');assert.equal(p.favorite,1);assert.equal(p.status,'完好');assert.equal(p.height_type,'正高');assert.equal(p.height,117.271);assert.equal(p.version,2);assert.equal(surveyResults(p.raw).results[0].systems.length,2);
    assert.equal((await(await req('/api/points/p/measurements',update({version:1,source_hash:hash,record}))).json()).duplicate,true);assert.equal((await db.prepare("SELECT count(*) n FROM audits WHERE action='survey_results'").first()).n,1);
    const audit=await db.prepare("SELECT * FROM audits WHERE action='survey_results'").first();assert.equal(JSON.parse(audit.before_json).height,136.894);
    assert.equal((await db.prepare("SELECT point_id FROM attachments WHERE id='photo'").first()).point_id,'p');assert.equal((await db.prepare("SELECT point_id FROM visits WHERE id='v'").first()).point_id,'p');
    // 另一台匯入雙坐標後，原有巡查與照片編輯仍保留完整測量成果。
    const revisionBefore=(await(await req('/api/points-revision')).json()).revision;
    const patch=data=>({...update(data),method:'PATCH'});
    assert.equal((await req('/api/points/p/visits/v',patch({status:'點位存在',note:'重新確認現場',expectedStatus:'完好',expectedNote:'巡查備註'}))).status,200);
    assert.equal((await req('/api/points/p/attachments/photo',patch({category:'遠照',expectedCategory:'近照'}))).status,200);
    const edited=await db.prepare("SELECT * FROM points WHERE id='p'").first();
    assert.equal(edited.status,'點位存在');assert.equal(edited.raw,p.raw);assert.equal(edited.north,p.north);assert.equal(edited.height,p.height);
    assert.equal(await(await files.get('photo-object')).text(),'jpg');
    assert.notEqual((await(await req('/api/points-revision')).json()).revision,revisionBefore);
  }finally{await mf.dispose();}
});
