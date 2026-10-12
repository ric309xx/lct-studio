// Restore a ZIP into a NEW isolated D1/R2 directory and verify every record/file.
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const archive=process.argv[2]||resolve('.local/backups',readdirSync('.local/backups').filter(n=>n.endsWith('.zip')).sort().at(-1)||'');
const zip=await JSZip.loadAsync(readFileSync(archive)),metadata=zip.file('data.json');
if(!metadata)throw new Error('備份缺少 data.json');
const data=JSON.parse(await metadata.async('string'));
if(data.version!==1)throw new Error('不支援此備份版本');
const tables=['datasets','points','visits','attachments','audits'];
for(const table of tables)if(!Array.isArray(data[table]))throw new Error('備份缺少資料表：'+table);
const objects=[];
async function collect(path,key,mime,hash){
  const file=zip.file(path);if(!file)throw new Error('備份缺少檔案：'+path);
  const bytes=await file.async('nodebuffer'),actual=createHash('sha256').update(bytes).digest('hex');
  if(hash&&hash!==actual)throw new Error('檔案雜湊不符：'+path);
  objects.push({key,mime,bytes,hash:actual});
}
for(const d of data.datasets)if(d.source_key)await collect(`sources/${d.id}/${d.source_name}`,d.source_key,'application/octet-stream',d.source_hash);
for(const a of data.attachments){await collect(`photos/${a.id}/${a.filename}`,a.object_key,a.mime,a.sha256);if(a.thumb_key)await collect(`photos/${a.id}/thumbnail.jpg`,a.thumb_key,'image/jpeg');}
if(zip.file('cadastral.geojson'))await collect('cadastral.geojson','settings/cadastral.geojson','application/geo+json');
for(const r of data.references||[]){
  if(!/^[a-f0-9]{32}$/.test(r.id))throw new Error('參考圖層 ID 不正確');
  await collect(`references/${r.id}/source.dxf`,`references/source/${r.id}.dxf`,'application/dxf',r.source_hash);
  await collect(`references/${r.id}/data.geojson`,`references/data/${r.id}.geojson`,'application/geo+json',r.geojson_hash);
  const bytes=Buffer.from(JSON.stringify(r));objects.push({key:`references/meta/${r.id}.json`,mime:'application/json',bytes,hash:createHash('sha256').update(bytes).digest('hex')});
}
const target=resolve('.local',`recovery-${new Date().toISOString().replaceAll(':','-')}`);
if(existsSync(target))throw new Error('還原目錄已存在，不可覆寫');mkdirSync(target,{recursive:true});
const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("recovery check")}}',compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],d1Persist:resolve(target,'d1'),r2Persist:resolve(target,'r2')}),resourcePersistencePath:resolve(target,'state')});
try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');await db.exec(readFileSync('schema.sql','utf8'));
  for(const table of tables){
    const fields=(await db.prepare(`PRAGMA table_info(${table})`).all()).results.map(c=>c.name);
    for(const row of data[table])if(Object.keys(row).some(k=>!fields.includes(k)))throw new Error('備份有未知欄位：'+table);
    const stmt=db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`);
    for(let i=0;i<data[table].length;i+=100)await db.batch(data[table].slice(i,i+100).map(row=>stmt.bind(...fields.map(k=>row[k]??null))));
    const restored=(await db.prepare(`SELECT * FROM ${table}`).all()).results;
    const byId=new Map(restored.map(row=>[row.id,row]));
    if(restored.length!==data[table].length)throw new Error('還原筆數不符：'+table);
    for(const row of data[table])for(const field of fields)if(row[field]!==byId.get(row.id)?.[field])throw new Error(`還原欄位不符：${table}/${row.id}/${field}`);
  }
  for(const object of objects){await bucket.put(object.key,object.bytes,{httpMetadata:{contentType:object.mime}});const restored=await bucket.get(object.key);if(!restored||createHash('sha256').update(new Uint8Array(await restored.arrayBuffer())).digest('hex')!==object.hash)throw new Error('還原檔案不符：'+object.key);}
  const report={archive,target,points:data.points.length,visits:data.visits.length,attachments:data.attachments.length,verifiedObjects:objects.length,passed:true};
  writeFileSync(resolve(target,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await mf.dispose();}
