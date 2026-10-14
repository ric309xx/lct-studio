import {readAllPages} from './pages.mjs';
export const POINT_CACHE_KEY='point-snapshot-v1';
const valid=cache=>cache?.format===1&&typeof cache.revision==='string'&&Array.isArray(cache.points)&&Array.isArray(cache.datasets);

// Call only after session verification. The cache never grants authentication.
export function createPointCache({request,read,write,onData,onProgress=(_count)=>{},onChecking=(_value)=>{},onStorageError=()=>{}}){
  let snapshot=null,pending=null,epoch=0;
  function load(useStored){
    if(pending)return pending;
    const current=epoch;
    const task=(async()=>{
      onChecking(true);
      try{
        if(useStored&&!snapshot){try{const saved=await read(POINT_CACHE_KEY);if(current===epoch&&valid(saved))snapshot=saved;}catch{}}
        if(current!==epoch)return;
        if(useStored&&snapshot)onData(snapshot);
        let {revision}=await request('/api/points-revision');
        if(typeof revision!=='string'||!revision)throw new Error('資料版本格式不正確');
        if(snapshot?.revision===revision)return;
        // Do not label a mixed import/edit across multiple pages as current.
        for(let attempt=0;attempt<2;attempt++){
          const [datasets,points]=await Promise.all([request('/api/datasets'),readAllPages(request,'/api/points',count=>{if(current===epoch)onProgress(count);})]);
          const latest=await request('/api/points-revision');
          if(current!==epoch)return;
          if(latest.revision!==revision){revision=latest.revision;continue;}
          snapshot={format:1,revision,datasets,points,savedAt:new Date().toISOString()};
          onData(snapshot);
          try{await write(POINT_CACHE_KEY,snapshot);}catch{onStorageError();}
          return;
        }
        throw new Error('資料正在更新，請稍後重試；已保存的點位仍可查看');
      }finally{if(current===epoch)onChecking(false);}
    })();
    pending=task;task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});
    return task;
  }
  return {open:()=>load(true),refresh:()=>load(false),afterWrite:async()=>{
    // 寫入完成時若舊的版本檢查仍在進行，等它結束後再核對，避免新巡查顯示舊點況。
    const current=epoch;
    if(pending)await pending.catch(()=>{});
    if(current===epoch)return load(false);
  },cancel:()=>{epoch++;snapshot=null;pending=null;onChecking(false);}};
}
