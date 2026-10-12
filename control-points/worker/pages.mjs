// Bound each D1 response and JSON encoding operation on the Worker.
export async function readPage(db,table,params,where='1=1',values=[]){
  const requested=params.get('limit')??'200';
  if(!/^\d+$/.test(requested)||Number(requested)<1||Number(requested)>200)throw Object.assign(new Error('分頁筆數須為 1 至 200'),{status:400});
  const after=params.get('after')||'';
  if(after.length>200)throw Object.assign(new Error('分頁游標不正確'),{status:400});
  const limit=Number(requested);
  const {results}=await db.prepare(`SELECT * FROM ${table} WHERE ${where} AND id>? ORDER BY id LIMIT ?`).bind(...values,after,limit+1).all();
  const items=results.slice(0,limit);
  return {items,next:results.length>limit?items.at(-1).id:null};
}
