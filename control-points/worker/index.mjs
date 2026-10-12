import {normalizeRecords} from '../shared/coordinates.mjs';
import {referenceRoute,listReferences} from './references.mjs';
import {createPlaceSearch} from './geocode.mjs';
const searchPlaces=createPlaceSearch();
const TTL=12*3600, MAX_FILE=30*1024*1024;
const now=()=>new Date().toISOString();
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hex=buffer=>[...new Uint8Array(buffer)].map(x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value));
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
async function passwordHash(password,salt) {const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},k,256));}
const audit=(env,id,action,before,after)=>env.DB.prepare('INSERT INTO audits VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),id,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null,now());
export function csvCell(value) {let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
async function readJson(req,limit=16*1024*1024){const text=await req.text();if(new TextEncoder().encode(text).length>limit)fail('資料過大',413);try{return JSON.parse(text);}catch{fail('JSON 格式錯誤');}}
async function point(env,id,includeDeleted=false){const p=await env.DB.prepare('SELECT * FROM points WHERE id=?'+(includeDeleted?'':' AND deleted_at IS NULL')).bind(id).first();if(!p)fail('找不到控制點',404);return p;}
function safeName(s){return String(s).replace(/[\r\n"\\/]/g,'_').slice(0,180);}
function downloadHeaders(filename,mime){return {'Content-Type':mime,'Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safeName(filename))}`,'Cache-Control':'no-store'};}

export default {
  async fetch(request,env){
    let response;
    try { response=await route(request,env); }
    catch(e){console.error('request_failed',e.status||500,e.status||env.APP_ENV!=='production'?e.message:'internal_error');response=json({error:e.status?e.message:'服務暫時無法使用，請稍後重試'},e.status||500);}
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('X-Robots-Tag','noindex, nofollow');
    headers.set('Permissions-Policy','camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), microphone=()');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://wmts.nlsc.gov.tw; connect-src 'self' https://wmts.nlsc.gov.tw; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    return new Response(response.body,{status:response.status,headers});
  }
};

async function route(req,env){
  const url=new URL(req.url),path=url.pathname;
  if(!path.startsWith('/api/')&&!path.startsWith('/files/'))return env.ASSETS.fetch(req);
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
    const origin=req.headers.get('origin');if(origin&&origin!==url.origin)fail('來源不允許',403);
  }
  const secure=url.protocol==='https:'?'; Secure':'';
  if(path==='/api/login'&&req.method==='POST'){
    if(!env.PASSWORD_HASH||!env.PASSWORD_SALT)fail('請先執行本機設定',503);
    const ip=await digest(req.headers.get('cf-connecting-ip')||'local');const time=Math.floor(Date.now()/1000);
    const attempt=await env.DB.prepare('SELECT * FROM login_attempts WHERE ip_hash=?').bind(ip).first();
    if(attempt&&attempt.reset_at>time&&attempt.attempts>=8)fail('登入失敗次數過多，請於 15 分鐘後重試',429);
    const data=await readJson(req,4096);
    if(typeof data.password!=='string'||data.password.length>128)fail('密碼格式錯誤');
    if(!equal(await passwordHash(data.password,env.PASSWORD_SALT),env.PASSWORD_HASH)){
      await env.DB.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN reset_at>? THEN attempts+1 ELSE 1 END,reset_at=CASE WHEN reset_at>? THEN reset_at ELSE ? END').bind(ip,time+900,time,time,time+900).run();
      fail('密碼不正確',401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(ip).run();
    const token=crypto.randomUUID()+crypto.randomUUID();await env.DB.prepare('INSERT INTO sessions VALUES(?,?)').bind(await digest(token),time+TTL).run();
    await env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(time).run();
    return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`lct_points_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL}${secure}`}});
  }
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)lct_points_session=([^;]+)/)?.[1];
  const session=token&&await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').bind(await digest(token),Math.floor(Date.now()/1000)).first();
  if(!session)fail('請先登入',401);
  if(path==='/api/references'||path.startsWith('/api/references/'))return referenceRoute(req,env.FILES);
  if(path==='/api/session')return json({ok:true,environment:env.APP_ENV,expires:session.expires});
  if(path==='/api/places'&&req.method==='GET')return json(await searchPlaces(url.searchParams.get('q'),env.FILES,env.GEOCODER_URL));
  if(path==='/api/logout'&&req.method==='POST'){
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':`lct_points_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`}});
  }
  if(path==='/api/datasets'&&req.method==='GET')return json((await env.DB.prepare('SELECT d.*, (SELECT COUNT(*) FROM points p WHERE p.dataset_id=d.id AND p.deleted_at IS NULL) point_count FROM datasets d ORDER BY imported_at,id').all()).results);
  if(path==='/api/points'&&req.method==='GET'){
    const dataset=url.searchParams.get('dataset'),trash=url.searchParams.get('trash')==='1';
    const sql='SELECT * FROM points WHERE deleted_at IS '+(trash?'NOT NULL':'NULL')+(dataset?' AND dataset_id=?':'')+' ORDER BY dataset_id,code';
    return json((await (dataset?env.DB.prepare(sql).bind(dataset):env.DB.prepare(sql)).all()).results);
  }
  if(path==='/api/offline'&&req.method==='GET'){
    const dataset=url.searchParams.get('dataset'),where='p.deleted_at IS NULL'+(dataset?' AND p.dataset_id=?':'');
    const query=async sql=>(await (dataset?env.DB.prepare(sql).bind(dataset):env.DB.prepare(sql)).all()).results;
    return json({datasets:await query('SELECT d.*, (SELECT COUNT(*) FROM points WHERE dataset_id=d.id AND deleted_at IS NULL) point_count FROM datasets d'+(dataset?' WHERE d.id=?':'')),points:await query('SELECT p.* FROM points p WHERE '+where),visits:await query('SELECT v.* FROM visits v JOIN points p ON p.id=v.point_id WHERE '+where),attachments:await query("SELECT a.* FROM attachments a JOIN points p ON p.id=a.point_id WHERE a.state='ready' AND "+where),downloadedAt:now()});
  }
  if(path==='/api/points'&&req.method==='POST'){
    const data=await readJson(req,32768),dataset=await env.DB.prepare('SELECT * FROM datasets WHERE id=?').bind(data.dataset_id).first();if(!dataset)fail('請選擇資料集');
    const n=normalizeRecords([data],dataset);if(n.errors.length)fail(n.errors[0].message);const p=n.points[0];
    if(await env.DB.prepare('SELECT id FROM points WHERE dataset_id=? AND code=?').bind(dataset.id,p.code).first())fail('此資料集已有相同點號',409);
    const fields=Object.keys(p);await env.DB.batch([env.DB.prepare(`INSERT INTO points(${fields.join(',')},updated_at) VALUES(${Array(fields.length+1).fill('?').join(',')})`).bind(...fields.map(k=>p[k]??null),now()),audit(env,p.id,'create',null,p)]);return json(await point(env,p.id),201);
  }
  if(path==='/api/import'&&req.method==='POST'){
    if(Number(req.headers.get('content-length')||0)>20*1024*1024)fail('匯入檔案過大',413);
    const form=await req.formData();const source=form.get('source');
    const payload=String(form.get('payload')||'');if(payload.length>16*1024*1024)fail('資料過大',413);
    let input;try{input=JSON.parse(payload);}catch{fail('匯入格式錯誤');}
    const d=input.dataset;
    if(!d||typeof d.name!=='string'||!d.name.trim()||d.name.length>100)fail('請填寫資料集名稱');
    const id=d.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))fail('資料集 ID 不正確');
    if(!source||typeof source.arrayBuffer!=='function'||source.size>10*1024*1024)fail('請附上 10 MB 以內原始檔');
    const bytes=await source.arrayBuffer(),hash=await digest(bytes);
    const existing=await env.DB.prepare('SELECT id FROM datasets WHERE source_hash=?').bind(hash).first();
    if(existing)return json({ok:true,duplicate:true,id:existing.id});
    if(await env.DB.prepare('SELECT id FROM datasets WHERE id=?').bind(id).first())fail('資料集已存在，請使用不同名稱建立新批次',409);
    const normalized=normalizeRecords(input.records,{...d,id});
    if(normalized.errors.length)return json({error:'匯入檢查未通過',errors:normalized.errors},422);
    const key=`sources/${id}/${hash}`,time=now();
    await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
    const fields=['id','dataset_id','code','original_code','name','north','east','height','lon','lat','crs','epsg','height_type','height_datum','category','description','notes','source_row','source_sheet','raw'];
    try{
      await env.DB.prepare('INSERT INTO datasets VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,d.name.trim(),normalized.points[0].crs,Number(d.epsg),d.height_type||'未註明',d.height_datum||null,safeName(source.name),hash,key,time,JSON.stringify(d.metadata||{})).run();
      const stmt=env.DB.prepare(`INSERT INTO points(${fields.join(',')},updated_at) VALUES(${Array(fields.length+1).fill('?').join(',')})`);
      for(let i=0;i<normalized.points.length;i+=100)await env.DB.batch(normalized.points.slice(i,i+100).map(p=>stmt.bind(...fields.map(k=>p[k]??null),time)));
      await audit(env,null,'import',null,{dataset:id,count:normalized.points.length,sourceHash:hash}).run();
    }catch(e){await env.DB.batch([env.DB.prepare('DELETE FROM points WHERE dataset_id=?').bind(id),env.DB.prepare('DELETE FROM datasets WHERE id=?').bind(id)]);await env.FILES.delete(key);throw e;}
    return json({ok:true,id,count:normalized.points.length,warnings:normalized.warnings});
  }
  if(path==='/api/backup'&&req.method==='GET'){
    const tables={};for(const table of ['datasets','points','visits','attachments','audits'])tables[table]=(await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
    return new Response(JSON.stringify({version:1,created_at:now(),...tables,references:await listReferences(env.FILES)}),{headers:downloadHeaders('控制點資料備份.json','application/json; charset=utf-8')});
  }
  if(path==='/api/overlay'){
    if(req.method==='GET'){const object=await env.FILES.get('settings/cadastral.geojson');return object?new Response(object.body,{headers:{'Content-Type':'application/geo+json','Cache-Control':'no-store'}}):json(null);}
    if(req.method==='POST'){
      const data=await readJson(req,5*1024*1024);if(data.type!=='FeatureCollection'||!Array.isArray(data.features))fail('請提供 WGS84 GeoJSON FeatureCollection');
      const verify=coordinates=>{if(!Array.isArray(coordinates))fail('地籍坐標格式不正確');if(typeof coordinates[0]==='number'){if(coordinates[0]<117||coordinates[0]>125||coordinates[1]<20||coordinates[1]>28)fail('地籍 GeoJSON 須使用 WGS84 經緯度');}else coordinates.forEach(verify);};
      data.features.forEach(f=>{if(!['Polygon','MultiPolygon','LineString','MultiLineString','Point'].includes(f.geometry?.type))fail('不支援此地籍幾何類型');verify(f.geometry.coordinates);});
      await env.FILES.put('settings/cadastral.geojson',JSON.stringify(data),{httpMetadata:{contentType:'application/geo+json'}});return json({ok:true,count:data.features.length});
    }
  }
  const sourceMatch=path.match(/^\/api\/datasets\/([^/]+)\/source$/);
  if(sourceMatch&&req.method==='GET'){
    const d=await env.DB.prepare('SELECT * FROM datasets WHERE id=?').bind(decodeURIComponent(sourceMatch[1])).first();if(!d)fail('找不到資料集',404);
    const f=await env.FILES.get(d.source_key);if(!f)fail('找不到原始檔',404);return new Response(f.body,{headers:downloadHeaders(d.source_name,'application/octet-stream')});
  }
  const pointMatch=path.match(/^\/api\/points\/([^/]+)(?:\/(visits|attachments|history|restore))?$/);
  if(pointMatch){
    const id=decodeURIComponent(pointMatch[1]),action=pointMatch[2],p=await point(env,id,action==='restore');
    if(req.method==='GET'&&!action)return json(p);
    if(req.method==='GET'&&action==='history')return json((await env.DB.prepare('SELECT * FROM audits WHERE point_id=? ORDER BY created_at DESC').bind(id).all()).results);
    if(req.method==='GET'&&action==='visits')return json((await env.DB.prepare('SELECT * FROM visits WHERE point_id=? ORDER BY visited_at DESC').bind(id).all()).results);
    if(req.method==='GET'&&action==='attachments')return json((await env.DB.prepare("SELECT * FROM attachments WHERE point_id=? AND state='ready' ORDER BY created_at DESC").bind(id).all()).results);
    if(req.method==='PATCH'&&!action){
      const data=await readJson(req,16384);if(data.version!==p.version)fail('資料已更新，請重新載入後再編輯',409);
      const changed={...p};for(const key of ['name','description','notes'])if(key in data){if(typeof data[key]!=='string'||data[key].length>8000)fail('文字欄位過長');changed[key]=data[key];}
      if('favorite' in data)changed.favorite=data.favorite?1:0;
      const result=await env.DB.batch([env.DB.prepare('UPDATE points SET name=?,description=?,notes=?,favorite=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(changed.name,changed.description,changed.notes,changed.favorite,now(),id,p.version),audit(env,id,'edit',p,changed)]);
      if(!result[0].meta.changes)fail('資料已更新，請重新載入',409);return json(await point(env,id));
    }
    if(req.method==='DELETE'&&!action){await env.DB.batch([env.DB.prepare('UPDATE points SET deleted_at=?,version=version+1 WHERE id=?').bind(now(),id),audit(env,id,'delete',p,null)]);return json({ok:true});}
    if(req.method==='POST'&&action==='restore'){
      if(!p.deleted_at)return json(p);
      await env.DB.batch([env.DB.prepare('UPDATE points SET deleted_at=NULL,version=version+1,updated_at=? WHERE id=?').bind(now(),id),audit(env,id,'restore',p,null)]);return json(await point(env,id));
    }
    if(req.method==='POST'&&action==='visits'){
      const data=await readJson(req,16384);
      if(!['完好','損壞','找不到','無法進入'].includes(data.status))fail('點況不正確');
      if(typeof data.id!=='string'||!/^[a-f0-9-]{36}$/.test(data.id))fail('紀錄 ID 不正確');
      const old=await env.DB.prepare('SELECT * FROM visits WHERE id=?').bind(data.id).first();if(old){if(old.point_id!==id)fail('紀錄 ID 已使用',409);return json(old);}
      const visited=new Date(data.visited_at||now());if(!Number.isFinite(+visited))fail('巡查時間不正確');
      const note=String(data.note||'');if(note.length>8000)fail('備註過長');
      await env.DB.batch([env.DB.prepare('INSERT INTO visits VALUES(?,?,?,?,?,?,?)').bind(data.id,id,data.status,note,visited.toISOString(),data.position?JSON.stringify(data.position):null,now()),env.DB.prepare('UPDATE points SET status=?,updated_at=?,version=version+1 WHERE id=? AND (SELECT id FROM visits WHERE point_id=? ORDER BY visited_at DESC,created_at DESC LIMIT 1)=?').bind(data.status,now(),id,id,data.id),audit(env,id,'visit',null,{id:data.id,status:data.status,note})]);
      return json({ok:true,id:data.id});
    }
    if(req.method==='POST'&&action==='attachments'){
      if(Number(req.headers.get('content-length')||0)>MAX_FILE+1024*1024)fail('單張照片上限 30 MB',413);
      const form=await req.formData(),file=form.get('file'),thumbnail=form.get('thumbnail'),attachmentId=String(form.get('id')||'');
      if(!/^[a-f0-9-]{36}$/.test(attachmentId))fail('照片 ID 不正確');
      const old=await env.DB.prepare('SELECT * FROM attachments WHERE id=?').bind(attachmentId).first();
      if(old){if(old.point_id!==id)fail('照片 ID 已使用',409);return json(old);}
      if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>MAX_FILE)fail('請選擇 30 MB 以內照片或 PDF');
      const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes.slice(0,16));let mime='';
      if(head[0]===255&&head[1]===216&&head[2]===255)mime='image/jpeg';
      else if(head[0]===137&&head[1]===80&&head[2]===78&&head[3]===71)mime='image/png';
      else if(new TextDecoder().decode(head.slice(0,4))==='RIFF'&&new TextDecoder().decode(head.slice(8,12))==='WEBP')mime='image/webp';
      else if(new TextDecoder().decode(head.slice(4,8))==='ftyp'&&/hei[cf]|hevc|mif1|avif/.test(new TextDecoder().decode(head.slice(8))))mime='image/heic';
      else if(new TextDecoder().decode(head.slice(0,5))==='%PDF-')mime='application/pdf';
      if(!mime)fail('檔案內容不屬於支援的照片或 PDF 格式');
      const visitId=String(form.get('visit_id')||'')||null;
      if(visitId){const v=await env.DB.prepare('SELECT point_id FROM visits WHERE id=?').bind(visitId).first();if(!v||v.point_id!==id)fail('巡查紀錄與點位不符');}
      const key=`points/${id}/${attachmentId}/original`,thumbKey=`points/${id}/${attachmentId}/thumbnail.jpg`,hash=await digest(bytes);let savedThumb=null;
      await env.FILES.put(key,bytes,{httpMetadata:{contentType:mime}});
      if(thumbnail&&typeof thumbnail.arrayBuffer==='function'&&thumbnail.size<=1024*1024){const thumb=await thumbnail.arrayBuffer(),h=new Uint8Array(thumb);if(h[0]===255&&h[1]===216){await env.FILES.put(thumbKey,thumb,{httpMetadata:{contentType:'image/jpeg'}});savedThumb=thumbKey;}}
      try{await env.DB.prepare('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(attachmentId,id,visitId,key,savedThumb,safeName(file.name),mime,file.size,String(form.get('category')||'其他').slice(0,40),form.get('captured_at')?String(form.get('captured_at')):null,String(form.get('position')||'')||null,'ready',hash,now()).run();}
      catch(e){const duplicate=await env.DB.prepare('SELECT * FROM attachments WHERE id=?').bind(attachmentId).first();if(duplicate&&duplicate.point_id===id)return json(duplicate);throw e;}
      return json({ok:true,id:attachmentId,sha256:hash});
    }
  }
  const fileMatch=path.match(/^\/files\/([a-f0-9-]{36})(\/thumbnail)?$/);
  if(fileMatch&&(req.method==='GET'||req.method==='HEAD')){
    const a=await env.DB.prepare("SELECT a.* FROM attachments a LEFT JOIN points p ON p.id=a.point_id WHERE a.id=? AND a.state='ready' AND p.deleted_at IS NULL").bind(fileMatch[1]).first();if(!a)fail('找不到附件',404);
    const key=fileMatch[2]?a.thumb_key:a.object_key;if(!key)fail('沒有預覽圖',404);const object=await env.FILES.get(key);if(!object)fail('找不到檔案',404);
    const headers=fileMatch[2]?{'Content-Type':'image/jpeg','Cache-Control':'no-store'}:downloadHeaders(a.filename,a.mime);
    return new Response(req.method==='HEAD'?null:object.body,{headers});
  }
  const backupFile=path.match(/^\/api\/backup-files\/([a-f0-9-]{36})(\/thumbnail)?$/);
  if(backupFile&&req.method==='GET'){
    const a=await env.DB.prepare('SELECT * FROM attachments WHERE id=?').bind(backupFile[1]).first();if(!a)fail('找不到附件',404);
    const key=backupFile[2]?a.thumb_key:a.object_key;if(!key)fail('沒有預覽圖',404);const f=await env.FILES.get(key);if(!f)fail('找不到附件',404);return new Response(f.body,{headers:downloadHeaders(a.filename,a.mime)});
  }
  fail('找不到此功能',404);
}
