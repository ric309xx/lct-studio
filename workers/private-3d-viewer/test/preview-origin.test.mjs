import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const preview='https://security-preview-20261118--lct-studio.netlify.app';
const tile='https://worker.test/projects/longdong-pix4d-mesh-20260805/tiles/tileset.json';
const env={SESSION_SECRET:'synthetic-only-session-secret',MODELS:{get(){throw Error('Unauthorized storage read');}}};

test('only the exact preview origin joins existing origins; other Netlify and lookalike origins stay denied',async()=>{
 for(const origin of ['https://lctstudio.tw','https://www.lctstudio.tw',preview]) {
  const r=await worker.fetch(new Request(tile,{method:'OPTIONS',headers:{origin}}),env);
  assert.equal(r.status,204);
  assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(r.headers.get('access-control-allow-credentials'),null);
 }
 for(const origin of ['https://evil.test','https://other--lct-studio.netlify.app',preview+'.evil.test']) {
  const r=await worker.fetch(new Request(tile,{method:'OPTIONS',headers:{origin}}),env);
  assert.equal(r.status,403);
  assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
});

test('the allowed preview origin still needs a valid project read token',async()=>{
 const r=await worker.fetch(new Request(tile,{headers:{origin:preview}}),env);
 assert.equal(r.status,401);
 assert.equal(r.headers.get('access-control-allow-origin'),preview);
});
