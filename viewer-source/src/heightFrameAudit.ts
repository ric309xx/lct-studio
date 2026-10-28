import {Cartesian3,Cartographic,Ellipsoid,Ray,type Cesium3DTileset,type Viewer} from 'cesium';
import {classifyHeightFrame,type HeightProfile,type HeightControl} from './heightReference';
import {loadLocalHeightAuditReferences} from './localHeightAuditSources';

/** Only included in explicitly enabled LOCAL audit builds. Raw control points
 * are never needed by the ordinary display/height-conversion bundle. */
export async function auditModelHeightFrame(viewer:Viewer,tileset:Cesium3DTileset,profile:HeightProfile,cancelled:()=>boolean){
  viewer.canvas.dataset.modelHeightReferenceAudit=JSON.stringify({status:'sampling',profileId:profile.id});
  try{
    const {sources,ion1007Source,ion1007Dem}=await loadLocalHeightAuditReferences();
    if(cancelled()||viewer.isDestroyed())return;
    const source=profile.id===ion1007Source.id?ion1007Source:sources.find(p=>p.id===profile.id);
    if(!source)throw Error('No control references');
    const controls:HeightControl[]=source.points.filter(p=>p.matched&&p.observationSpreadM!<=.15&&p.longitude!==undefined&&p.latitude!==undefined)
      .map(p=>({id:p.id,longitude:p.longitude!,latitude:p.latitude!,orthometric:p.orthometric,ellipsoidal:p.ellipsoidal!}));
    if ('anchorReferences' in source && source.anchorReferences) controls.push(...source.anchorReferences);
    if (source.id===ion1007Source.id) controls.push(...ion1007Dem.samples);
    const excluded:object[]=[viewer.scene.globe,...viewer.entities.values];
    for(let i=0;i<viewer.dataSources.length;i++)excluded.push(...viewer.dataSources.get(i).entities.values);
    // Diagnostic-only private Cesium API. Reject globe fallback or another model.
    const rayScene=viewer.scene as unknown as {pickFromRayMostDetailed:(ray:Ray,excluded:object[],width:number)=>Promise<{object?:{primitive?:unknown;tileset?:unknown};position?:Cartesian3}|undefined>};
    const sampled=await Promise.all(controls.map(async p=>{
      const position=Cartographic.fromDegrees(p.longitude,p.latitude);
      const up=Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(position,new Cartesian3());
      const hit=await rayScene.pickFromRayMostDetailed(new Ray(Cartesian3.fromRadians(position.longitude,position.latitude,5000),Cartesian3.negate(up,new Cartesian3())),excluded,.05);
      const owned=hit?.object?.primitive===tileset||hit?.object?.tileset===tileset;
      return owned&&hit?.position?Cartographic.fromCartesian(hit.position).height:null;
    }));
    if(cancelled()||viewer.isDestroyed())return;
    const samples=controls.map((p,i)=>({...p,height:sampled[i]}));
    viewer.canvas.dataset.modelHeightReferenceAudit=JSON.stringify({status:'ready',profileId:profile.id,frame:classifyHeightFrame(samples),samples});
  }catch{if(!cancelled()&&!viewer.isDestroyed())viewer.canvas.dataset.modelHeightReferenceAudit=JSON.stringify({status:'unavailable',profileId:profile.id});}
}
