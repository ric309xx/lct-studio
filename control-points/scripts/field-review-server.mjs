// 隔離記憶體資料庫與模擬 GPS／羅盤，只供本機手機介面驗證，絕不部署。
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';import {pbkdf2Sync} from 'node:crypto';
import {createLoginProof} from '../shared/loginProof.mjs';
import {readFileSync,existsSync,statSync} from 'node:fs';import {resolve,extname,sep} from 'node:path';
const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false}),root=resolve('dist'),salt='field-review';
const fixture=`Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok){ok({coords:{longitude:121.1936,latitude:25.064,accuracy:8},timestamp:Date.now()});return setInterval(()=>ok({coords:{longitude:121.1936,latitude:25.064,accuracy:8},timestamp:Date.now()}),2000);},clearWatch(id){clearInterval(id);}}});let attempts=0;Object.defineProperty(window,'DeviceOrientationEvent',{value:{async requestPermission(){if(++attempts===1)return 'denied';setInterval(()=>{const e=new Event('deviceorientationabsolute');Object.defineProperties(e,{absolute:{value:true},alpha:{value:315}});dispatchEvent(e);},500);return 'granted';}}});`;
const assets=async req=>{
  const path=new URL(req.url).pathname;if(path==='/qa-geo.js')return new Response(fixture,{headers:{'Content-Type':'text/javascript'}});
  let file=resolve(root,'.'+path);if(!file.startsWith(root+sep))return new Response('Forbidden',{status:403});if(!existsSync(file)||!statSync(file).isFile())file=resolve(root,'index.html');
  let bytes=readFileSync(file);if(extname(file)==='.html')bytes=Buffer.from(bytes.toString().replace('<head>','<head><script src="/qa-geo.js"></script>'));
  return new Response(bytes,{headers:{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[extname(file)]||'application/octet-stream'}});
};
const mf=new Miniflare(convertV4MiniflareOptions({name:'field-review-only',port:8792,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync('local-review-only',salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:assets}}));
const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
const challenge=await(await mf.dispatchFetch('http://localhost/api/login/challenge',{method:'POST'})).json();
const proof=await createLoginProof('local-review-only',challenge);
const login=await mf.dispatchFetch('http://localhost/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)}),cookie=login.headers.get('set-cookie').split(';')[0];
for(const [id,name,color] of [['leveling-109','109 年一等水準點','#743c92'],['image-control-202610','115年測量控制點','#f2c53d']]){
 const form=new FormData();form.set('source',new File([id],'qa-only.csv'));form.set('payload',JSON.stringify({dataset:{id,name,epsg:4326,metadata:{color,resultYear:id==='leveling-109'?109:115}},records:Array.from({length:8},(_,i)=>({code:i===0?'5004':'D0'+(18+i),name:'本機測試點'+i,east:121.19525732+i*.001,north:25.06837311+i*.0005,category:id==='leveling-109'?'一等水準點':'控制點'}))}));
 const req=new Request('http://localhost/api/import',{method:'POST',headers:{Cookie:cookie},body:form});
 const r=await mf.dispatchFetch(req.url,{method:'POST',headers:Object.fromEntries(req.headers),body:await req.arrayBuffer()});if(!r.ok)throw new Error(await r.text());
}
console.log('隔離手機流程測試：http://127.0.0.1:8792；密碼 local-review-only；GPS／羅盤為測試資料。');
process.on('SIGINT',async()=>{await mf.dispose();process.exit(0);});
