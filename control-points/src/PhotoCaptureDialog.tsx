import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Camera,X,Trash2,Upload,ImagePlus} from 'lucide-react';
import {PHOTO_CATEGORIES,PHOTO_SET,assignPhotoCategories} from '../shared/fieldWorkflow.mjs';
import type {Point,Position} from './types';
export type StagedPhoto={id:string;category?:string;file:File;capturedAt:string;position:Position|null;preview:string};
type Props={point:Point;initialCategory?:string;position:Position|null;online:boolean;staging?:boolean;onSave:(items:StagedPhoto[],category:string)=>Promise<void>;onClose:()=>void};
export default function PhotoCaptureDialog({point,initialCategory='近照',position,online,staging=false,onSave,onClose}:Props){
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),urls=useRef(new Set<string>()),title=useId();
  const [category,setCategory]=useState([...PHOTO_CATEGORIES,PHOTO_SET].includes(initialCategory)?initialCategory:'其他'),[items,setItems]=useState<StagedPhoto[]>([]),[camera,setCamera]=useState(false),[cameraBusy,setCameraBusy]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [nearId,setNearId]=useState(''),[flash,setFlash]=useState(0);const shooting=useRef(false);
  const series=category===PHOTO_SET,near=items.find(i=>i.id===nearId)?.id||items[0]?.id||'';
  const complete=series?items.length===5:items.length>0;
  function endCamera(){stopStream();setCamera(false);setReady(false);}
  function stopStream(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  useEffect(()=>{alive.current=true;const el=dialog.current!;el.showModal();const hidden=()=>{if(document.hidden){stopStream();setCamera(false);setReady(false);}};document.addEventListener('visibilitychange',hidden);return()=>{alive.current=false;stopStream();urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current.clear();document.removeEventListener('visibilitychange',hidden);el.close();};},[]);
  useEffect(()=>{if(!items.length)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[items.length]);
  useEffect(()=>{if(camera&&video.current&&stream.current){video.current.srcObject=stream.current;video.current.play().catch(()=>setError('請點預覽畫面播放相機，或改用系統相機。'));}},[camera]);
  function close(){if(busy||cameraBusy)return;if(items.length&&!confirm(`本次 ${items.length} 張照片尚未確認上傳，確定放棄？`))return;onClose();}
  function stage(files:File[]){
    if(series&&files.length+items.length>5){setError('這組只收 5 張，請重新選擇剩餘張數。');return;}
    if(series&&files.some(f=>!f.type.startsWith('image/')&&!/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name))){setError('1 近 4 遠只接受照片。');return;}
    setError('');const added:StagedPhoto[]=[];for(const file of files){if(file.size<1||file.size>30*1024*1024){setError(`${file.name} 必須在 30 MB 以內`);continue;}const preview=file.type.startsWith('image/')?URL.createObjectURL(file):'';if(preview)urls.current.add(preview);added.push({id:crypto.randomUUID(),file,capturedAt:new Date().toISOString(),position:position?{...position}:null,preview});}
    setItems(previous=>[...previous,...added]);if(series&&items.length+added.length===5)endCamera();
  }
  async function startCamera(){
    setError('');if(!navigator.mediaDevices?.getUserMedia){setError('此瀏覽器沒有連拍相機，請使用下方「系統相機」；可重複拍攝，最後一起上傳。');return;}
    setCameraBusy(true);try{const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});if(!alive.current||document.hidden){s.getTracks().forEach(t=>t.stop());return;}stopStream();stream.current=s;setCamera(true);setReady(false);}catch{setError('相機未能開啟。請允許本站相機權限，或改用下方「系統相機」；已拍照片仍保留。');}finally{if(alive.current)setCameraBusy(false);}
  }
  async function shoot(){
    const v=video.current;if(!v||!ready||busy||shooting.current)return;shooting.current=true;setBusy(true);setError('');try{const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');if(!ctx||!c.width||!c.height)throw new Error('相機尚未準備完成，請再試一次。');ctx.drawImage(v,0,0);const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/jpeg',.94));if(!blob)throw new Error('照片未能保存，請再拍一次。');if(alive.current){setFlash(v=>v+1);stage([new File([blob],`${point.code}_${category}_${Date.now()}.jpg`,{type:'image/jpeg'})]);}}catch(e){setError((e as Error).message);}finally{shooting.current=false;if(alive.current)setBusy(false);}
  }
  function remove(item:StagedPhoto){if(item.preview){URL.revokeObjectURL(item.preview);urls.current.delete(item.preview);}setItems(p=>p.filter(v=>v.id!==item.id));}
  async function save(){if(!complete||busy)return;setBusy(true);setError('');stopStream();setCamera(false);setReady(false);try{await onSave(assignPhotoCategories(items,category,near),category);}catch(e){setError((e as Error).message);}finally{if(alive.current)setBusy(false);}}
  return createPortal(<dialog ref={dialog} className={'capture-dialog'+(camera?' camera-active':'')} aria-labelledby={title} onCancel={e=>{e.preventDefault();if(camera){if(!busy)endCamera();}else close();}}>
    {camera?<div className="camera-screen">
      <header className="camera-head"><div><small>{point.code}</small><h2 id={title}>{series?(items.length?'拍攝遠照':'拍攝近照'):category}</h2></div><strong aria-live="polite">已拍 {items.length}{series?' / 5':''} 張</strong></header>
      <div className="camera-view"><video ref={video} autoPlay muted playsInline onCanPlay={()=>setReady(true)} onClick={()=>video.current?.play().catch(()=>{})}/>{flash>0&&<i className="shutter-flash" key={flash}/>}</div>
      {error&&<p className="camera-error" role="alert">{error}</p>}
      <footer className="camera-controls"><small>{!ready?'相機準備中…':busy?'正在保存…':'可連續拍攝'}</small><button className="shutter" aria-label="拍一張" onClick={shoot} disabled={busy||!ready}><Camera size={30}/></button><button className="camera-done" disabled={busy} onClick={endCamera}>完成取景</button></footer>
    </div>:<><header className="capture-heading"><div><small>{point.code} · {point.name||'現場點位'}</small><h2 id={title}>分類連拍</h2></div><button className="icon-button" onClick={close} disabled={busy||cameraBusy} aria-label="關閉分類連拍"><X size={23}/></button></header>
    <div className="capture-categories" role="group" aria-label="本次照片類別">{[PHOTO_SET,...PHOTO_CATEGORIES].map(c=><button key={c} className={'secondary '+(c===category?'active':'')} aria-pressed={c===category} disabled={busy||cameraBusy||items.length>0} onClick={()=>{setCategory(c);setError('');}}>{c}</button>)}</div>
    <p className="muted">{series?'連拍或一次選 5 張。預設第一張是近照，可在預覽中改選，其餘 4 張為遠照。':'可重複拍攝或多選照片，確認後再整批保存。'}</p>
    <strong className="capture-count" aria-live="polite">{category} · 已選 {items.length}{series?' / 5':''} 張</strong>
    <button className="primary full" onClick={startCamera} disabled={busy||cameraBusy||(series&&complete)}><Camera size={19}/>{cameraBusy?'開啟相機中…':'開啟連拍相機'}</button>
    <div className="button-row capture-fallback"><label className="secondary upload-button"><Camera size={16}/>系統相機<input disabled={busy||cameraBusy||(series&&complete)} type="file" accept="image/*" capture="environment" onChange={e=>{if(e.target.files)stage(Array.from(e.target.files));e.target.value='';}}/></label><label className="secondary upload-button"><ImagePlus size={16}/>選擇照片／附件<input disabled={busy||cameraBusy||(series&&complete)} type="file" accept={series?'image/*,.heic,.heif':'image/*,.heic,.heif,.pdf'} multiple onChange={e=>{if(e.target.files)stage(Array.from(e.target.files));e.target.value='';}}/></label></div>
    <div className="capture-thumbnails">{items.map((item,i)=><div key={item.id}>{item.preview?<img src={item.preview} alt={'第 '+(i+1)+' 張'} onError={e=>{e.currentTarget.style.display='none';}}/>:<span>{item.file.name}</span>}{series?<button type="button" className="photo-role" aria-pressed={near===item.id} aria-label={'將第 '+(i+1)+' 張設為近照'} disabled={busy} onClick={()=>setNearId(item.id)}>{near===item.id?'✓ 近照':'遠照 · 改近照'}</button>:<small>{category} {i+1}</small>}<button className="icon-button" disabled={busy} onClick={()=>remove(item)} aria-label={'移除第 '+(i+1)+' 張'}><Trash2 size={16}/></button></div>)}</div>
    {error&&<p className="error-text" role="alert">{error}</p>}<footer className="capture-footer"><button className="primary full" onClick={save} disabled={!complete||busy||cameraBusy}><Upload size={18}/>{busy?'正在保存至裝置…':(staging?'確認加入':online?'確認上傳':'確認暫存')+' '+category+'（'+items.length+' 張）'}</button><p className="muted">{staging?'照片先加入表單，保存點位時再送出。':'先保存至手機待傳區，再背景上傳。請保持網站開啟，可繼續找下一點。'}</p></footer></>}
  </dialog>,document.body);
}
