import test from 'node:test';import assert from 'node:assert/strict';import {createPlaceSearch,placeResults} from '../worker/geocode.mjs';
const feature=(id,lon=121.22,lat=24.95)=>({geometry:{type:'Point',coordinates:[lon,lat]},properties:{osm_type:'N',osm_id:id,name:'中壢車站',city:'桃園市',street:'中和路'}});
const storage=()=>{const data=new Map();return {get:async key=>data.has(key)?{json:async()=>JSON.parse(data.get(key))}:null,put:async(key,value)=>data.set(key,value)};};
test('地點結果僅接受台灣周邊有效點，重複項目合併',()=>{
  const results=placeResults({features:[feature(1),feature(1),feature(2,0,0),feature(3,NaN,24),{geometry:{type:'Polygon',coordinates:[121,24]}}]});
  assert.equal(results.length,1);assert.equal(results[0].address,'桃園市 · 中和路');assert.equal(results[0].lon,121.22);
});
test('手動地點搜尋限制長度與頻率，重複關鍵字走快取並能過期更新',async()=>{
  let calls=0,t=1000;const files=storage();
  const search=createPlaceSearch({time:()=>t,fetcher:async(url,options)=>{calls++;assert.equal(url.searchParams.get('bbox'),'117,20,125,28');assert.equal(url.searchParams.get('limit'),'6');assert.match(options.headers['User-Agent'],/LCTControlPoints/);return Response.json({features:[feature(calls)]});}});
  await assert.rejects(search('',files),e=>e.status===400);await assert.rejects(search('x'.repeat(121),files),e=>e.status===400);assert.equal(calls,0);
  const result=await search(' 中壢車站 ',files);assert.equal(result.length,1);assert.deepEqual(await search('中壢車站',files),result);assert.equal(calls,1);
  await assert.rejects(search('桃園市民權路',files),e=>e.status===429);
  t+=1100;await search('桃園市民權路',files);assert.equal(calls,2);
  t+=8*24*3600*1000;await search('中壢車站',files);assert.equal(calls,3);
});
test('搜尋服務斷線與異常回覆有明確錯誤，不能當作零筆結果',async()=>{
  for(const fetcher of [async()=>{throw new Error('offline');},async()=>new Response('busy',{status:429}),async()=>Response.json({error:'bad'})]){
    await assert.rejects(createPlaceSearch({fetcher})('中壢車站',storage()),e=>e.status===503);
  }
});
