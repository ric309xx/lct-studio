// Gukeng's reviewed publication appends a 20-character SHA-256 prefix to
// refreshed PDF/page aliases. Preserve that cache version, never arbitrary URLs.
export function parseGukengAssetPath(value) {
  if(typeof value!=='string')throw Error('成果檔案路徑不正確');
  const match=/^(\/(?:model|output)\/[A-Za-z0-9_./-]+)(?:\?v=([a-f0-9]{20}))?$/.exec(value);
  if(!match||match[1].slice(1).split('/').some(part=>!part||part==='.'||part==='..'))throw Error('成果檔案路徑不正確');
  return {path:value,pathname:match[1],version:match[2]??null,filename:match[1].split('/').at(-1)};
}
