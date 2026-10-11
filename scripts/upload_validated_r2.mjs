// Upload only an already validated 3D Tiles tree to an explicit private prefix.
// Reuse Wrangler's local OAuth session; never print or persist credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const [manifestFile, prefix, resultFile, mode = '--check'] = process.argv.slice(2);
if (!manifestFile || !resultFile || !/^projects\/taoyuan\/20261006-v1\/terra_b3dms$/.test(prefix ?? '')) {
  throw Error('Expected validation manifest, fixed new Taoyuan prefix, and local results path.');
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (manifest.unreachable.length || manifest.objectCount !== manifest.objects.length) throw Error('Invalid manifest');
const configPath = path.join(os.homedir(), 'AppData/Roaming/xdg.config/.wrangler/config/default.toml');
const config = fs.readFileSync(configPath, 'utf8');
const oauth = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!oauth) throw Error('Wrangler login is required');
const workerConfig = JSON.parse(fs.readFileSync('workers/private-3d-viewer/wrangler.jsonc', 'utf8'));
const bucket = workerConfig.r2_buckets.find(x => x.binding === 'MODELS').bucket_name;
const accountResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {headers:{Authorization:`Bearer ${oauth}`}});
const accounts = await accountResponse.json();
if (!accounts.success || accounts.result.length !== 1) throw Error('Cannot uniquely resolve authorized account');
const base = `https://api.cloudflare.com/client/v4/accounts/${accounts.result[0].id}/r2/buckets/${bucket}/objects/`;
const endpoint = relative => base + `${prefix}/${relative}`.split('/').map(encodeURIComponent).join('/');
const headers = {Authorization: `Bearer ${oauth}`};
const previous = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile,'utf8')) : null;
if (previous && (previous.prefix !== prefix || previous.root !== manifest.root)) throw Error('Resume target mismatch');
const completed = new Map((previous?.completed ?? []).map(x=>[x.relative,x]));
const rootCheck = await fetch(endpoint('tileset.json'), {headers});
if (rootCheck.status !== 404 && !previous) throw Error(`New prefix already exists or cannot be checked (${rootCheck.status}); refusing overwrite`);
await rootCheck.arrayBuffer();
if (mode !== '--upload') {
  console.log(JSON.stringify({bucket,prefix,objects:manifest.objectCount,bytes:manifest.bytes,rootStatus:rootCheck.status,upload:false}));
  process.exit(0);
}
let cursor=0, bytes=0, nextRequest=Date.now(), count=0;
const failures=[];
const checkpoint=()=>fs.writeFileSync(resultFile,JSON.stringify({bucket,prefix,root:manifest.root,updatedAt:new Date().toISOString(),completed:[...completed.values()],failures},null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function throttle(){const wait=Math.max(0,nextRequest-Date.now());nextRequest=Math.max(Date.now(),nextRequest)+220;await delay(wait);}
async function upload(item){
  const full=path.join(manifest.root,item.relative);
  const body=fs.readFileSync(full);
  if(body.length!==item.size || crypto.createHash('sha256').update(body).digest('hex')!==item.sha256) throw Error(`Source changed: ${item.relative}`);
  const type=item.relative.endsWith('.json')?'application/json; charset=utf-8':item.relative.endsWith('.b3dm')?'model/vnd.b3dm':'application/octet-stream';
  for(let attempt=0;attempt<8;attempt++){
    await throttle();
    let response;
    try { response=await fetch(endpoint(item.relative),{method:'PUT',headers:{...headers,'Content-Type':type},body,signal:AbortSignal.timeout(90000)}); }
    catch {if(attempt===7)throw Error(`Network upload failed: ${item.relative}`);await delay(3000*(attempt+1));continue;}
    const status=response.status;await response.arrayBuffer();
    if(status>=200 && status<300)return;
    if(status===401 || status===403)throw Error(`Authorization failed (${status})`);
    if(attempt===7)throw Error(`Upload failed (${status}): ${item.relative}`);
    await delay(status===429?60000:3000*(attempt+1));
  }
}
// Publish the root descriptor last, after its entire tree is uploaded.
const queue=manifest.objects.filter(x=>x.relative!=='tileset.json');
async function run(){while(cursor<queue.length){const item=queue[cursor++];if(completed.get(item.relative)?.sha256===item.sha256)continue;try{await upload(item);completed.set(item.relative,{relative:item.relative,sha256:item.sha256,size:item.size});bytes+=item.size;count++;if(count%50===0){checkpoint();console.log(JSON.stringify({uploaded:completed.size,total:manifest.objectCount,newBytes:bytes}));}}catch(error){failures.push({relative:item.relative,message:error.message});checkpoint();if(/Authorization/.test(error.message))throw error;}}}
checkpoint();
await Promise.all(Array.from({length:5},run));
if(failures.length){checkpoint();throw Error(`${failures.length} uploads failed; see local results`);}
const root=manifest.objects.find(x=>x.relative==='tileset.json');
await upload(root);completed.set(root.relative,{relative:root.relative,sha256:root.sha256,size:root.size});checkpoint();
for(const item of [root,...queue.filter(x=>x.relative.endsWith('.b3dm')).filter((_,i)=>i%1000===0)]){
  const response=await fetch(endpoint(item.relative),{headers});
  if(!response.ok)throw Error(`Verification GET failed (${response.status})`);
  const actual=crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if(actual!==item.sha256)throw Error(`Remote checksum mismatch: ${item.relative}`);
}
console.log(JSON.stringify({complete:true,bucket,prefix,objects:completed.size,bytes:manifest.bytes,sampledRemoteChecksums:true}));
