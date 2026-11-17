// 一次性將既有目錄移到伺服器，秘密僅寫入被忽略的本機遷移檔。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(import.meta.url);
const ts=require(path.join(root,'viewer-source/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/typescript.js'));
const target=path.join(root,'netlify/private/catalog.json');
const secretFile=path.join(root,'.local/security-migration/netlify-secrets.json');
if(fs.existsSync(target))throw Error('遷移檔已存在，請勿重複覆寫。');
const source=fs.readFileSync(path.join(root,'viewer-source/src/projects.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports});
const projects=exports.createProjectCatalog({type:'cesium-ion',assetId:5094702});
const comparisons=exports.createComparisonCatalog();
const entries={},credentials={};
for(const dir of fs.readdirSync(path.join(root,'3d-viewer/p'))){
  const file=path.join(root,'3d-viewer/p',dir,'index.html');if(!fs.existsSync(file))continue;
  const html=fs.readFileSync(file,'utf8');
  const match=html.match(/window\.LCT_VIEWER_ACCESS\s*=\s*({[\s\S]*?});/);if(!match)throw Error('分享設定缺失：'+dir);
  const config=vm.runInNewContext('('+match[1]+')');
  const {passwordHash,...entry}=config;
  entries[entry.accessId]={...entry,path:'/3d-viewer/p/'+dir+'/'};
  if(passwordHash){const salt=randomBytes(16).toString('hex');credentials[entry.accessId]={algorithm:'pbkdf2-sha256-of-sha256',iterations:210000,salt,hash:pbkdf2Sync(passwordHash,salt,210000,32,'sha256').toString('hex')};}
}
const bundle=fs.readFileSync(path.join(root,'3d-viewer/assets/viewer.js'),'utf8');
const token=bundle.match(/VITE_CESIUM_ION_ACCESS_TOKEN\s*:\s*["']([^"']+)["']/)?.[1];
if(!token)throw Error('找不到舊權杖設定；未輸出任何秘密。');
const secrets={VIEWER_SESSION_SECRET:randomBytes(32).toString('hex'),VIEWER_ACCESS_CREDENTIALS:JSON.stringify(credentials),CESIUM_ION_ACCESS_TOKEN:token};
fs.mkdirSync(path.dirname(secretFile),{recursive:true});
fs.writeFileSync(secretFile,JSON.stringify(secrets,null,2)+'\n',{flag:'wx'});
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify({projects,comparisons,entries},null,2)+'\n');
console.log(JSON.stringify({projects:projects.length,comparisons:comparisons.length,shares:Object.keys(entries).length,compatibleVerifiers:Object.keys(credentials).length,secretsPrinted:false}));
