import {Cartesian3,Ellipsoid,Matrix4,type Cesium3DTileset} from 'cesium';
import profiles from './taoyuanHeightProfiles.json';
import type {ModelSource} from './types/model';

export type HeightControl={id:string;longitude:number;latitude:number;orthometric:number;ellipsoidal:number};
export type HeightFrame='orthometric-as-ellipsoid'|'ellipsoidal'|'unverified';
export type HeightProfile={id:string;tilesetPath:string;sourceVerticalDatum:string;rootTilesetSha256:string;gcpSha256:string;
  offsetM:number|null;pairedControls:number;rangeM:number|null;renderFrame:HeightFrame;
  conversionMethod:string;conversionRevision:string;frameEvidence:string};
export type HeightResolution={profileId:string;revision:string;sourceDatum:'TWVD2001'|'unknown';
  status:'converted-local-controls'|'already-ellipsoidal'|'pending';undulationM:number|null;appliedOffsetM:number;reason:string};

// Runtime receives only the per-model conversion manifest, not raw survey rows
// or control-point coordinates. Diagnostics are a separate local-only build;
// the optional control-point viewer fetches its own authorized catalog on demand.
export const HEIGHT_PROFILES:ReadonlyArray<HeightProfile>=profiles.map(p=>({...p,renderFrame:p.renderFrame as HeightFrame}));
export function heightProfileForPath(tilesetPath:string|undefined):HeightProfile|undefined{
  return HEIGHT_PROFILES.find(p=>p.tilesetPath===(tilesetPath??'tileset.json'));
}
/** Match actual model identity, not the presence of a private overlay URL. */
export function heightProfileForModel(source:ModelSource,tilesetPath?:string):HeightProfile|undefined{
  return source.type==='cesium-ion'
    ? HEIGHT_PROFILES.find(p=>p.tilesetPath===`ion:${source.assetId}`)
    : heightProfileForPath(tilesetPath);
}
export function classifyHeightFrame(samples:Array<{height:number|null;orthometric:number;ellipsoidal:number}>):HeightFrame{
  const valid=samples.filter(p=>p.height!==null&&Number.isFinite(p.height));
  if(valid.length<3)return 'unverified';
  const threshold=Math.max(3,Math.ceil(samples.length*.6));
  const orthometric=valid.filter(p=>Math.abs(p.height!-p.orthometric)<=1).length;
  const ellipsoidal=valid.filter(p=>Math.abs(p.height!-p.ellipsoidal)<=1).length;
  if(orthometric>=threshold&&ellipsoidal===0)return 'orthometric-as-ellipsoid';
  if(ellipsoidal>=threshold&&orthometric===0)return 'ellipsoidal';
  return 'unverified';
}
const applied=new WeakMap<Cesium3DTileset,{revision:string;resolution:HeightResolution}>();
/** A coordinate pick must use its actual tileset's verified frame, never the
 * active project's frame for an unverified comparison model. */
export function resolvedTilesetHeight(tileset:Cesium3DTileset):HeightResolution|null{return applied.get(tileset)?.resolution??null;}
export function resolveModelHeight(tileset:Cesium3DTileset,profile:HeightProfile|undefined,rootSha256:string|null):HeightResolution{
  const revision=profile?`height-v1:${profile.id}:${profile.rootTilesetSha256}:${profile.gcpSha256}:${profile.offsetM}:${profile.renderFrame}:${profile.conversionMethod}:${profile.conversionRevision}`:'height-v1:unknown';
  const previous=applied.get(tileset);
  if(previous){if(previous.revision!==revision||rootSha256!==profile?.rootTilesetSha256)throw Error('模型已套用不同高程版本，請重新載入');return previous.resolution;}
  const pending=(reason:string):HeightResolution=>({profileId:profile?.id??'unknown',revision,sourceDatum:profile?.sourceVerticalDatum==='EPSG:8904'?'TWVD2001':'unknown',status:'pending',undulationM:null,appliedOffsetM:0,reason});
  if(!profile)return pending('缺少此模型的高程設定，不預設為零或加 20 m');
  if(rootSha256!==profile.rootTilesetSha256)return pending('模型版本與高程設定不符，未套用轉換');
  if(profile.conversionMethod!=='paired-controls-local-constant'||!profile.conversionRevision||!profile.frameEvidence)
    return pending('缺少可使用的高度轉換方法或驗證版本');
  if(profile.sourceVerticalDatum!=='EPSG:8904'||!Number.isInteger(profile.pairedControls)||profile.pairedControls<3||profile.offsetM===null||!Number.isFinite(profile.offsetM)||Math.abs(profile.offsetM)>50||profile.rangeM===null||!Number.isFinite(profile.rangeM)||profile.rangeM<0||profile.rangeM>.2)
    return pending('來源基準或控制點配對不足，未套用轉換');
  if(profile.renderFrame!=='orthometric-as-ellipsoid'&&profile.renderFrame!=='ellipsoidal')return pending('瓦片顯示基準尚未驗證，未套用轉換');
  const offset=profile.renderFrame==='ellipsoidal'?0:profile.offsetM;
  if(offset!==0){
    const up=Ellipsoid.WGS84.geodeticSurfaceNormal(tileset.boundingSphere.center,new Cartesian3());
    const translation=Matrix4.fromTranslation(Cartesian3.multiplyByScalar(up,offset,new Cartesian3()));
    tileset.modelMatrix=Matrix4.multiply(translation,tileset.modelMatrix,new Matrix4());
  }
  const resolution:HeightResolution={profileId:profile.id,revision,sourceDatum:'TWVD2001',status:offset===0?'already-ellipsoidal':'converted-local-controls',
    undulationM:profile.offsetM,appliedOffsetM:offset,reason:'本區成對控制點局部換算；不是全臺固定值或正式大地起伏網格驗收'};
  applied.set(tileset,{revision,resolution});return resolution;
}
export function orthometricToRenderHeight(height:number,resolution:HeightResolution|null):number|null{
  return Number.isFinite(height)&&resolution?.status!=='pending'&&resolution?.undulationM!==null&&resolution?.undulationM!==undefined?height+resolution.undulationM:null;
}
export function renderToOrthometricHeight(height:number,resolution:HeightResolution|null):number|null{
  return Number.isFinite(height)&&resolution?.status!=='pending'&&resolution?.undulationM!==null&&resolution?.undulationM!==undefined?height-resolution.undulationM:null;
}
export async function sha256ArrayBuffer(bytes:ArrayBuffer):Promise<string>{
  const result=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
