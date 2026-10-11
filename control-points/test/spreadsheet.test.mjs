import test from 'node:test';import assert from 'node:assert/strict';import * as XLSX from 'xlsx';
import {worksheetColumns,worksheetRecords} from '../shared/spreadsheet.mjs';
import {sourceAttributes} from '../shared/attributes.mjs';import {normalizeRecords} from '../shared/coordinates.mjs';

test('重複／空白欄名、日期顯示、公式快取與實際來源列號完整保留',()=>{
  const s=XLSX.utils.aoa_to_sheet([['pt','N','E','橢球高','橢球高',null,'測量時間','備註2'],['CL01',2760940.6678,271231.8118,150.876,151,'地形點*5',46302,'確認座標系統'],[],['CL02',2761143.3538,271470.3356,149.6426,null,'控制點60*2',null,null]]);
  s.G2.z='yyyy/m/d';s.G2.w='2026/10/7';s.A2.f='LEFT("CL01.full",4)';
  const columns=worksheetColumns(s);assert.equal(new Set(columns.map(c=>c.label)).size,8);
  const records=worksheetRecords(s,'成果',{code:'0',original_code:'0',north:'1',east:'2',height:'3'});
  assert.equal(records.length,2);assert.deepEqual(records.map(r=>r.source_row),[2,4]);
  assert.equal(records[0].raw['橢球高（D 欄）'],150.876);assert.equal(records[0].raw['橢球高（E 欄）'],151);
  assert.equal(records[0].raw['欄 F'],'地形點*5');assert.equal(records[0].raw.__excel.formulas.pt,'LEFT("CL01.full",4)');
  const normalized=normalizeRecords(records,{id:'test',epsg:3826,height_type:'橢球高'});assert.equal(normalized.errors.length,0);
  const attrs=sourceAttributes(normalized.points[0].raw);assert.equal(attrs.length,8);assert.equal(attrs.find(a=>a.label==='測量時間').text,'2026/10/7');assert.equal(attrs.find(a=>a.label==='備註2').text,'確認座標系統');
  assert.equal(sourceAttributes(normalized.points[1].raw).find(a=>a.label==='橢球高（E 欄）').text,'未提供');
});
test('舊資料屬性相容；0 與空白區分；損壞 JSON 不影響點位畫面',()=>{
  assert.deepEqual(sourceAttributes('{"正高":0,"備註":""}').map(a=>a.text),['0','未提供']);
  assert.deepEqual(sourceAttributes('invalid JSON'),[]);
});
