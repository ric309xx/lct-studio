import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {readLimitedText} from '../src/login-security.mjs';
const call=(path,options={},env={})=>worker.fetch(new Request('https://worker.test'+path,options),env);
test('both login routes stop before credentials or storage when rate limited',async()=>{
  const keys=[];const env={LOGIN_RATE_LIMITER:{async limit({key}){keys.push(key);return {success:false};}}};
  for(const [path,origin] of [['/login','https://worker.test'],['/api/site-access/login','https://lctstudio.tw']]) {
    const result=await call(path,{method:'POST',headers:{origin,'cf-connecting-ip':'192.0.2.1'},body:'{}'},env);
    assert.equal(result.status,429);assert.equal(result.headers.get('retry-after'),'60');
    assert.equal(result.headers.get('strict-transport-security'),'max-age=31536000');
  }
  assert.equal(keys[0],keys[1]);assert.doesNotMatch(keys[0],/192\.0\.2\.1/);
});
test('missing or failed rate limiter fails closed',async()=>{
  for(const env of [{},{LOGIN_RATE_LIMITER:{async limit(){throw Error('synthetic');}}}]) {
    assert.equal((await call('/login',{method:'POST',headers:{origin:'https://worker.test'}},env)).status,503);
  }
});
test('login and logout reject cross-origin POST and missing Origin',async()=>{
  for(const path of ['/login','/logout'])for(const headers of [{},{origin:'https://evil.test'}])assert.equal((await call(path,{method:'POST',headers})).status,403);
});
test('body cap applies to streamed bytes without Content-Length',async()=>{
  await assert.rejects(()=>readLimitedText(new Request('https://worker.test',{method:'POST',body:'界'.repeat(1500)})),RangeError);
});
test('all response types include security headers and robots exclusion',async()=>{
  for(const path of ['/','/health','/missing','/projects/nanya/tiles/tileset.json','/app.js']) {
    const r=await call(path);assert.equal(r.headers.get('strict-transport-security'),'max-age=31536000');
    assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');assert.equal(r.headers.get('x-frame-options'),'DENY');
  }
});
