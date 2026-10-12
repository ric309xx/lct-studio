/** Read complete records in bounded requests; never return a partial result. */
export async function readAllPages(request,path,onProgress=(_count)=>{}){
  const items=[],seen=new Set();let after='';
  for(;;){
    const query=new URLSearchParams({paged:'1',limit:'200',...(after?{after}:{})});
    const page=await request(path+(path.includes('?')?'&':'?')+query);
    if(!Array.isArray(page.items)||!(page.next===null||typeof page.next==='string'))throw new Error('分頁資料格式不正確');
    for(const item of page.items){if(!item.id||seen.has(item.id))throw new Error('點位資料載入不一致，請重試');seen.add(item.id);items.push(item);}
    onProgress(items.length);
    if(page.next===null)return items;
    if(!page.items.length||page.next!==page.items.at(-1).id||page.next<=after)throw new Error('分頁游標未前進，請重試');
    after=page.next;
  }
}

export async function readBackup(request){
  const data=await request('/api/backup?metadata=1');
  for(const table of ['datasets','points','visits','attachments','audits'])data[table]=await readAllPages(request,'/api/backup?table='+table);
  return data;
}
