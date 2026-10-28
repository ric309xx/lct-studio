import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {parseControlCatalog} from './controlPoints';
const base=resolve(process.cwd(),'../.local/private-control-points/taoyuan-building-overlay');
it.skipIf(!existsSync(resolve(base,'catalog.json')))('validates the optional local package and every copied photo without bundling private data',()=>{
  const catalog=parseControlCatalog(JSON.parse(readFileSync(resolve(base,'catalog.json'),'utf8')));
  expect(catalog.points).toHaveLength(37);expect(new Set(catalog.points.map(p=>p.profileId)).size).toBe(8);
  const photos=new Map(catalog.points.flatMap(p=>p.photos.map(photo=>[photo.path,photo.sha256] as const)));
  expect(photos.size).toBe(134);expect(catalog.points.filter(p=>!p.photos.length)).toHaveLength(9);
  expect(catalog.points.find(p=>p.code==='CLR16')?.photos).toEqual([]);
  for(const [path,hash] of photos)expect(createHash('sha256').update(readFileSync(resolve(base,path))).digest('hex')).toBe(hash);
});
