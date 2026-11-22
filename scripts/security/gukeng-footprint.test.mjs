import test from 'node:test';
import assert from 'node:assert/strict';
import {simplifyGukengFootprint} from '../../viewer-source/src/gukengFootprint.mjs';

test('background footprint simplifies dense closed edges without changing source rings or heights',()=>{
  const ring=[];for(let i=0;i<100;i++)ring.push([i/10,0,i/100]);
  for(let i=0;i<100;i++)ring.push([10,i/10,2]);
  for(let i=0;i<100;i++)ring.push([10-i/10,10,3]);
  for(let i=0;i<100;i++)ring.push([0,10-i/10,4]);ring.push(ring[0]);
  const before=JSON.stringify(ring),out=simplifyGukengFootprint(ring);
  assert.equal(JSON.stringify(ring),before);assert.equal(out.length,4);
  assert.deepEqual(out.map(p=>p.slice(0,2)),[[0,0],[10,0],[10,10],[0,10]]);
  assert.ok(out.every(p=>ring.some(q=>JSON.stringify(q)===JSON.stringify(p))));
});
test('rejects invalid or line-like footprints instead of making an arbitrary terrain hole',()=>{
  for(const ring of [[],[[0,0,0],[1,0,0],[2,0,0]],[[0,0,0],[1,0,NaN],[1,1,0]],[[0,0],[1,0],[1,1]]])assert.throws(()=>simplifyGukengFootprint(ring));
  assert.throws(()=>simplifyGukengFootprint([[0,0,0],[2,0,0],[2,2,0]],NaN));
});
