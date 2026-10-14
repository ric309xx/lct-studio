import {useEffect,useRef,useState} from 'react';
import {Navigation,Compass,X,LocateFixed,Route,MapPin,FileText,CheckCircle2,Camera,ArrowRight} from 'lucide-react';
import {bearing,distance} from '../shared/coordinates.mjs';
import {createCompass} from '../shared/compass.mjs';
import {cardinal,formatDistance,routeProgress} from '../shared/finding.mjs';
import {datasetLabel} from '../shared/datasets.mjs';
import {api,jsonRequest} from './api';
import type {Point,Position,Dataset,WalkingRoute} from './types';

type Props={onChoose:()=>void;onCreate:()=>void;visitId:string|null;complete:boolean;photoCount:number;onFound:()=>Promise<string>;onCapture:()=>void;onSkip:()=>void;onNext:()=>void;point:Point;dataset:Dataset|undefined;position:Position|null;online:boolean;route:WalkingRoute|null;onRoute:(route:WalkingRoute|null)=>void;onLocate:()=>void;onFrame:()=>void;onDetails:()=>void;onClose:()=>void};
export default function FindPoint({onChoose,onCreate,visitId,complete,photoCount,onFound,onCapture,onSkip,onNext,point,dataset,position,online,route,onRoute,onLocate,onFrame,onDetails,onClose}:Props){
  const [foundBusy,setFoundBusy]=useState(false),[foundError,setFoundError]=useState('');
  async function found(){setFoundBusy(true);setFoundError('');try{await onFound();}catch(e){setFoundError((e as Error).message);}finally{setFoundBusy(false);}}
  const [heading,setHeading]=useState<number|null>(null),[compassState,setCompassState]=useState('idle'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now()),[expanded,setExpanded]=useState(false);
  const compass=useRef<ReturnType<typeof createCompass>|null>(null),request=useRef<AbortController|null>(null);
  if(!compass.current)compass.current=createCompass({scope:window,onHeading:setHeading,onState:setCompassState});
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{clearInterval(timer);compass.current?.stop();request.current?.abort();};},[]);
  const fresh=!!position&&clock-position.timestamp<=30000,meters=position?distance([position.lon,position.lat],[point.lon,point.lat]):null,direction=position?bearing([position.lon,position.lat],[point.lon,point.lat]):null,progress=route&&fresh?routeProgress(route.coordinates,position):null;
  const messages:Record<string,string>={idle:'羅盤尚未開啟；箭頭以正北為上方。',waiting:'正在等待羅盤讀值，請平放手機。',ready:'方向箭頭會隨手機轉向，請平放手機並遠離磁性物品。',denied:'羅盤先前被拒絕，已改用正北方位。iPhone：關閉本站分頁，完全關閉 Safari 後重新開啟本站，再按「開啟羅盤」並選「允許」。Android：於 Chrome 網站設定允許動作感測器。',unsupported:'此瀏覽器不支援羅盤，仍可依正北方位與地圖找點。',unavailable:'未收到有效北向讀值，已改用正北方位；請確認感測設定，或改用 Safari／Chrome。'};
  async function plan(){
    if(!position||!fresh||busy)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');onRoute(null);
    try{const result=await api<WalkingRoute>('/api/walking-route',{...jsonRequest('POST',{pointId:point.id,lon:position.lon,lat:position.lat}),signal:controller.signal});if(!controller.signal.aborted){onRoute(result);onFrame();}}
    catch(e){if(!controller.signal.aborted)setError((e as Error).message);}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className={'find-panel '+(expanded?'expanded':'')} aria-label="找點模式">
    <div className="find-heading"><div><small>找點模式 · {datasetLabel(dataset)}</small><h2>{point.code}<span>{point.name&&point.name!==point.code?point.name:''}</span></h2></div><button className="icon-button" onClick={onClose} aria-label="結束找點"><X size={21}/></button></div>
    <div className="find-distance"><div className="find-arrow" aria-label={heading==null?'以正北為上方的目標方向':'相對手機的目標方向'}><small>{heading==null?'北 ↑':'羅盤'}</small><Navigation size={38} style={{transform:`rotate(${(direction??0)-(heading??0)-45}deg)`,opacity:direction==null?.25:1}}/></div><div><strong>{meters==null?'等待定位':formatDistance(meters)}</strong><span>{direction==null?'取得位置後顯示距離與方位':`直線距離 · 目標在${cardinal(direction)}方 ${direction.toFixed(0)}°`}</span><small>{position?`GPS 精度 ±${Math.round(position.accuracy)} m · ${new Date(position.timestamp).toLocaleTimeString('zh-TW',{hour12:false})}${fresh?'':' · 定位已過期'}`:'請允許本站使用位置資訊'}</small></div></div>
    {!fresh&&<p className="find-notice">{position?'目前顯示上次定位，距離可能已改變。請重新定位。':'尚未取得 GPS 定位；可先查看目標位置或重試定位。'}</p>}
    {fresh&&meters!=null&&position&&meters<=Math.max(10,position.accuracy)&&<p className="find-notice">已接近目標／進入 GPS 誤差範圍，請對照標石與現場照片確認。</p>}
    <div className="found-workflow">{!visitId?<button className="primary full" onClick={found} disabled={foundBusy}><CheckCircle2 size={19}/>{foundBusy?'保存巡查中…':'點位存在／找到點了'}</button>:<><strong><CheckCircle2 size={18}/>已巡查 · 點位存在{point.pending_visit?'（待同步）':''}</strong>{!complete?<><p>要拍攝本次現場照片嗎？可先選近照、遠照，再各自連拍一批。</p><div className="button-row"><button className="primary" onClick={onCapture}><Camera size={17}/>拍攝現場照片</button><button className="secondary" onClick={onSkip}>略過</button></div></>:<><p>{photoCount?`本點已保存 ${photoCount} 張照片，可繼續拍其他類別。`:'本點巡查已完成，可之後再補照片。'}</p><div className="button-row"><button className="secondary" onClick={onCapture}><Camera size={16}/>繼續拍照</button><button className="primary" onClick={onNext}>下一點<ArrowRight size={17}/></button></div></>}</>}{foundError&&<p className="error-text" role="alert">{foundError}</p>}</div>
    <div className="find-actions"><button className="secondary" onClick={onLocate}><LocateFixed size={16}/>{fresh?'更新定位':'重試定位'}</button><button className="secondary" onClick={onFrame}><MapPin size={16}/>查看兩端</button><button className="secondary" onClick={onDetails}><FileText size={16}/>資料／照片</button></div>
    <div className="button-row"><button className="text-button" onClick={onChoose}>更換目標／附近點位</button><button className="text-button" onClick={onCreate} disabled={!online}>新增現場點位</button></div>
    <button className="secondary full" onClick={()=>compass.current?.enable()} disabled={compassState==='waiting'}><Compass size={16}/>{compassState==='ready'?'重新校準羅盤':'開啟羅盤（選用）'}</button><p className="find-sensor-note" role="status">{messages[compassState]}</p>
    <div className="find-route-summary">{route?<><strong>步行路線 {formatDistance(route.distance)} · 約 {Math.max(1,Math.round(route.duration/60))} 分鐘</strong>{progress&&<span>沿路線估計剩餘 {formatDistance(progress.remaining)}{progress.offRoute>Math.max(30,(position?.accuracy??0)*2)?' · 已偏離路線，建議重新規劃':''}</span>}<small>路線終點距標石約 {formatDistance(route.targetGap)}，最後一段請依虛線方向確認通行方式。</small></>:<small>虛線是直線方向，不代表可通行道路。</small>}</div>
    <button className="primary full" onClick={plan} disabled={!online||!fresh||busy}><Route size={17}/>{busy?'規劃中…':route?'重新規劃步行路線':'規劃步行路線'}</button>
    <p className="find-privacy">按下規劃會將目前位置與目標坐標送至 FOSSGIS 路線服務；本站不保存找點軌跡。{!online&&' 離線時仍可依 GPS 直線找點。'}</p>
    {error&&<p className="find-notice" role="alert">{error}</p>}
    {route&&<><button className="text-button" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>{expanded?'收起':'展開'}步行指示（{route.steps.length} 段）</button>{expanded&&<ol className="find-steps">{route.steps.map((step,i)=><li key={i}><span>{step.instruction}</span><small>{formatDistance(step.distance)}</small></li>)}</ol>}<p className="find-attribution">{route.attribution} · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">回報路網問題</a></p></>}
  </section>;
}
