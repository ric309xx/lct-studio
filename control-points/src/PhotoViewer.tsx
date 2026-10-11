import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,Minus,Plus,X} from 'lucide-react';
import {readStored} from './storage';
import type {Attachment} from './types';
import {photoCategory,UploadTime} from './photos';

export default function PhotoViewer({attachment,preview,onClose}:{attachment:Attachment;preview:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
  const [src,setSrc]=useState(preview),[original,setOriginal]=useState(''),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[zoom,setZoom]=useState(1),[failed,setFailed]=useState(false);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  useEffect(()=>{
    let active=true;const urls:string[]=[];
    (async()=>{
      try{
        let blob=await readStored<Blob>(`photo:${attachment.id}:original`);
        if(!blob){const response=await fetch(`/files/${attachment.id}`,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('原圖無法載入，請確認網路或重新登入。');blob=await response.blob();}
        if(!active)return;const url=URL.createObjectURL(blob);urls.push(url);setOriginal(url);setSrc(url);setFailed(false);
      }catch(error){if(active)setMessage(preview?'原圖無法載入，目前顯示預覽圖。':(error as Error).message);}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};
  },[attachment.id,preview]);
  function imageError(){if(src!==preview&&preview){setSrc(preview);setMessage('原始格式無法預覽，目前顯示預覽圖；仍可下載原檔。');}else{setFailed(true);setMessage('此照片無法預覽，請下載原檔查看。');}}
  return createPortal(<dialog ref={dialog} className="photo-viewer" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <header className="photo-viewer-header"><div><h2 id={titleId}>{photoCategory(attachment.category)}</h2><p>{attachment.filename}</p><UploadTime value={attachment.created_at} className="photo-viewer-upload-time"/></div><a className="photo-viewer-button" href={original||`/files/${attachment.id}`} download={attachment.filename} aria-label="下載照片原檔"><Download size={20}/></a><button className="photo-viewer-button" onClick={onClose} aria-label="關閉照片" autoFocus><X size={24}/></button></header>
    <div className={'photo-viewer-stage'+(zoom>1?' zoomed':'')}>
      {src&&!failed?<img src={src} alt={`${attachment.category} ${attachment.filename}`} onError={imageError} style={zoom>1?{width:`${zoom*100}%`}:undefined}/>:!loading&&<p>無法顯示照片</p>}
    </div>
    <footer className="photo-viewer-footer"><div className="photo-viewer-status" role="status">{loading?'正在載入原圖…':message||'可放大查看細節，或下載原檔。'}</div><div className="photo-viewer-zoom"><button className="photo-viewer-button" onClick={()=>setZoom(value=>Math.max(1,value-.5))} disabled={zoom<=1||failed} aria-label="縮小照片"><Minus size={20}/></button><button className="photo-viewer-button photo-viewer-fit" onClick={()=>setZoom(1)} aria-label="照片符合螢幕">{Math.round(zoom*100)}%</button><button className="photo-viewer-button" onClick={()=>setZoom(value=>Math.min(3,value+.5))} disabled={zoom>=3||failed} aria-label="放大照片"><Plus size={20}/></button></div></footer>
  </dialog>,document.body);
}
