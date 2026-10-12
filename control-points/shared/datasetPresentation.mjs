export function datasetDisplayName(dataset){
  let metadata;try{metadata=typeof dataset.metadata==='string'?JSON.parse(dataset.metadata):dataset.metadata;}catch{}
  const year=metadata?.resultYear,name=String(dataset.name||'');
  if(!Number.isInteger(year)||year<1||year>300)return name;
  if(new RegExp(`^${year}\\s*年`).test(name))return name;
  return `${year}年${name}`;
}
