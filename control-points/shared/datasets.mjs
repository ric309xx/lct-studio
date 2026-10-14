// 成果年份與坐標年代分開保存，舊資料集採用使用者指定的年份。
const legacy={
  'zhongli-bade':{resultYear:115,color:'#2b6852'},
  'leveling-109':{resultYear:109,color:'#743c92'},
  'image-control-202610':{resultYear:115,color:'#f2c53d'}
};
const colors=['#287fb8','#c26b28','#bc4778','#468767','#7360ad'];
export function datasetMetadata(dataset){
  try{return typeof dataset?.metadata==='string'?JSON.parse(dataset.metadata)||{}:dataset?.metadata||{};}catch{return {};}
}
export function datasetYear(dataset){return datasetMetadata(dataset).resultYear??legacy[dataset?.id]?.resultYear??null;}
export function datasetLabel(dataset){
  if(!dataset)return '未提供資料集';
  const year=datasetYear(dataset),name=dataset.name||dataset.id;
  return year&&!new RegExp(`(^|\\D)${year}\\s*年`).test(name)?`${year} 年 ${name}`:name;
}
export function datasetColor(dataset){
  const color=datasetMetadata(dataset).color;
  if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))return color;
  if(legacy[dataset?.id])return legacy[dataset.id].color;
  let hash=0;for(const c of dataset?.id||'')hash=(hash*31+c.charCodeAt(0))>>>0;
  return colors[hash%colors.length];
}
export function coordinateLabel(options){
  const epsg=Number(options.epsg),metadata=datasetMetadata(options);
  const base={3826:'TWD97 / TM2 121 分帶',3825:'TWD97 / TM2 119 分帶',4326:'WGS84 經緯度'}[epsg];
  if(!base)throw new Error('請選擇支援的坐標系統');
  const system=metadata.coordinateSystem;
  if(system!=null&&!['TWD97','TWD97[2010]','WGS84'].includes(system))throw new Error('坐標年代設定不正確');
  if(system==='TWD97[2010]'){
    if(![3826,3825].includes(epsg))throw new Error('TWD97[2010] 必須使用 TM2 投影');
    if(metadata.coordinateEpoch!=null&&Number(metadata.coordinateEpoch)!==2010)throw new Error('TWD97[2010] 坐標年代必須為 2010.0');
    return base.replace('TWD97','TWD97[2010]');
  }
  if((system==='WGS84'&&epsg!==4326)||(system==='TWD97'&&epsg===4326))throw new Error('坐標系統與投影不一致');
  return base;
}
