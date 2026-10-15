import {isApproximate} from '../shared/fieldPoints.mjs';
import type {Point} from './types';

export default function PointCoordinates({point}:{point:Point}){
  const geographic=point.epsg===4326;
  const number=(value:number,digits=3)=>value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  return <section className="find-coordinates" aria-label="目標點位座標">
    <div><strong>目標點位座標</strong><small>{point.crs} · EPSG:{point.epsg}</small></div>
    <dl><dt>{geographic?'緯度':'N（m）'}</dt><dd>{number(point.north,geographic?7:3)}</dd><dt>{geographic?'經度':'E（m）'}</dt><dd>{number(point.east,geographic?7:3)}</dd>{point.height!=null&&<><dt>{point.height_type||'高度'}（m）</dt><dd>{number(point.height)}</dd></>}</dl>
    {isApproximate(point)&&<small className="approximate-coordinate-note">概略位置（待測量）</small>}
  </section>;
}
