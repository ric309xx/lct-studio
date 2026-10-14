// 使用記憶體中的隔離資料庫預覽候選成果，關閉程序即清除測試資料。
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {build} from 'esbuild';
import {readFileSync,existsSync,statSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pbkdf2Sync} from 'node:crypto';
const batches=JSON.parse(readFileSync('.local/review-20261012/review-batches.json','utf8'));
const bundle=await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
const assetRoot=resolve('dist'),salt='review-only-salt';
const assets=async req=>{
 let target=resolve(assetRoot,'.'+new URL(req.url).pathname);
 if(!target.startsWith(assetRoot+sep))return new Response('Forbidden',{status:403});
 if(!existsSync(target)||!statSync(target).isFile())target=resolve(assetRoot,'index.html');
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[extname(target)]||'application/octet-stream';
 return new Response(readFileSync(target),{headers:{'Content-Type':mime}});
};
const mf=new Miniflare(convertV4MiniflareOptions({name:'review-only',port:8791,modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['FILES'],bindings:{PASSWORD_SALT:salt,PASSWORD_HASH:pbkdf2Sync('local-review-only',salt,100000,32,'sha256').toString('hex'),APP_ENV:'test'},serviceBindings:{ASSETS:assets}}));
const db=await mf.getD1Database('DB');await db.exec(readFileSync('schema.sql','utf8'));
const login=await mf.dispatchFetch('http://localhost/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'local-review-only'})});
const cookie=login.headers.get('set-cookie').split(';')[0];
for(const b of batches){
 const form=new FormData();form.set('source',new File([readFileSync(b.file)],b.file.split(/[\\/]/).pop()));form.set('payload',JSON.stringify({dataset:b.dataset,records:b.records}));
 const req=new Request('http://localhost/api/import',{method:'POST',headers:{Cookie:cookie},body:form});
 const r=await mf.dispatchFetch(req.url,{method:'POST',headers:Object.fromEntries(req.headers),body:await req.arrayBuffer()});
 if(!r.ok)throw new Error(await r.text());console.log(b.dataset.id,await r.text());
}
const points=(await db.prepare('SELECT * FROM points').all()).results;let total=0;
for(const b of batches){
 const ps=points.filter(p=>p.dataset_id===b.dataset.id),byCode=new Map(ps.map(p=>[p.code,p]));
 if(ps.length!==b.records.length)throw new Error('匯入點數不一致');
 for(const r of b.records){const p=byCode.get(r.code);if(!p||p.north!==r.north||p.east!==r.east||p.height!==r.height||p.original_code!==r.original_code||JSON.stringify(JSON.parse(p.raw))!==JSON.stringify(r.raw))throw new Error(`逐筆驗證失敗 ${b.dataset.id}:${r.code}`);}
 total+=ps.length;
}
writeFileSync('.local/review-20261012/local-verification.json',JSON.stringify({verifiedRecords:total,verifiedAt:new Date().toISOString(),environment:'獨立記憶體 D1／R2，未連線正式網站'},null,2));
console.log(`已逐筆核對 ${total} 筆原點號、N/E、高度與完整屬性。本機預覽：http://127.0.0.1:8791 ，測試密碼 local-review-only`);
process.on('SIGINT',async()=>{await mf.dispose();process.exit(0);});
