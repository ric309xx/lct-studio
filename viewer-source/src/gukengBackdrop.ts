import {Cartesian3,ClippingPolygon,ClippingPolygonCollection,Matrix4,type Viewer} from 'cesium';
import {simplifyGukengFootprint} from './gukengFootprint.mjs';

export type GukengPart='completed'|'unperformed';
type Footprints=Record<GukengPart,number[][][]>;
/** Only remove the coarse globe inside currently displayed survey surfaces.
 * Model transforms, terrain data and measured coordinates are never changed.
 * Do not replace another feature's clipping collection. */
export function installGukengBackdrop(viewer:Viewer,transform:Matrix4,rings:Footprints){
  const globe=viewer.scene.globe;
  if(!globe||globe.clippingPolygons||!ClippingPolygonCollection.isSupported(viewer.scene))return null;
  const positions=new Map<GukengPart,Cartesian3[][]>();
  for(const part of ['completed','unperformed'] as const)positions.set(part,rings[part].map(ring=>
    simplifyGukengFootprint(ring).map(p=>Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(p),new Cartesian3()))));
  const collection=new ClippingPolygonCollection({polygons:[],inverse:false});
  globe.clippingPolygons=collection;
  let disposed=false;
  const publish=()=>{viewer.canvas.dataset.gukengBackdrop=JSON.stringify({revision:'survey-footprint-v1',enabled:collection.enabled,
    polygons:collection.length,vertices:Array.from({length:collection.length},(_,i)=>collection.get(i).positions.length).reduce((a,b)=>a+b,0)});};
  return {
    update(enabled:boolean,visible:readonly GukengPart[]){
      if(disposed||viewer.isDestroyed()||collection.isDestroyed()||globe.clippingPolygons!==collection)return;
      collection.removeAll();
      for(const part of visible)for(const polygon of positions.get(part)??[])collection.add(new ClippingPolygon({positions:polygon}));
      collection.enabled=enabled&&collection.length>0;publish();viewer.scene.requestRender();
    },
    dispose(){
      if(disposed)return;disposed=true;
      if(!viewer.isDestroyed()){
        if(globe.clippingPolygons===collection)globe.clippingPolygons=undefined;
        delete viewer.canvas.dataset.gukengBackdrop;viewer.scene.requestRender();
      }
      if(!collection.isDestroyed())collection.destroy();
    }
  };
}
