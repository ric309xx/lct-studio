import {Cartesian3, Cartographic, Math as CesiumMath, type Viewer} from 'cesium';
import data from './taoyuan17Ground.json';

export const taoyuan17Ground=data;
export function taoyuan17ProfileHeight(latitudeDegrees:number):number {
  const profile=data.profile;
  if(latitudeDegrees<=profile[0][0])return profile[0][1];
  for(let i=1;i<profile.length;i++){
    const a=profile[i-1],b=profile[i];
    if(latitudeDegrees<=b[0])return a[1]+(b[1]-a[1])*(latitudeDegrees-a[0])/(b[0]-a[0]);
  }
  return profile.at(-1)![1];
}
/** Reconcile source orthometric road returns with this mesh's height datum. */
export async function sampleTaoyuan17Offset(viewer:Viewer):Promise<number>{
  const sampled=await viewer.scene.sampleHeightMostDetailed(data.probes.map(p=>Cartographic.fromDegrees(p[0],p[1])));
  const offsets=sampled.flatMap((p,i)=>p&&Number.isFinite(p.height)?[p.height-data.probes[i][2]]:[]).sort((a,b)=>a-b);
  const consensus=offsets.map(start=>offsets.filter(v=>v>=start&&v<=start+.8)).sort((a,b)=>b.length-a.length)[0]??[];
  if(consensus.length<Math.max(10,Math.ceil(data.probes.length*.6)))throw Error('17-1道路模型高程採樣不足，請稍後重新載入');
  return consensus[Math.floor(consensus.length/2)];
}
export const taoyuan17Position=(p:number[],offset:number)=>Cartesian3.fromDegrees(p[0],p[1],p[2]+offset+data.displayLiftM);
export const taoyuan17HeightAt=(latitudeRadians:number,offset:number)=>taoyuan17ProfileHeight(CesiumMath.toDegrees(latitudeRadians))+offset+data.displayLiftM;
