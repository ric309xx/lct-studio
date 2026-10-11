import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,X,LoaderCircle} from 'lucide-react';
import JSZip from 'jszip';
import {api,ApiError} from './api';
import {readStored} from './storage';
import {download} from './exports';
import {prepareRecord,buildRecordFile,recordPdfPages} from './pointRecordExport';
import {jpegPagesPdf} from '../shared/pdfPages.mjs';
import {batchPhotos,recordBatchPath,runRecordBatch,batchManifest} from '../shared/batchRecords.mjs';
import {recordCategory} from '../shared/pointRecord.mjs';
import type {Point,Dataset,Attachment,OfflinePack} from './types';

export default function BatchPointRecordDialog({points,datasets,onClose}:{points:Point[];datasets:Dataset[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),title=useId(),controller=useRef<AbortController|null>(null);
 const [delivery,setDelivery]=useState('combined-pdf'),[format,setFormat]=useState('pdf'),[basemap,setBasemap]=useState('road'),[preset,setPreset]=useState('1+4'),[attributes,setAttributes]=useState(false),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[completed,setCompleted]=useState(0),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[cancelling,setCancelling]=useState(false);
 useEffect(()=>{dialog.current!.showModal();return()=>{controller.current?.abort();dialog.current?.close();};},[]);
 async function generate(){
  const abort=new AbortController();controller.current=abort;setBusy(true);setCancelling(false);setError('');setWarnings([]);setCompleted(0);
  const zip=new JSZip(),notes:string[]=[],combined=delivery==='combined-pdf',pages:Awaited<ReturnType<typeof recordPdfPages>>=[];
  try{
   const manifest=await runRecordBatch(points,{
    signal:abort.signal,
    onProgress:(point:Point,index:number,total:number)=>{setCompleted(index);setProgress(`${index+1} / ${total} · ${point.code}：讀取照片清單…`);},
    render:async(point:Point,index:number)=>{
     const dataset=datasets.find(d=>d.id===point.dataset_id),label=`${index+1} / ${points.length} · ${point.code}`;
     let attachments:Attachment[];
     try{attachments=await api<Attachment[]>(`/api/points/${point.id}/attachments`,{signal:abort.signal});}
     catch(e){abort.signal.throwIfAborted();if(e instanceof ApiError)throw e;const offline=await readStored<OfflinePack>('offline');if(!offline?.points.some(p=>p.id===point.id)||!offline.withPhotos)throw e;attachments=offline.attachments.filter(a=>a.point_id===point.id);}
     const photos:Attachment[]=batchPhotos(attachments,preset),near=photos.filter(a=>recordCategory(a.category)==='近照').length,far=photos.filter(a=>recordCategory(a.category)==='遠照').length,other=photos.length-near-far;
     const short=preset==='1+4'||preset==='1+1',wantedFar=preset==='1+1'?1:4,warning=short&&(near<1||far<wantedFar)?`照片不足：使用 ${near} 近照、${far} 遠照`:'';
     if(warning)notes.push(`${point.code} · ${dataset?.name||point.dataset_id}：${warning}`);
     const doc=await prepareRecord(point,dataset,photos,basemap,s=>setProgress(`${label}：${s}`),abort.signal);if(!attributes)doc.attributes=[];
     abort.signal.throwIfAborted();setProgress(`${label}：產生 ${combined?'PDF':format.toUpperCase()}…`);
     if(combined)return {pages:await recordPdfPages(doc)};
     const {blob}=await buildRecordFile(doc,format),path=recordBatchPath(point,dataset,index,format);
     return {blob,summary:{dataset:dataset?.name||point.dataset_id,code:point.code,id:point.id,path,near,far,other,warning}};
    },
    add:async(result:{pages?:Awaited<ReturnType<typeof recordPdfPages>>;blob?:Blob;summary?:{path:string}})=>{if(result.pages)pages.push(...result.pages);else if(result.blob&&result.summary)zip.file(result.summary.path,await result.blob.arrayBuffer());},
   });
   abort.signal.throwIfAborted();setCompleted(points.length);setProgress(combined?'合併 PDF…':'打包 ZIP…');
   let blob:Blob;
   if(combined)blob=new Blob([new Uint8Array(jpegPagesPdf(pages))],{type:'application/pdf'});
   else{zip.file('下載清單.csv',batchManifest(manifest));blob=await zip.generateAsync({type:'blob',compression:'STORE'},metadata=>setProgress(`打包 ZIP… ${Math.round(metadata.percent)}%`));}
   abort.signal.throwIfAborted();download(blob,`點之記_批次_${points.length}點_${new Date().toISOString().slice(0,10)}.${combined?'pdf':'zip'}`);
   setWarnings(notes);setProgress(combined?`已將 ${points.length} 點合併為一份 PDF，共 ${pages.length} 頁，請查看瀏覽器下載項目。`:`已產生 ${points.length} 份點之記 ZIP，請查看瀏覽器下載項目。`);
  }catch(e){if(abort.signal.aborted)setProgress('已取消，未下載不完整的檔案。');else{setError(`${(e as Error).message}。本次未下載檔案，已勾選點位保留，可重試。`);setProgress('');}}
  finally{controller.current=null;setBusy(false);setCancelling(false);}
 }
 return createPortal(<dialog ref={dialog} className="record-dialog batch-record-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="modal-heading"><div><h2 id={title}>批次下載點之記</h2><p className="muted">已選 {points.length.toLocaleString()} 點 · {delivery==='combined-pdf'?'全部點位合併為一份 PDF':'每點一份，打包 ZIP'}</p></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="關閉批次點之記設定"><X size={22}/></button></div>
  <details className="batch-review"><summary>查看已選點位（{points.length}）</summary><ul>{points.map(p=><li key={p.id}><strong>{p.code}</strong><span>{datasets.find(d=>d.id===p.dataset_id)?.name||p.dataset_id}</span></li>)}</ul></details>
  <label>下載方式<select disabled={busy} value={delivery} onChange={e=>setDelivery(e.target.value)}><option value="combined-pdf">單一 PDF（全部點位合併）</option><option value="zip">ZIP（每點一份檔案）</option></select></label>
  <div className="form-grid">{delivery==='zip'&&<label>輸出格式<select disabled={busy} value={format} onChange={e=>setFormat(e.target.value)}><option value="pdf">PDF</option><option value="docx">Word（.docx，可編輯）</option><option value="html">HTML（含照片，可離線開啟）</option></select></label>}<label>位置圖底圖<select disabled={busy} value={basemap} onChange={e=>setBasemap(e.target.value)}><option value="road">電子地圖</option><option value="aerial">正射影像</option></select></label></div>
  <label>每點照片配置<select disabled={busy} value={preset} onChange={e=>setPreset(e.target.value)}><option value="1+4">1 近照 + 4 遠照</option><option value="1+1">1 近照 + 1 遠照</option><option value="all">全部照片</option><option value="none">不放照片</option></select></label>
  <p className="muted">沿用精簡版型及橫式照片。照片不足時使用現有張數，完成後顯示提醒；ZIP 另附「下載清單.csv」。位置圖需連線載入。</p>
  <label className="checkbox-label"><input type="checkbox" checked={attributes} disabled={busy} onChange={e=>setAttributes(e.target.checked)}/>另附完整 Excel 來源屬性</label>
  {busy&&<progress className="batch-progress" max={points.length} value={completed} aria-label="批次產生進度"/>}<p role="status" className="muted">{progress}</p>
  {error&&<p className="notice warning" role="alert">{error}</p>}{warnings.length>0&&<details className="notice warning"><summary>{warnings.length} 個點的照片未達設定張數</summary><ul>{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
  <button className="primary full" onClick={generate} disabled={busy||!points.length}>{busy?<LoaderCircle size={17} className="spin"/>:<Download size={17}/>} {busy?'產生中…':delivery==='combined-pdf'?'下載完整 PDF':'下載點之記 ZIP'}</button>
  {busy&&<button className="secondary full" disabled={cancelling} onClick={()=>{setCancelling(true);controller.current?.abort();}}>{cancelling?'正在取消…':'取消產生'}</button>}
 </dialog>,document.body);
}
