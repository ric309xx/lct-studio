import {useEffect,useRef,useState} from 'react';
import {X,LocateFixed,MapPin,Camera,Plus} from 'lucide-react';
import {datasetLabel,datasetMetadata} from '../shared/datasets.mjs';
import {api,jsonRequest,makeThumbnail} from './api';
import {queuePutMany,storeValue} from './storage';
import {preparePhotoBatch} from '../shared/fieldWorkflow.mjs';
import PhotoCaptureDialog,{type StagedPhoto} from './PhotoCaptureDialog';
import type {Dataset,Point,Position,QueueItem} from './types';
export type PickedPosition={lon:number;lat:number};
type Props={datasets:Dataset[];initialDataset:string;position:Position|null;picked:PickedPosition|null;picking:boolean;online:boolean;onPick:()=>void;onLocate:()=>void;onClose:()=>void;onDatasetCreated:(id:string)=>Promise<void>;onSaved:(point:Point,photos:number)=>Promise<void>};
export default function FieldPointDialog({datasets,initialDataset,position,picked,picking,online,onPick,onLocate,onClose,onDatasetCreated,onSaved}:Props){
  const [datasetId,setDatasetId]=useState(initialDataset),[code,setCode]=useState(()=>`F-${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}).replaceAll('-','')}-${Date.now().toString(36).slice(-5).toUpperCase()}`),[name,setName]=useState(''),[description,setDescription]=useState(''),[notes,setNotes]=useState(''),[method,setMethod]=useState<'gps'|'map'>('gps'),[photos,setPhotos]=useState<(StagedPhoto&{category:string})[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[newLayer,setNewLayer]=useState(false),[layerName,setLayerName]=useState('現場新增點位'),[year,setYear]=useState(115),[color,setColor]=useState('#c77d32');
  const saved=useRef<Point|null>(null),queued=useRef(new Set<string>());
  const [captureOpen,setCaptureOpen]=useState(false);
  useEffect(()=>{if(picked)setMethod('map');},[picked]);
  const location=method==='gps'?position:picked;
  async function createLayer(){setBusy(true);setError('');try{const result=await api<{id:string}>('/api/field-datasets',jsonRequest('POST',{name:layerName,resultYear:year,color}));await onDatasetCreated(result.id);setDatasetId(result.id);setNewLayer(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function save(e:React.FormEvent){e.preventDefault();if(!location)return;setBusy(true);setError('');try{
    if(!saved.current)saved.current=await api<Point>('/api/points',jsonRequest('POST',{dataset_id:datasetId,code,original_code:code,name,description,notes,coordinateQuality:'approximate',positionMethod:method,lon:location.lon,lat:location.lat,accuracy:method==='gps'?position?.accuracy:null,positionTimestamp:method==='gps'?position?.timestamp:null,category:'現場新增點'}));
    const point=saved.current;
    const pending=photos.filter(item=>!queued.current.has(item.id));
    const batch=[];
    for(const category of new Set(pending.map(item=>item.category)))batch.push(...await preparePhotoBatch(pending.filter(item=>item.category===category),point,{category,thumbnail:makeThumbnail}));
    if(batch.length){await queuePutMany(batch as QueueItem[]);pending.forEach(item=>queued.current.add(item.id));await Promise.allSettled(batch.filter(item=>item.thumbnail).map(item=>storeValue(`photo:${item.id}:thumb`,item.thumbnail)));}
    await onSaved(point,photos.length);
  }catch(e){setError((saved.current?'點位已保存；照片或更新尚未完成，可重試：':'')+(e as Error).message);}finally{setBusy(false);}}
  if(picking)return null;
  return <div className="modal-backdrop"><form className="modal field-point-dialog" onSubmit={save} aria-label="新增現場點位"><div className="modal-heading"><h2>新增現場點位</h2><button type="button" className="icon-button" onClick={onClose} aria-label="關閉新增現場點位"><X size={20}/></button></div><p className="muted">先保存概略位置與照片；測量完成後可更新同一點位，不另建重複點。</p>
    <fieldset disabled={busy||!!saved.current}><label>圖層<select value={datasetId} onChange={e=>setDatasetId(e.target.value)} required>{datasets.filter(d=>!datasetMetadata(d).archiveOnly).map(d=><option key={d.id} value={d.id}>{datasetLabel(d)}</option>)}</select></label><button type="button" className="secondary full" onClick={()=>setNewLayer(!newLayer)}><Plus size={16}/>新增圖層</button>
    {newLayer&&<div className="field-new-layer"><label>新圖層名稱<input value={layerName} maxLength={100} onChange={e=>setLayerName(e.target.value)}/></label><div className="form-grid"><label>成果年（民國）<input type="number" min="1" max="300" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><label>圖層顏色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label></div><button type="button" className="primary full" onClick={createLayer} disabled={!online||!layerName.trim()}>建立圖層</button></div>}
    <div className="form-grid"><label>點號<input required maxLength={100} value={code} onChange={e=>setCode(e.target.value)}/></label><label>點名<input maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label></div>
    <div className="field-position-buttons"><button type="button" className={'secondary '+(method==='gps'?'active':'')} onClick={()=>{setMethod('gps');onLocate();}}><LocateFixed size={16}/>使用目前 GPS</button><button type="button" className={'secondary '+(method==='map'?'active':'')} onClick={onPick}><MapPin size={16}/>在地圖上選位置</button></div>
    <div className="field-location"><strong>概略位置 · {method==='gps'?'手機 GPS':'地圖點選'}</strong>{location?<><code>{location.lat.toFixed(7)}, {location.lon.toFixed(7)}</code><small>{method==='gps'?`精度 ±${Math.round(position?.accuracy??0)} m；非測量坐標`:'地圖手動指定；非測量坐標'}</small></>:<p>尚未取得位置，請按 GPS 或地圖選點。</p>}</div>
    <label>現場說明<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={8000} placeholder="例如：電桿旁、圍牆轉角或進入方式"/></label><label>備註<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={8000}/></label></fieldset>
    <button type="button" className="secondary full" disabled={busy} onClick={()=>setCaptureOpen(true)}><Camera size={17}/>分類連拍／選擇照片</button>
    {photos.length>0&&<ul className="field-photo-list">{photos.map((item,i)=><li key={item.id}><span>{item.category} · {item.file.name}{queued.current.has(item.id)?'（已保存）':''}</span><button type="button" disabled={busy||queued.current.has(item.id)} onClick={()=>setPhotos(p=>p.filter(v=>v.id!==item.id))} aria-label={`移除照片 ${i+1}`}>移除</button></li>)}</ul>}
    {error&&<p className="error-text" role="alert">{error}</p>}<button className="primary full" disabled={busy||!location||!online||!datasetId}>{busy?'保存中…':saved.current?'重試保存照片':'保存概略點位與照片'}</button><p className="muted">新增圖層／點位需要連線；照片先保存至本機待傳，再上傳至本站。</p>
  </form>{captureOpen&&<PhotoCaptureDialog point={{code,name} as Point} position={method==='gps'?position:null} online={online} staging onSave={async(items,category)=>{setPhotos(p=>[...p,...items.map(item=>({...item,category}))]);setCaptureOpen(false);}} onClose={()=>setCaptureOpen(false)}/>}</div>;
}
