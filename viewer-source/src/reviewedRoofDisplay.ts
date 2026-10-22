import {Cartesian3,Cartographic,PolygonHierarchy,type Entity,type JulianDate} from 'cesium';

export const suppressRawRoofAnalysis=(building:Entity)=>building.properties?.analysisOnly?.getValue()===true
  &&building.properties?.displaySuppressRawAnalysis?.getValue()===true;

/** Display geometry is opt-in and never replaces the entity's measured XY. */
export function reviewedRoofHierarchy(building:Entity,time:JulianDate):PolygonHierarchy{
  const coords=building.properties?.displayCleanRoofSurface?.getValue()===true
    ? building.properties?.displaySmoothCoordinates?.getValue() as number[][][]|undefined:undefined;
  if(!coords?.length)return building.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
  const ring=(values:number[][])=>values.slice(0,-1).map(p=>Cartesian3.fromDegrees(p[0],p[1]));
  return new PolygonHierarchy(ring(coords[0]),coords.slice(1).map(r=>new PolygonHierarchy(ring(r))));
}

export function reviewedRoofHeight(building:Entity,point:Cartographic):number|null{
  if(building.properties?.displayCleanRoofSurface?.getValue()!==true)return null;
  const p=building.properties?.displayRoofPlane?.getValue() as number[]|undefined;
  if(p?.length!==5||!p.every(Number.isFinite))return null;
  const radians=Math.PI/180;
  return p[2]+p[3]*(point.longitude-p[0]*radians)*Math.cos(p[1]*radians)*6378137
    +p[4]*(point.latitude-p[1]*radians)*6378137;
}
