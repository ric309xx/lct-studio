// Read-only production checks. Credentials stay in memory; report only safe evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://lct-private-3d-viewer.private-3d-viewer.workers.dev',project='taoyuan-20261006';
const manifest=JSON.parse(fs.readFileSync('.codex-tmp/taoyuan-building-overlay/1006-model-validation.json','utf8'));
const password=process.env.LCT_R2_VIEWER_PASSWORD;
const evidence={project,checkedAt:new Date().toISOString(),checks:[]};
async function check(name,ok,details={}){evidence.checks.push({name,ok,...details});if(!ok)throw Error('Check failed: '+name);}
const health=await fetch(origin+'/health');await check('health',health.status===200);
const tileRoot=`${origin}/projects/${project}/tiles/`;
const anonymous=await fetch(tileRoot+'tileset.json');await anonymous.arrayBuffer();await check('private-anonymous-denied',anonymous.status===401);
if(process.argv.includes('--anonymous')) {
  for(const id of ['nanya','longteng-20260906','longdong-pointcloud-20260805','heping-seawall-20260922']) {
    const response=await fetch(`${origin}/projects/${id}/tiles/tileset.json`);await response.arrayBuffer();await check('legacy-private-'+id,response.status===401);
  }
  const preflight=await fetch(tileRoot+'tileset.json',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5500','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});await check('preflight',preflight.status===204);
  const blocked=await fetch(tileRoot+'tileset.json',{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid'}});await check('unknown-origin-blocked',blocked.status===403);
  fs.writeFileSync('analysis/20261010-taoyuan-1006/remote-anonymous-verification.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));process.exit(0);
}
if(!password)throw Error('Set an explicitly authorized LCT_R2_VIEWER_PASSWORD; never read credentials from documents.');
const login=await fetch(origin+'/login',{method:'POST',body:new URLSearchParams({password,project}),redirect:'manual'});
const cookie=login.headers.get('set-cookie')?.split(';')[0];await login.arrayBuffer();await check('authorized-project-login',login.status===303 && Boolean(cookie));
const access=await fetch(origin+'/api/cadastral-access?project='+project,{headers:{cookie}});await check('project-token',access.status===200);
const {token}=await access.json(),headers={Authorization:'Bearer '+token,Origin:'http://127.0.0.1:5500'};
const root=await fetch(tileRoot+'tileset.json',{headers}),rootBytes=Buffer.from(await root.arrayBuffer());
await check('root-checksum',root.status===200 && crypto.createHash('sha256').update(rootBytes).digest('hex')===manifest.objects.find(x=>x.relative==='tileset.json').sha256,{status:root.status,contentType:root.headers.get('content-type')});
await check('cors-allowlisted',root.headers.get('access-control-allow-origin')===headers.Origin);
const sample=manifest.objects.find(x=>x.relative.endsWith('.b3dm')),url=tileRoot+sample.relative;
const head=await fetch(url,{method:'HEAD',headers});await check('head-length-type',head.status===200 && Number(head.headers.get('content-length'))===sample.size && head.headers.get('content-type')==='model/vnd.b3dm',{status:head.status,size:sample.size});
const range=await fetch(url,{headers:{...headers,Range:'bytes=0-31'}}),bytes=Buffer.from(await range.arrayBuffer());
await check('range-binary-header',range.status===206 && bytes.length===32 && bytes.subarray(0,4).toString()==='b3dm',{status:range.status,contentRange:range.headers.get('content-range')});
const preflight=await fetch(url,{method:'OPTIONS',headers:{Origin:headers.Origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});await check('preflight',preflight.status===204);
const blocked=await fetch(url,{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid'}});await check('unknown-origin-blocked',blocked.status===403);
for(const id of ['nanya','longteng-20260906','longdong-pointcloud-20260805','heping-seawall-20260922']) {
  const response=await fetch(`${origin}/projects/${id}/tiles/tileset.json`);await response.arrayBuffer();await check('legacy-private-'+id,response.status===401);
}
fs.writeFileSync('analysis/20261010-taoyuan-1006/remote-verification.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence));
