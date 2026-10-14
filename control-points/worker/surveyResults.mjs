import {normalizeRecords,distance} from '../shared/coordinates.mjs';
const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const parse=value=>{try{return JSON.parse(value);}catch{fail('資料格式不正確');}};

// Auth and Origin checks are applied by the main router before reaching here.
export async function surveyResultRoute(req,env,url){
  const source=url.pathname.match(/^\/api\/datasets\/([^/]+)\/revisions$/);
  if(source&&req.method==='POST'){
    const id=decodeURIComponent(source[1]),d=await env.DB.prepare('SELECT * FROM datasets WHERE id=?').bind(id).first();if(!d)fail('找不到資料集',404);
    if(Number(req.headers.get('content-length')||0)>11*1024*1024)fail('成果來源過大',413);
    const form=await req.formData(),file=form.get('source'),input=parse(String(form.get('payload')||'{}'));
    if(!file||typeof file.arrayBuffer!=='function'||file.size>10*1024*1024||file.size<4)fail('請附上 10 MB 以內成果 Excel');
    const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes);if(head[0]!==80||head[1]!==75)fail('請提供 XLSX 成果檔');
    const hash=await sha(bytes);if(d.source_hash===hash)return json({ok:true,duplicate:true,hash});
    if(input.expected_source_hash!==d.source_hash)fail('資料集來源已更新，請重新核對',409);
    const metadata=parse(d.metadata),time=new Date().toISOString(),key=`sources/${id}/${hash}`;
    const allowed={};for(const field of ['crsNote','surveySystems','resultYear','surveyImport','provisionalCodes'])if(field in (input.metadata||{}))allowed[field]=input.metadata[field];
    const history=[...(metadata.sourceRevisions||[]),{hash:d.source_hash,key:d.source_key,name:d.source_name,importedAt:d.imported_at,archivedAt:time}];
    const after={...d,source_hash:hash,source_key:key,source_name:String(file.name).replace(/[\r\n"\\/]/g,'_').slice(0,180),height_type:'正高',metadata:JSON.stringify({...metadata,...allowed,sourceRevisions:history})};
    await env.FILES.put(key,bytes,{httpMetadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    const result=await env.DB.batch([
      env.DB.prepare("INSERT INTO audits SELECT ?,NULL,'source_revision',?,?,? WHERE EXISTS(SELECT 1 FROM datasets WHERE id=? AND source_hash=?)").bind(crypto.randomUUID(),JSON.stringify(d),JSON.stringify(after),time,id,d.source_hash),
      env.DB.prepare('UPDATE datasets SET source_hash=?,source_key=?,source_name=?,height_type=?,metadata=? WHERE id=? AND source_hash=?').bind(hash,key,after.source_name,after.height_type,after.metadata,id,d.source_hash)
    ]);
    if(!result[1].meta.changes)fail('資料集來源已更新，請重新核對',409);
    return json({ok:true,hash});
  }
  const match=url.pathname.match(/^\/api\/points\/([^/]+)\/measurements$/);
  if(match&&req.method==='POST'){
    const id=decodeURIComponent(match[1]),p=await env.DB.prepare('SELECT * FROM points WHERE id=? AND deleted_at IS NULL').bind(id).first();if(!p)fail('找不到控制點',404);
    const text=await req.text();if(new TextEncoder().encode(text).length>128*1024)fail('測量成果過大',413);
    const data=parse(text),d=await env.DB.prepare('SELECT * FROM datasets WHERE id=?').bind(p.dataset_id).first();
    if(!/^[a-f0-9]{64}$/.test(data.source_hash||'')||data.source_hash!==d.source_hash)fail('成果來源不符，請先保存本次 Excel',409);
    const currentRaw=parse(p.raw),record=data.record;
    if(currentRaw.__survey?.sourceHash===data.source_hash)return json({ok:true,duplicate:true,point:p});
    if(data.version!==p.version)fail('點位已更新，請重新核對',409);
    if(record?.code!==p.code||record?.raw?.__survey?.sourceHash!==data.source_hash)fail('測量成果與點號或來源不符');
    if(!Array.isArray(record.raw.__survey.results)||!record.raw.__survey.results.length)fail('缺少坐標成果');
    const checked=normalizeRecords([record],{id:p.dataset_id,epsg:3826,height_type:'正高',height_datum:null});
    if(checked.errors.length)fail(checked.errors[0].message);
    const n=checked.points[0];if(distance([p.lon,p.lat],[n.lon,n.lat])>5)fail('成果位置與既有點相差超過 5 公尺，請先人工核對',409);
    const time=new Date().toISOString(),after={...p,...Object.fromEntries(['original_code','north','east','height','lon','lat','crs','epsg','height_type','height_datum','source_row','source_sheet','raw'].map(k=>[k,n[k]])),version:p.version+1,updated_at:time};
    if(currentRaw['備註2']==='確認座標系統')after.notes=p.notes.replace('座標系統待確認（暫以 TWD97 / TM2 121 分帶顯示）','').replace('原註記：確認座標系統','').replace(/^[；\s]+|[；\s]+$/g,'');
    const fields=['original_code','north','east','height','lon','lat','crs','epsg','height_type','height_datum','source_row','source_sheet','raw','notes','updated_at'];
    const result=await env.DB.batch([
      env.DB.prepare("INSERT INTO audits SELECT ?,?,'survey_results',?,?,? WHERE EXISTS(SELECT 1 FROM points WHERE id=? AND version=?)").bind(crypto.randomUUID(),id,JSON.stringify(p),JSON.stringify(after),time,id,p.version),
      env.DB.prepare(`UPDATE points SET ${fields.map(k=>k+'=?').join(',')},version=version+1 WHERE id=? AND version=?`).bind(...fields.map(k=>after[k]??null),id,p.version)
    ]);
    if(!result[1].meta.changes)fail('點位已更新，請重新核對',409);
    return json({ok:true,point:after});
  }
  return null;
}
