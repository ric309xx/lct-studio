import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainDisplayDelta as delta} from '../../viewer-source/src/gukengTerrainField.mjs';
test('background difference matches valid model samples and leaves the distant globe unchanged',()=>{
  const samples=[{east:0,north:0,delta:19.5}],before=JSON.stringify(samples);
  assert.equal(delta(samples,0,0),19.5);assert.equal(delta(samples,20,0),19.5);
  assert.ok(delta(samples,70,0)>0&&delta(samples,70,0)<19.5);
  assert.equal(delta(samples,110,0),0);assert.equal(delta(samples,1000,0),0);assert.equal(JSON.stringify(samples),before);
});
test('uses nearby differences symmetrically, ignores missing/implausible values and fades continuously',()=>{
  assert.equal(delta([{east:-10,north:0,delta:-20},{east:10,north:0,delta:20}],0,0),0);
  assert.equal(delta([{east:0,north:0,delta:NaN},{east:0,north:0,delta:101}],0,0),0);
  assert.ok(Math.abs(delta([{east:0,north:0,delta:-20}],109.999,0))<1e-6);
});
