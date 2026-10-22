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

export type CaseMapSnapshot={navigation:CaseMapNavigation|null;view:number[]|null};
export function readCaseMapSnapshot(storage:Pick<Storage,'getItem'>,key:string):CaseMapSnapshot{
  try{
    const value=JSON.parse(storage.getItem(key)??'null');
    const n=value?.navigation;
    return {navigation:n&&typeof n.selected==='string'&&typeof n.query==='string'&&Array.isArray(n.nearbyKeys)&&n.nearbyKeys.every((k:unknown)=>typeof k==='string')&&
      (n.expandedKeys===undefined||(Array.isArray(n.expandedKeys)&&n.expandedKeys.every((k:unknown)=>typeof k==='string')))?n:null,
      view:Array.isArray(value?.view)&&value.view.length===4&&value.view.every(Number.isFinite)?value.view:null};
  }catch{return {navigation:null,view:null};}
}
export function saveCaseMapSnapshot(storage:Pick<Storage,'setItem'>,key:string,snapshot:CaseMapSnapshot){
  try{storage.setItem(key,JSON.stringify(snapshot));}catch{/* Navigation still works when storage is blocked. */}
}
