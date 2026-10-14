// 唯讀解析來源，先產生檢查與匯入候選檔，不連線正式資料庫。
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as XLSX from 'xlsx';
import {normalizeRecords,toLonLat,distance} from '../shared/coordinates.mjs';

const sourceDir=process.argv[2],outputDir=resolve(process.argv[3]||'.local/review-20261012');
if(!sourceDir)throw new Error('用法：node scripts/prepare-review.mjs 來源資料夾 [輸出資料夾]');
mkdirSync(outputDir,{recursive:true});
const definitions=[
 {file:'TWD97 2010.0.xls',id:'twd97-2010',name:'TWD97[2010] 全臺控制點',year:null,color:'#287fb8',system:'TWD97[2010]'},
 {file:'112中壢八德坐標成果表.xlsx',id:'zhongli-bade-112',name:'中壢八德',year:112,color:'#468767',system:'TWD97'},
 {file:'112桃園龜山坐標成果表.xlsx',id:'taoyuan-guishan-112',name:'桃園龜山',year:112,color:'#c26b28',system:'TWD97'},
 {file:'112新屋、楊梅、觀音坐標成果.xlsx',id:'xinwu-yangmei-guanyin-112',name:'新屋、楊梅、觀音',year:112,color:'#bc4778',system:'TWD97'}
];
const batches=[],issues=[],checks=[],quarantine=[];
const code=v=>typeof v==='number'?String(v):String(v??'').trim();
const valid=v=>typeof v==='number'&&Number.isFinite(v);
function dms(v){const m=String(v).match(/([NSEW])\s*(\d+)\s+(\d+)\s+([\d.]+)/);return m?(m[1]==='S'||m[1]==='W'?-1:1)*(Number(m[2])+Number(m[3])/60+Number(m[4])/3600):null;}
const values=(book,sheet)=>XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,defval:null,blankrows:true,raw:true});
function rawRow(book,sheet,index){
 const s=book.Sheets[sheet],range=XLSX.utils.decode_range(s['!ref']),raw={},display={},formulas={};
 for(let c=0;c<=range.e.c;c++){
  const cell=s[XLSX.utils.encode_cell({r:index,c})],header=s[XLSX.utils.encode_cell({r:0,c})]?.v;
  const label=`${header||'欄'}（${XLSX.utils.encode_col(c)}）`;
  raw[label]=cell?.v??null;
  if(cell)display[label]=String(cell.w??XLSX.utils.format_cell(cell));
  if(cell?.f)formulas[label]=cell.f;
 }
 raw.__excel={display,formulas};return raw;
}
for(const def of definitions){
 const file=resolve(sourceDir,def.file),bytes=readFileSync(file),sourceHash=createHash('sha256').update(bytes).digest('hex');
 const book=XLSX.read(bytes,{type:'buffer',cellFormula:true,cellNF:true,cellText:true});
 const records=[],byCoordinate=new Map(),representations=new Map();
 if(def.system==='TWD97[2010]')for(const sheet of ['XYZ','flh'])for(const [index,r] of values(book,sheet).entries()){
  if(index===0)continue;const key=`${r[0]}:${code(r[1])}`;
  const entry=representations.get(key)||{};entry[sheet]={source_sheet:sheet,source_row:index+1,values:rawRow(book,sheet,index)};representations.set(key,entry);
 }
 let sourceRows=0,deduplicated=0;
 for(const sheet of book.SheetNames){
  if(def.system==='TWD97[2010]'&&sheet!=='NEh')continue;
  for(const [index,r] of values(book,sheet).entries()){
   let pi,ni,ei,hi,primary,category,description,notes;
   if(def.system==='TWD97[2010]'){[pi,ni,ei,hi]=[1,7,8,9];primary=r[1];category=r[3];description=r[6];notes=r[13];}
   else if(def.id==='zhongli-bade-112'){[pi,ni,ei,hi]=[0,1,2,3];primary=r[4];category=r[5];description=r[6];notes=r[7];}
   else if(def.id==='taoyuan-guishan-112'){[pi,ni,ei,hi]=[1,3,4,5];primary=r[2];category=r[7];description=r[8];notes=r[6];}
   else if(sheet==='TY0297'){[pi,ni,ei,hi]=[0,1,2,3];primary=r[0];category=r[4];description=r[5];notes=r[6];}
   else{[pi,ni,ei,hi]=[1,2,3,4];primary=r[1];category=r[5];description=r[6];notes=r[7];}
   if(!valid(r[ni])||!valid(r[ei]))continue;
   const original=code(r[pi]),raw=rawRow(book,sheet,index);
   const key=JSON.stringify([original,r[ni],r[ei],r[hi]??null]);
   if(sheet.includes('檢測18點')){
    const check={point:original,source_sheet:sheet,source_row:index+1,north:r[7],east:r[8],height:r[9],horizontal_cm:100*Math.hypot(r[7]-r[ni],r[8]-r[ei]),raw};
    checks.push(check);const main=byCoordinate.get(key);if(!main)throw new Error(`檢測點 ${original} 無對應主表成果`);
    (main.raw['檢測成果']??=[]).push(check);continue;
   }
   sourceRows++;
   if(byCoordinate.has(key)){
    const main=byCoordinate.get(key);(main.raw['重複來源']??=[]).push({source_sheet:sheet,source_row:index+1,raw});deduplicated++;continue;
   }
   const record={code:code(primary),original_code:original,name:def.system==='TWD97[2010]'?code(r[2]):'',north:r[ni],east:r[ei],height:r[hi]??null,category:code(category),description:code(description),notes:code(notes),source_row:index+1,source_sheet:sheet,raw};
   if(def.system==='TWD97[2010]')raw['其他坐標表示']=representations.get(`${r[0]}:${original}`)||{};
   records.push(record);byCoordinate.set(key,record);
  }
 }
 const primaryGroups=new Map();for(const r of records){const group=primaryGroups.get(r.code)||[];group.push(r);primaryGroups.set(r.code,group);}
 for(const [primary,group] of primaryGroups)if(group.length>1){
  issues.push({dataset_id:def.id,kind:'同主要點號異坐標，分開保留',code:primary,rows:group.map(r=>r.source_row)});
  for(const r of group){r.code=`${primary}__R${r.source_row}`;r.raw['匯入識別註記']='同號異坐標，以來源列號建立識別碼；原點號未更動';}
 }
 const dataset={id:def.id,name:def.name,epsg:3826,height_type:'橢球高',height_datum:null,metadata:{resultYear:def.year,color:def.color,coordinateSystem:def.system,coordinateEpoch:def.system==='TWD97[2010]'?2010:null,projectionNote:'EPSG 指投影計算；未套用 TWD97 與 TWD97[2010] 年代轉換',sourceHash,sourceRows,deduplicatedRows:deduplicated,originalSheets:book.SheetNames,reviewStatus:'待與正式網站逐筆比對',existingDataset:def.id==='zhongli-bade-112'?'zhongli-bade':null}};
 const groups=new Map();
 for(const r of records){
  let epsg=3826;
  if(def.system==='TWD97[2010]'){
   const f=r.raw['其他坐標表示']?.flh?.values,entries=Object.entries(f||{});
   const lat=dms(entries.find(([k])=>k.startsWith('緯度'))?.[1]),lon=dms(entries.find(([k])=>k.startsWith('經度'))?.[1]);
   if(lat==null||lon==null){quarantine.push({reason:'缺少來源經緯度，無法核對分帶',record:r});continue;}
   const errors=[3826,3825].map(e=>({epsg:e,error:distance(toLonLat(r.east,r.north,e),[lon,lat])})).sort((a,b)=>a.error-b.error);
   if(errors[0].error>1){quarantine.push({reason:'121／119 分帶均與原經緯度相差超過 1 公尺，保留待查',lon,lat,errors,record:r});continue;}
   epsg=errors[0].epsg;r.source_lon=lon;r.source_lat=lat;
   r.raw['分帶核對']={epsg,difference_m:errors[0].error};
  }
  const group=groups.get(epsg)||[];group.push(r);groups.set(epsg,group);
 }
 for(const [epsg,group] of groups){
  const d={...dataset,epsg,metadata:{...dataset.metadata,importScope:`${def.id}-epsg-${epsg}`}};
  if(def.system==='TWD97[2010]'){d.id=`twd97-2010-${epsg===3826?'121':'119'}`;d.name=`TWD97[2010] 控制點（${epsg===3826?'121':'119'} 分帶）`;}
  const result=normalizeRecords(group,d);if(result.errors.length)throw new Error(JSON.stringify(result.errors));
  batches.push({dataset:d,records:group,file,source_hash:sourceHash});
  console.log(JSON.stringify({id:d.id,sourceRows,importCandidates:group.length,deduplicated},null,2));
 }
}
writeFileSync(join(outputDir,'review-batches.json'),JSON.stringify(batches,null,2));
writeFileSync(join(outputDir,'review-issues.json'),JSON.stringify(issues,null,2));
writeFileSync(join(outputDir,'review-checks.json'),JSON.stringify(checks,null,2));
writeFileSync(join(outputDir,'review-quarantine.json'),JSON.stringify(quarantine,null,2));
console.log('已產生本機候選檔，未匯入正式網站。');
