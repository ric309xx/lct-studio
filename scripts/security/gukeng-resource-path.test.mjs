import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGukengAssetPath} from '../../viewer-source/src/gukengResourcePath.mjs';
test('Gukeng accepts reviewed versioned PDF/page aliases and keeps the download filename clean',()=>{
  for(const pathname of ['/output/pdf/classified-slope-trial-20261024-v2.pdf','/output/pdf/preview/partition-20261024-v2-01.jpg']){
    const version='3ff1165a8b52b53709cb',value=pathname+'?v='+version;
    assert.deepEqual(parseGukengAssetPath(value),{path:value,pathname,version,filename:pathname.split('/').at(-1)});
  }
  assert.equal(parseGukengAssetPath('/model/BlockRABCB/tileset.json').version,null);
});
test('Gukeng rejects arbitrary origins, traversal, credentials, fragments and non-publication query parameters',()=>{
  for(const path of [null,'https://evil.test/output/a.pdf','//evil.test/a','/output/../settings/a','/output//a','/output/%2e%2e/a',
    '/output/a.pdf?token=secret','/output/a.pdf?v=abc','/output/a.pdf?v=3ff1165a8b52b53709cb&url=https://evil.test',
    '/output/a.pdf?v=3ff1165a8b52b53709cb&v=3ff1165a8b52b53709cb','/output/a.pdf#x','/output/./a.pdf','/settings/a.json']){
    assert.throws(()=>parseGukengAssetPath(path),/路徑不正確/);
  }
});
