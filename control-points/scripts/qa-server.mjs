// An isolated local app for browser upload/offline testing. No production state.
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {build} from 'esbuild';import {readFileSync,mkdirSync,existsSync,statSync} from 'node:fs';import {pbkdf2Sync} from 'node:crypto';import {resolve,extname,sep} from 'node:path';
const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false}),salt='local-qa-salt';
mkdirSync('.local/browser-qa',{recursive:true});
const assetRoot=resolve('dist');
const assets=async(req)=>{let target=resolve(assetRoot,'.'+new URL(req.url).pathname);if(!target.startsWith(assetRoot+sep)&&target!==assetRoot)return new Response('Forbidden',{status:403});if(!existsSync(target)||!statSync(target).isFile())target=resolve(assetRoot,'index.html');const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[extname(target)]||'application/octet-stream';return new Response(readFileSync(target),{headers:{'Content-Type':mime}});};
const mf=new Miniflare({...convertV4MiniflareOptions({name:'browser-qa',port:8790,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],d1Persist:'.local/browser-qa/d1',r2Persist:'.local/browser-qa/r2',bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync('local-qa-only',salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:assets}}),resourcePersistencePath:resolve('.local/browser-qa/state')});
const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
if(!(await db.prepare('SELECT id FROM datasets LIMIT 1').first())){
  const login=await mf.dispatchFetch('http://localhost/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'local-qa-only'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const form=new FormData();form.set('source',new File(['disposable test fixture'],'local-qa.txt'));form.set('payload',JSON.stringify({dataset:{id:'zhongli-bade',name:'瀏覽器測試資料（獨立環境）',epsg:3826,height_type:'橢球高'},records:[{code:'QA001',original_code:'QA-ORIG',east:250000,north:2770000,height:10,description:'獨立測試用點位，不屬於首批正式資料',category:'測試點'}]}));
  const req=new Request('http://localhost/api/import',{method:'POST',headers:{Cookie:cookie},body:form}),r=await mf.dispatchFetch(req.url,{method:'POST',headers:Object.fromEntries(req.headers),body:await req.arrayBuffer()});if(!r.ok)throw new Error(await r.text());
}
console.log('獨立瀏覽器測試環境：http://127.0.0.1:8790');
process.on('SIGINT',async()=>{await mf.dispose();process.exit(0);});
