export const annualMaps=[
  {key:'annual114',label:'114 年',layer:'PHOTO2025'},
  {key:'annual113',label:'113 年',layer:'PHOTO2024'},
  {key:'annual112',label:'112 年',layer:'PHOTO2023'}
];
export function basemapUrl(key){
  const annual=annualMaps.find(m=>m.key===key);
  const layer=annual?.layer??(key==='aerial'?'PHOTO2':'EMAP');
  return 'https://wmts.nlsc.gov.tw/wmts/'+layer+'/default/GoogleMapsCompatible/{z}/{y}/{x}';
}
export function googleDirections(point){
  const {lat,lon}=point;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
  const query=new URLSearchParams({api:'1',destination:lat.toFixed(7)+','+lon.toFixed(7),dir_action:'navigate'});
  return 'https://www.google.com/maps/dir/?'+query;
}
