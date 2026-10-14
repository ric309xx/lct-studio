import {distance} from './coordinates.mjs';
import {nearbyPoints} from './pointFinder.mjs';
export const formatDistance=meters=>meters>=1000?`${(meters/1000).toFixed(2)} km`:`${Math.round(meters)} m`;
export const cardinal=bearing=>['北','東北','東','東南','南','西南','西','西北'][Math.round(bearing/45)%8];
export function nearestVisiblePoints(points,visibleIds,position,limit=8){
  const ids=new Set(visibleIds);
  return nearbyPoints(points.filter(p=>ids.has(p.dataset_id)),position,limit);
}
export function stepInstruction(step) {
  const m=step.maneuver||{},road=String(step.name||'').slice(0,150);
  if(m.type==='arrive')return '到達路線終點，依直線方向與現場照片尋找標石';
  if(m.type==='depart')return `出發${road?`，沿${road}前進`:''}`;
  if(m.type==='roundabout'||m.type==='rotary')return `進入圓環${m.exit?`，由第 ${m.exit} 個出口離開`:''}${road?`，往${road}`:''}`;
  const turns={'left':'左轉','right':'右轉','slight left':'靠左前進','slight right':'靠右前進','sharp left':'向左急轉','sharp right':'向右急轉','uturn':'迴轉','straight':'直行'};
  return `${turns[m.modifier]||'繼續前進'}${road?`，往${road}`:''}`;
}

/** 就近投影至路線，回傳偏離距離與估計剩餘路程；不代表已到達標石。 */
export function routeProgress(coordinates,position) {
  if(!position||coordinates.length<2)return null;
  const p=[position.lon,position.lat],scale=Math.cos(p[1]*Math.PI/180),meters=111195;
  let best=Infinity,index=0,fraction=0;
  for(let i=0;i<coordinates.length-1;i++){
    const a=coordinates[i],b=coordinates[i+1],ax=(a[0]-p[0])*scale*meters,ay=(a[1]-p[1])*meters,bx=(b[0]-p[0])*scale*meters,by=(b[1]-p[1])*meters,dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,(-ax*dx-ay*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(ax+t*dx,ay+t*dy);
    // 同距離交叉路口優先較前段，避免誤認整段已走完。
    if(d<best-.01){best=d;index=i;fraction=t;}
  }
  let remaining=(1-fraction)*distance(coordinates[index],coordinates[index+1]);
  for(let i=index+1;i<coordinates.length-1;i++)remaining+=distance(coordinates[i],coordinates[i+1]);
  return {offRoute:best,remaining};
}
