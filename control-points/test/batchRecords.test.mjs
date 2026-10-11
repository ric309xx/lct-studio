import test from 'node:test';import assert from 'node:assert/strict';
import {toggleRecordSelection,selectRecordResults,batchPhotos,recordBatchPath,runRecordBatch,batchManifest} from '../shared/batchRecords.mjs';
test('selection uses point IDs, retains hidden results, and selects all results beyond the visible page',()=>{
 const points=Array.from({length:181},(_,i)=>({id:'p'+i,code:'same'}));
 const selected=selectRecordResults(new Set(['hidden']),points,true);assert.equal(selected.size,182);
 const next=toggleRecordSelection(selected,'p0');assert.equal(next.size,181);assert.ok(selected.has('p0'));
 assert.deepEqual([...selectRecordResults(next,points,false)],['hidden']);
});
test('batch photo presets honor categories and ZIP paths cannot collide for duplicate codes',()=>{
 const photos=['近照','近照',...Array(6).fill('遠照'),'環境'].map((category,i)=>({id:String(i),category,filename:i+'.jpg',mime:'image/jpeg'}));
 assert.equal(batchPhotos(photos,'1+4').length,5);assert.equal(batchPhotos(photos,'1+1').length,2);assert.equal(batchPhotos(photos,'all').length,9);assert.equal(batchPhotos(photos,'none').length,0);assert.equal(batchPhotos(photos.slice(0,1),'1+4').length,1);
 const a=recordBatchPath({code:'../A:B',dataset_id:'a'},{name:'../同名'},0,'pdf'),b=recordBatchPath({code:'../A:B',dataset_id:'b'},{name:'../同名'},1,'pdf');
 assert.notEqual(a,b);assert.ok(a.split('/').every(p=>p!=='.'&&p!=='..'));assert.throws(()=>recordBatchPath({},null,0,'exe'));
});
test('batch renders sequentially, deduplicates IDs, and never adds a failed or cancelled record',async()=>{
 const points=[{id:'a',code:'A'},{id:'b',code:'B'},{id:'a',code:'A'}],added=[],controller=new AbortController();let active=0;
 const result=await runRecordBatch(points,{signal:controller.signal,onProgress:()=>{},render:async p=>{assert.equal(active++,0);await Promise.resolve();active--;return {summary:p.code};},add:async(r,p)=>added.push(p.id)});
 assert.deepEqual(added,['a','b']);assert.deepEqual(result,['A','B']);
 const failed=[];await assert.rejects(runRecordBatch(points,{signal:controller.signal,onProgress:()=>{},render:async p=>{if(p.id==='b')throw new Error('map unavailable');return {summary:p.code};},add:async(r,p)=>failed.push(p.id)}),/B：map unavailable/);assert.deepEqual(failed,['a']);
 const cancelled=new AbortController(),cancelAdded=[];await assert.rejects(runRecordBatch(points,{signal:cancelled.signal,onProgress:()=>{},render:async()=>{cancelled.abort();return {};},add:r=>cancelAdded.push(r)}),{name:'AbortError'});assert.equal(cancelAdded.length,0);
});
test('manifest quotes user fields and neutralizes spreadsheet formulas',()=>{const csv=batchManifest([{dataset:'=CMD',code:'A,"B',id:'1',path:'a.pdf',near:1,far:3,other:0,warning:'遠照不足'}]);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('"\'=CMD"'));assert.ok(csv.includes('"A,""B"'));assert.ok(csv.includes('遠照不足'));});
