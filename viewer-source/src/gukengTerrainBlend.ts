import {Cartographic,HeightmapTerrainData,sampleTerrainMostDetailed,type Cesium3DTileset,type TerrainProvider,type Viewer} from 'cesium';
import {terrainDisplayDelta,type DisplayHeightSample} from './gukengTerrainField.mjs';

/** Build a temporary display backdrop from the existing protected mesh. This
 * is not a bare-earth DEM, datum correction or a source for survey exports. */
export async function prepareGukengTerrainBlend(viewer:Viewer,tileset:Cesium3DTileset,cancelled:()=>boolean){
  const base=viewer.terrainProvider,center=Cartographic.fromCartesian(tileset.boundingSphere.center),R=6378137,cos=Math.cos(center.latitude);
  if(!base.availability||Math.abs(cos)<.1)throw Error('背景地形尚未就緒');
  const radius=Math.min(500,Math.max(80,tileset.boundingSphere.radius)),steps=Math.min(32,Math.max(12,Math.ceil(radius/12)));
  const positions:Cartographic[]=[],offsets:Array<{east:number;north:number}>=[];
  for(let row=0;row<=steps;row++)for(let col=0;col<=steps;col++){
    const east=-radius+2*radius*col/steps,north=-radius+2*radius*row/steps;
    positions.push(new Cartographic(center.longitude+east/(R*cos),center.latitude+north/R));offsets.push({east,north});
  }
  const excluded:object[]=[viewer.scene.globe,...viewer.entities.values];
  for(let i=0;i<viewer.dataSources.length;i++)excluded.push(...viewer.dataSources.get(i).entities.values);
  const samples:DisplayHeightSample[]=[];
  // Bound offscreen queries so model streaming stays responsive.
  for(let start=0;start<positions.length;start+=64){
    if(cancelled()||viewer.isDestroyed())return null;
    const chunk=positions.slice(start,start+64);
    const [mesh,terrain]=await Promise.all([viewer.scene.sampleHeightMostDetailed(chunk.map(p=>Cartographic.clone(p)),excluded),
      sampleTerrainMostDetailed(base,chunk.map(p=>Cartographic.clone(p)))]);
    for(let i=0;i<chunk.length;i++){
      const a=mesh[i]?.height,b=terrain[i]?.height;
      if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=100)samples.push({...offsets[start+i],delta:a-b-.5});
    }
  }
  if(cancelled()||viewer.isDestroyed())return null;
  if(samples.length<12)throw Error('現有模型覆蓋不足，維持原背景');
  let disposed=false;
  const radiusOfInfluence=110,bounds={west:Math.min(...samples.map(p=>p.east))-radiusOfInfluence,east:Math.max(...samples.map(p=>p.east))+radiusOfInfluence,
    south:Math.min(...samples.map(p=>p.north))-radiusOfInfluence,north:Math.max(...samples.map(p=>p.north))+radiusOfInfluence};
  const project=(longitude:number,latitude:number)=>({east:(longitude-center.longitude)*R*cos,north:(latitude-center.latitude)*R});
  const request:TerrainProvider['requestTileGeometry']=(x,y,level,options)=>{
    const original=base.requestTileGeometry(x,y,level,options);if(!original||disposed||level<12)return original;
    const rect=base.tilingScheme.tileXYToRectangle(x,y,level),sw=project(rect.west,rect.south),ne=project(rect.east,rect.north);
    if(ne.east<bounds.west||sw.east>bounds.east||ne.north<bounds.south||sw.north>bounds.north)return original;
    return original.then(data=>{
      if(disposed)return data;
      const size=65,buffer=new Float32Array(size*size);let changed=false;
      for(let row=0;row<size;row++)for(let col=0;col<size;col++){
        const lon=rect.west+(rect.east-rect.west)*col/(size-1),lat=rect.north-(rect.north-rect.south)*row/(size-1);
        const h=data.interpolateHeight(rect,lon,lat);if(!Number.isFinite(h))return data;
        const p=project(lon,lat),delta=terrainDisplayDelta(samples,p.east,p.north);if(Math.abs(delta)>.001)changed=true;
        buffer[row*size+col]=h+delta;
      }
      if(!changed)return data;
      const childTileMask=[[0,1,1],[1,1,2],[0,0,4],[1,0,8]].reduce((mask,[dx,dy,bit])=>mask|(data.isChildAvailable(x,y,x*2+dx,y*2+dy)?bit:0),0);
      const result=new HeightmapTerrainData({buffer,width:size,height:size,childTileMask,
        waterMask:data.waterMask instanceof Uint8Array?data.waterMask:undefined});
      // HeightmapTerrainData exposes a getter-only credits property. Preserve
      // the source attribution through an instance getter, never assignment.
      Object.defineProperty(result,'credits',{get:()=>data.credits});return result;
    });
  };
  // Delegate the base provider's availability, credentials, events and credits.
  const provider=new Proxy(base,{get(target,key){if(key==='requestTileGeometry')return request;
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
  const publish=()=>{viewer.canvas.dataset.gukengTerrainBlend=JSON.stringify({revision:'mesh-backdrop-blend-v1',samples:samples.length,
    active:viewer.terrainProvider===provider,minimumDeltaM:Math.min(...samples.map(p=>p.delta)),maximumDeltaM:Math.max(...samples.map(p=>p.delta))});};
  return {
    setEnabled(enabled:boolean){
      if(disposed||viewer.isDestroyed())return;
      if(enabled&&viewer.terrainProvider===base)viewer.terrainProvider=provider;
      else if(!enabled&&viewer.terrainProvider===provider)viewer.terrainProvider=base;
      publish();viewer.scene.requestRender();
    },
    dispose(){if(disposed)return;disposed=true;if(!viewer.isDestroyed()){
      if(viewer.terrainProvider===provider)viewer.terrainProvider=base;
      delete viewer.canvas.dataset.gukengTerrainBlend;viewer.scene.requestRender();}}
  };
}
