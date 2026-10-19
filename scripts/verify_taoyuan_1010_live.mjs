// Read-only post-release checks. Password arrives through stdin, never logged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const [manifestDirectory,reportPath]=process.argv.slice(2);
const site='https://lctstudio.tw',base='https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
const route='/projects/taoyuan-20261006/tiles/';
let password='';for await(const chunk of process.stdin)password+=chunk;
const login=await fetch(base+'/api/site-access/login',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({project:'taoyuan-20261006',role:'viewer',password:password.trim()})});
password='';assert.equal(login.status,200,'viewer login');const access=await login.json();
assert.equal(access.role,'viewer');
const headers={Origin:site,Authorization:'Bearer '+access.token},results=[];
async function request(name,path,status,options={}){
 const r=await fetch(base+path,{headers,...options});assert.equal(r.status,status,name);
 results.push({name,status:r.status,type:r.headers.get('content-type'),range:r.headers.get('content-range'),cache:r.headers.get('cache-control')});return r;
}
for(const id of ['1010-cl1','1010-cl2']){
 const manifest=JSON.parse(fs.readFileSync(`${manifestDirectory}/${id}-v1-manifest.json`,'utf8'));
 await request(id+' anonymous blocked',route+id+'/tileset.json',401,{headers:{Origin:site}});
 const r=await request(id+' root',route+id+'/tileset.json',200);
 assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),manifest.objects.find(x=>x.relative==='tileset.json').sha256);
 const tiles=manifest.objects.filter(x=>x.relative.endsWith('.b3dm'));
 for(const sample of [tiles[0],tiles.at(-1)]){
  const r=await request(id+' deep Range '+sample.relative,route+id+'/'+sample.relative,206,{headers:{...headers,Range:'bytes=0-31'}});
  const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.length,32);assert.equal(bytes.subarray(0,4).toString(),'b3dm');
  await request(id+' deep HEAD '+sample.relative,route+id+'/'+sample.relative,200,{method:'HEAD'});
 }
}
for(const id of ['1013','1013-v2','1013-cl2','1015-cl1','1015-cl2']){
 const r=await request(id+' retained',route+id+'/tileset.json',200);await r.arrayBuffer();
}
await request('other project denied','/projects/longteng-20260906/tiles/tileset.json',401);
const report={verifiedAt:new Date().toISOString(),rootSha256Matched:true,results};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
