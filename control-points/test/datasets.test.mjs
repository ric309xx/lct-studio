import test from 'node:test';import assert from 'node:assert/strict';
import {datasetLabel,datasetYear,datasetColor,coordinateLabel} from '../shared/datasets.mjs';
import {normalizeRecords} from '../shared/coordinates.mjs';
test('成果年採用指定的舊批次年份，112 與 115 同區成果不混用',()=>{
  assert.equal(datasetLabel({id:'zhongli-bade',name:'中壢八德'}),'115 年 中壢八德');
  assert.equal(datasetLabel({id:'leveling-109',name:'109 年一等水準點'}),'109 年一等水準點');
  assert.equal(datasetYear({id:'image-control-202610'}),115);
  assert.equal(datasetLabel({id:'zhongli-bade-112',name:'中壢八德',metadata:'{"resultYear":112}'}),'112 年 中壢八德');
  assert.equal(datasetYear({id:'twd97-2010',metadata:{coordinateEpoch:2010}}),null);
});
test('2010 年代保存於成果標示，原坐標不因投影或備註而變更',()=>{
  const options={id:'test',epsg:3826,metadata:{coordinateSystem:'TWD97[2010]',coordinateEpoch:2010}};
  assert.equal(coordinateLabel(options),'TWD97[2010] / TM2 121 分帶');
  const result=normalizeRecords([{code:'N804',north:2765091.85,east:280383.843,height:182.08}],options);
  assert.equal(result.errors.length,0);assert.equal(result.points[0].north,2765091.85);assert.match(result.points[0].crs,/\[2010\]/);
  assert.throws(()=>coordinateLabel({...options,epsg:4326}),/TM2/);
  assert.throws(()=>coordinateLabel({...options,metadata:{coordinateSystem:'TWD97[2010]',coordinateEpoch:2020}}),/2010/);
  assert.equal(coordinateLabel({epsg:3826,metadata:{note:'@2010'}}),'TWD97 / TM2 121 分帶');
});
test('圖層配色允許來源設定，舊資料與不良點況配色仍可辨識',()=>{
  assert.equal(datasetColor({id:'leveling-109'}),'#743c92');
  assert.equal(datasetColor({id:'new',metadata:{color:'#287fb8'}}),'#287fb8');
  assert.match(datasetColor({id:'new',metadata:'broken'}),/^#[0-9a-f]{6}$/i);
});
