import {useEffect,useMemo,useRef,useState} from 'react';
import {X,LocateFixed,MapPin,Camera,Plus} from 'lucide-react';
import {datasetLabel,datasetMetadata} from '../shared/datasets.mjs';
import {api,jsonRequest,makeThumbnail} from './api';
import {queuePutMany,storeValue} from './storage';
import {preparePhotoBatch} from '../shared/fieldWorkflow.mjs';
import PhotoCaptureDialog,{type StagedPhoto} from './PhotoCaptureDialog';
import type {Dataset,Point,Position,QueueItem} from './types';
import FieldLayerEditor from './FieldLayerEditor';
import {manualCoordinates} from '../shared/manualCoordinates.mjs';
export type PickedPosition={lon:number;lat:number};
import {fieldNumbers} from '../shared/fieldNumbering.mjs';
type Props={points:Point[];datasets:Dataset[];initialDataset:string;position:Position|null;picked:PickedPosition|null;picking:boolean;online:boolean;onPick:()=>void;onLocate:()=>void;onClose:()=>void;onDatasetCreated:(id:string)=>Promise<void>;onSaved:(point:Point,photos:number)=>Promise<void>};
export default function FieldPointDialog({points,datasets,initialDataset,position,picked,picking,online,onPick,onLocate,onClose,onDatasetCreated,onSaved}:Props){
  const [datasetId,setDatasetId]=useState(initialDataset),[code,setCode]=useState(''),[name,setName]=useState(''),[description,setDescription]=useState(''),[notes,setNotes]=useState(''),[method,setMethod]=useState<'gps'|'map'|'manual'>('gps'),[photos,setPhotos]=useState<(StagedPhoto&{category:string})[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[newLayer,setNewLayer]=useState(false),[layerName,setLayerName]=useState('現場新增點位'),[year,setYear]=useState(115),[color,setColor]=useState('#c77d32');
  const saved=useRef<Point|null>(null),queued=useRef(new Set<string>());
  const [captureOpen,setCaptureOpen]=useState(false),[editingLayer,setEditingLayer]=useState<Dataset|null>(null);
  const selectedLayer=datasets.find(d=>d.id===datasetId);
  const [manual,setManual]=useState({epsg:'3826',north:'',east:'',coordinates:'',height:'',height_type:'未註明',height_datum:''});
  const manualData={...manual,coordinateSystem:manual.epsg==='4326'?'WGS84':'TWD97'};
  let manualLocation:ReturnType<typeof manualCoordinates>|null=null,manualError='';
  if(method==='manual'&&(manual.north||manual.east||manual.coordinates))try{manualLocation=manualCoordinates(manualData);}catch(e){manualError=(e as Error).message;}
  const changeManual=(key:string,value:string)=>setManual(p=>({...p,[key]:value}));
  useEffect(()=>{if(picked)setMethod('map');},[picked]);
  const hint=useMemo(()=>fieldNumbers(points,datasetId,name||code),[points,datasetId,name,code]);
  const effectiveCode=code.trim()||name.trim();
  const location=method==='manual'?manualLocation:method==='gps'?position:picked;
  async function createLayer(){setBusy(true);setError('');try{const result=await api<{id:string}>('/api/field-datasets',jsonRequest('POST',{name:layerName,resultYear:year,color}));await onDatasetCreated(result.id);setDatasetId(result.id);setNewLayer(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function save(e:React.FormEvent){e.preventDefault();if(!location)return;setBusy(true);setError('');try{
    if(!saved.current)saved.current=await api<Point>('/api/points',jsonRequest('POST',{dataset_id:datasetId,code:effectiveCode,original_code:effectiveCode,name,description,notes,...(method==='manual'?{...manualData,coordinateQuality:'manual'}:{coordinateQuality:'approximate',positionMethod:method,lon:location.lon,lat:location.lat,accuracy:method==='gps'?position?.accuracy:null,positionTimestamp:method==='gps'?position?.timestamp:null}),category:'現場新增點'}));
    const point=saved.current;
    const pending=photos.filter(item=>!queued.current.has(item.id));
    const batch=[];
    for(const category of new Set(pending.map(item=>item.category)))batch.push(...await preparePhotoBatch(pending.filter(item=>item.category===category),point,{category}));
    if(batch.length){await queuePutMany(batch as QueueItem[]);pending.forEach(item=>queued.current.add(item.id));}
    await onSaved(point,photos.length);
  }catch(e){setError((saved.current?'點位已保存；照片或更新尚未完成，可重試：':'')+(e as Error).message);}finally{setBusy(false);}}
  if(picking)return null;
  return <div className="modal-backdrop"><form className="modal field-point-dialog" onSubmit={save} aria-label="新增現場點位"><div className="modal-heading"><h2>新增現場點位</h2><button type="button" className="icon-button" onClick={onClose} aria-label="關閉新增現場點位"><X size={20}/></button></div><p className="muted">選擇 GPS、地圖選點或輸入座標；照片保存於同一點位，之後可繼續更新。</p>
    <fieldset disabled={busy||!!saved.current}><label>圖層<select value={datasetId} onChange={e=>setDatasetId(e.target.value)} required>{datasets.filter(d=>!datasetMetadata(d).archiveOnly).map(d=><option key={d.id} value={d.id}>{datasetLabel(d)}</option>)}</select></label><button type="button" className="secondary full" onClick={()=>setNewLayer(!newLayer)}><Plus size={16}/>新增圖層</button>{selectedLayer&&datasetMetadata(selectedLayer).fieldLayer&&<button type="button" className="secondary full" disabled={!online} onClick={()=>setEditingLayer(selectedLayer)}>修改圖層</button>}
    {newLayer&&<div className="field-new-layer"><label>新圖層名稱<input value={layerName} maxLength={100} onChange={e=>setLayerName(e.target.value)}/></label><div className="form-grid"><label>成果年（民國）<input type="number" min="1" max="300" value={year} onChange={e=>setYear(Number(e.target.value))}/></label><label>圖層顏色<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label></div><button type="button" className="primary full" onClick={createLayer} disabled={!online||!layerName.trim()}>建立圖層</button></div>}
    <div className="form-grid"><label>點號<input required={!name.trim()} placeholder={name.trim()||"例如 CL28"} maxLength={100} value={code} onChange={e=>setCode(e.target.value)}/></label><label>點名<input placeholder="例如 CL，可查看現有編號" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label></div>
    {hint.next&&<div className="number-hint"><small>本圖層已有：{hint.existing.join('、')||'尚無相同字首'}</small><button className="secondary" type="button" onClick={()=>{setCode(hint.next);setName(hint.next);}}>使用下一號 {hint.next}</button></div>}<small className="muted">點號留白時沿用點名。</small>
    <div className="field-position-buttons"><button type="button" className={'secondary '+(method==='gps'?'active':'')} onClick={()=>{setMethod('gps');onLocate();}}><LocateFixed size={16}/>使用目前 GPS</button><button type="button" className={'secondary '+(method==='map'?'active':'')} onClick={onPick}><MapPin size={16}/>在地圖上選位置</button><button type="button" className={'secondary '+(method==='manual'?'active':'')} onClick={()=>setMethod('manual')}><MapPin size={16}/>輸入座標</button></div>
    {method==='manual'&&<section className="manual-coordinate-entry" aria-label="輸入座標"><label>坐標系統<select value={manual.epsg} onChange={e=>changeManual('epsg',e.target.value)}><option value="3826">TWD97／TM2 121 分帶</option><option value="3825">TWD97／TM2 119 分帶</option><option value="4326">WGS84 經緯度</option></select></label>{manual.epsg==='4326'?<label>經緯度（緯度, 經度）<input required maxLength={120} value={manual.coordinates} onChange={e=>changeManual('coordinates',e.target.value)} placeholder="23.575861, 120.707583"/><small>緯度在前，經度在後，也可貼上度分秒格式。</small></label>:<div className="form-grid"><label>N 縱坐標（m）<input required inputMode="decimal" value={manual.north} onChange={e=>changeManual('north',e.target.value)}/></label><label>E 橫坐標（m）<input required inputMode="decimal" value={manual.east} onChange={e=>changeManual('east',e.target.value)}/></label></div>}<div className="form-grid"><label>高度（m，選填）<input inputMode="decimal" value={manual.height} onChange={e=>changeManual('height',e.target.value)}/></label><label>高程類型<select value={manual.height_type} onChange={e=>changeManual('height_type',e.target.value)}><option>未註明</option><option>正高</option><option>橢球高</option></select></label></div><label>高程基準（選填）<input maxLength={100} value={manual.height_datum} onChange={e=>changeManual('height_datum',e.target.value)} placeholder="例如 TWVD2001；未確認可留白"/></label>{manualError&&<p className="error-text" role="alert">{manualError}</p>}</section>}
    <div className="field-location"><strong>{method==='manual'?'輸入位置':'概略位置 · '+(method==='gps'?'手機 GPS':'地圖點選')}</strong>{location?<><code>{location.lat.toFixed(7)}, {location.lon.toFixed(7)}</code><small>{method==='gps'?`精度 ±${Math.round(position?.accuracy??0)} m；非測量坐標`:method==='manual'?'依輸入座標換算；非手機 GPS':'地圖手動指定；非測量坐標'}</small></>:<p>{method==='manual'?'請輸入完整座標以預覽位置。':'尚未取得位置，請按 GPS 或地圖選點。'}</p>}</div>
    <label>現場說明<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={8000} placeholder="例如：電桿旁、圍牆轉角或進入方式"/></label><label>備註<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={8000}/></label></fieldset>
    <button type="button" className="secondary full" disabled={busy} onClick={()=>setCaptureOpen(true)}><Camera size={17}/>分類連拍／選擇照片</button>
    {photos.length>0&&<ul className="field-photo-list">{photos.map((item,i)=><li key={item.id}><span>{item.category} · {item.file.name}{queued.current.has(item.id)?'（已保存）':''}</span><button type="button" disabled={busy||queued.current.has(item.id)} onClick={()=>setPhotos(p=>p.filter(v=>v.id!==item.id))} aria-label={`移除照片 ${i+1}`}>移除</button></li>)}</ul>}
    {error&&<p className="error-text" role="alert">{error}</p>}<button className="primary full" disabled={busy||!location||!online||!datasetId}>{busy?'保存中…':saved.current?'重試保存照片':method==='manual'?'保存座標點位與照片':'保存概略點位與照片'}</button><p className="muted">新增圖層／點位需要連線；照片先保存至本機待傳，再上傳至本站。</p>
  </form>{editingLayer&&<FieldLayerEditor key={editingLayer.id} dataset={editingLayer} online={online} onSaved={()=>onDatasetCreated(editingLayer.id)} onClose={()=>setEditingLayer(null)}/>} {captureOpen&&<PhotoCaptureDialog point={{code:effectiveCode||"新點位",name} as Point} position={method==='gps'?position:null} online={online} staging onSave={async(items,category)=>{setPhotos(p=>[...p,...items.map(item=>({...item,category:item.category||category}))]);setCaptureOpen(false);}} onClose={()=>setCaptureOpen(false)}/>}</div>;
}
