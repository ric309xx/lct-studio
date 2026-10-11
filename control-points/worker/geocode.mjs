const problem=(message,status)=>Object.assign(new Error(message),{status});
export function placeResults(data) {
  const seen=new Set();
  return (Array.isArray(data?.features)?data.features:[]).flatMap(f=>{
    const p=f.properties||{},[lon,lat]=f.geometry?.coordinates||[];
    if(f.geometry?.type!=='Point'||!Number.isFinite(lon)||!Number.isFinite(lat)||lon<117||lon>125||lat<20||lat>28) return [];
    const name=String(p.name||p.street||p.city||'地點'),address=[p.city,p.district,p.locality,p.street,p.housenumber].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
    const id=`${p.osm_type||'P'}${p.osm_id||`${lon},${lat}`}`;
    if(seen.has(id)) return [];seen.add(id);
    return [{id,name,address,lon,lat}];
  }).slice(0,6);
}
export function createPlaceSearch({fetcher=fetch,time=Date.now}={}) {
  let lastRequest=-Infinity;
  return async function(query,files,endpoint='https://photon.komoot.io/api/') {
    const q=String(query||'').trim().replace(/\s+/g,' ');
    if(q.length<2||q.length>120) throw problem('請輸入 2–120 字的地標、路名或地址',400);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(q)))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const key=`geocoding/v1/${hash}`,cached=await files.get(key);
    if(cached){try{const data=await cached.json();if(data.expires>time()&&Array.isArray(data.results))return data.results;}catch{}}
    if(time()-lastRequest<1000) throw problem('搜尋過於頻繁，請稍候 1 秒再試',429);
    lastRequest=time();
    const url=new URL(endpoint);url.searchParams.set('q',q);url.searchParams.set('bbox','117,20,125,28');url.searchParams.set('limit','6');
    let response;
    try{response=await fetcher(url,{headers:{'User-Agent':'LCTControlPoints/0.1 (+https://lctstudio.tw)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});}catch{throw problem('地點搜尋暫時無法連線，請稍後再試',503);}
    if(!response.ok)throw problem('地點搜尋服務忙碌，請稍後再試',503);
    let data;try{data=await response.json();}catch{throw problem('地點搜尋服務回覆異常，請稍後再試',503);}
    if(!Array.isArray(data?.features))throw problem('地點搜尋服務回覆異常，請稍後再試',503);
    const results=placeResults(data);
    await files.put(key,JSON.stringify({expires:time()+7*24*3600*1000,results}),{httpMetadata:{contentType:'application/json'}});
    return results;
  };
}
