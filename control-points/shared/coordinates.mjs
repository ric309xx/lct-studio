import proj4 from 'proj4';
for (const [epsg, lon, datum] of [[3826,121,'GRS80'],[3825,119,'GRS80'],[3828,121,'aust_SA'],[3827,119,'aust_SA']]) {
  proj4.defs(`EPSG:${epsg}`, `+proj=tmerc +lat_0=0 +lon_0=${lon} +k=0.9999 +x_0=250000 +y_0=0 +ellps=${datum} +units=m +no_defs`);
}
export const CRS_OPTIONS = [
  {epsg:3826,label:'TWD97 / TM2 121 分帶'}, {epsg:3825,label:'TWD97 / TM2 119 分帶'},
  {epsg:3828,label:'TWD67 / TM2 121 分帶'}, {epsg:3827,label:'TWD67 / TM2 119 分帶'},
  {epsg:4326,label:'WGS84 經緯度'}
];
export function toLonLat(east,north,epsg=3826) {
  if (![3826,3825,4326].includes(Number(epsg))) throw new Error('TWD67 轉換須提供經驗證的地方轉換參數，第一版先不接受。');
  if (!Number.isFinite(Number(east)) || !Number.isFinite(Number(north))) throw new Error('坐標必須為有效數字');
  return proj4(`EPSG:${epsg}`, 'EPSG:4326', [Number(east),Number(north)]);
}
export function distance(a,b) {
  const rad=Math.PI/180, dlat=(b[1]-a[1])*rad, dlon=(b[0]-a[0])*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  return 6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function bearing(a,b) {
  const r=Math.PI/180, d=(b[0]-a[0])*r;
  return (Math.atan2(Math.sin(d)*Math.cos(b[1]*r), Math.cos(a[1]*r)*Math.sin(b[1]*r)-Math.sin(a[1]*r)*Math.cos(b[1]*r)*Math.cos(d))/r+360)%360;
}
export function normalizeRecords(records, options) {
  if (!Array.isArray(records) || !records.length || records.length>20000) throw new Error('請提供 1–20,000 筆資料');
  const epsg=Number(options.epsg), crs=CRS_OPTIONS.find(c=>c.epsg===epsg)?.label;
  if (!crs || ![3826,3825,4326].includes(epsg)) throw new Error('請選擇支援的坐標系統');
  const seen=new Set(), points=[], errors=[], warnings=[];
  records.forEach((raw,i)=>{
    try {
      const code=String(raw.code??'').trim(), original=String(raw.original_code??code).trim();
      if (!code || code.length>100) throw new Error('點號空白或超過 100 字');
      if(seen.has(code)) throw new Error(`計算點號重複：${code}`);
      seen.add(code);
      if(raw.north==null || raw.east==null || String(raw.north).trim()==='' || String(raw.east).trim()==='') throw new Error('缺少 N／E 坐標');
      const north=Number(raw.north),east=Number(raw.east),[lon,lat]=toLonLat(east,north,epsg);
      if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<117||lon>125||lat<20||lat>28) throw new Error('換算位置超出台灣周邊範圍，請檢查分帶或 N/E 順序');
      const height=raw.height==null||String(raw.height).trim()===''?null:Number(raw.height);
      if(height!==null&&!Number.isFinite(height)) throw new Error('高度不是有效數字');
      if(raw.source_lon!=null&&raw.source_lat!=null) {
        const difference=distance([lon,lat],[Number(raw.source_lon),Number(raw.source_lat)]);
        if(!Number.isFinite(difference)||difference>1) throw new Error(`原經緯度與換算坐標相差 ${difference.toFixed(2)} 公尺`);
      }
      if(height===null) warnings.push({row:raw.source_row??i+2,message:`${code} 未提供高度`});
      points.push({id:crypto.randomUUID(),dataset_id:options.id,code,original_code:original,name:String(raw.name??''),north,east,height,lon,lat,crs,epsg,height_type:options.height_type||'未註明',height_datum:options.height_datum||null,category:String(raw.category??''),description:String(raw.description??''),notes:String(raw.notes??''),source_row:raw.source_row??i+2,source_sheet:raw.source_sheet??options.sheet??'',raw:JSON.stringify(raw.raw??raw)});
    }catch(e){errors.push({row:raw.source_row??i+2,message:e.message});}
  });
  return {points,errors,warnings};
}
