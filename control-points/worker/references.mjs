const json=data=>Response.json(data,{headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const depths={Point:0,MultiPoint:1,LineString:1,MultiLineString:2,Polygon:2,MultiPolygon:3};
export function inspectReference(data){
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length||data.features.length>20000)fail('請提供 1 至 20,000 筆 WGS84 GeoJSON 圖徵');
  let vertices=0,shapes=0;const layers=Object.create(null),bbox=[Infinity,Infinity,-Infinity,-Infinity];
  function coordinates(c,depth){
    if(!Array.isArray(c)||!c.length)fail('圖形坐標不完整');
    if(depth){for(const child of c)coordinates(child,depth-1);return;}
    if(c.length<2||c.length>3||!c.every(Number.isFinite)||c[0]<117||c[0]>125||c[1]<20||c[1]>28)fail('參考圖層須使用臺灣範圍 WGS84 經緯度');
    if(++vertices>200000)fail('圖形頂點過多',413);
    bbox[0]=Math.min(bbox[0],c[0]);bbox[1]=Math.min(bbox[1],c[1]);bbox[2]=Math.max(bbox[2],c[0]);bbox[3]=Math.max(bbox[3],c[1]);
  }
  for(const f of data.features){
    const g=f?.geometry;if(f?.type!=='Feature'||!g||!Object.hasOwn(depths,g.type))fail('不支援此圖形類型');
    coordinates(g.coordinates,depths[g.type]);
    if(!['Point','MultiPoint'].includes(g.type)){shapes++;const layer=String(f.properties?.layer||'未命名');layers[layer]=(layers[layer]||0)+1;}
  }
  if(!shapes)fail('參考圖層需要線或面圖形');
  return {feature_count:data.features.length,shape_count:shapes,vertex_count:vertices,layers,bbox};
}
export async function listReferences(bucket){
  let cursor;const metadata=[];
  do{const page=await bucket.list({prefix:'references/meta/',limit:100,cursor});
    for(const object of page.objects){const stored=await bucket.get(object.key);if(stored)metadata.push(await stored.json());}
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return metadata.sort((a,b)=>a.created_at.localeCompare(b.created_at));
}
export async function referenceRoute(req,bucket){
  const path=new URL(req.url).pathname;
  if(path==='/api/references'&&req.method==='GET')return json(await listReferences(bucket));
  if(path==='/api/references'&&req.method==='POST'){
    if(Number(req.headers.get('content-length')||0)>16*1024*1024)fail('參考圖層檔案過大',413);
    const form=await req.formData(),source=form.get('source'),geo=form.get('geojson'),info=form.get('metadata');
    if(!source||typeof source.arrayBuffer!=='function'||!source.size||source.size>10*1024*1024||!/\.dxf$/i.test(source.name))fail('請附上 10 MB 以內原始 DXF');
    if(!geo||typeof geo.text!=='function'||geo.size>5*1024*1024)fail('請附上 5 MB 以內 GeoJSON');
    if(typeof info!=='string'||info.length>4096)fail('參考圖層資料格式錯誤');
    let meta,data;try{meta=JSON.parse(info);data=JSON.parse(await geo.text());}catch{fail('參考圖層 JSON 格式錯誤');}
    if(typeof meta?.name!=='string'||!meta.name.trim()||meta.name.length>100||![3826,3825,3828,3827,4326].includes(meta.epsg))fail('請提供圖層名稱及原始坐標系統');
    const stats=inspectReference(data),bytes=await source.arrayBuffer(),sourceHash=await sha(bytes),geoBytes=new TextEncoder().encode(JSON.stringify(data)),geoHash=await sha(geoBytes);
    // Content-derived IDs make retries idempotent without overwriting existing files.
    const id=(await sha(new TextEncoder().encode(sourceHash+geoHash+meta.epsg+meta.name.trim()))).slice(0,32),key='references/meta/'+id+'.json';
    const existing=await bucket.get(key);if(existing)return json({ok:true,duplicate:true,reference:await existing.json()});
    const record={id,name:meta.name.trim(),epsg:meta.epsg,source_name:String(source.name).replace(/[\r\n"\\/]/g,'_').slice(0,180),source_hash:sourceHash,geojson_hash:geoHash,created_at:new Date().toISOString(),warning:typeof meta.warning==='string'?meta.warning.slice(0,500):'',...stats};
    await bucket.put('references/source/'+id+'.dxf',bytes,{httpMetadata:{contentType:'application/dxf'}});
    await bucket.put('references/data/'+id+'.geojson',geoBytes,{httpMetadata:{contentType:'application/geo+json'}});
    // Publish metadata last, so an incomplete upload is never listed.
    await bucket.put(key,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
    return json({ok:true,reference:record});
  }
  const match=path.match(/^\/api\/references\/([a-f0-9]{32})(\/source)?$/);
  if(match&&req.method==='GET'){
    const meta=await bucket.get('references/meta/'+match[1]+'.json');if(!meta)fail('找不到參考圖層',404);
    const info=await meta.json(),source=!!match[2],object=await bucket.get(`references/${source?'source':'data'}/${match[1]}.${source?'dxf':'geojson'}`);if(!object)fail('參考圖層檔案不完整',404);
    const filename=source?info.source_name:info.name+'.geojson';
    return new Response(object.body,{headers:{'Content-Type':source?'application/dxf':'application/geo+json','Cache-Control':'no-store','Content-Disposition':`attachment; filename="reference"; filename*=UTF-8''${encodeURIComponent(filename)}`}});
  }
  fail('找不到參考圖層功能',404);
}
