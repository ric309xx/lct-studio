import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash,pbkdf2Sync} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGateway} from '../../netlify/lib/viewer-gateway.mjs';
import {catalog,readSession,readSessions,writeSession,scopeFor,allowedAsset,COOKIE} from '../../netlify/lib/viewer-auth.mjs';
const origin='https://lctstudio.tw',entry=catalog.entries.Y8nA4rK2mP7x;
const salt='a'.repeat(32),password='synthetic-password';
const digest=createHash('sha256').update(password).digest('hex');
const verifier={algorithm:'pbkdf2-sha256',iterations:600000,salt,hash:pbkdf2Sync(password,salt,600000,32,'sha256').toString('hex')};
const env={VIEWER_SESSION_SECRET:randomBytes(32).toString('hex'),VIEWER_R2_SERVICE_PASSWORD:'synthetic-r2-service-password',VIEWER_ACCESS_CREDENTIALS:JSON.stringify({[entry.accessId]:verifier})};
const request=(action,body={},extra={})=>new Request(origin+'/api/viewer-session/'+action,{method:'POST',headers:{origin,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const upstream=async(_url,options)=>{const body=JSON.parse(options.body);return Response.json({project:body.project,role:body.role??'admin',sessionToken:'synthetic-upstream-session',token:'synthetic-short-read',expiresAt:Math.floor(Date.now()/1000)+600,sessionExpiresAt:Math.floor(Date.now()/1000)+3600});};
const handler=()=>createGateway({env:()=>env,fetchUpstream:upstream,loadData:async()=>[]});

test('preview requires its exact explicit origin and keeps upstream on the production allowlist',async()=>{
 const preview='https://security-preview-20261118--lct-studio.netlify.app';
 const req=(host=preview,source=host)=>new Request(host+'/api/viewer-session/login',{method:'POST',headers:{origin:source,'Content-Type':'application/json'},body:JSON.stringify({accessId:'admin',password})});
 assert.equal((await handler()(req())).status,403);
 let seen=[];
 const gateway=createGateway({env:()=>({...env,VIEWER_PREVIEW_ORIGIN:preview}),fetchUpstream:async(url,options)=>{seen.push(options.headers.Origin);return upstream(url,options);},loadData:async()=>[]});
 assert.equal((await gateway(req())).status,200);
 assert.ok(seen.length>0);assert.ok(seen.every(x=>x===origin));
 assert.equal((await gateway(req(preview,'https://attacker.example'))).status,403);
 assert.equal((await gateway(req('https://other--lct-studio.netlify.app'))).status,403);
 const arbitrary=createGateway({env:()=>({...env,VIEWER_PREVIEW_ORIGIN:'https://attacker.example'}),fetchUpstream:upstream});
 assert.equal((await arbitrary(req('https://attacker.example'))).status,403);
});
test('分享登入在後端驗證且目錄僅包含該專案，角色參數不能提權',async()=>{
 const r=await handler()(request('login',{accessId:entry.accessId,password,role:'admin'}));assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.role,'viewer');assert.equal(body.sessionToken,undefined);assert.equal(body.r2,null);assert.deepEqual(body.data,{});
 assert.deepEqual(body.projects.map(x=>x.id),[entry.projectId]);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const session=readSession(new Request(origin,{headers:{cookie:r.headers.get('set-cookie')}}),env);assert.equal(session.role,'viewer');
 assert.ok(allowedAsset(session,5124638));assert.equal(allowedAsset(session,5105006),false);
});
test('管理員須通過既有伺服器登入，長效上游憑證不傳回 JSON',async()=>{
 const r=await handler()(request('login',{accessId:'admin',password}));assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.role,'admin');assert.equal(body.projects.length,catalog.projects.length);assert.equal(body.r2.token,'synthetic-short-read');
 assert.doesNotMatch(JSON.stringify(body),/synthetic-upstream-session/);
});
test('錯誤密碼、未知分享與缺少設定均拒絕，不退回前端驗證',async()=>{
 assert.equal((await handler()(request('login',{accessId:entry.accessId,password:'wrong'}))).status,401);
 assert.equal((await handler()(request('login',{accessId:'unknown',password}))).status,404);
 assert.equal((await createGateway({env:()=>({})})(request('login',{accessId:entry.accessId,password}))).status,503);
});
test('刷新只接受 Cookie，不採用瀏覽器提交的 bearer 或角色',async()=>{
 assert.equal((await handler()(request('refresh',{sessionToken:'fake',role:'admin'},{authorization:'Bearer fake'}))).status,401);
 const issued=writeSession({role:'viewer',accessId:entry.accessId},env);
 const r=await handler()(request('refresh',{accessId:entry.accessId,role:'admin'},{cookie:issued.cookie}));assert.equal(r.status,200);assert.equal((await r.json()).role,'viewer');assert.equal(r.headers.get('set-cookie'),null);
 assert.equal((await handler()(request('refresh',{accessId:'admin'},{cookie:issued.cookie}))).status,401);
});
test('Cookie 篡改、過期與簽章密鑰輪換均失效',()=>{
 const issued=writeSession({role:'viewer',accessId:entry.accessId},env,100);
 const req=new Request(origin,{headers:{cookie:issued.cookie}});assert.equal(readSession(req,env,50000),null);
 assert.equal(readSession(req,{...env,VIEWER_SESSION_SECRET:'other-secret'.repeat(4)},200),null);
 assert.equal(readSession(new Request(origin,{headers:{cookie:issued.cookie.replace('=','=tampered')}}),env,200),null);
});
test('比較入口含獲准比較的模型，但不包含其他專案',()=>{
 const scope=scopeFor({role:'viewer',accessId:'V6mQ2rL8dK4x'});assert.equal(scope.projects.length,6);assert.equal(scope.comparisons.length,1);
 assert.equal(scope.projects.some(x=>x.id==='taoyuan-building-overlay'),false);
});

test('龍騰出現在管理員目錄，授權分開快取且不進入其他客戶範圍',async()=>{
 const calls=[];const gateway=createGateway({env:()=>env,fetchUpstream:async(url,options)=>{calls.push(JSON.parse(options.body));return upstream(url,options);},loadData:async()=>[]});
 const result=await gateway(request('login',{accessId:'admin',password}));
 assert.equal(result.status,200);const body=await result.json();
 const p=body.projects.find(x=>x.id==='longteng-20260906');
 assert.equal(p.name,'龍騰');assert.equal(p.modelSource.privateProjectId,p.id);assert.equal(p.camera,undefined);
 assert.equal(body.r2Access[p.id].project,p.id);
 assert.equal(calls.filter(x=>x.project===p.id).length,1);
 const cookie=result.headers.get('set-cookie');
 assert.equal((await gateway(request('refresh',{accessId:'admin'},{cookie}))).status,200);
 assert.equal(calls.filter(x=>x.project===p.id).length,1);
 for(const accessId of Object.keys(catalog.entries))assert.equal(scopeFor({role:'viewer',accessId}).projects.some(x=>x.id===p.id),false);
});
test('龍洞比較登入只取得龍洞網格短效授權，不取得桃園控制點資料',async()=>{
 const calls=[];const gateway=createGateway({env:()=>env,fetchUpstream:async(url,options)=>{calls.push(JSON.parse(options.body));return upstream(url,options);},loadData:()=>{throw Error('不得讀取桃園資料');}});
 const issued=writeSession({role:'viewer',accessId:'V6mQ2rL8dK4x'},env);
 const r=await gateway(request('refresh',{accessId:'V6mQ2rL8dK4x',project:'taoyuan-20261006'},{cookie:issued.cookie}));
 assert.equal(r.status,200);const body=await r.json();
 assert.deepEqual(Object.keys(body.r2Access),['longdong-pix4d-mesh-20260805']);assert.deepEqual(body.data,{});
 assert.equal(calls.length,1);assert.equal(calls[0].project,'longdong-pix4d-mesh-20260805');assert.equal(calls[0].role,'viewer');
 assert.doesNotMatch(JSON.stringify(body),/synthetic-r2-service-password|synthetic-upstream-session/);
});
test('不同分享可同時登入；還原及登出只針對指定入口',async()=>{
 const first=writeSession({role:'viewer',accessId:entry.accessId},env);
 const second=writeSession({role:'viewer',accessId:'T7nV2qL9bX4m'},env);
 const cookies=first.cookie.split(';')[0]+'; '+second.cookie.split(';')[0];
 const r=request('refresh',{accessId:'T7nV2qL9bX4m'},{cookie:cookies});
 assert.equal(readSessions(r,env).length,2);assert.equal(readSession(r,env,undefined,'T7nV2qL9bX4m').accessId,'T7nV2qL9bX4m');
 const refreshed=await handler()(r);assert.equal(refreshed.status,200);assert.deepEqual((await refreshed.json()).projects.map(x=>x.id),['sanxia-solar-2']);
 const logout=await handler()(request('logout',{accessId:entry.accessId},{cookie:cookies}));
 assert.ok(logout.headers.get('set-cookie').startsWith(COOKIE+'-'+entry.accessId+'='));assert.doesNotMatch(logout.headers.get('set-cookie'),/T7nV2qL9bX4m/);
});
test('密碼驗證器輪換只撤銷該入口；全域 epoch 輪換撤銷所有登入',()=>{
 const first=writeSession({role:'viewer',accessId:entry.accessId},env);
 const other=writeSession({role:'viewer',accessId:'T7nV2qL9bX4m'},env);
 const admin=writeSession({role:'admin',accessId:'admin'},env);
 const changed={...env,VIEWER_ACCESS_CREDENTIALS:JSON.stringify({[entry.accessId]:{...verifier,hash:'b'.repeat(64)}})};
 const requestFor=cookie=>new Request(origin,{headers:{cookie}});
 assert.equal(readSession(requestFor(first.cookie),changed),null);
 assert.ok(readSession(requestFor(other.cookie),changed));assert.ok(readSession(requestFor(admin.cookie),changed));
 assert.equal(readSession(requestFor(admin.cookie),{...env,VIEWER_AUTH_EPOCH:'rotated'}),null);
});
test('已公開舊密碼的相容模式須明確開啟，不能默認回退',async()=>{
 const legacy={algorithm:'pbkdf2-sha256-of-sha256',iterations:210000,salt,hash:pbkdf2Sync(digest,salt,210000,32,'sha256').toString('hex')};
 const legacyEnv={...env,VIEWER_ACCESS_CREDENTIALS:JSON.stringify({[entry.accessId]:legacy})};
 const gateway=options=>createGateway({env:()=>options});
 assert.equal((await gateway(legacyEnv)(request('login',{accessId:entry.accessId,password}))).status,503);
 assert.equal((await gateway({...legacyEnv,VIEWER_ALLOW_LEGACY_PASSWORDS:'true'})(request('login',{accessId:entry.accessId,password}))).status,200);
 assert.equal((await handler()(request('login',{accessId:'__proto__',password}))).status,404);
});
test('CSRF、過大請求與登出行為正確',async()=>{
 for(const action of ['login','refresh','logout'])assert.equal((await handler()(request(action,{}, {origin:'https://evil.test'}))).status,403);
 assert.equal((await handler()(request('login',{accessId:entry.accessId,password:'x'.repeat(5000)}))).status,400);
 const logout=await handler()(request('logout',{accessId:entry.accessId}));assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
test('瀏覽器只存無秘密提示，還原必須經後端並清除舊版 bearer',async()=>{
 const storage=new Map([['lct-site-cadastral-session-v1','old-secret']]);const calls=[];
 const data={role:'viewer',sessionExpiresAt:Date.now()/1000+3600,access:{role:'viewer',accessId:entry.accessId,projectId:entry.projectId},projects:[catalog.projects[0]],comparisons:[],data:{},r2:null};
 const sandbox={window:{LCT_VIEWER_ACCESS:{accessId:entry.accessId,role:'viewer'}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,JSON,Error,Number,Array,Promise,
 fetch:async(url,options)=>{calls.push({url,options});return Response.json(data);}};
 vm.runInNewContext(fs.readFileSync(new URL('../../3d-viewer/site-auth.js',import.meta.url),'utf8'),sandbox);
 await sandbox.window.LCT_SITE_AUTH.login(password,'viewer');assert.equal(storage.has('lct-site-cadastral-session-v1'),false);
 const saved=JSON.parse([...storage.values()][0]);assert.deepEqual(Object.keys(saved).sort(),['accessId','expiresAt','role']);
 await sandbox.window.LCT_SITE_AUTH.restore(true);assert.equal(calls.at(-1).url,'/api/viewer-session/refresh');assert.equal(calls.at(-1).options.credentials,'same-origin');assert.equal(calls.at(-1).options.headers.Authorization,undefined);
});

test('瀏覽器登出須由伺服器確認，失敗時可重試且不假裝已登出',async()=>{
 const source=fs.readFileSync(new URL('../../3d-viewer/site-auth.js',import.meta.url),'utf8');
 for(const outcome of ['network','rejected','unexpected','success']){
  const storage=new Map();const calls=[];
  const bootstrap={role:'viewer',sessionExpiresAt:Date.now()/1000+3600,access:{role:'viewer',accessId:entry.accessId},projects:[catalog.projects[0]],comparisons:[],data:{},r2:null};
  const sandbox={window:{LCT_VIEWER_ACCESS:{accessId:entry.accessId,role:'viewer'},LCT_VIEWER_BOOTSTRAP:bootstrap},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,JSON,Error,Number,Array,Promise,
   fetch:async(url,options)=>{calls.push({url,options});if(outcome==='network')throw Error('offline');return Response.json(outcome==='success'?{ok:true}:{},{status:outcome==='rejected'?503:200});}};
  vm.runInNewContext(source,sandbox);
  if(outcome==='success'){await sandbox.window.LCT_SITE_AUTH.clear();assert.equal(sandbox.window.LCT_VIEWER_BOOTSTRAP,undefined);}
  else{await assert.rejects(sandbox.window.LCT_SITE_AUTH.clear(),/登出未完成/);assert.equal(sandbox.window.LCT_VIEWER_BOOTSTRAP,bootstrap);}
  assert.equal(calls[0].url,'/api/viewer-session/logout');
  assert.deepEqual(JSON.parse(calls[0].options.body),{accessId:entry.accessId});
  assert.equal(calls[0].options.credentials,'same-origin');
 }
});
