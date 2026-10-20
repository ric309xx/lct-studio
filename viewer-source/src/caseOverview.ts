import geometry from './caseMapGeometry.json';
import {caseCaptureDate} from './caseCaptureDate';

export type OverviewParcel={key:string;groupKey?:string;groupLabel?:string;overlayUrl?:string;tilesetPath?:string;focus?:{longitude:number;latitude:number};info:{parcelNo:string;sectionName:string}};
export type CaseOverviewItem={key:string;title:string;section:string;parcels:OverviewParcel[];date:string;longitude:number;latitude:number;rings:number[][][];bounds:[number,number,number,number]};
// Model sharing is not case membership. In particular the six 1006 parcels are separate cases.
export function caseKey(parcel:OverviewParcel){return parcel.groupKey??parcel.key;}
export function caseTitle(parcels:OverviewParcel[]){
  const section=parcels[0].groupLabel?.split('｜')[0].trim()??parcels[0].info.sectionName.replace('三座屋段','');
  const numbers=parcels.slice(0,2).map(p=>p.info.parcelNo).join('、');
  return `${section}｜${numbers}${parcels.length>2?'…':''}${parcels.length>1?` 等${parcels.length}筆地號`:''}`;
}
export function buildCaseOverview(parcels:OverviewParcel[]):CaseOverviewItem[]{
  const groups=new Map<string,OverviewParcel[]>();
  for(const parcel of parcels){const key=caseKey(parcel);groups.set(key,[...(groups.get(key)??[]),parcel]);}
  return [...groups].map(([key,members])=>{
    const rings=members.flatMap(p=>geometry[p.key as keyof typeof geometry]?.rings??[]);
    const points=rings.flat();
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const lon=members[0].focus?.longitude,lat=members[0].focus?.latitude;
    if(!points.length&&!(Number.isFinite(lon)&&Number.isFinite(lat)))throw Error(`案件缺少定位：${key}`);
    const bounds:[number,number,number,number]=points.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:[lon!,lat!,lon!,lat!];
    const dates=[...new Set(members.map(caseCaptureDate))];
    return {key,title:caseTitle(members),section:members[0].info.sectionName,parcels:members,date:dates.join('、'),longitude:(bounds[0]+bounds[2])/2,latitude:(bounds[1]+bounds[3])/2,rings,bounds};
  });
}

export type MapMarker={x:number;y:number;items:CaseOverviewItem[]};
// Screen-space clusters only: never combines legal parcels or their areas.
export function clusterMapMarkers(points:MapMarker[],distance=64):MapMarker[]{
  const groups:MapMarker[]=[];
  for(const point of points){
    const group=groups.find(g=>Math.hypot(g.x-point.x,g.y-point.y)<distance||(Math.abs(g.y-point.y)<36&&Math.abs(g.x-point.x)<210));
    if(group){const n=group.items.length;group.x=(group.x*n+point.x)/(n+1);group.y=(group.y*n+point.y)/(n+1);group.items.push(...point.items);}
    else groups.push({...point,items:[...point.items]});
  }
  return groups;
}
