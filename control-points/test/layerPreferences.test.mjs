import test from 'node:test';
import assert from 'node:assert/strict';
import {LAYER_PREFERENCES_KEY,readLayerSelection,hiddenLayerIds,captureLayerSelection,saveLayerSelection} from '../shared/layerPreferences.mjs';

const datasets=[{id:'leveling-109'},{id:'zhongli-bade'},{id:'twd97-2010-121'}];
function memoryStorage(){const items=new Map();return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,value)};}

test('只儲存水準點後重開維持單一圖層；暫時改勾選不覆蓋已儲存組合',()=>{
  const storage=memoryStorage(),hidden=new Set(['zhongli-bade','twd97-2010-121']);
  assert.equal(saveLayerSelection(storage,captureLayerSelection(datasets,hidden)),true);
  assert.deepEqual(hiddenLayerIds(datasets,readLayerSelection(storage)),hidden);
  hidden.delete('zhongli-bade');
  assert.deepEqual(hiddenLayerIds(datasets,readLayerSelection(storage)),new Set(['zhongli-bade','twd97-2010-121']));
  assert.equal(hiddenLayerIds([...datasets,{id:'new-layer'}],readLayerSelection(storage)).has('new-layer'),true);
});

test('全部取消及全部勾選均可還原，全部勾選涵蓋新增圖層',()=>{
  const storage=memoryStorage();
  saveLayerSelection(storage,captureLayerSelection(datasets,new Set(datasets.map(d=>d.id))));
  assert.deepEqual(hiddenLayerIds(datasets,readLayerSelection(storage)),new Set(datasets.map(d=>d.id)));
  saveLayerSelection(storage,captureLayerSelection(datasets,new Set()));
  assert.equal(hiddenLayerIds([...datasets,{id:'new-layer'}],readLayerSelection(storage)).size,0);
});

test('首次使用、損壞設定與儲存遭封鎖時正常退回，不使地圖無法開啟',()=>{
  const storage=memoryStorage();
  for(const value of [null,'{','null','{"all":false,"visibleIds":[3]}']){
    storage.setItem(LAYER_PREFERENCES_KEY,value);
    assert.equal(hiddenLayerIds(datasets,readLayerSelection(storage)).size,0);
  }
  const blocked={getItem(){throw new Error();},setItem(){throw new Error();}};
  assert.equal(readLayerSelection(blocked).all,true);
  assert.equal(saveLayerSelection(blocked,{all:false,visibleIds:[]}),false);
});
