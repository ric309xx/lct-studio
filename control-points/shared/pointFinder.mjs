import {distance,bearing} from './coordinates.mjs';

export function nearbyPoints(points,position,limit=8){
  if(!position||!Number.isFinite(position.lon)||!Number.isFinite(position.lat))return [];
  return points.filter(p=>!p.deleted_at&&Number.isFinite(p.lon)&&Number.isFinite(p.lat))
    .map(point=>({point,meters:distance([position.lon,position.lat],[point.lon,point.lat])}))
    .sort((a,b)=>a.meters-b.meters||a.point.id.localeCompare(b.point.id)).slice(0,limit);
}
export function targetDirection(position,point){
  if(!position||!point)return null;
  const degrees=bearing([position.lon,position.lat],[point.lon,point.lat]);
  return {meters:distance([position.lon,position.lat],[point.lon,point.lat]),degrees,cardinal:['北','東北','東','東南','南','西南','西','西北'][Math.round(degrees/45)%8]};
}
export function distanceLabel(meters){return meters>=1000?`${(meters/1000).toFixed(2)} km`:`${Math.round(meters)} m`;}
