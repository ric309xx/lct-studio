// 使用現有套件檔案建立隔離建置環境，不下載或安裝新套件、不改 OneDrive 連結。
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'viewer-source'),store=path.join(source,'node_modules/.pnpm');
const target=path.resolve(process.argv[2]??path.join(root,'.codex-tmp/security-runtime'));
if(!target.startsWith(path.join(root,'.codex-tmp')+path.sep))throw Error('隔離環境必須位於專案的暫存目錄');
const require=createRequire(import.meta.url);
const semver=require(path.join(store,'semver@7.8.5/node_modules/semver'));
const packages=new Map();
for(const entry of fs.readdirSync(store)){
  const nm=path.join(store,entry,'node_modules');if(!fs.existsSync(nm))continue;
  for(const name of fs.readdirSync(nm)){
    if(name.startsWith('.'))continue;const item=path.join(nm,name);
    const candidates=name.startsWith('@')?fs.readdirSync(item).map(x=>path.join(item,x)):[item];
    for(const dir of candidates){try{const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));const list=packages.get(meta.name)??[];list.push({dir,meta});packages.set(meta.name,list);}catch{}}
  }
}
const picks=new Map();const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
const required={...manifest.dependencies,...manifest.devDependencies};
for(const [name,list]of packages){list.sort((a,b)=>semver.rcompare(a.meta.version,b.meta.version));picks.set(name,list.find(x=>!required[name]||semver.satisfies(x.meta.version,required[name]))??list[0]);}
const nm=path.join(target,'node_modules');fs.mkdirSync(nm,{recursive:true});let copied=0;
function copyPackage(pkg,destination,ancestors=[]){
  const marker=path.join(destination,'.lct-existing-package');
  if(!fs.existsSync(marker)){
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.cpSync(pkg.dir,destination,{recursive:true,filter:src=>{
      const relative=path.relative(pkg.dir,src);return !relative.split(path.sep).includes('node_modules')&&!fs.lstatSync(src).isSymbolicLink();
    }});
    fs.writeFileSync(marker,pkg.meta.version);copied++;
  }
  const chain=[...ancestors,pkg.meta.name+'@'+pkg.meta.version];
  for(const [name,range]of Object.entries({...pkg.meta.dependencies,...pkg.meta.optionalDependencies})){
    const global=picks.get(name);if(global&&semver.satisfies(global.meta.version,range))continue;
    const local=packages.get(name)?.find(x=>semver.satisfies(x.meta.version,range));
    if(!local||chain.includes(name+'@'+local.meta.version))continue;
    copyPackage(local,path.join(destination,'node_modules',name),chain);
  }
}
for(const [name,pkg]of picks)copyPackage(pkg,path.join(nm,name));
for(const name of ['src','public'])fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true,filter:src=>!/(DESKTOP-|LAPTOP-)/.test(src)});
for(const file of ['package.json','index.html','tsconfig.json','tsconfig.app.json','tsconfig.node.json','vite.config.ts'])fs.copyFileSync(path.join(source,file),path.join(target,file));
// 個別舊測試會讀取專案外業稽核檔，僅在隔離副本調整為實際專案位置。
for(const file of fs.readdirSync(path.join(target,'src')).filter(x=>/\.test\.tsx?$/.test(x))){
  const p=path.join(target,'src',file);
  let code=fs.readFileSync(p,'utf8');
  code=code.replaceAll('../analysis/',root.replaceAll('\\','/')+'/analysis/');
  code=code.replaceAll('../../3d-viewer/',pathToFileURL(path.join(root,'3d-viewer')+path.sep).href);
  fs.writeFileSync(p,code);
}
// 同版本套件缺少一個產生後的 shader，從已安裝的完整 build 原樣還原。
const shader=path.join(nm,'@cesium/engine/Source/Shaders/BufferPolylineMaterialFS.js');
if(!fs.existsSync(shader)){
  const built=fs.readFileSync(path.join(nm,'cesium/Build/CesiumUnminified/index.js'),'utf8');
  const match=built.match(/var BufferPolylineMaterialFS_default\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*');/);
  if(!match)throw Error('無法從既有套件還原缺少的 shader');
  fs.writeFileSync(shader,'export default '+match[1]+';\n');
}
console.log(JSON.stringify({target,existingPackages:picks.size,copiedPackages:copied,newPackagesInstalled:0}));
