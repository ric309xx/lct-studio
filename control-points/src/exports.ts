import {sourceAttributes} from '../shared/attributes.mjs';
import JSZip from 'jszip';import type {Point,Dataset,Attachment} from './types';import {api} from './api';
export function download(blob:Blob,filename:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const safe=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function exportPoints(points:Point[],datasets:Dataset[],format:'csv'|'geojson'){
  const names=Object.fromEntries(datasets.map(d=>[d.id,d.name]));
  if(format==='csv'){
    const attributes=points.map(p=>Object.fromEntries(sourceAttributes(p.raw).map(a=>[a.label,a.value])));
    const attributeNames=[...new Set(attributes.flatMap(a=>Object.keys(a)))];
    const headers=['資料集','點號','原點號','點名','坐標系統','EPSG','N','E','高度','高度類型','高程基準','WGS84經度','WGS84緯度','分類','說明','備註','巡查狀態',...attributeNames.map(k=>'原始屬性：'+k)];
    const rows=points.map((p,i)=>[names[p.dataset_id],p.code,p.original_code,p.name,p.crs,p.epsg,p.north,p.east,p.height,p.height_type,p.height_datum||'未註明',p.lon,p.lat,p.category,p.description,p.notes,p.status,...attributeNames.map(k=>attributes[i][k]??'')]);
    download(new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'控制點資料.csv');
  }else download(new Blob([JSON.stringify({type:'FeatureCollection',features:points.map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{...p,dataset_name:names[p.dataset_id],geometry_crs:'WGS84 EPSG:4326',source_crs:p.crs}}))},null,2)],{type:'application/geo+json'}),'控制點資料.geojson');
}
export async function downloadPhotos(attachments:Attachment[]){
  if(!attachments.length)throw new Error('目前沒有已上傳照片');const zip=new JSZip();
  for(const a of attachments){const r=await fetch(`/files/${a.id}`,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('照片下載失敗，請確認登入與連線');zip.file(`${a.category}/${a.id}_${a.filename}`,await r.blob());}
  download(await zip.generateAsync({type:'blob'}),'控制點照片.zip');
}
export async function fullBackup(){
  const data=await api('/api/backup'),zip=new JSZip();zip.file('data.json',JSON.stringify(data,null,2));
  const add=async(path:string,url:string)=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('備份下載不完整，請重新登入後重試');zip.file(path,await r.blob());};
  for(const d of data.datasets)await add(`sources/${d.id}/${d.source_name}`,`/api/datasets/${d.id}/source`);
  for(const a of data.attachments){await add(`photos/${a.id}/${a.filename}`,`/api/backup-files/${a.id}`);if(a.thumb_key)await add(`photos/${a.id}/thumbnail.jpg`,`/api/backup-files/${a.id}/thumbnail`);}
  const overlay=await api('/api/overlay');if(overlay)zip.file('cadastral.geojson',JSON.stringify(overlay));
  download(await zip.generateAsync({type:'blob'}),`控制點完整備份_${new Date().toISOString().slice(0,10)}.zip`);
}
