import test from 'node:test';import assert from 'node:assert/strict';
import {nearbyPoints,targetDirection,distanceLabel} from '../shared/pointFinder.mjs';
test('nearest lookup uses physical distance, retains coincident points by ID, and excludes deleted or invalid points',()=>{
  const position={lon:121,lat:25};
  const points=[{id:'far',code:'same',lon:121,lat:25.1},{id:'b',code:'same',lon:121,lat:25.001},{id:'a',code:'same',lon:121,lat:25.001},{id:'invalid',lon:NaN,lat:25},{id:'deleted',lon:121,lat:25,deleted_at:'2026-10-13'}];
  assert.deepEqual(nearbyPoints(points,position).map(v=>v.point.id),['a','b','far']);
  assert.equal(nearbyPoints(points,position,1)[0].point.id,'a');
  assert.deepEqual(nearbyPoints(points,null),[]);assert.deepEqual(nearbyPoints([],position),[]);
  assert.equal(nearbyPoints(points,position)[0].meters>100,true);
});
test('target guidance reports north-referenced bearings and metres across quadrants',()=>{
  const position={lon:121,lat:25};
  for(const [point,cardinal,degrees] of [[{lon:121,lat:25.01},'北',0],[{lon:121.01,lat:25},'東',90],[{lon:121,lat:24.99},'南',180],[{lon:120.99,lat:25},'西',270]]){
    const result=targetDirection(position,point);assert.equal(result.cardinal,cardinal);assert.ok(Math.abs(result.degrees-degrees)<.1);assert.ok(result.meters>900&&result.meters<1200);
  }
  assert.equal(targetDirection(null,{lon:121,lat:25}),null);
  assert.equal(distanceLabel(471.2),'471 m');assert.equal(distanceLabel(1500),'1.50 km');
});
