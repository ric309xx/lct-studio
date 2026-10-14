import {createLoginProof} from '../shared/loginProof.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pbkdf2Sync,createHash} from 'node:crypto';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {build} from 'esbuild';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('獨立本機環境：登入、匯入、照片重試、巡查、回收與還原',async()=>{
  const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const password='integration-test-only',salt='integration-test-salt';
  const mf=new Miniflare(convertV4MiniflareOptions({name:'test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:req=>new Response('app',{headers:{'Content-Type':new URL(req.url).pathname.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'public, max-age=0, must-revalidate'}})}}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
    let cookie='';const request=async(path,options={})=>{const r=new Request('http://localhost'+path,{...options,headers:{Cookie:cookie,...options.headers}});return mf.dispatchFetch(r.url,{method:r.method,headers:Object.fromEntries(r.headers),body:r.body?await r.arrayBuffer():undefined});};
    const j=(data,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    for(const path of ['/','/?app-update=mobile','/index.html','/sw.js'])assert.equal((await request(path)).headers.get('cache-control'),'no-store',path);
    assert.equal((await request('/assets/index-test.js')).headers.get('cache-control'),'public, max-age=0, must-revalidate');
    assert.equal((await request('/api/points')).status,401);
    assert.equal((await request('/api/places?q=中壢車站')).status,401);
    const proofFor=async password=>createLoginProof(password,await(await request('/api/login/challenge',{method:'POST'})).json());
    assert.equal((await request('/api/login',j(await proofFor('wrong')))).status,401);
    const proof=await proofFor(password);
    const login=await request('/api/login',j(proof));assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict/);
    assert.equal((await request('/api/login',j(proof))).status,401,'登入憑證不可重複使用');
    assert.equal((await request('/api/login',j({password}))).status,409,'舊登入請求提示重新整理，不能進行高成本雜湊');
    assert.equal((await request('/api/logout',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await request('/api/login/challenge',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
    const expired=await proofFor(password);await db.prepare('UPDATE login_challenges SET expires=0').run();assert.equal((await request('/api/login',j(expired))).status,401,'過期憑證拒絕');
    const ipProof=await proofFor(password);assert.equal((await request('/api/login',{...j(ipProof),headers:{'Content-Type':'application/json','cf-connecting-ip':'test-different-ip'}})).status,401,'不同來源 IP 無法使用憑證');
    assert.equal((await request('/api/login',j(ipProof))).status,200,'不同 IP 嘗試不消耗原來源憑證');
    for(let i=0;i<8;i++)assert.equal((await request('/api/login',{...j(proof),headers:{'Content-Type':'application/json','cf-connecting-ip':'rate-test-ip'}})).status,401);
    assert.equal((await request('/api/login/challenge',{method:'POST',headers:{'cf-connecting-ip':'rate-test-ip'}})).status,429,'密碼重試仍有速率限制');
    const source=new TextEncoder().encode('test workbook fixture'),dataset={id:'qa',name:'獨立驗證資料',epsg:3826,height_type:'橢球高'},records=[{code:'QA-A',original_code:'QA-ORIG',east:250000,north:2770000,height:10},{code:'QA-ORIG',original_code:'QA-ORIG',east:256000,north:2775000,height:15}];
    const form=()=>{const f=new FormData();f.set('source',new File([source],'fixture.xlsx'));f.set('payload',JSON.stringify({dataset,records}));return f;};
    const imported=await request('/api/import',{method:'POST',body:form()});assert.equal(imported.status,200,await imported.clone().text());assert.equal((await imported.json()).count,2);
    assert.equal((await(await request('/api/import',{method:'POST',body:form()})).json()).duplicate,true);
    const points=await(await request('/api/points')).json();assert.equal(points.length,2);const p=points[0];assert.equal(p.epsg,3826);
    const downloaded=await request('/api/datasets/qa/source');assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())),hash(source));
    const later={id:crypto.randomUUID(),status:'完好',note:'測試專用',visited_at:'2026-10-11T03:00:00Z'},older={id:crypto.randomUUID(),status:'損壞',note:'較早巡查',visited_at:'2026-10-10T03:00:00Z'};
    assert.equal((await request(`/api/points/${p.id}/visits`,j(later))).status,200);await request(`/api/points/${p.id}/visits`,j(later));await request(`/api/points/${p.id}/visits`,j(older));
    assert.equal((await(await request(`/api/points/${p.id}/visits`)).json()).length,2);assert.equal((await(await request(`/api/points/${p.id}`)).json()).status,'完好');
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+FcAAAAASUVORK5CYII=','base64'),photoId=crypto.randomUUID();const photo=()=>{const f=new FormData();f.set('id',photoId);f.set('file',new File([png],'photo.png',{type:'image/png'}));f.set('category','近照');return f;};
    const upload=await request(`/api/points/${p.id}/attachments`,{method:'POST',body:photo()});assert.equal(upload.status,200,await upload.clone().text());await request(`/api/points/${p.id}/attachments`,{method:'POST',body:photo()});assert.equal((await(await request(`/api/points/${p.id}/attachments`)).json()).length,1);
    assert.equal(hash(Buffer.from(await(await request('/files/'+photoId)).arrayBuffer())),hash(png));
    const spoof=new FormData();spoof.set('id',crypto.randomUUID());spoof.set('file',new File(['<html>bad</html>'],'fake.jpg',{type:'image/jpeg'}));assert.equal((await request(`/api/points/${p.id}/attachments`,{method:'POST',body:spoof})).status,400);
    const fresh=await(await request(`/api/points/${p.id}`)).json();assert.equal((await request(`/api/points/${p.id}`,j({version:1,notes:'stale'},'PATCH'))).status,409);assert.equal((await request(`/api/points/${p.id}`,j({version:fresh.version,notes:'updated'},'PATCH'))).status,200);
    await request(`/api/points/${p.id}`,{method:'DELETE'});assert.equal((await request('/files/'+photoId)).status,404);assert.equal((await request('/api/backup-files/'+photoId)).status,200);assert.equal((await(await request('/api/points?trash=1')).json()).length,1);await request(`/api/points/${p.id}/restore`,j({}));assert.equal((await request('/files/'+photoId)).status,200);
    const invalidOverlay=await request('/api/overlay',j({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[278000,2763000]}}]}));assert.equal(invalidOverlay.status,400);
    const offline=await(await request('/api/offline?dataset=qa')).json();assert.equal(offline.points.length,2);assert.equal(offline.visits.length,2);assert.equal(offline.attachments.length,1);
    // Same category and filename must permit multiple photos; upload time is server-owned.
    const capturedAt='2000-01-01T00:00:00Z',newIds=[];
    for(const category of ['近照','遠照','環境'])for(let i=0;i<3;i++){
      const body=photo(),id=crypto.randomUUID();newIds.push(id);body.set('id',id);body.set('category',category);body.set('captured_at',capturedAt);body.set('created_at','1990-01-01T00:00:00Z');
      assert.equal((await request(`/api/points/${p.id}/attachments`,{method:'POST',body})).status,200);
    }
    const allPhotos=await(await request(`/api/points/${p.id}/attachments`)).json();
    assert.equal(allPhotos.find(a=>a.id===photoId).captured_at,null,'未提供拍攝時間時保留未知，不將上傳時間當成拍攝時間');
    assert.equal(allPhotos.length,10);for(const category of ['遠照','環境'])assert.equal(allPhotos.filter(a=>a.category===category).length,3);
    for(const id of newIds){const a=allPhotos.find(a=>a.id===id);assert.equal(a.captured_at,capturedAt);assert.ok(Date.parse(a.created_at)>Date.parse('2000-01-02'));assert.equal(a.filename,'photo.png');}
    const originalUpload=allPhotos.find(a=>a.id===photoId).created_at;await request(`/api/points/${p.id}/attachments`,{method:'POST',body:photo()});
    assert.equal((await(await request(`/api/points/${p.id}/attachments`)).json()).find(a=>a.id===photoId).created_at,originalUpload);
    // 同一原檔分帶建立圖層；相同分組重送仍須避免重複。
    const scoped=(id,epsg,scope)=>{const f=new FormData();f.set('source',new File([source],'fixture.xlsx'));f.set('payload',JSON.stringify({dataset:{id,name:'2010 分帶驗證',epsg,height_type:'橢球高',metadata:{coordinateSystem:'TWD97[2010]',coordinateEpoch:2010,importScope:scope}},records:[{code:'ZONE',north:2770000,east:250000,height:10}]}));return f;};
    for(const [id,epsg,scope] of [['zone121',3826,'121'],['zone119',3825,'119']]){
      const r=await request('/api/import',{method:'POST',body:scoped(id,epsg,scope)});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).count,1);
      assert.equal((await(await request('/api/import',{method:'POST',body:scoped(id,epsg,scope)})).json()).duplicate,true);
      assert.match((await(await request(`/api/points?dataset=${id}`)).json())[0].crs,/TWD97\[2010\]/);
    }
    // 現場圖層、GPS 概略點及補測量沿用同一 ID，照片與巡查不遺失。
    const layerResponse=await request('/api/field-datasets',j({name:'現場測試',resultYear:115,color:'#c77d32'}));assert.equal(layerResponse.status,201);
    const layer=await layerResponse.json();assert.equal((await request(`/api/datasets/${layer.id}/source`)).status,404);
    const fieldResponse=await request('/api/points',j({dataset_id:layer.id,code:'FIELD1',coordinateQuality:'approximate',positionMethod:'gps',lon:121.2,lat:25,accuracy:8,positionTimestamp:Date.now()}));assert.equal(fieldResponse.status,201,await fieldResponse.clone().text());const field=await fieldResponse.json();assert.equal(field.epsg,4326);
    const fieldPhoto=photo(),fieldPhotoId=crypto.randomUUID();fieldPhoto.set('id',fieldPhotoId);assert.equal((await request(`/api/points/${field.id}/attachments`,{method:'POST',body:fieldPhoto})).status,200);
    const fieldVisitId=crypto.randomUUID();assert.equal((await request(`/api/points/${field.id}/visits`,j({id:fieldVisitId,status:'完好',visited_at:new Date().toISOString(),note:'現場確認'}))).status,200);
    const currentField=await(await request(`/api/points/${field.id}`)).json(),measurement={version:currentField.version,epsg:3826,coordinateSystem:'TWD97[2010]',north:2770000,east:250000,height:0,height_type:'正高',height_datum:'TWVD2001',source:'實測',measured_at:'2026-10-12'};
    const measuredResponse=await request(`/api/points/${field.id}/measurement`,j(measurement,'PATCH'));assert.equal(measuredResponse.status,200,await measuredResponse.clone().text());const measured=await measuredResponse.json();assert.equal(measured.id,field.id);assert.equal(measured.height,0);assert.equal(measured.status,'完好');assert.match(measured.crs,/2010/);assert.equal(JSON.parse(measured.raw).fieldCapture.initialLocation.lon,121.2);
    assert.equal((await(await request(`/api/points/${field.id}/attachments`)).json())[0].id,fieldPhotoId);assert.equal((await(await request(`/api/points/${field.id}/visits`)).json())[0].id,fieldVisitId);
    assert.equal((await request(`/api/points/${field.id}/measurement`,j(measurement,'PATCH'))).status,409);
    const currentOriginal=await(await request(`/api/points/${p.id}`)).json();assert.equal((await request(`/api/points/${p.id}/measurement`,j({...measurement,version:currentOriginal.version},'PATCH'))).status,400);
    assert.equal((await request('/api/walking-route',j({pointId:'missing',lon:121.2,lat:25}))).status,404);
    // 分類修改保留原始照片、雜湊、拍攝與上傳時間，跨點位及舊版修改拒絕。
    const beforePhoto=(await(await request(`/api/points/${p.id}/attachments`)).json()).find(a=>a.id===photoId);
    assert.equal((await request(`/api/points/${p.id}/attachments/${photoId}`,j({category:'遠照',expectedCategory:'近照'},'PATCH'))).status,200);
    const afterPhoto=(await(await request(`/api/points/${p.id}/attachments`)).json()).find(a=>a.id===photoId);
    for(const key of ['id','filename','sha256','size','created_at','captured_at'])assert.equal(afterPhoto[key],beforePhoto[key]);assert.equal(afterPhoto.category,'遠照');assert.equal(hash(Buffer.from(await(await request('/files/'+photoId)).arrayBuffer())),hash(png));
    assert.equal((await request(`/api/points/${field.id}/attachments/${photoId}`,j({category:'近照',expectedCategory:'遠照'},'PATCH'))).status,404);
    assert.equal((await request(`/api/points/${p.id}/attachments/${photoId}`,j({category:'環境',expectedCategory:'近照'},'PATCH'))).status,409);
    // 修改舊巡查不得覆蓋較新點況，修改最新巡查同步更新點況並保留原日期。
    assert.equal((await request(`/api/points/${p.id}/visits/${older.id}`,j({status:'找不到',note:'補充早期內容',expectedStatus:older.status,expectedNote:older.note},'PATCH'))).status,200);
    assert.equal((await(await request(`/api/points/${p.id}`)).json()).status,'完好');
    assert.equal((await request(`/api/points/${p.id}/visits/${later.id}`,j({status:'點位存在',note:'現場找到點',expectedStatus:later.status,expectedNote:later.note},'PATCH'))).status,200);
    assert.equal((await(await request(`/api/points/${p.id}`)).json()).status,'點位存在');
    assert.equal((await(await request(`/api/points/${p.id}/visits`)).json()).find(v=>v.id===later.id).visited_at,later.visited_at.replace('Z','.000Z'));
    assert.equal((await request(`/api/points/${p.id}/visits/${later.id}`,j({status:'完好',note:'舊版',expectedStatus:later.status,expectedNote:later.note},'PATCH'))).status,409);
    const presence={id:crypto.randomUUID(),status:'點位存在',note:'測試找到點',visited_at:new Date().toISOString()};assert.equal((await request(`/api/points/${field.id}/visits`,j(presence))).status,200);
    const batches=[];for(const [category,count] of [['近照',3],['遠照',4]])for(let i=0;i<count;i++){const f=photo(),id=crypto.randomUUID();f.set('id',id);f.set('category',category);f.set('visit_id',presence.id);assert.equal((await request(`/api/points/${field.id}/attachments`,{method:'POST',body:f})).status,200);batches.push({id,category});}
    const fieldPhotos=await(await request(`/api/points/${field.id}/attachments`)).json();for(const a of batches){const stored=fieldPhotos.find(p=>p.id===a.id);assert.equal(stored.category,a.category);assert.equal(stored.visit_id,presence.id);}
    await db.prepare('UPDATE datasets SET metadata=? WHERE id=?').bind(JSON.stringify({archiveOnly:true}),'qa').run();
    assert.equal((await request('/api/points',j({dataset_id:'qa',code:'ARCHIVE-NEW',north:2770000,east:250000}))).status,400,'來源封存資料集不新增地圖點');
    const refGeo={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[121.2,24.9],[121.21,24.91]]},properties:{layer:'__proto__'}},{type:'Feature',geometry:{type:'Point',coordinates:[121.2,24.9]},properties:{attributes:[{tag:'ID',value:'原始屬性'}]}}]};
    const referenceForm=(data=refGeo)=>{const f=new FormData();f.set('source',new File(['dxf reference fixture'],'房屋.dxf'));f.set('geojson',new File([JSON.stringify(data)],'ref.geojson'));f.set('metadata',JSON.stringify({name:'房屋',epsg:3826}));return f;};
    assert.equal((await request('/api/references',{method:'POST',body:referenceForm(),headers:{Origin:'https://evil.example'}})).status,403);
    const refUpload=await request('/api/references',{method:'POST',body:referenceForm()});assert.equal(refUpload.status,200,await refUpload.clone().text());const ref=(await refUpload.json()).reference;
    assert.equal(ref.shape_count,1);assert.equal(ref.feature_count,2);assert.equal(ref.layers.__proto__,1);assert.equal(ref.epsg,3826);
    assert.equal((await(await request('/api/references',{method:'POST',body:referenceForm()})).json()).duplicate,true);
    assert.equal((await(await request('/api/references')).json()).length,1);
    assert.deepEqual(await(await request(`/api/references/${ref.id}`)).json(),refGeo);
    const originalRef=await request(`/api/references/${ref.id}/source`);assert.match(originalRef.headers.get('content-disposition'),/filename\*=UTF-8/);assert.equal(await originalRef.text(),'dxf reference fixture');
    assert.equal((await request('/api/references',{method:'POST',body:referenceForm({...refGeo,features:[{type:'Feature',geometry:{type:'LineString',coordinates:[[271000,2760000],[272000,2761000]]}}]})})).status,400);
    assert.equal((await(await request('/api/references')).json()).length,1);
    assert.equal((await(await request('/api/overlay')).json()),null,'參考圖層不覆寫地籍套繪');
    assert.deepEqual((await(await request('/api/backup')).json()).references,[ref]);
    await request('/api/logout',{method:'POST'});assert.equal((await request('/api/references')).status,401);assert.equal((await request(`/api/references/${ref.id}`)).status,401);assert.equal((await request(`/api/references/${ref.id}/source`)).status,401);assert.equal((await request('/files/'+photoId)).status,401);assert.equal((await request('/api/backup')).status,401);
  }finally{await mf.dispose();}
});
