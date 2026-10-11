export function sourceAttributes(raw) {
  try {
    const values=typeof raw==='string'?JSON.parse(raw):raw;
    if(!values||typeof values!=='object'||Array.isArray(values)) return [];
    return Object.entries(values).filter(([key])=>key!=='__excel').map(([label,value])=>({
      label,value,text:value==null||value===''?'未提供':String(values.__excel?.display?.[label]??(typeof value==='object'?JSON.stringify(value):value))
    }));
  } catch {return [];}
}
