// Rebuild checked-in viewer source without copying local credential files.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'viewer-source');
const envPath=process.argv[2] ? path.resolve(process.argv[2]) : path.join(source,'.env');
if(fs.existsSync(envPath)) {
  for(const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)) {
    const match=line.match(/^(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if(match && !process.env[match[1]])process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
  }
}
if(!process.env.VITE_CESIUM_ION_ACCESS_TOKEN)throw Error('An authorized local viewer .env is required; credentials are never printed.');
process.env.VITE_BASE_PATH='/3d-viewer/';
for(const args of [['node_modules/typescript/bin/tsc','-b'],['node_modules/vite/bin/vite.js','build']]) {
  const result=spawnSync(process.execPath,args,{cwd:source,env:process.env,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
const assets=path.join(source,'dist/assets'),target=path.join(root,'3d-viewer/assets');
const files=fs.readdirSync(assets),entry=files.find(x=>/^viewer-.*\.js$/.test(x)),css=files.find(x=>/^viewer-.*\.css$/.test(x));
if(!entry||!css)throw Error('Missing generated viewer bundle');
const backup=path.join(root,'.codex-tmp','viewer-backup-'+new Date().toISOString().replaceAll(':','-'));
fs.mkdirSync(backup,{recursive:true});
for(const name of ['viewer.js','viewer.css'])if(fs.existsSync(path.join(target,name)))fs.copyFileSync(path.join(target,name),path.join(backup,name));
for(const file of files) {
  const destination=path.join(target,file===entry?'viewer.js':file===css?'viewer.css':file);
  // Lazy PDF chunks import helpers from the entry. Keep those imports valid
  // when publishing the hashed Vite entry under our stable viewer.js name.
  if(file.endsWith('.js'))fs.writeFileSync(destination,fs.readFileSync(path.join(assets,file),'utf8').replaceAll(entry,'viewer.js'));
  else fs.copyFileSync(path.join(assets,file),destination);
}
console.log(JSON.stringify({built:true,entry:entry,css:css,assets:files.length,backup:path.relative(root,backup)}));
