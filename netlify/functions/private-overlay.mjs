import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {readSessions,hasTaoyuan,scopeFor} from '../lib/viewer-auth.mjs';
const project='taoyuan-20261006';
const prefix='/3d-viewer/overlays/';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer',
  'Strict-Transport-Security':'max-age=31536000','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
export function createOverlayHandler(authenticate=async request=>{
  const sessions=readSessions(request,process.env);
  if(!sessions.length)return new Response(null,{status:401});
  const pathname=new URL(request.url).pathname;
  const allowed=sessions.some(session=>pathname.endsWith('/sanxia-solar-2-cadastral.geojson')
    ? scopeFor(session).projects.some(x=>['sanxia-solar-2','sanxia-solar-b3dms'].includes(x.id)) : hasTaoyuan(session));
  return new Response(null,{status:allowed?200:403});
}, load=relative=>readFile(path.join(process.cwd(),'3d-viewer','overlays',relative))) {
  return async request=>{
    const url=new URL(request.url);
    const reply=(message,status)=>new Response(message,{status,headers});
    if(!['GET','HEAD'].includes(request.method))return reply('Method not allowed',405);
    // 不接受任意儲存路徑、URL、編碼路徑或其他專案，先拒絕再碰觸磁碟。
    const relative=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):'';
    if(relative!=='sanxia-solar-2-cadastral.geojson'&&!/^taoyuan-(?:building-overlay\.geojson|(?:1006|1010-v1|1013|1013-cl2-v1|1013-v2|1015|1111-v1)\/(?:[a-z0-9-]+\.geojson|review\/[a-zA-Z0-9._-]+\.(?:jpg|png|webp)))$/.test(relative))return reply('Not found',404);
    const auth=await authenticate(request);
    if(!auth.ok)return reply(auth.status===401?'Unauthorized':'Access unavailable',auth.status);
    // 回應內容與模型讀取權杖均不轉傳給套繪下載端。
    await auth.body?.cancel();
    let bytes;try{bytes=await load(relative);}catch{return reply('Not found',404);}
    const type=relative.endsWith('.geojson')?'application/geo+json; charset=utf-8':relative.endsWith('.png')?'image/png':relative.endsWith('.webp')?'image/webp':'image/jpeg';
    return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,'Content-Type':type,'Content-Length':String(bytes.byteLength)}});
  };
}
export default createOverlayHandler();
export const config={path:[
  '/3d-viewer/overlays/sanxia-solar-2-cadastral.geojson',
  '/3d-viewer/overlays/taoyuan-building-overlay.geojson',
  '/3d-viewer/overlays/taoyuan-1006/*',
  '/3d-viewer/overlays/taoyuan-1010-v1/*',
  '/3d-viewer/overlays/taoyuan-1013/*',
  '/3d-viewer/overlays/taoyuan-1013-cl2-v1/*',
  '/3d-viewer/overlays/taoyuan-1013-v2/*',
  '/3d-viewer/overlays/taoyuan-1015/*',
  '/3d-viewer/overlays/taoyuan-1111-v1/*'
]};
