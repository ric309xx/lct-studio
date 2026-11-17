// 僅發布允許清單，不將儲存庫根目錄或 OneDrive 衝突副本上傳。
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const out = path.join(root,'.site-dist');
const manifestPath=path.join(root,'3d-viewer/assets-manifest.json');
const viewerAssets=fs.existsSync(manifestPath)?new Set(JSON.parse(fs.readFileSync(manifestPath,'utf8'))):null;
if (path.dirname(out) !== root || path.basename(out) !== '.site-dist') throw Error('Invalid output path');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
const excluded = /(?:DESKTOP-|LAPTOP-|原始|備選|_original|(?:^|\/)\.[^/]+|\.map$)/i;
const types = new Set(['.html','.js','.css','.json','.geojson','.png','.jpg','.jpeg','.webp','.svg','.gif','.ico','.woff','.woff2','.ttf','.otf','.mp4','.webm','.wasm','.xml','.txt']);
function copy(relative) {
  const source = path.join(root,relative), target = path.join(out,relative);
  if (excluded.test(relative.replaceAll('\\','/'))) return;
  // 只使用穩定入口，避免舊版 bundle 仍能透過舊網址下載。
  if (/^3d-viewer[\\/]assets[\\/]viewer-[^\\/]+\.(js|css)$/.test(relative)) return;
  if (viewerAssets&&/^3d-viewer[\\/]assets[\\/]/.test(relative)&&!viewerAssets.has(path.basename(relative)))return;
  // 桃園套繪改由驗證 Cookie 的 Function 提供，不放入公開靜態目錄。
  if (/^3d-viewer[\\/]overlays[\\/]/.test(relative)) return;
  const stat = fs.lstatSync(source);
  // OneDrive 檔案帶有重新剖析屬性；僅拒絕實際的符號連結。
  if (stat.isSymbolicLink()) throw Error('Unexpected link: '+relative);
  if (stat.isDirectory()) { for (const name of fs.readdirSync(source)) copy(path.join(relative,name)); return; }
  if (!types.has(path.extname(relative).toLowerCase())) return;
  fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(source,target);
}
for (const file of ['index.html','robots.txt','sitemap.xml','archive/index.html','archive/archive.js','archive/archive.css','archive/archive-video.css',
  '3d-viewer/index.html','3d-viewer/access-gate.js','3d-viewer/access-gate.css','3d-viewer/site-auth.js']) copy(file);
for (const dir of ['public/assets','public/css','public/js','public/photos','public/videos','3d-viewer/assets','3d-viewer/cesium','3d-viewer/cesium-1.143.0','3d-viewer/overlays']) if(fs.existsSync(path.join(root,dir)))copy(dir);
for (const name of fs.readdirSync(path.join(root,'3d-viewer/p'))) {
  const entry=path.join('3d-viewer/p',name,'index.html'); if(fs.existsSync(path.join(root,entry)))copy(entry);
}
for (const file of ['your-hero-video4.mp4','your-hero-video4.webm','your-hero-video4.jpg'])copy(path.join('background',file));
// 沿用各頁現有政策，並以 HTTP 標頭補上 meta 不支援的 frame-ancestors。
const policies=[];
for(const [file,routes] of [['index.html',['/','/index.html']],['archive/index.html',['/archive/*']]]) {
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const policy=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];
  if(!policy)throw Error('Missing CSP in '+file);
  for(const route of routes)policies.push(route+'\n  Content-Security-Policy: '+policy+"; frame-ancestors 'none'");
}
// Cesium、PDF 與多來源底圖先觀察違規訊息，確認後再收緊為強制政策。
policies.push("/3d-viewer/*\n  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
fs.writeFileSync(path.join(out,'_headers'),policies.join('\n\n')+'\n');
console.log('Public website prepared in .site-dist; repository source and local copies excluded.');
