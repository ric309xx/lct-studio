import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BoundingSphere,Cartesian3,HeadingPitchRange,Rectangle,SceneTransforms,type Viewer} from 'cesium';
import {Crosshair,X} from 'lucide-react';
import {loadControlCatalog,loadControlPhoto,controlPointPosition,type ControlCatalog,type ControlPhoto} from './controlPoints';
import {fromTwd97} from './surveyMeasurement';
import type {HeightResolution} from './heightReference';
import {HelpHint} from './HelpHint';
import './controlPoints.css';

type Props={viewer:Viewer|null;mode:'map'|'model';profileId?:string|null;resolution?:HeightResolution|null;disabled?:boolean};
type PhotoView={photo:ControlPhoto;url?:string;error?:string};
export function ControlPointsLayer({viewer,mode,profileId,resolution=null,disabled=false}:Props){
  const [enabled,setEnabled]=useState(false),[catalog,setCatalog]=useState<ControlCatalog|null>(null),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState(''),[photos,setPhotos]=useState<PhotoView[]>([]),[expanded,setExpanded]=useState<number|null>(null);
  const [markers,setMarkers]=useState<Array<{id:string;code:string;x:number;y:number;profileId:string}>>([]);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if(!enabled||catalog)return;
    let cancelled=false;setNotice('正在讀取控制點…');
    loadControlCatalog().then(value=>{if(!cancelled){setCatalog(value);setNotice('');}})
      .catch(error=>{if(!cancelled)setNotice(error instanceof Error?error.message:'控制點無法載入');});
    return ()=>{cancelled=true;};
  },[enabled,catalog]);
  const points=useMemo(()=>catalog?.points.filter(p=>!profileId||p.profileId===profileId)??[],[catalog,profileId]);
  const point=enabled?points.find(p=>p.id===selected):undefined;
  useEffect(()=>{setSelected('');setExpanded(null);},[profileId,enabled]);
  useEffect(()=>{
    let cancelled=false;const urls:string[]=[];setPhotos([]);setExpanded(null);
    if(!point)return;
    setPhotos(point.photos.map(photo=>({photo})));
    point.photos.forEach((photo,index)=>{void loadControlPhoto(photo).then(blob=>{
      if(cancelled)return;const url=URL.createObjectURL(blob);urls.push(url);
      setPhotos(current=>current.map((value,i)=>i===index?{photo,url}:value));
    }).catch(error=>{if(!cancelled)setPhotos(current=>current.map((value,i)=>i===index?{photo,error:error instanceof Error?error.message:'照片無法載入'}:value));});});
    return ()=>{cancelled=true;urls.forEach(url=>URL.revokeObjectURL(url));};
  },[point]);
  useEffect(()=>{
    if(expanded===null)return;
    const element=dialog.current;if(element&&!element.open)element.showModal();
  },[expanded]);
  useEffect(()=>{
    if(!enabled||!viewer||viewer.isDestroyed()){setMarkers([]);return;}
    let frame=0,signature='';
    const update=()=>{
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;if(viewer.isDestroyed())return;
        const canvas=viewer.canvas.getBoundingClientRect(),host=viewer.container.getBoundingClientRect();
        const values=points.flatMap(p=>{
          const position=controlPointPosition(p,mode,resolution);if(!position)return [];
          if(mode==='model'&&Cartesian3.dot(Cartesian3.subtract(position,viewer.camera.positionWC,new Cartesian3()),viewer.camera.directionWC)<=0)return [];
          const projected=SceneTransforms.worldToWindowCoordinates(viewer.scene,position);
          if(!projected||projected.x<0||projected.y<0||projected.x>canvas.width||projected.y>canvas.height)return [];
          return [{id:p.id,code:p.code,profileId:p.profileId,x:Math.round(projected.x+canvas.left-host.left),y:Math.round(projected.y+canvas.top-host.top)}];
        });
        const next=JSON.stringify(values);if(next!==signature){signature=next;setMarkers(values);}
      });
    };
    const remove=viewer.scene.postRender.addEventListener(update);update();viewer.scene.requestRender();
    return ()=>{remove();cancelAnimationFrame(frame);};
  },[enabled,viewer,points,mode,resolution]);
  const fit=()=>{
    if(!viewer||viewer.isDestroyed())return;
    const positions=points.flatMap(p=>{const position=controlPointPosition(p,mode,resolution);return position?[position]:[];});
    if(!positions.length)return;
    if(mode==='map'){
      const locations=points.map(p=>fromTwd97(p.east,p.north)!).filter(Boolean);
      const xs=locations.map(p=>p.longitude),ys=locations.map(p=>p.latitude);
      viewer.camera.flyTo({destination:Rectangle.fromDegrees(Math.min(...xs)-.0005,Math.min(...ys)-.0005,Math.max(...xs)+.0005,Math.max(...ys)+.0005),duration:.7});
    }else{
      const sphere=BoundingSphere.fromPoints(positions);
      viewer.camera.flyToBoundingSphere(sphere,{duration:.7,offset:new HeadingPitchRange(viewer.camera.heading,-Math.PI/3,Math.max(80,sphere.radius*2.8))});
    }
  };
  const location=point?fromTwd97(point.east,point.north):null;
  return <section className="control-points-group" aria-label="控制點圖層">
    <div className="control-points-heading"><label><input type="checkbox" checked={enabled} disabled={disabled} onChange={event=>setEnabled(event.target.checked)}/><Crosshair size={15} aria-hidden="true"/>顯示控制點</label>
      <HelpHint label="控制點圖層說明">依案件所在模型批次顯示建模控制點及檢核點，不以附近地號猜測隸屬。點位座標是來源 TWD97 成果與 TWVD2001 正高，並非滑鼠取點。照片僅採已有明確點號的分類，未知拍攝日期不以檔案時間代替。</HelpHint></div>
    {enabled&&<>
      {notice&&<p role="status">{notice}</p>}
      {catalog&&<>
        <p className="control-points-caption">{profileId?`本案模型批次 ${profileId}`:'全部模型批次'} · {points.length} 點</p>
        {mode==='model'&&resolution?.status==='pending'&&<p role="status">模型高程尚未確認，只提供來源座標，暫不猜測圖上位置。</p>}
        <div className="control-points-actions"><select aria-label="選擇控制點" value={point?.id??''} onChange={event=>setSelected(event.target.value)}><option value="">點選圖上點位或從此選擇</option>{points.map(p=><option key={p.id} value={p.id}>{p.code}{profileId?'':` · ${p.profileId}`}{p.kind==='check'?'（檢核點）':''}</option>)}</select><button type="button" onClick={fit} disabled={!viewer||disabled||(mode==='model'&&(!resolution||resolution.status==='pending'))}>查看點位範圍</button></div>
        {!points.length&&<p>此模型批次尚未有控制點資料。</p>}
      </>}
      {point&&<section className="control-point-detail" aria-label={`控制點 ${point.code} 資訊`}>
        <header><strong>{point.code} · {point.kind==='check'?'檢核點':'控制點'}</strong><button type="button" onClick={()=>setSelected('')} aria-label="關閉控制點資訊"><X size={15}/></button></header>
        <p>TWD97 / TM2 121 · EPSG:3826</p>
        <dl><div><dt>E 東座標</dt><dd>{point.east.toFixed(4)} m</dd></div><div><dt>N 北座標</dt><dd>{point.north.toFixed(4)} m</dd></div><div><dt>H 正高</dt><dd>{point.orthometric.toFixed(4)} m</dd></div></dl>
        <small>TWVD2001 · 來源控制點，非模型讀值</small>
        {location&&<small>緯度 {location.latitude.toFixed(8)}，經度 {location.longitude.toFixed(8)}</small>}
        {point.originalCode!==point.code&&<small>原始觀測點號：{point.originalCode}</small>}
        <details><summary>座標與照片來源</summary><small>{point.source}</small><small>{point.photoNote}</small></details>
        {point.photos.length?<div className="control-point-photos">{photos.map((value,index)=><div key={value.photo.sha256}>{value.url?<button type="button" aria-label={`放大 ${point.code} ${value.photo.category} ${index+1}`} onClick={()=>setExpanded(index)}><img src={value.url} alt={`${point.code} ${value.photo.category}`} loading="lazy"/><span>{value.photo.category}</span></button>:<p>{value.error??'照片載入中…'}</p>}</div>)}</div>:<p>照片待補：{point.photoNote}</p>}
      </section>}
    </>}
    {enabled&&viewer&&!viewer.isDestroyed()&&createPortal(<div className="control-point-markers" aria-label="圖上控制點">{markers.map(p=><button key={p.id} type="button" disabled={disabled} className={point?.id===p.id?'selected':''} style={{left:p.x,top:p.y}} aria-label={`查詢控制點 ${p.code}（批次 ${p.profileId}）`} onClick={()=>setSelected(p.id)}><Crosshair size={18}/><span>{p.code}</span></button>)}</div>,viewer.container)}
    {expanded!==null&&photos[expanded]?.url&&createPortal(<dialog ref={dialog} className="control-point-photo-dialog" aria-label={`${point?.code} 點位照片`} onCancel={event=>{event.preventDefault();setExpanded(null);}} onClick={event=>{if(event.target===event.currentTarget)setExpanded(null);}}><header><strong>{point?.code} · {photos[expanded].photo.category}</strong><button type="button" autoFocus onClick={()=>setExpanded(null)} aria-label="關閉點位照片"><X size={20}/></button></header><img src={photos[expanded].url} alt={`${point?.code} ${photos[expanded].photo.category}`}/><small>{photos[expanded].photo.filename} · 原始拍攝時間未知</small></dialog>,document.body)}
  </section>;
}
