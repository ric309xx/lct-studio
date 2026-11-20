// Cloud-only compilation and regression; never deploys a Worker or reads secrets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

if(process.env.NETLIFY!=='true')throw Error('Worker compilation is cloud-only.');
const root=path.resolve(import.meta.dirname,'../..');
const output=path.join(root,'.local/cloud-worker-preview');
await fs.mkdir(output,{recursive:true});
// Reuse Vite's locked esbuild dependency, without installing another version.
const projectRequire=createRequire(path.join(root,'viewer-source/package.json'));
// Resolve Vite's physical pnpm package path before looking up its dependencies.
const viteRequire=createRequire(projectRequire.resolve('vite'));
const {build}=viteRequire('esbuild');
const result=await build({entryPoints:[path.join(root,'workers/private-3d-viewer/src/index.js')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',keepNames:false,charset:'utf8',logLevel:'warning'});
assert.equal(result.outputFiles.length,1);
const bytes=result.outputFiles[0].contents;
const code=result.outputFiles[0].text;
await fs.writeFile(path.join(output,'worker.mjs'),bytes);
// Add test-only exports AFTER compilation; the deployment bytes remain untouched.
const inspected=code+'\nexport {PROJECTS,createCadastralToken,readCadastralToken,APP_JS};\n';
await fs.writeFile(path.join(output,'worker-test.mjs'),inspected);
const imported=await import(pathToFileURL(path.join(output,'worker-test.mjs')));
const sourceStart=imported.APP_JS.indexOf('(function landmarkClient(')+1;
const sourceEnd=imported.APP_JS.lastIndexOf(')(viewer, Cesium,');
assert.ok(sourceStart>0&&sourceEnd>sourceStart,'Embedded landmark client missing');
const embedded=imported.APP_JS.slice(sourceStart,sourceEnd);
// Execute both roles in a tiny DOM, so compiler helpers accidentally captured by
// function.toString() fail here instead of breaking the deployed viewer.
for(const role of ['viewer','admin']){
 let requests=0;
 const nodes=new Map();
 const element=()=>({style:{},append(){},replaceChildren(){},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);}});
 const client=vm.runInNewContext('('+embedded+')',{document:{createElement:element,body:{append(){}}},window:{addEventListener(){}},fetch:async()=>{requests++;return {ok:true,json:async()=>({version:'synthetic',landmarks:[]})};},prompt:()=>null,confirm:()=>false,crypto});
 client({entities:{remove(){},add(){}},scene:{canvas:{},requestRender(){}}},{ScreenSpaceEventHandler:class{setInputAction(){}},ScreenSpaceEventType:{LEFT_CLICK:1}},role,()=>{},{id:'synthetic-project',name:'Synthetic project'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,1);
 assert.equal(nodes.get('.message').textContent,'已讀取共 0 個標的');
}
const tests=[];
for(const name of (await fs.readdir(path.join(root,'workers/private-3d-viewer/test'))).filter(name=>name.endsWith('.test.mjs'))){
 let test=await fs.readFile(path.join(root,'workers/private-3d-viewer/test',name),'utf8');
 for(const module of ['../src/index.js','../src/projects.mjs','../src/cadastral-access.mjs'])test=test.replaceAll(module,'./worker-test.mjs');
 // This test imports the bounded reader directly; use the same source module.
 test=test.replaceAll('../src/login-security.mjs',pathToFileURL(path.join(root,'workers/private-3d-viewer/src/login-security.mjs')).href);
 const file=path.join(output,name);await fs.writeFile(file,test);tests.push(file);
}
const run=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit',windowsHide:true});
if(run.error||run.status!==0)throw Error('Compiled Worker regression failed.');
const manifest={compiledOnly:true,deployed:false,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,projectCount:Object.keys(imported.PROJECTS).length,embeddedClientRolesChecked:['viewer','admin'],testFiles:tests.length};
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Worker cloud artifact verified: '+JSON.stringify(manifest));
