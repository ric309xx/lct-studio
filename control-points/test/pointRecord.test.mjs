import test from 'node:test';import assert from 'node:assert/strict';
import {defaultRecordPhotos,recordFields,mapPixel,escapeRecord,recordFilename,recordImageLayout} from '../shared/pointRecord.mjs';
import {jpegPagesPdf} from '../shared/pdfPages.mjs';
test('record defaults select one close and four far, stably, without inventing missing photos',()=>{
 const a=[...Array.from({length:5},(_,i)=>({id:'f'+i,category:'遠照',filename:`far${5-i}.jpg`,mime:'image/jpeg'})),{id:'n',category:'近照',filename:'near.jpg',mime:'image/jpeg'},{id:'e',category:'環境',filename:'environment.jpg',mime:'image/jpeg'},{id:'pdf',category:'近照',filename:'a.pdf',mime:'application/pdf'}];
 assert.deepEqual(defaultRecordPhotos(a),['n','f4','f3','f2','f1']);assert.deepEqual(defaultRecordPhotos(a.slice(0,2)),['f1','f0']);
});
test('record preserves projected coordinates and an unknown height datum',()=>{
 const fields=Object.fromEntries(recordFields({dataset_id:'leveling-109',code:'123',north:2760000.123,east:250000.456,height:10.12345,lat:24.9,lon:121.2,crs:'TWD97 / TM2 121 分帶',epsg:3826,height_type:'正高',source_row:2,notes:'待確認'},undefined));
 assert.equal(fields['N 縱坐標（m）'],'2760000.123');assert.equal(fields['正高（m）'],'10.12345');assert.match(fields['坐標系統'],/3826/);assert.match(fields['高程基準'],/待確認/);assert.equal(fields['備註'],'待確認');
 assert.equal(Object.keys(fields).length,10);assert.equal(fields['成果年份'],'民國 109 年');for(const removed of ['資料集','原點號','點名','說明／所在地','巡查狀態','來源'])assert.equal(fields[removed],undefined);
 assert.deepEqual(mapPixel(0,0,0),[128,128]);assert.throws(()=>mapPixel(NaN,24,17));assert.equal(escapeRecord('<script>'), '&lt;script&gt;');assert.equal(recordFilename('../A:B'),'點之記_.._A_B');
});
test('portrait photos rotate into landscape without cropping; landscape photos keep their direction',()=>{
 assert.deepEqual(recordImageLayout(1108,1477),{rotate:true,width:1477,height:1108});assert.deepEqual(recordImageLayout(1477,1108),{rotate:false,width:1477,height:1108});assert.deepEqual(recordImageLayout(2400,4000),{rotate:true,width:1600,height:960});
});
test('PDF objects use byte offsets and each embedded JPEG page has its own resources',()=>{
 const bytes=jpegPagesPdf([{width:1,height:1,bytes:new Uint8Array([255,216,255,217])},{width:1,height:1,bytes:new Uint8Array([255,216,255,217])}]),text=new TextDecoder().decode(bytes),offset=Number(text.match(/startxref\n(\d+)/)[1]);
 assert.equal(new TextDecoder().decode(bytes.slice(offset,offset+4)),'xref');assert.match(text,/\/Count 2/);assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,2);assert.throws(()=>jpegPagesPdf([]));
 const xref=text.slice(text.indexOf('xref\n')).split('\n');for(let i=3;i<11;i++){const at=Number(xref[i].slice(0,10));assert.ok(new TextDecoder().decode(bytes.slice(at,at+12)).startsWith(`${i-2} 0 obj`));}
});
