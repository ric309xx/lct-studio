import {Cartesian3,Cartographic,Math as CesiumMath,type Viewer} from 'cesium';
import data from './taoyuan255Ground.json';
export const taoyuan255Ground=data;
export function taoyuan255SourceHeight(longitude:number,latitude:number):number{
  const nearest=data.nodes.map(p=>({p,d:Math.hypot((p[0]-longitude)*Math.cos(latitude*Math.PI/180),p[1]-latitude)*111319.49})).sort((a,b)=>a.d-b.d).slice(0,8);
  const weights=nearest.map(q=>1/Math.max(q.d,.7)**2);
  return nearest.reduce((sum,q,i)=>sum+q.p[2]*weights[i],0)/weights.reduce((a,b)=>a+b,0);
}
export async function sampleTaoyuan255Offset(viewer:Viewer):Promise<number>{
  const samples=await viewer.scene.sampleHeightMostDetailed(data.probes.map(p=>Cartographic.fromDegrees(p[0],p[1])));
  const offsets=samples.flatMap((p,i)=>p&&Number.isFinite(p.height)?[p.height-data.probes[i][2]]:[]).sort((a,b)=>a-b);
  const consensus=offsets.map(start=>offsets.filter(v=>v>=start&&v<=start+.8)).sort((a,b)=>b.length-a.length)[0]??[];
  if(consensus.length<Math.max(10,Math.ceil(data.probes.length*.6)))throw Error('255區道路模型高程採樣不足，請稍後重新載入');
  return consensus[Math.floor(consensus.length/2)];
}
export const taoyuan255Position=(p:number[],offset:number)=>Cartesian3.fromDegrees(p[0],p[1],p[2]+offset+data.displayLiftM);
export const taoyuan255HeightAt=(longitudeRadians:number,latitudeRadians:number,offset:number)=>taoyuan255SourceHeight(CesiumMath.toDegrees(longitudeRadians),CesiumMath.toDegrees(latitudeRadians))+offset+data.displayLiftM;
