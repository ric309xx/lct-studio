import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../../netlify/lib/viewer-auth.mjs';
import {checkReleaseConfig} from '../../netlify/lib/release-config.mjs';
const ready=()=>({VIEWER_SESSION_SECRET:'synthetic-signing-secret'.repeat(3),VIEWER_AUTH_EPOCH:'synthetic-epoch-1',VIEWER_R2_SERVICE_PASSWORD:'synthetic-r2-service-password',CESIUM_ION_ACCESS_TOKEN:'synthetic-server-only-asset-token',VIEWER_ACCESS_CREDENTIALS:JSON.stringify(Object.fromEntries(Object.values(catalog.entries).filter(x=>x.projectId!=='taoyuan-building-overlay').map(x=>[x.accessId,{algorithm:'pbkdf2-sha256',iterations:600000,salt:'a'.repeat(32),hash:'b'.repeat(64)}])))});
test('正式環境不得沿用占位權杖或舊密碼相容模式',()=>{
 assert.equal(checkReleaseConfig(ready()).ready,true);
 for(const changed of [{CESIUM_ION_ACCESS_TOKEN:'REPLACE_WITH_NEW_ION_TOKEN'},{VIEWER_ALLOW_LEGACY_PASSWORDS:'true'},{VIEWER_AUTH_EPOCH:''},{VIEWER_SESSION_SECRET:'short'}])assert.equal(checkReleaseConfig({...ready(),...changed}).ready,false);
});
test('任何一個分享入口缺少安全驗證器，都不能視為可部署',()=>{
 const env=ready();const entries=JSON.parse(env.VIEWER_ACCESS_CREDENTIALS);delete entries.Y8nA4rK2mP7x;
 const result=checkReleaseConfig({...env,VIEWER_ACCESS_CREDENTIALS:JSON.stringify(entries)});
 assert.equal(result.ready,false);assert.ok(result.issues.includes('VIEWER_ACCESS_CREDENTIALS:Y8nA4rK2mP7x'));
 assert.doesNotMatch(JSON.stringify(result),/synthetic-signing-secret|bbbbbbbbbbbbbbbb/);
});
