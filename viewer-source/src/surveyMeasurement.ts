import {Cartesian3,Cartographic,Math as CesiumMath} from 'cesium';
import {renderToOrthometricHeight,type HeightResolution} from './heightReference';

/** GRS80 transverse Mercator, EPSG:3826. The viewer's geographic model
 * positions use the existing TWD97/WGS84 alignment; no epoch correction or
 * survey-accuracy claim is introduced by displaying extra decimal places. */
export function toTwd97(longitude:number,latitude:number):{easting:number;northing:number}|null{
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<120||longitude>122||latitude<20||latitude>27)return null;
  const a=6378137,f=1/298.257222101,e2=f*(2-f),e4=e2*e2,e6=e4*e2,ep2=e2/(1-e2),k=.9999;
  const phi=latitude*Math.PI/180,lambda=(longitude-121)*Math.PI/180;
  const sin=Math.sin(phi),cos=Math.cos(phi),tan=Math.tan(phi),nu=a/Math.sqrt(1-e2*sin*sin);
  const t=tan*tan,c=ep2*cos*cos,A=lambda*cos;
  const meridian=a*((1-e2/4-3*e4/64-5*e6/256)*phi
    -(3*e2/8+3*e4/32+45*e6/1024)*Math.sin(2*phi)
    +(15*e4/256+45*e6/1024)*Math.sin(4*phi)-35*e6/3072*Math.sin(6*phi));
  return {easting:250000+k*nu*(A+(1-t+c)*A**3/6+(5-18*t+t*t+72*c-58*ep2)*A**5/120),
    northing:k*(meridian+nu*tan*(A*A/2+(5-t+9*c+4*c*c)*A**4/24+(61-58*t+t*t+600*c-330*ep2)*A**6/720))};
}
export type SurveyCoordinate={longitude:number;latitude:number;easting:number|null;northing:number|null;height:number|null;source:'model'|'terrain'};
/** Invert the same EPSG:3826 projection; never use a measured/model-picked
 * coordinate to replace the source control-point E/N. No epoch conversion. */
export function fromTwd97(east:number,north:number):{longitude:number;latitude:number}|null{
  if(![east,north].every(Number.isFinite))return null;
  let latitude=north/110700,longitude=121+(east-250000)/(111000*Math.cos(latitude*Math.PI/180));
  latitude=Math.max(20,Math.min(27,latitude));longitude=Math.max(120,Math.min(122,longitude));
  for(let i=0;i<8;i++){
    const dx=longitude>121.99999?-.000001:.000001,dy=latitude>26.99999?-.000001:.000001;
    const p=toTwd97(longitude,latitude),x=toTwd97(longitude+dx,latitude),y=toTwd97(longitude,latitude+dy);
    if(!p||!x||!y)return null;
    const de=east-p.easting,dn=north-p.northing;
    if(Math.hypot(de,dn)<.00001)return {longitude,latitude};
    const a=(x.easting-p.easting)/dx,b=(y.easting-p.easting)/dy,c=(x.northing-p.northing)/dx,d=(y.northing-p.northing)/dy,det=a*d-b*c;
    if(!Number.isFinite(det)||Math.abs(det)<1)return null;
    longitude+=(d*de-b*dn)/det;latitude+=(a*dn-c*de)/det;
    if(longitude<120-.0000001||longitude>122+.0000001||latitude<20-.0000001||latitude>27+.0000001)return null;
    longitude=Math.max(120,Math.min(122,longitude));latitude=Math.max(20,Math.min(27,latitude));
  }
  const result=toTwd97(longitude,latitude);
  return result&&Math.hypot(result.easting-east,result.northing-north)<.001?{longitude,latitude}:null;
}
export function surveyCoordinate(position:Cartesian3,source:SurveyCoordinate['source'],resolution:HeightResolution|null):SurveyCoordinate|null{
  if(![position.x,position.y,position.z].every(Number.isFinite)||Cartesian3.magnitudeSquared(position)<1)return null;
  const p=Cartographic.fromCartesian(position);
  const longitude=CesiumMath.toDegrees(p.longitude),latitude=CesiumMath.toDegrees(p.latitude),grid=toTwd97(longitude,latitude);
  return {longitude,latitude,easting:grid?.easting??null,northing:grid?.northing??null,
    height:source==='model'?renderToOrthometricHeight(p.height,resolution):null,source};
}
export type DistanceSummary={spatialM:number;gridM:number|null;heightDifferenceM:number;pointCount:number};
export type DistanceResult=DistanceSummary&{id:number};
export function measureModelPath(positions:readonly Cartesian3[]):DistanceSummary|null{
  if(positions.length<2||positions.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||Cartesian3.magnitudeSquared(p)<1))return null;
  const cartographics=positions.map(p=>Cartographic.fromCartesian(p));
  const grid=cartographics.map(p=>toTwd97(CesiumMath.toDegrees(p.longitude),CesiumMath.toDegrees(p.latitude)));
  let spatialM=0,gridM=0;
  for(let i=1;i<positions.length;i++){
    spatialM+=Cartesian3.distance(positions[i-1],positions[i]);
    const a=grid[i-1],b=grid[i];if(a&&b)gridM+=Math.hypot(b.easting-a.easting,b.northing-a.northing);
  }
  // Local constant N cancels in endpoint differences. This is not terrain-
  // following distance and does not sum mesh triangles between clicks.
  return {spatialM,gridM:grid.every(Boolean)?gridM:null,heightDifferenceM:cartographics.at(-1)!.height-cartographics[0].height,pointCount:positions.length};
}
export function coordinateText(p:SurveyCoordinate):string{
  const longitude=p.longitude.toFixed(8),latitude=p.latitude.toFixed(8);
  return `${latitude},${longitude}`;
}
