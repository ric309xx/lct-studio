import {recordPhotos,recordCategory,recordFilename} from './pointRecord.mjs';

export function toggleRecordSelection(ids,id){const next=new Set(ids);if(next.has(id))next.delete(id);else next.add(id);return next;}
export function selectRecordResults(ids,points,checked){const next=new Set(ids);for(const p of points){if(checked)next.add(p.id);else next.delete(p.id);}return next;}
export function batchPhotos(attachments,preset){
 const photos=recordPhotos(attachments);
 if(preset==='all')return photos;
 if(preset==='none')return [];
 return [...photos.filter(a=>recordCategory(a.category)==='近照').slice(0,1),...photos.filter(a=>recordCategory(a.category)==='遠照').slice(0,preset==='1+1'?1:4)];
}
export function recordBatchPath(point,dataset,index,format){
 if(!['pdf','docx','html'].includes(format))throw new Error('不支援的點之記格式');
 const folder=String(dataset?.name||point.dataset_id||'控制點').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,70)||'控制點';
 // A unique sequence also prevents collisions between identical codes or sanitized dataset names.
 return `${folder}/${String(index+1).padStart(4,'0')}_${recordFilename(point.code).slice(0,100)}.${format}`;
}
export async function runRecordBatch(points,{signal,render,add,onProgress}){
 const unique=[...new Map(points.map(p=>[p.id,p])).values()],results=[];
 if(!unique.length)throw new Error('請先勾選點位');
 for(const [index,point]of unique.entries()){
  signal.throwIfAborted();onProgress(point,index,unique.length);
  let result;
  try{result=await render(point,index);}catch(e){signal.throwIfAborted();throw new Error(`${point.code}：${e.message}`);}
  signal.throwIfAborted();await add(result,point,index);results.push(result.summary);
 }
 return results;
}
export function batchManifest(rows){
 const safe=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const headers=['資料集','點號','點位 ID','檔案','近照張數','遠照張數','其他照片張數','提醒'];
 return '\ufeff'+[headers,...rows.map(r=>[r.dataset,r.code,r.id,r.path,r.near,r.far,r.other,r.warning])].map(row=>row.map(safe).join(',')).join('\r\n');
}
