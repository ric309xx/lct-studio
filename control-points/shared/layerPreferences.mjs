export const LAYER_PREFERENCES_KEY='lct-control-points:layers:v1';

/** @typedef {{all:boolean,visibleIds:string[]}} LayerSelection */
/** @returns {LayerSelection} */
export function readLayerSelection(storage) {
  try {
    const value=JSON.parse(storage.getItem(LAYER_PREFERENCES_KEY));
    if(typeof value?.all==='boolean'&&Array.isArray(value.visibleIds)&&value.visibleIds.every(id=>typeof id==='string'))return {all:value.all,visibleIds:[...new Set(value.visibleIds)]};
  } catch {}
  return {all:true,visibleIds:[]};
}

/** @param {{id:string}[]} datasets @param {LayerSelection} selection */
export function hiddenLayerIds(datasets,selection) {
  const visible=new Set(selection.visibleIds);
  return new Set(datasets.filter(d=>!selection.all&&!visible.has(d.id)).map(d=>d.id));
}

/** @param {{id:string}[]} datasets @param {Set<string>} hidden @returns {LayerSelection} */
export function captureLayerSelection(datasets,hidden) {
  return {all:datasets.every(d=>!hidden.has(d.id)),visibleIds:datasets.filter(d=>!hidden.has(d.id)).map(d=>d.id)};
}

/** @param {LayerSelection} selection */
export function saveLayerSelection(storage,selection) {
  try {storage.setItem(LAYER_PREFERENCES_KEY,JSON.stringify(selection));return true;}catch{return false;}
}
