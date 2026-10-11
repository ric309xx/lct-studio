import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pbkdf2Sync,createHash} from 'node:crypto';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {build} from 'esbuild';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('獨立本機環境：登入、匯入、照片重試、巡查、回收與還原',async()=>{
  const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
  const password='integration-test-only',salt='integration-test-salt';
  const mf=new Miniflare(convertV4MiniflareOptions({name:'test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:()=>new Response('app')}}));
  try{
    const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
    let cookie='';const request=async(path,options={})=>{const r=new Request('http://localhost'+path,{...options,headers:{Cookie:cookie,...options.headers}});return mf.dispatchFetch(r.url,{method:r.method,headers:Object.fromEntries(r.headers),body:r.body?await r.arrayBuffer():undefined});};
    const j=(data,method='POST')=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await request('/api/points')).status,401);
    assert.equal((await request('/api/places?q=中壢車站')).status,401);
    assert.equal((await request('/api/login',j({password:'wrong'}))).status,401);
    const login=await request('/api/login',j({password}));assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict/);
    assert.equal((await request('/api/logout',{method:'POST',headers:{Origin:'https://evil.example'}})).status,403);
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
    await request('/api/logout',{method:'POST'});assert.equal((await request('/files/'+photoId)).status,401);assert.equal((await request('/api/backup')).status,401);
  }finally{await mf.dispose();}
});
