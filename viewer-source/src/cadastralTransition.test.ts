import {describe,it,expect} from 'vitest';
import {needsFreshShuanglingDocument} from './cadastralTransition';
const source=(groupKey:string,tilesetPath='1013-v2/tileset.json')=>({groupKey,tilesetPath});
describe('1013-1 versioned model transitions',()=>{
  it('keeps same-group parcel switching in-place',()=>expect(needsFreshShuanglingDocument(source('01'),source('01'))).toBe(false));
  it('uses a fresh document only between this updated model’s three groups',()=>expect(needsFreshShuanglingDocument(source('01'),source('02'))).toBe(true));
  it('does not alter old or unrelated model transitions',()=>{
    expect(needsFreshShuanglingDocument(source('01','1013/tileset.json'),source('02','1013/tileset.json'))).toBe(false);
    expect(needsFreshShuanglingDocument(source('01','1015-cl1/tileset.json'),source('02','1015-cl1/tileset.json'))).toBe(false);
    expect(needsFreshShuanglingDocument(undefined,source('02'))).toBe(false);
  });
});
