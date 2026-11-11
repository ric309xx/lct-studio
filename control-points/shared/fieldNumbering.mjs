const norm=v=>String(v??'').trim().toUpperCase();
// 點名也參與比對，舊現場點可能只有點名是 CL27。
export function fieldNumbers(points,datasetId,input){
 const text=norm(input),prefix=text.replace(/[0-9]+$/,'');
 if(!prefix||prefix.length>90)return {next:'',existing:[]};
 const labels=new Set(),sequence=[];
 for(const p of points)if(p.dataset_id===datasetId&&!p.deleted_at)for(const value of [p.name,p.code]){
   const s=norm(value);if(!s.startsWith(prefix))continue;labels.add(s);const suffix=s.slice(prefix.length);
   if(/^\d{1,12}$/.test(suffix))sequence.push({n:Number(suffix),width:suffix.length});
 }
 sequence.sort((a,b)=>b.n-a.n||b.width-a.width);
 const last=sequence[0],next=prefix+String((last?.n??0)+1).padStart(last?.width??2,'0');
 return {next,existing:[...labels].sort((a,b)=>b.localeCompare(a,'zh-Hant',{numeric:true})).slice(0,8)};
}
