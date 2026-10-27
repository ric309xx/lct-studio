import type {CaseOverviewItem} from './caseOverview';

export type CaseMapNavigation={selected:string;query:string;nearbyKeys:string[];expandedKeys?:string[]};

// Navigation context only: these neighbours never change legal case membership.
export function nearbyCases(cases:CaseOverviewItem[],activeKey:string,context:CaseMapNavigation|null){
  const active=cases.find(item=>item.key===activeKey);
  if(!active)return [];
  const saved=cases.filter(item=>context?.nearbyKeys.includes(item.key));
  return saved.some(item=>item.key===activeKey)?saved:cases.filter(item=>item.section===active.section);
}

export function returnCaseContext(cases:CaseOverviewItem[],activeKey:string,context:CaseMapNavigation|null):CaseMapNavigation{
  return context&&(context.selected===activeKey||context.nearbyKeys.includes(activeKey))?context:
    {selected:activeKey,query:'',nearbyKeys:nearbyCases(cases,activeKey,null).map(item=>item.key)};
}

/** In 2D Cesium reports the horizontal frustum span as cartographic height.
 * Capture while the canvas is alive, never compute an extent during teardown.
 */
export type CaseMapCamera={kind:'camera-2d';longitude:number;latitude:number;span:number};
export type CaseMapView=CaseMapCamera|number[];
export function isCaseMapCamera(value:unknown):value is CaseMapCamera{
  const p=value as CaseMapCamera|null;
  return p?.kind==='camera-2d'&&[p.longitude,p.latitude,p.span].every(Number.isFinite)&&
    Math.abs(p.longitude)<=Math.PI&&Math.abs(p.latitude)<=Math.PI/2&&p.span>0&&p.span<=5e7;
}
export function captureCaseMapCamera(camera:{positionCartographic:{longitude:number;latitude:number;height:number}}):CaseMapCamera|null{
  const p=camera.positionCartographic;
  const result:CaseMapCamera={kind:'camera-2d',longitude:p.longitude,latitude:p.latitude,span:p.height};
  return isCaseMapCamera(result)?result:null;
}
export type CaseMapSnapshot={navigation:CaseMapNavigation|null;view:CaseMapView|null};
export function readCaseMapSnapshot(storage:Pick<Storage,'getItem'>,key:string):CaseMapSnapshot{
  try{
    const value=JSON.parse(storage.getItem(key)??'null');
    const n=value?.navigation;
    return {navigation:n&&typeof n.selected==='string'&&typeof n.query==='string'&&Array.isArray(n.nearbyKeys)&&n.nearbyKeys.every((k:unknown)=>typeof k==='string')&&
      (n.expandedKeys===undefined||(Array.isArray(n.expandedKeys)&&n.expandedKeys.every((k:unknown)=>typeof k==='string')))?n:null,
      view:isCaseMapCamera(value?.view)||(Array.isArray(value?.view)&&value.view.length===4&&value.view.every(Number.isFinite))?value.view:null};
  }catch{return {navigation:null,view:null};}
}
export function saveCaseMapSnapshot(storage:Pick<Storage,'setItem'>,key:string,snapshot:CaseMapSnapshot){
  try{storage.setItem(key,JSON.stringify(snapshot));}catch{/* Navigation still works when storage is blocked. */}
}
