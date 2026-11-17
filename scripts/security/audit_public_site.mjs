// 僅輸出風險位置與數量，絕不輸出密碼、雜湊或權杖實際值。
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const output=path.join(root,'.site-dist');
if(!fs.existsSync(output))throw Error('請先執行 node scripts/build_public_site.mjs');
const findings=[];
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name),relative=path.relative(output,full).replaceAll('\\','/');
    if(entry.isDirectory()){walk(full);continue;}
    if(/(?:^|\/)(?:workers|viewer-source|scripts|netlify|\.local|photos)\//.test(relative) && !relative.startsWith('public/photos/'))findings.push({priority:'P0',issue:'非網站檔案進入發布目錄',file:relative});
    if(/\.(html|js)$/.test(relative)) {
      const source=fs.readFileSync(full,'utf8');
      if(/passwordHash\s*[:=]/.test(source)&&/LCT_VIEWER_ACCESS/.test(source))findings.push({priority:'P0',issue:'分享頁仍含公開密碼雜湊',file:relative});
      if(/VITE_CESIUM_ION_ACCESS_TOKEN/.test(source))findings.push({priority:'P0',issue:'前端仍使用打包的 Cesium ion 權杖設定',file:relative});
      if(source.includes('管理員密碼不正確')&&source.includes('lct-3d-viewer-role'))findings.push({priority:'P0',issue:'疑似遺留前端管理員密碼分支',file:relative});
      if(source.includes('cdn.tailwindcss.com'))findings.push({priority:'P2',issue:'仍載入 Tailwind Play CDN',file:relative});
    }
    if(relative.startsWith('3d-viewer/overlays/')&&relative.endsWith('.geojson'))findings.push({priority:'P1',issue:'GeoJSON 尚為公開靜態檔案，待判定公開範圍並遷移授權',file:relative});
  }
}
walk(output);
const counts={};for(const f of findings)counts[f.priority]=(counts[f.priority]||0)+1;
console.log(JSON.stringify({scope:'本機發布產物；不代表正式站已更新',counts,findings},null,2));
if(process.argv.includes('--strict')&&findings.some(f=>['P0','P1'].includes(f.priority)))process.exitCode=1;
