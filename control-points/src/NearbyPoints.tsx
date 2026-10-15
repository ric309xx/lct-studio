import {pointColor,pointStatusStyle} from '../shared/pointStatus.mjs';
import {displayPointStatus} from '../shared/fieldWorkflow.mjs';
import {Navigation,X,LocateFixed} from 'lucide-react';
import {formatDistance,nearestVisiblePoints} from '../shared/finding.mjs';
import {datasetLabel,datasetColor} from '../shared/datasets.mjs';
import {isApproximate} from '../shared/fieldPoints.mjs';
import type {Point,Dataset,Position} from './types';
export default function NearbyPoints({excludedIds=[],points,visibleIds,datasets,position,onSelect,onLocate,onClose}:{excludedIds?:string[];points:Point[];visibleIds:string[];datasets:Dataset[];position:Position|null;onSelect:(point:Point)=>void;onLocate:()=>void;onClose:()=>void}){
  const nearby:{point:Point;meters:number}[]=nearestVisiblePoints(points.filter(p=>!excludedIds.includes(p.id)),visibleIds,position);
  return <section className="nearby-panel" aria-label="找點：選擇附近點位"><div className="find-heading"><div><small>找點模式</small><h2>選擇附近點位</h2></div><button className="icon-button" onClick={onClose} aria-label="關閉附近找點"><X size={21}/></button></div><p className="muted">{excludedIds.length>0?`本次已查 ${excludedIds.length} 點，選擇下一點。`:""}依目前勾選圖層及搜尋條件，列出最近 8 點。選取後立即顯示大字距離與方向。</p>{position?<p className="nearby-accuracy">GPS 精度 ±{Math.round(position.accuracy)} m{Date.now()-position.timestamp>30000?' · 上次定位已過期，請重新定位':''}</p>:<p className="find-notice">正在等待定位。請允許位置資訊；若未出現結果，按下方重試定位。</p>}
    <div className="nearby-list">{nearby.map(({point:p,meters})=><button key={p.id} className="nearby-point" onClick={()=>onSelect(p)}><i style={{backgroundColor:pointColor(p,datasets.find(d=>d.id===p.dataset_id))}}/><span><strong>{p.code} {isApproximate(p)&&<small className="approximate-tag">概略</small>}</strong><span>{p.name||p.category||'控制點'}</span><small>{datasetLabel(datasets.find(d=>d.id===p.dataset_id))}</small><small style={{color:pointStatusStyle(p.status)?.color}}>{displayPointStatus(p.status)}{p.pending_visit?'（待同步）':''}</small></span><b>{formatDistance(meters)}<Navigation size={16}/></b></button>)}</div>
    {position&&!nearby.length&&<p className="find-notice">目前篩選沒有其他可用點位，請調整圖層或搜尋條件；本輪已完成的點位會略過。</p>}<button className="secondary full" onClick={onLocate}><LocateFixed size={17}/>重新取得定位</button>
  </section>;
}
