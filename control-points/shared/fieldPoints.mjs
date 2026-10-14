import {normalizeRecords} from './coordinates.mjs';
export function fieldCapture(point){try{return JSON.parse(point.raw||'{}').fieldCapture||null;}catch{return null;}}
export const isApproximate=point=>fieldCapture(point)?.quality==='approximate';
export const coordinateQuality=point=>isApproximate(point)?'概略位置（待測量）':fieldCapture(point)?'已補測量坐標':'來源測量成果';
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export function approximatePoint(data,dataset,time=Date.now()){
  if(!['gps','map'].includes(data.positionMethod))throw problem('請選擇 GPS 或地圖點選位置');
  if(data.positionMethod==='gps'&&(!Number.isFinite(data.accuracy)||data.accuracy<0||!Number.isFinite(data.positionTimestamp)||time-data.positionTimestamp>120000||data.positionTimestamp-time>60000))throw problem('GPS 定位已過期或缺少精度，請重新取得目前位置。');
  const capture={quality:'approximate',method:data.positionMethod,createdAt:new Date(time).toISOString(),initialLocation:{lon:data.lon,lat:data.lat,accuracy:data.positionMethod==='gps'?data.accuracy:null,timestamp:data.positionMethod==='gps'?data.positionTimestamp:null}};
  const normalized=normalizeRecords([{...data,east:data.lon,north:data.lat,height:null,raw:{fieldCapture:capture},source_sheet:'現場新增',source_row:0}],{...dataset,metadata:{coordinateSystem:'WGS84'},epsg:4326,crs:'WGS84',height_type:'未測量',height_datum:null});
  if(normalized.errors.length)throw problem(normalized.errors[0].message);
  return normalized.points[0];
}
export function measuredPoint(data,point,time=Date.now()){
  const capture=fieldCapture(point);if(!capture)throw problem('僅現場新增點可補測量；來源成果請另行匯入。');
  if(![3826,3825].includes(Number(data.epsg))||!['TWD97','TWD97[2010]'].includes(data.coordinateSystem))throw problem('請明確選擇 TWD97 或 TWD97[2010] 與正確分帶。');
  if(!['橢球高','正高','未註明'].includes(data.height_type))throw problem('請選擇高程類型');
  if(typeof data.source!=='string'||!data.source.trim()||data.source.length>500)throw problem('請填寫測量來源或作業說明');
  const raw=JSON.parse(point.raw),date=new Date(data.measured_at);if(!Number.isFinite(+date))throw problem('測量日期不正確');
  raw.fieldCapture={...capture,quality:'measured',measurement:{measuredAt:date.toISOString(),updatedAt:new Date(time).toISOString(),source:data.source.trim()}};
  const result=normalizeRecords([{...point,north:data.north,east:data.east,height:data.height,raw}],{id:point.dataset_id,epsg:data.epsg,metadata:{coordinateSystem:data.coordinateSystem,...(data.coordinateSystem==='TWD97[2010]'?{coordinateEpoch:2010}:{})},height_type:data.height_type,height_datum:String(data.height_datum||'').slice(0,100)||null});
  if(result.errors.length)throw problem(result.errors[0].message);
  return {...result.points[0],id:point.id};
}
