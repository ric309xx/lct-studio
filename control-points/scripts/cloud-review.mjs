// 透過已授權的 Cloudflare 管理 API 備份、比對及發布；不輸出登入憑證。
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import JSZip from 'jszip';
import {normalizeRecords} from '../shared/coordinates.mjs';

const action=process.argv[2],dir=resolve('.local/review-20261012');
const configPath=resolve(process.env.APPDATA,'xdg.config/.wrangler/config/default.toml');
const config=readFileSync(configPath,'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw new Error('缺少 Cloudflare 登入，請先執行 wrangler login');
const account='9772521339062dfe389c2ab219ecfa72',database='27104b0d-aca5-4d59-b260-abf5b7647a84',bucket='lct-control-points';
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const read=name=>JSON.parse(readFileSync(resolve(dir,name),'utf8'));
const save=(name,value)=>writeFileSync(resolve(dir,name),JSON.stringify(value,null,2));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const literal=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
async function cf(path,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});
 if(!response.ok){const body=await response.text();throw new Error(`Cloudflare ${response.status}: ${body.slice(0,500)}`);}return response;
}
async function query(sql,params=[]){
 const data=await(await cf(`/d1/database/${database}/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql,params})})).json();
 if(!data.success||data.result.some(r=>!r.success))throw new Error('D1 查詢失敗 '+JSON.stringify(data.errors));return data.result;
}
const objectPath=key=>`/r2/buckets/${bucket}/objects/${key.split('/').map(encodeURIComponent).join('/')}`;

if(action==='backup'){
 const original=read('production-before.json'),zip=new JSZip(),objects=[];
 zip.file('data.json',JSON.stringify(original,null,2));zip.file('database.sql',readFileSync(resolve(dir,'production-before.sql')));
 for(const d of original.datasets)objects.push({path:`sources/${d.id}/${d.source_name}`,key:d.source_key,hash:d.source_hash});
 for(const a of original.attachments){objects.push({path:`photos/${a.id}/${a.filename}`,key:a.object_key,hash:a.sha256});if(a.thumb_key)objects.push({path:`photos/${a.id}/thumbnail.jpg`,key:a.thumb_key});}
 let index=0,done=0;const receipts=[];
 await Promise.all(Array.from({length:6},async()=>{while(index<objects.length){const o=objects[index++];const bytes=Buffer.from(await(await cf(objectPath(o.key))).arrayBuffer());const hash=digest(bytes);if(o.hash&&hash!==o.hash)throw new Error('備份雜湊不符 '+o.path);zip.file(o.path,bytes);receipts.push({...o,size:bytes.length,sha256:hash});if(++done%25===0)console.log(`來源與附件備份 ${done}/${objects.length}`);}}));
 const overlay=await cf(objectPath('settings/cadastral.geojson')).catch(e=>{if(e.message.startsWith('Cloudflare 404:'))return null;throw e;});if(overlay)zip.file('cadastral.geojson',await overlay.text());
 zip.file('object-verification.json',JSON.stringify(receipts,null,2));
 const output=resolve(dir,'production-full-before.zip');writeFileSync(output,await zip.generateAsync({type:'nodebuffer'}));
 const saved=await JSZip.loadAsync(readFileSync(output));for(const r of receipts)if(digest(await saved.file(r.path).async('nodebuffer'))!==r.sha256)throw new Error('備份ZIP核對失敗');
 save('backup-verification.json',{points:original.points.length,visits:original.visits.length,attachments:original.attachments.length,objects:receipts.length,bytes:readFileSync(output).length,sha256:digest(readFileSync(output)),verifiedAt:new Date().toISOString()});
 console.log('完整備份與 ZIP 雜湊核對完成：'+output);
}else if(action==='prepare'){
 const before=read('production-before.json'),batches=read('review-batches.json'),existing=before.points.filter(p=>!p.deleted_at&&p.dataset_id==='zhongli-bade');
 const plans=[];
 for(const batch of batches){
  const duplicateReferences=[],records=[];
  for(const r of batch.records){
   const matches=batch.dataset.metadata.coordinateSystem==='TWD97'?existing.filter(p=>p.epsg===batch.dataset.epsg&&(p.original_code===r.original_code||p.code===r.code)&&p.north===r.north&&p.east===r.east&&p.height===r.height):[];
   if(matches.length)duplicateReferences.push({source_sheet:r.source_sheet,source_row:r.source_row,code:r.code,original_code:r.original_code,existingIds:matches.map(p=>p.id),preferredDataset:'zhongli-bade'});
   else records.push(r);
  }
  const dataset={...batch.dataset,metadata:{...batch.dataset.metadata,reviewStatus:'已與正式站逐筆比對',skippedDuplicateRows:duplicateReferences.length,duplicateReferences,archiveOnly:records.length===0,preferredDataset:duplicateReferences.length?'zhongli-bade':null}};
  if(!records.length)dataset.name+='（來源封存，沿用115年成果）';
  const normalized=records.length?normalizeRecords(records,dataset):{points:[],errors:[]};if(normalized.errors.length)throw new Error(JSON.stringify(normalized.errors));
  plans.push({...batch,dataset,records,points:normalized.points});
 }
 const z=plans.find(p=>p.dataset.id==='zhongli-bade-112');if(z.records.length||z.dataset.metadata.skippedDuplicateRows!==479)throw new Error('中壢八德479筆重複核對不符');
 save('production-plan.json',plans);
 console.log(JSON.stringify(plans.map(p=>({id:p.dataset.id,insert:p.points.length,prefer115:p.dataset.metadata.skippedDuplicateRows,archiveOnly:p.dataset.metadata.archiveOnly})),null,2));
}else if(action==='upload'){
 if(!existsSync(resolve(dir,'backup-verification.json')))throw new Error('需先完成完整備份');
 const plans=read('production-plan.json'),before=read('production-before.json');
 const current=(await query('SELECT id FROM datasets'))[0].results;
 if(current.some(d=>plans.some(p=>p.dataset.id===d.id)))throw new Error('已有本次資料集，請先核對，不重複發布');
 const time=new Date().toISOString();
 for(const b of plans){
  const bytes=readFileSync(b.file),hash=digest(bytes),key=`sources/${b.dataset.id}/${hash}`;
  if(hash!==b.source_hash)throw new Error('來源檔已變更 '+b.file);
  await cf(objectPath(key),{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:bytes});
  const check=Buffer.from(await(await cf(objectPath(key))).arrayBuffer());if(digest(check)!==hash)throw new Error('來源上傳核對失敗');
  await query('INSERT INTO datasets(id,name,crs,epsg,height_type,height_datum,source_name,source_hash,source_key,imported_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[b.dataset.id,b.dataset.name,b.points[0]?.crs||'TWD97 / TM2 121 分帶',b.dataset.epsg,b.dataset.height_type,null,basename(b.file),hash,key,time,JSON.stringify(b.dataset.metadata)]);
  const fields=['id','dataset_id','code','original_code','name','north','east','height','lon','lat','crs','epsg','height_type','height_datum','category','description','notes','source_row','source_sheet','raw','updated_at'];
  for(let i=0;i<b.points.length;i+=10){
   const ps=b.points.slice(i,i+10),sql=`INSERT INTO points(${fields.join(',')}) VALUES ${ps.map(p=>`(${fields.map(f=>literal(f==='updated_at'?time:p[f]??null)).join(',')})`).join(',')}`;
   await query(sql);
   if(i%500===0)console.log(`${b.dataset.id} ${Math.min(i+10,b.points.length)}/${b.points.length}`);
  }
  await query('INSERT INTO audits VALUES(?,?,?,?,?,?)',[randomUUID(),null,'import',null,JSON.stringify({dataset:b.dataset.id,count:b.points.length,preferred115:b.dataset.metadata.skippedDuplicateRows,sourceHash:hash}),time]);
 }
 for(const [id,year,color] of [['zhongli-bade',115,'#2b6852'],['leveling-109',109,'#743c92'],['image-control-202610',115,'#f2c53d']]){
  const old=before.datasets.find(d=>d.id===id),metadata={...JSON.parse(old.metadata),resultYear:year,color};
  await query('UPDATE datasets SET metadata=? WHERE id=?',[JSON.stringify(metadata),id]);
  await query('INSERT INTO audits VALUES(?,?,?,?,?,?)',[randomUUID(),null,'dataset_metadata',JSON.stringify(old),JSON.stringify({id,metadata}),time]);
 }
 console.log('資料上傳完成，需再執行 verify');
}else if(action==='verify'){
 const before=read('production-before.json'),plans=read('production-plan.json'),tables={};
 for(const table of ['datasets','points','visits','attachments','audits'])tables[table]=(await query('SELECT * FROM '+table))[0].results;
 const byId=new Map(tables.points.map(p=>[p.id,p]));
 for(const p of before.points)for(const k of Object.keys(p))if(p[k]!==byId.get(p.id)?.[k])throw new Error(`既有點位變更 ${p.id}:${k}`);
 for(const table of ['visits','attachments']){const ids=new Map(tables[table].map(r=>[r.id,r]));if(tables[table].length!==before[table].length)throw new Error('既有紀錄筆數變更');for(const r of before[table])for(const k of Object.keys(r))if(ids.get(r.id)?.[k]!==r[k])throw new Error('既有紀錄遭變更 '+table);}
 for(const b of plans){
  const ds=tables.datasets.find(d=>d.id===b.dataset.id);if(!ds)throw new Error('缺少資料集');
  const ps=tables.points.filter(p=>p.dataset_id===ds.id);if(ps.length!==b.points.length)throw new Error('新點數不一致');
  for(const p of b.points)for(const k of Object.keys(p))if(byId.get(p.id)?.[k]!==p[k])throw new Error('新點欄位核對不符 '+p.code+':'+k);
 }
 const report={totalPoints:tables.points.filter(p=>!p.deleted_at).length,existingPointsUnchanged:before.points.length,newPoints:plans.reduce((n,p)=>n+p.points.length,0),photosUnchanged:before.attachments.length,visitsUnchanged:before.visits.length,datasets:tables.datasets.map(d=>({id:d.id,name:d.name,year:JSON.parse(d.metadata).resultYear??null,points:tables.points.filter(p=>p.dataset_id===d.id&&!p.deleted_at).length})),verifiedAt:new Date().toISOString()};
 save('production-after.json',{version:1,...tables});save('production-verification.json',report);console.log(JSON.stringify(report,null,2));
}else throw new Error('動作：backup／prepare／upload／verify');
