import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,X,Trash2,Upload,ImagePlus} from 'lucide-react';
import {PHOTO_CATEGORIES} from '../shared/fieldWorkflow.mjs';
import type {Point,Position} from './types';
export type StagedPhoto={id:string;file:File;capturedAt:string;position:Position|null;preview:string};
type Props={point:Point;initialCategory?:string;position:Position|null;online:boolean;staging?:boolean;onSave:(items:StagedPhoto[],category:string)=>Promise<void>;onClose:()=>void};
export default function PhotoCaptureDialog({point,initialCategory='近照',position,online,staging=false,onSave,onClose}:Props){
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),urls=useRef(new Set<string>()),title=useId();
  const [category,setCategory]=useState(PHOTO_CATEGORIES.includes(initialCategory)?initialCategory:'其他'),[items,setItems]=useState<StagedPhoto[]>([]),[camera,setCamera]=useState(false),[cameraBusy,setCameraBusy]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  function stopStream(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  useEffect(()=>{alive.current=true;const el=dialog.current!;el.showModal();const hidden=()=>{if(document.hidden){stopStream();setCamera(false);setReady(false);}};document.addEventListener('visibilitychange',hidden);return()=>{alive.current=false;stopStream();urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();document.removeEventListener('visibilitychange',hidden);el.close();};},[]);
  useEffect(()=>{if(!items.length)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[items.length]);
  useEffect(()=>{if(camera&&video.current&&stream.current){video.current.srcObject=stream.current;video.current.play().catch(()=>setError('請點預覽畫面播放相機，或改用系統相機。'));}},[camera]);
  function close(){if(busy||cameraBusy)return;if(items.length&&!confirm(`本次 ${items.length} 張照片尚未確認上傳，確定放棄？`))return;onClose();}
  function stage(files:File[]){
    const added:StagedPhoto[]=[];for(const file of files){if(file.size<1||file.size>30*1024*1024){setError(`${file.name} 必須在 30 MB 以內`);continue;}const preview=file.type.startsWith('image/')?URL.createObjectURL(file):'';if(preview)urls.current.add(preview);added.push({id:crypto.randomUUID(),file,capturedAt:new Date().toISOString(),position:position?{...position}:null,preview});}
    setItems(previous=>[...previous,...added]);
  }
  async function startCamera(){
    setError('');if(!navigator.mediaDevices?.getUserMedia){setError('此瀏覽器沒有連拍相機，請使用下方「系統相機」；可重複拍攝，最後一起上傳。');return;}
    setCameraBusy(true);try{const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});if(!alive.current){s.getTracks().forEach(t=>t.stop());return;}stopStream();stream.current=s;setCamera(true);setReady(false);}catch{setError('相機未能開啟。請允許本站相機權限，或改用下方「系統相機」；已拍照片仍保留。');}finally{if(alive.current)setCameraBusy(false);}
  }
  async function shoot(){
    const v=video.current;if(!v||!ready||busy)return;setBusy(true);setError('');try{const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');if(!ctx||!c.width||!c.height)throw new Error('相機尚未準備完成，請再試一次。');ctx.drawImage(v,0,0);const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',.94));if(!blob)throw new Error('照片未能保存，請再拍一次。');if(alive.current)stage([new File([blob],`${point.code}_${category}_${Date.now()}.jpg`,{type:'image/jpeg'})]);}catch(e){setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
  }
  function remove(item:StagedPhoto){if(item.preview){URL.revokeObjectURL(item.preview);urls.current.delete(item.preview);}setItems(p=>p.filter(v=>v.id!==item.id));}
  async function save(){if(!items.length||busy)return;setBusy(true);setError('');stopStream();setCamera(false);setReady(false);try{await onSave(items,category);}catch(e){setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
  return createPortal(<dialog ref={dialog} className="capture-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();close();}}><header className="capture-heading"><div><small>{point.code} · {point.name||'現場點位'}</small><h2 id={title}>分類連拍</h2></div><button className="icon-button" onClick={close} disabled={busy||cameraBusy} aria-label="關閉分類連拍"><X size={23}/></button></header>
    <p className="muted">先選本次類別，再連續拍照。拍完確認張數後，一次加入上傳。</p><div className="capture-categories" role="group" aria-label="本次照片類別">{PHOTO_CATEGORIES.map(c=><button key={c} className={'secondary '+(c===category?'active':'')} aria-pressed={c===category} disabled={busy||cameraBusy||items.length>0} onClick={()=>setCategory(c)}>{c}</button>)}</div><strong className="capture-count">本次 {category} · 已拍／選 {items.length} 張</strong>
    {camera?<><video ref={video} className="capture-video" autoPlay muted playsInline onLoadedData={()=>setReady(true)} onClick={()=>video.current?.play()}/><div className="button-row"><button className="primary" onClick={shoot} disabled={busy||!ready}><Camera size={19}/>{busy?'保存中…':'拍一張'}（{items.length}）</button><button className="secondary" disabled={busy} onClick={()=>{stopStream();setCamera(false);setReady(false);}}>結束連拍</button></div></>:<button className="primary full" onClick={startCamera} disabled={busy||cameraBusy}><Camera size={19}/>{cameraBusy?'開啟相機中…':'開啟連拍相機'}</button>}
    <div className="button-row capture-fallback"><label className="secondary upload-button"><Camera size={16}/>系統相機<input disabled={busy||cameraBusy} type="file" accept="image/*" capture="environment" onChange={e=>{if(e.target.files)stage(Array.from(e.target.files));e.target.value='';}}/></label><label className="secondary upload-button"><ImagePlus size={16}/>選擇照片／附件<input disabled={busy||cameraBusy} type="file" accept="image/*,.heic,.heif,.pdf" multiple onChange={e=>{if(e.target.files)stage(Array.from(e.target.files));e.target.value='';}}/></label></div>
    <div className="capture-thumbnails">{items.map((item,i)=><div key={item.id}>{item.preview?<img src={item.preview} alt={`${category}第 ${i+1} 張`} onError={e=>{e.currentTarget.style.display='none';}}/>:<span>{item.file.name}</span>}<small>{category} {i+1}</small><button className="icon-button" disabled={busy} onClick={()=>remove(item)} aria-label={`移除第 ${i+1} 張`}><Trash2 size={16}/></button></div>)}</div>
    {error&&<p className="error-text" role="alert">{error}</p>}<footer className="capture-footer"><button className="primary full" onClick={save} disabled={!items.length||busy||cameraBusy}><Upload size={18}/>{busy?'保存整批照片中…':`確認${staging?'加入':online?'上傳':'暫存'} ${category} ${items.length} 張`}</button><p className="muted">{staging?'照片先加入新點位表單，保存點位時才會上傳。':'確認前不會上傳。'}要拍其他類別，完成這批後再開啟拍照。{!online&&!staging&&'目前離線，確認後保存在本機待傳。'}</p></footer>
  </dialog>,document.body);
}
