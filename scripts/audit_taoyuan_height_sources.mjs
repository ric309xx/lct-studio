// Read-only survey CSV/GCP join. Does not write/normalize original measurements.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const survey='D:/DATA/WORK/20261006桃園三維地籍';
const modelBase='D:/DJI/DJITerra/20261006CL';
const sources=['20260723-20261006.csv','20261015A-20261015.csv','20261015B-20261015.csv',
  '01測量資料/20260723-20261007.csv','01測量資料/20261007-20261010.csv','01測量資料/20261007-20261010-2.csv','01測量資料/20261007-20261013.csv'];
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  const header=rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim());
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}
function dms(value){
  const p=value?.match(/(-?\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  return p?Number(p[1])+Number(p[2])/60+Number(p[3])/3600:null;
}
const observations=sources.flatMap(source=>{
  const bytes=fs.readFileSync(path.join(survey,source));let text=bytes.toString('utf8');
  if(text.includes('\uFFFD'))text=new TextDecoder('big5').decode(bytes);
  return parseCsv(text).filter(r=>r['大地高']?.trim()&&r['東座標']?.trim()&&r['北座標']?.trim()).map(r=>({
    id:r['點名'].split('.')[0].toUpperCase(),east:Number(r['東座標']),north:Number(r['北座標']),
    ellipsoidal:Number(r['大地高']),reportedHeight:r['高程']===''?null:Number(r['高程']),
    longitude:dms(r['經度']),latitude:dms(r['緯度']),source,sourceSha256:digest(bytes),time:r['本地時間']
  })).filter(r=>[r.east,r.north,r.ellipsoidal].every(Number.isFinite));
});
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
// Explicit source-name aliases only, corroborated by matching XY within 0.15 m.
// CLR16 is deliberately NOT matched to CL16 (different XY by several metres).
const aliases={CLY1:'CLY01',CLY2:'CLY02',B112:'B112042',BS04:'BS040'};
const models=[['1006','20261006CL','tileset.json'],['1010-cl1','20261010CL1','1010-cl1/tileset.json'],['1010-cl2','20261010CL2','1010-cl2/tileset.json'],
  ['1013','20261013CL','1013-v2/tileset.json'],['1013-cl2','20261013CL2','1013-cl2/tileset.json'],['1015-cl1','20261015CL1','1015-cl1/tileset.json'],['1015-cl2','20261015CL2','1015-cl2/tileset.json']];
const selected=process.argv.includes('--1007')?[['1007-ion-6000372','20261007CL','ion:6000372']]:models;
const result=selected.map(([id,folder,tilesetPath])=>{
  const root=path.join(modelBase,folder),gcpBytes=fs.readFileSync(path.join(root,'AT/gcp_points.json')),gcp=JSON.parse(gcpBytes);
  const metadataPath=path.join(root,'models/pc/0/terra_obj/metadata.xml');
  const metadata=fs.existsSync(metadataPath)?fs.readFileSync(metadataPath,'utf8'):'';
  const rootPath=path.join(root,'models/pc/0/terra_b3dms/tileset.json');
  const rootBytes=fs.existsSync(rootPath)?fs.readFileSync(rootPath):null;
  const points=[...(gcp.control_point??[]),...(gcp.check_point??[])].map(p=>{
    const [east,north,orthometric]=p.gt_pt;
    let matches=observations.filter(r=>r.id===(aliases[p.id]??p.id.toUpperCase())&&Math.hypot(r.east-east,r.north-north)<=.15);
    const modelDate=folder.slice(0,4)+'-'+folder.slice(4,6)+'-'+folder.slice(6,8);
    const sameDay=matches.filter(r=>r.time?.startsWith(modelDate));
    if(sameDay.length)matches=sameDay;
    matches=[...new Map(matches.map(r=>[JSON.stringify([r.id,r.time,r.east,r.north,r.ellipsoidal]),r])).values()];
    if(!matches.length)return {id:p.id,east,north,orthometric,matched:false};
    const hs=matches.map(m=>m.ellipsoidal),ellipsoidal=median(hs),reference=matches.reduce((a,b)=>Math.abs(b.ellipsoidal-ellipsoidal)<Math.abs(a.ellipsoidal-ellipsoidal)?b:a);
    return {id:p.id,east,north,orthometric,matched:true,ellipsoidal,undulationM:ellipsoidal-orthometric,
      observationSpreadM:Math.max(...hs)-Math.min(...hs),observations:matches.length,
      longitude:reference.longitude,latitude:reference.latitude,sourcePointId:reference.id,
      source:reference.source,sourceSha256:reference.sourceSha256};
  });
  const accepted=points.filter(p=>p.matched&&p.observationSpreadM<=.15),offsets=accepted.map(p=>p.undulationM);
  return {id,folder,tilesetPath,sourceVerticalDatum:gcp.geo_desc.override_vertical_cs,
    metadataSrs:metadata.match(/<SRS>(.*?)<\/SRS>/)?.[1]??null,gcpSha256:digest(gcpBytes),rootTilesetSha256:rootBytes?digest(rootBytes):null,
    pairedControls:accepted.length,offsetM:offsets.length?median(offsets):null,
    rangeM:offsets.length?Math.max(...offsets)-Math.min(...offsets):null,renderFrame:'pending-scene-validation',points};
});
console.log(JSON.stringify(result,null,2));
