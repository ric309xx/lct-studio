export const PHOTO_CATEGORIES=['近照','遠照','環境','到達路線','點之記','其他'];
export const VISIT_STATUSES=['點位存在','完好','損壞','找不到','無法進入'];
export const displayPointStatus=status=>status==='點位存在'?'已巡查 · 點位存在':status;
export function pendingVisitPoints(points,queue){
  const latest=new Map();
  for(const q of queue){if(q.kind!=='visit')continue;const old=latest.get(q.pointId);if(!old||q.payload.visited_at>=old.payload.visited_at)latest.set(q.pointId,q);}
  return points.map(p=>latest.has(p.id)?{...p,status:latest.get(p.id).payload.status,pending_visit:true}:p);
}
/** 先完整準備整批，再一次寫入本機交易；單筆處理失敗不留下半批。 */
/** @param {any[]} items @param {any} point @param {{category:string,visitId?:string|null,position?:any,thumbnail:(file:File)=>Promise<any>}} options */
export async function preparePhotoBatch(items,point,{category,visitId=null,position=null,thumbnail}){
  if(!PHOTO_CATEGORIES.includes(category))throw new Error('請選擇照片類別');
  if(!items.length)throw new Error('請先拍照或選擇照片');
  const results=[];
  for(const item of items){
    if(!item.file||item.file.size<1||item.file.size>30*1024*1024)throw new Error(`${item.file?.name||'照片'} 必須在 30 MB 以內`);
    const thumb=await thumbnail(item.file);
    results.push({id:item.id,kind:'attachment',pointId:point.id,code:point.code,createdAt:item.capturedAt,file:item.file,thumbnail:thumb,filename:item.file.name,payload:{id:item.id,category,visit_id:visitId,captured_at:item.capturedAt,position:item.position??position}});
  }
  return results;
}
