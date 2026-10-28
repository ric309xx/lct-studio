import {Cartesian3,Color,ConstantPositionProperty,ScreenSpaceEventHandler,ScreenSpaceEventType,type Cartesian2,type Viewer,type Cesium3DTileset,type Ray,type Entity} from 'cesium';
export type SurveyPick={position:Cartesian3;source:'model'|'terrain';model?:Cesium3DTileset};
type PickObject={primitive?:unknown;tileset?:unknown;content?:{tileset?:unknown}};
type RayScene={pickFromRay?:(ray:Ray,excluded:object[],width:number)=>{object?:PickObject;position?:Cartesian3}|undefined};
type Showable={show:boolean;length?:number;get?:(index:number)=>unknown};
const valid=(p:Cartesian3|undefined):p is Cartesian3=>Boolean(p&&[p.x,p.y,p.z].every(Number.isFinite)&&Cartesian3.magnitudeSquared(p)>=1);
const owner=(hit:PickObject|undefined,models:readonly Cesium3DTileset[])=>hit&&models.find(t=>hit.primitive===t||hit.tileset===t||hit.content?.tileset===t);

/** Only the synchronous offscreen pick sees these visibility overrides. Keep
 * the model and any parent collections visible; restore exact original flags
 * before returning, including exceptions. No entity geometry is changed. */
function isolateModels(viewer:Viewer,models:readonly Cesium3DTileset[]):()=>void{
  const changed:Array<[Showable,boolean]>=[],visited=new Set<unknown>();
  const hide=(value:unknown)=>{
    if(!value||visited.has(value))return;visited.add(value);
    if(models.includes(value as Cesium3DTileset))return;
    const item=value as Showable;
    if(typeof item.get==='function'&&typeof item.length==='number'){
      for(let i=0;i<item.length;i++)hide(item.get(i));
    }else if(typeof item.show==='boolean'&&item.show){changed.push([item,item.show]);item.show=false;}
  };
  try{hide(viewer.scene.globe);hide(viewer.scene.primitives);hide(viewer.scene.groundPrimitives);}
  catch(error){for(const [item,show] of changed.reverse())item.show=show;throw error;}
  return ()=>{for(const [item,show] of changed.reverse())item.show=show;};
}
/** Actual camera-ray/mesh intersection, not vertical height sampling. Cesium
 * 1.133 supplies pickFromRay as a private API: contain it in this guarded
 * adapter and test its ownership/exclusion contract when upgrading Cesium.
 * It uses currently rendered LOD, matching what the user points at. */
export function pickSurveyPosition(viewer:Viewer,screen:Cartesian2,models:readonly Cesium3DTileset[],modelOnly=false):SurveyPick|undefined{
  if(viewer.isDestroyed())return;
  try{
    const ray=viewer.camera.getPickRay(screen);if(!ray)return;
    const rayScene=viewer.scene as unknown as RayScene;
    if(typeof rayScene.pickFromRay==='function'){
      const excluded:object[]=[viewer.scene.globe,...viewer.entities.values];
      for(let i=0;i<viewer.dataSources.length;i++)excluded.push(...viewer.dataSources.get(i).entities.values);
      const restore=isolateModels(viewer,models);
      try{
        const hit=rayScene.pickFromRay(ray,excluded,.02),model=owner(hit?.object,models);
        if(model&&valid(hit?.position))return {position:Cartesian3.clone(hit.position),source:'model',model};
      }finally{restore();viewer.scene.requestRender();}
    }else if(viewer.scene.pickPositionSupported){
      // Compatibility fallback: read visible-frame depth BEFORE any pick pass.
      // Do not drill through annotations and then use the leftover depth as a
      // model height. Unsupported overlay penetration stays unavailable.
      const p=viewer.scene.pickPosition(screen),hit=viewer.scene.pick(screen) as PickObject|undefined;
      const model=owner(hit,models);
      if(model&&valid(p))return {position:Cartesian3.clone(p),source:'model',model};
      if(hit)return;
    }
    if(modelOnly)return;
    const p=viewer.scene.globe.pick(ray,viewer.scene);
    if(valid(p))return {position:Cartesian3.clone(p),source:'terrain'};
  }catch{/* No depth / unsupported pick: leave unavailable, never zero. */}
}
export type SurveySelection={clear:()=>void;dispose:()=>void};
/** Click-to-pin only: motion, camera changes, and moving into the copy button
 * do not alter the selected world position. Own exactly one temporary marker.
 * The busy guard lets area/distance/clipping/edit tools keep their own clicks. */
export function selectSurveyPoint(viewer:Viewer,models:()=>readonly Cesium3DTileset[],onPoint:(p:SurveyPick|undefined)=>void,canSelect:()=>boolean=()=>true):SurveySelection{
  const handler=new ScreenSpaceEventHandler(viewer.canvas);let marker:Entity|undefined,disposed=false;
  const clear=()=>{if(marker&&!viewer.isDestroyed()){viewer.entities.remove(marker);viewer.scene.requestRender();}marker=undefined;};
  handler.setInputAction((event:{position:Cartesian2})=>{
    if(disposed||viewer.isDestroyed()||!canSelect())return;
    const point=pickSurveyPosition(viewer,event.position,models(),true);
    if(!point){onPoint(undefined);return;}
    const position=new ConstantPositionProperty(Cartesian3.clone(point.position));
    if(marker)marker.position=position;
    else marker=viewer.entities.add({name:'座標選取點',position,point:{pixelSize:13,color:Color.fromCssColorString('#56c7ff'),outlineColor:Color.WHITE,outlineWidth:3,disableDepthTestDistance:Number.POSITIVE_INFINITY}});
    viewer.scene.requestRender();onPoint(point);
  },ScreenSpaceEventType.LEFT_CLICK);
  return {clear,dispose:()=>{if(disposed)return;disposed=true;handler.destroy();clear();}};
}
