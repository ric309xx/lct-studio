import test from 'node:test';import assert from 'node:assert/strict';
import {datasetDisplayName} from '../shared/datasetPresentation.mjs';
test('資料集依成果年份顯示，既有年份不重複，坐標年代不當成果年份',()=>{
  assert.equal(datasetDisplayName({name:'中壢八德',metadata:'{"resultYear":115}'}),'115年中壢八德');
  assert.equal(datasetDisplayName({name:'桃園龜山',metadata:'{"resultYear":112}'}),'112年桃園龜山');
  assert.equal(datasetDisplayName({name:'115年測量控制點',metadata:'{"resultYear":115}'}),'115年測量控制點');
  assert.equal(datasetDisplayName({name:'109 年一等水準點',metadata:'{"resultYear":109}'}),'109 年一等水準點');
  assert.equal(datasetDisplayName({name:'TWD97[2010] 控制點',metadata:'{"coordinateEpoch":2010,"resultYear":null}'}),'TWD97[2010] 控制點');
  assert.equal(datasetDisplayName({name:'其他資料',metadata:'bad json'}),'其他資料');
});
