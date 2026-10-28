import {Cartesian3} from 'cesium';
import {HEIGHT_PROFILES,orthometricToRenderHeight,sha256ArrayBuffer,type HeightResolution} from './heightReference';
import {fromTwd97} from './surveyMeasurement';
import {ensureR2Access,privateR2Resource,PRIVATE_R2_ORIGIN,TAOYUAN_R2_PROJECT} from './r2Access';

export type ControlPhoto={path:string;sha256:string;category:string;filename:string;source:string;capturedAt:null};
export type ControlPoint={id:string;profileId:string;code:string;originalCode:string;kind:'control'|'check';east:number;north:number;
  orthometric:number;crs:'EPSG:3826';verticalDatum:'TWVD2001';source:string;sourceSha256:string;photoNote:string;photos:ControlPhoto[]};
export type ControlCatalog={schemaVersion:1;projectId:'taoyuan-building-overlay';revision:string;points:ControlPoint[]};
const hash=/^[a-f0-9]{64}$/;
export function parseControlCatalog(value:unknown):ControlCatalog{
  const c=value as ControlCatalog;
  if(!c||c.schemaVersion!==1||c.projectId!=='taoyuan-building-overlay'||typeof c.revision!=='string'||!Array.isArray(c.points)||c.points.length>1000)throw Error('控制點資料格式或專案不符');
  const ids=new Set<string>();
  for(const p of c.points){
    if(!p||typeof p.code!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(p.code)||!HEIGHT_PROFILES.some(profile=>profile.id===p.profileId)
      ||p.id!==`${p.profileId}:${p.code}`||ids.has(p.id)||!['control','check'].includes(p.kind)
      ||p.crs!=='EPSG:3826'||p.verticalDatum!=='TWVD2001'||!hash.test(p.sourceSha256)
      ||![p.east,p.north,p.orthometric].every(n=>typeof n==='number'&&Number.isFinite(n))
      ||p.orthometric< -100||p.orthometric>4000||!fromTwd97(p.east,p.north)
      ||!['source','photoNote','originalCode'].every(key=>typeof p[key as keyof ControlPoint]==='string')||!Array.isArray(p.photos)||p.photos.length>50)throw Error('控制點來源或座標未通過檢查');
    ids.add(p.id);
    for(const photo of p.photos)if(!photo||!hash.test(photo.sha256)||photo.path!==`photos/${photo.sha256}.jpg`
      ||!['category','filename','source'].every(key=>typeof photo[key as keyof ControlPhoto]==='string')||photo.capturedAt!==null)throw Error('控制點照片路徑或來源不符');
  }
  return c;
}
export function controlPointPosition(p:ControlPoint,mode:'map'|'model',resolution:HeightResolution|null):Cartesian3|null{
  const location=fromTwd97(p.east,p.north);if(!location)return null;
  const height=mode==='map'?0:resolution?.profileId===p.profileId?orthometricToRenderHeight(p.orthometric,resolution):null;
  return height===null?null:Cartesian3.fromDegrees(location.longitude,location.latitude,height);
}
const local=()=>['127.0.0.1','localhost'].includes(window.location.hostname);
const localBase='/.local/private-control-points/taoyuan-building-overlay/';
const remoteBase=`${PRIVATE_R2_ORIGIN}/projects/${TAOYUAN_R2_PROJECT}/tiles/controls/v1/`;
export async function loadControlCatalog():Promise<ControlCatalog>{
  await ensureR2Access();
  if(local()){
    const response=await fetch(localBase+'catalog.json',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('本機控制點資料尚未準備');return parseControlCatalog(await response.json());
  }
  const value=await privateR2Resource(remoteBase+'catalog.json',TAOYUAN_R2_PROJECT).fetchJson();
  if(!value)throw Error('私人控制點資料尚未發布');return parseControlCatalog(value);
}
export async function loadControlPhoto(photo:ControlPhoto):Promise<Blob>{
  if(!hash.test(photo.sha256)||photo.path!==`photos/${photo.sha256}.jpg`)throw Error('照片路徑不符');
  await ensureR2Access();
  let blob:Blob|undefined;
  if(local()){
    const response=await fetch(localBase+photo.path,{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('照片無法載入');blob=await response.blob();
  }else blob=await privateR2Resource(remoteBase+photo.path,TAOYUAN_R2_PROJECT).fetchBlob();
  if(!blob||!['image/jpeg','application/octet-stream'].includes(blob.type))throw Error('照片格式不符');
  if(await sha256ArrayBuffer(await blob.arrayBuffer())!==photo.sha256)throw Error('照片內容與來源校驗不符');
  return blob;
}
