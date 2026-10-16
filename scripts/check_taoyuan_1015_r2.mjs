import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
const project='taoyuan-20261006',site='https://lctstudio.tw';
const evidence={checkedAt:new Date().toISOString(),checks:[]};
function check(name,ok,details={}){evidence.checks.push({name,ok,...details});if(!ok)throw Error('Failed: '+name);}
const login=await fetch(origin+'/api/site-access/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({project,role:'viewer',password:process.env.LCT_R2_VIEWER_PASSWORD})});
check('website-viewer-login',login.status===200);
const access=await login.json(),headers={Origin:site,Authorization:'Bearer '+access.token};
for(const n of [1,2]) {
 const manifest=JSON.parse(fs.readFileSync(`../1015-cl${n}-manifest.json`,'utf8'));
 const url=`${origin}/projects/${project}/tiles/1015-cl${n}/`;
 const anonymous=await fetch(url+'tileset.json');await anonymous.arrayBuffer();check(`cl${n}-anonymous-denied`,anonymous.status===401);
 const root=await fetch(url+'tileset.json',{headers}),bytes=Buffer.from(await root.arrayBuffer());
 check(`cl${n}-root-integrity`,root.status===200 && crypto.createHash('sha256').update(bytes).digest('hex')===manifest.objects.find(o=>o.relative==='tileset.json').sha256,{status:root.status,contentType:root.headers.get('content-type')});
 check(`cl${n}-cors`,root.headers.get('access-control-allow-origin')===site);
 const sample=manifest.objects.find(o=>o.relative.endsWith('.b3dm'));
 const head=await fetch(url+sample.relative,{headers,method:'HEAD'});
 const headDetails={status:head.status,length:head.headers.get('content-length'),type:head.headers.get('content-type'),expectedSize:sample.size};
 check(`cl${n}-head`,head.status===200 && head.headers.get('content-type')==='model/vnd.b3dm' && (headDetails.length===null || Number(headDetails.length)===sample.size),headDetails);
 const full=await fetch(url+sample.relative,{headers}),fullBytes=Buffer.from(await full.arrayBuffer());
 check(`cl${n}-tile-integrity`,full.status===200 && fullBytes.length===sample.size && crypto.createHash('sha256').update(fullBytes).digest('hex')===sample.sha256);
 const range=await fetch(url+sample.relative,{headers:{...headers,Range:'bytes=0-31'}}),b=Buffer.from(await range.arrayBuffer());
 check(`cl${n}-range`,range.status===206 && b.length===32 && b.toString('ascii',0,4)==='b3dm' && range.headers.get('content-range')===`bytes 0-31/${sample.size}`,{contentRange:range.headers.get('content-range')});
}
for(const source of ['tileset.json','1013/tileset.json']) {
 const r=await fetch(`${origin}/projects/${project}/tiles/${source}`,{headers});await r.arrayBuffer();check(`previous-${source}`,r.status===200);
}
fs.writeFileSync('analysis/20261016-taoyuan-1015/remote-verification.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
