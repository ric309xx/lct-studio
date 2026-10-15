import {useEffect,useState} from 'react';
import {X,LocateFixed,MapPin,FileText,Navigation,Compass,Plus} from 'lucide-react';
import {nearbyPoints,targetDirection,distanceLabel} from '../shared/pointFinder.mjs';
import type {Point,Dataset,Position} from './types';
import PointCoordinates from './PointCoordinates';

type Props={points:Point[];datasets:Dataset[];position:Position|null;target:Point|null;locating:boolean;error:string;online:boolean;onTarget:(id:string)=>void;onLocate:()=>void;onFit:()=>void;onDetails:()=>void;onClose:()=>void;onCreate:()=>void};
export default function PointFinder({points,datasets,position,target,locating,error,online,onTarget,onLocate,onFit,onDetails,onClose,onCreate}:Props){
  const [heading,setHeading]=useState<number|null>(null),[compassError,setCompassError]=useState('');
  useEffect(()=>{
    const listener=(e:DeviceOrientationEvent)=>{const h=(e as DeviceOrientationEvent&{webkitCompassHeading?:number}).webkitCompassHeading;if(Number.isFinite(h)&&h!>=0)setHeading(h!);else if(e.absolute&&e.alpha!=null)setHeading((360-e.alpha)%360);};
    window.addEventListener('deviceorientation',listener);window.addEventListener('deviceorientationabsolute',listener as EventListener);
    return()=>{window.removeEventListener('deviceorientation',listener);window.removeEventListener('deviceorientationabsolute',listener as EventListener);};
  },[]);
  async function compass(){try{setCompassError('');if(typeof DeviceOrientationEvent==='undefined')throw new Error('此裝置未提供羅盤，箭頭維持正北基準。');const event=DeviceOrientationEvent as typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>};if(event.requestPermission&&await event.requestPermission()!=='granted')throw new Error('未取得羅盤權限，箭頭維持正北基準。');setCompassError('請平放手機並遠離磁性物品；取得羅盤資料後會切換為手機朝向。');}catch(e){setCompassError((e as Error).message);}}
  const nearest:{point:Point;meters:number}[]=nearbyPoints(points,position),direction=targetDirection(position,target),dataset=datasets.find(d=>d.id===target?.dataset_id);
  return <section className="point-finder" role="region" aria-label="找點模式">
    <div className="finder-heading"><div><p>找點模式{dataset?` · ${dataset.name}`:''}</p><h2>{target?.code||'尋找最近控制點'}</h2>{target&&<span>{target.name||target.description||target.category}</span>}</div><button className="icon-button" aria-label="關閉找點模式" onClick={onClose}><X size={22}/></button></div>
    {direction&&position?<div className="finder-direction"><div className="finder-arrow"><span>{heading==null?'北 ↑':'手機朝向'}</span><Navigation size={52} style={{transform:`rotate(${direction.degrees-(heading??0)-45}deg)`}}/></div><div><strong>{distanceLabel(direction.meters)}</strong><p>直線距離 · 目標在{direction.cardinal}方 {Math.round(direction.degrees)}°</p><small>GPS 精度 ±{Math.round(position.accuracy)} m · {new Date(position.timestamp).toLocaleTimeString('zh-TW',{hour12:false})}</small></div></div>:<div className="finder-empty"><LocateFixed size={28}/><p>{locating?'正在取得目前位置…':position?'目前篩選範圍沒有控制點，請調整資料集或搜尋條件。':'取得目前位置後，會依距離列出最近的控制點。'}</p></div>}
    {target&&<PointCoordinates point={target}/>}
    {error&&<p className="error-text" role="alert">{error}</p>}
    <div className="finder-actions"><button className="secondary" onClick={onLocate} disabled={locating}><LocateFixed size={16}/>{locating?'定位中…':'更新定位'}</button><button className="secondary" onClick={onFit} disabled={!position||!target}><MapPin size={16}/>查看兩端</button><button className="secondary" onClick={onDetails} disabled={!target}><FileText size={16}/>資料／照片</button></div>
    <details className="finder-nearby" open={!target}><summary>最近控制點{nearest.length?`（${nearest.length}）`:''}</summary>{nearest.map(({point,meters})=><button key={point.id} className={point.id===target?.id?'active':''} aria-pressed={point.id===target?.id} onClick={()=>onTarget(point.id)}><span><strong>{point.code}</strong><small>{datasets.find(d=>d.id===point.dataset_id)?.name} · {point.name||point.category}</small></span><b>{distanceLabel(meters)}</b></button>)}</details>
    <div className="finder-footer"><button className="text-button" onClick={compass}><Compass size={14}/>手機羅盤</button><button className="text-button" onClick={onCreate} disabled={!online}><Plus size={14}/>新增點位</button></div>
    {compassError&&<p className="muted">{compassError}</p>}<p className="finder-note">依目前篩選搜尋 · 直線方向僅供找點參考</p>
  </section>;
}
