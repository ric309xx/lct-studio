// Local-only publication package. Original survey/GCP/photo files are read-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const survey='D:/DATA/WORK/20261006桃園三維地籍';
const models='D:/DJI/DJITerra/20261006CL';
const output=path.join(root,'.local/private-control-points/taoyuan-building-overlay');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function csv(text){
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(value.replace(/\r$/,''));value='';if(c==='\n'){rows.push(row);row=[];}}
    else value+=c;
  }
  if(value||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift().map(v=>v.replace(/^\uFEFF/,''));
  return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}
const sources=JSON.parse(fs.readFileSync(path.join(root,'analysis/20261027-height-audit/control-pairs.json'),'utf8'));
sources.push(JSON.parse(fs.readFileSync(path.join(root,'analysis/20261028-height-audit/1007-ion-source.json'),'utf8')));
const photos=[];
for(const folder of ['整理完成_20261011','整理完成_20261013']){
  const base=path.join(survey,'01測量資料/像控點照片',folder);
  for(const row of csv(fs.readFileSync(path.join(base,'照片分類清單.csv'),'utf8'))){
    if(row['是否上傳']!=='是'||!row['點號'])continue;
    const relative=row['整理後路徑'],file=path.resolve(base,relative);
    if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Photo source escaped its folder');
    const bytes=fs.readFileSync(file),digest=sha(bytes);
    if(digest!==row.SHA256)throw Error(`Photo hash mismatch: ${relative}`);
    photos.push({code:row['點號'],file,sha256:digest,category:row['分類'],filename:path.basename(relative),
      source:`${folder}/照片分類清單.csv`,capturedAt:null});
  }
}
const points=[],sourceFiles=[];
for(const source of sources){
  const file=path.join(models,source.folder,'AT/gcp_points.json'),bytes=fs.readFileSync(file);
  if(sha(bytes)!==source.gcpSha256)throw Error(`GCP source changed: ${source.id}`);
  const original=JSON.parse(bytes);
  if(original.geo_desc.geo_cs!=='EPSG:3826'||original.geo_desc.override_vertical_cs!=='EPSG:8904')throw Error('Unknown horizontal or vertical datum');
  sourceFiles.push({profileId:source.id,file:`${source.folder}/AT/gcp_points.json`,sha256:source.gcpSha256});
  for(const [kind,records] of [['control',original.control_point??[]],['check',original.check_point??[]]]){
    for(const p of records){
      const [east,north,orthometric]=p.gt_pt;
      if(![east,north,orthometric].every(Number.isFinite))throw Error('Invalid source coordinates');
      const paired=source.points.find(r=>r.id===p.id);
      if(!paired||Math.hypot(paired.east-east,paired.north-north)>.0001||Math.abs(paired.orthometric-orthometric)>.0001)throw Error('Audit/GCP mismatch');
      const candidates=photos.filter(photo=>photo.code===p.id);
      // Photo classifications identify physical point codes, not model aliases.
      // CLR16 therefore never borrows CL16 photographs.
      const sameCode=sources.flatMap(s=>s.points).filter(r=>r.id===p.id);
      const ambiguous=sameCode.some(r=>Math.hypot(r.east-east,r.north-north)>.5);
      const attached=(ambiguous?[]:candidates).filter((p,i,all)=>all.findIndex(other=>other.sha256===p.sha256)===i);
      points.push({id:`${source.id}:${p.id}`,profileId:source.id,code:p.id,originalCode:paired.sourcePointId??p.id,kind,
        east,north,orthometric,crs:'EPSG:3826',verticalDatum:'TWVD2001',
        source:`${source.folder}/AT/gcp_points.json`,sourceSha256:source.gcpSha256,
        photoNote:ambiguous?'同號點位位置不同，照片對應待確認':attached.length?'照片依既有分類清單對應；原始拍攝時間未知':'尚未有可確認對應的照片',
        photos:attached.map(photo=>({path:`photos/${photo.sha256}.jpg`,sha256:photo.sha256,category:photo.category,filename:photo.filename,source:photo.source,capturedAt:null}))});
    }
  }
}
fs.mkdirSync(path.join(output,'photos'),{recursive:true});
const used=new Set(points.flatMap(p=>p.photos.map(photo=>photo.sha256)));
for(const photo of photos)if(used.has(photo.sha256)){
  const target=path.join(output,'photos',`${photo.sha256}.jpg`);
  if(fs.existsSync(target)){if(sha(fs.readFileSync(target))!==photo.sha256)throw Error('Local photo copy differs');}
  else fs.copyFileSync(photo.file,target);
  if(sha(fs.readFileSync(target))!==photo.sha256)throw Error('Local copy verification failed');
}
const catalog={schemaVersion:1,projectId:'taoyuan-building-overlay',revision:'20261028-controls-v1',sourceFiles,points};
fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({localOnly:true,output:path.relative(root,output),models:sources.length,points:points.length,photos:used.size,
  withoutPhotos:points.filter(p=>!p.photos.length).map(p=>p.id)}));
