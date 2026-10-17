// Read-only live model verification; password is supplied via stdin, never logged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [manifestPath,reportPath]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const site='https://lctstudio.tw',base='https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
const project='taoyuan-20261006',route=`/projects/${project}/tiles/`;
let password='';for await(const chunk of process.stdin)password+=chunk;
const login=await fetch(base+'/api/site-access/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({project,role:'viewer',password:password.trim()})});
password='';assert.equal(login.status,200,'viewer login');const access=await login.json();
const headers={Origin:site,Authorization:'Bearer '+access.token};const results=[];
async function request(name,path,status,options={}){
 const r=await fetch(base+path,{headers,...options});assert.equal(r.status,status,name);
 results.push({name,status:r.status,type:r.headers.get('content-type'),range:r.headers.get('content-range'),cache:r.headers.get('cache-control')});return r;
}
await request('cl2 anonymous blocked',route+'1013-cl2/tileset.json',401,{headers:{Origin:site}});
const root=await request('cl2 root',route+'1013-cl2/tileset.json',200);
assert.equal(createHash('sha256').update(Buffer.from(await root.arrayBuffer())).digest('hex'),manifest.objects.find(x=>x.relative==='tileset.json').sha256);
const tiles=manifest.objects.filter(x=>x.relative.endsWith('.b3dm'));
for(const sample of [tiles[0],tiles.at(-1)]){
 const r=await request('cl2 deep Range '+sample.relative,route+'1013-cl2/'+sample.relative,206,{headers:{...headers,Range:'bytes=0-31'}});
 const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,32);assert.equal(bytes.subarray(0,4).toString(),'b3dm');
 await request('cl2 deep HEAD '+sample.relative,route+'1013-cl2/'+sample.relative,200,{method:'HEAD'});
}
await request('1013-1 v2 retained',route+'1013-v2/tileset.json',200);
await request('1013 v1 retained',route+'1013/tileset.json',200);
await request('other project denied','/projects/longteng-20260906/tiles/tileset.json',401);
const report={verifiedAt:new Date().toISOString(),rootSha256Matched:true,results};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
