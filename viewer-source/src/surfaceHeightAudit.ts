import {Cartographic,Math as CesiumMath,sampleTerrainMostDetailed,type TerrainProvider,type Viewer} from 'cesium';

export type SurfaceHeightPair={longitude:number;latitude:number;sceneHeight:number|null;terrainHeight:number|null;differenceM:number|null};
export function summarizeSurfaceHeightPairs(samples:SurfaceHeightPair[]){
  const differences=samples.flatMap(p=>p.differenceM!==null&&Number.isFinite(p.differenceM)?[p.differenceM]:[]).sort((a,b)=>a-b);
  return {validPairs:differences.length,minimumDifferenceM:differences[0]??null,
    medianDifferenceM:differences.length?differences[Math.floor(differences.length/2)]:null,
    maximumDifferenceM:differences.at(-1)??null};
}

/** Read-only, explicitly requested loopback diagnostics. Scene samples can hit
 * roofs/trees, and are NOT certified ground or a geoid correction. No display,
 * source geometry, model transform, datum or measurement is modified here.
 */
export async function auditSurfaceHeights(viewer:Viewer,provider:TerrainProvider,longitude:number,latitude:number,cancelled:()=>boolean){
  if(viewer.isDestroyed()||cancelled())return;
  viewer.canvas.dataset.surfaceHeightAudit=JSON.stringify({status:'sampling'});
  try{
    const positions=[-.00006,0,.00006].flatMap(dy=>[-.00006,0,.00006].map(dx=>Cartographic.fromDegrees(longitude+dx,latitude+dy)));
    const excluded:object[]=[viewer.scene.globe,...viewer.entities.values];
    for(let i=0;i<viewer.dataSources.length;i++)excluded.push(...viewer.dataSources.get(i).entities.values);
    const [scene,terrain]=await Promise.all([
      viewer.scene.sampleHeightMostDetailed(positions.map(p=>Cartographic.clone(p)),excluded),
      sampleTerrainMostDetailed(provider,positions.map(p=>Cartographic.clone(p)))
    ]);
    if(viewer.isDestroyed()||cancelled())return;
    const samples:SurfaceHeightPair[]=positions.map((p,i)=>{
      const sceneHeight=scene[i]?.height,terrainHeight=terrain[i]?.height;
      const a=typeof sceneHeight==='number'&&Number.isFinite(sceneHeight)?sceneHeight:null;
      const b=typeof terrainHeight==='number'&&Number.isFinite(terrainHeight)?terrainHeight:null;
      return {longitude:CesiumMath.toDegrees(p.longitude),latitude:CesiumMath.toDegrees(p.latitude),
        sceneHeight:a,terrainHeight:b,differenceM:a!==null&&b!==null?a-b:null};
    });
    viewer.canvas.dataset.surfaceHeightAudit=JSON.stringify({status:'ready',frame:'Cesium displayed heights; not orthometric/geoid validation',
      ...summarizeSurfaceHeightPairs(samples),samples});
  }catch{
    if(!viewer.isDestroyed()&&!cancelled())viewer.canvas.dataset.surfaceHeightAudit=JSON.stringify({status:'unavailable'});
  }
}
