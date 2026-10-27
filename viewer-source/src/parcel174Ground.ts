import {type Cartographic} from 'cesium';

type Point={x:number;y:number;z:number};
type Plane={a:number;b:number;c:number};
const metresPerRadian=6378137;
const value=(p:Plane,q:Point)=>p.a*q.x+p.b*q.y+p.c;
function solve(points:Point[]):Plane|null{
  // Centered normal equations for z = a*x + b*y + c.
  const n=points.length;
  const mean=points.reduce((p,q)=>({x:p.x+q.x/n,y:p.y+q.y/n,z:p.z+q.z/n}),{x:0,y:0,z:0});
  let xx=0,xy=0,yy=0,xz=0,yz=0;
  for(const p of points){const x=p.x-mean.x,y=p.y-mean.y,z=p.z-mean.z;xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*z;yz+=y*z;}
  const det=xx*yy-xy*xy;
  if(det<1e-6)return null;
  const a=(xz*yy-yz*xy)/det,b=(yz*xx-xz*xy)/det;
  if(Math.hypot(a,b)>.35)return null; // Reject walls, pole shafts and unstable fits.
  return {a,b,c:mean.z-a*mean.x-b*mean.y};
}

/** Display-only road plane for the small sloping parcel 174. All heights come
 * from the current model in Cesium's frame; no TWVD2001 height is substituted.
 * Robust consensus excludes poles/wires/roofs rather than lifting the cadastral
 * polygon to those objects. Original XY and occupancy calculations are untouched.
 */
export function fitParcel174Ground(samples:(Cartographic|undefined)[]):((latitude:number,longitude:number)=>number)|null{
  const valid=samples.filter((p):p is Cartographic=>!!p&&Number.isFinite(p.height)&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
  if(valid.length<6)return null;
  const origin=valid[0],east=metresPerRadian*Math.cos(origin.latitude);
  const points=valid.map(p=>({x:(p.longitude-origin.longitude)*east,y:(p.latitude-origin.latitude)*metresPerRadian,z:p.height}));
  let best:Point[]=[],error=Infinity;
  for(let i=0;i<points.length-2;i++)for(let j=i+1;j<points.length-1;j++)for(let k=j+1;k<points.length;k++){
    const plane=solve([points[i],points[j],points[k]]);if(!plane)continue;
    const inside=points.filter(p=>Math.abs(p.z-value(plane,p))<=.22);
    const residual=inside.reduce((s,p)=>s+Math.abs(p.z-value(plane,p)),0);
    if(inside.length>best.length||(inside.length===best.length&&residual<error)){best=inside;error=residual;}
  }
  if(best.length<Math.max(6,Math.ceil(points.length*.6)))return null;
  const plane=solve(best);if(!plane)return null;
  // Clear the upper envelope of accepted road samples, not tall outliers.
  const lift=Math.max(.18,...best.map(p=>p.z-value(plane,p)+.08));
  return (latitude,longitude)=>plane.a*(longitude-origin.longitude)*east+plane.b*(latitude-origin.latitude)*metresPerRadian+plane.c+lift;
}
