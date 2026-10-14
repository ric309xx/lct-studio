// 使用網站下載的備份作離線比對，不修改來源檔或任何資料庫。
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const backupPath=process.argv[2];if(!backupPath)throw new Error('用法：node scripts/compare-review.mjs 網站備份.json [候選檔.json]');
const backup=JSON.parse(readFileSync(backupPath,'utf8')),batches=JSON.parse(readFileSync(process.argv[3]||'.local/review-20261012/review-batches.json','utf8'));
if(!Array.isArray(backup.points)||!Array.isArray(backup.datasets))throw new Error('請提供完整備份 ZIP 中的 data.json');
const comparisons=[];
for(const b of batches){
 const rows=b.records.map(r=>{
  const candidates=backup.points.filter(p=>!p.deleted_at&&(p.original_code===r.original_code||p.code===r.code));
  const matches=candidates.map(p=>({id:p.id,dataset_id:p.dataset_id,code:p.code,original_code:p.original_code,crs:p.crs,epsg:p.epsg,horizontal_m:Math.hypot(p.north-r.north,p.east-r.east),height_difference:p.height==null||r.height==null?null:p.height-r.height,sameCoordinateSystem:p.epsg===b.dataset.epsg&&p.crs.includes('[2010]')===(b.dataset.metadata.coordinateSystem==='TWD97[2010]')}));
  const exact=matches.filter(p=>p.sameCoordinateSystem&&p.horizontal_m===0&&p.height_difference===0);
  return {code:r.code,original_code:r.original_code,source_row:r.source_row,status:exact.length?'網站已有相同坐標，保留來源並避免重複地圖點':matches.length?'同號不同成果或異點，分開核對':'網站未找到同號候選',matches};
 });
 comparisons.push({dataset_id:b.dataset.id,count:rows.length,exactExisting:rows.filter(r=>r.status.startsWith('網站已有')).length,rows});
}
const output=resolve('.local/review-20261012/existing-comparison.json');writeFileSync(output,JSON.stringify(comparisons,null,2));
console.log(JSON.stringify(comparisons.map(({rows,...summary})=>summary),null,2));console.log('詳細比對已寫入 '+output+'；未匯入或刪除資料。');
