import {describe,it,expect} from 'vitest';
import {buildCaseOverview} from './caseOverview';
import {nearbyCases,returnCaseContext,readCaseMapSnapshot,saveCaseMapSnapshot,captureCaseMapCamera} from './caseNavigation';
import p1006 from './taoyuan1006Parcels.json';
import p1010 from './taoyuan1010Parcels.json';

const cases=buildCaseOverview([...p1006,...p1010]);
describe('case navigation context',()=>{
  it('returns the exact cluster, search and selection instead of resetting to all cases',()=>{
    const context={selected:cases[1].key,query:'646',nearbyKeys:[cases[0].key,cases[1].key]};
    expect(returnCaseContext(cases,cases[1].key,context)).toBe(context);
    expect(nearbyCases(cases,cases[1].key,context).map(item=>item.key)).toEqual(context.nearbyKeys);
  });
  it('direct 3D links return to the same section, keeping six scattered cases independent',()=>{
    const context=returnCaseContext(cases,cases[0].key,null);
    expect(context.selected).toBe(cases[0].key);
    expect(context.nearbyKeys).toHaveLength(6);
    expect(nearbyCases(cases,cases[0].key,null).every(item=>item.parcels.length===1)).toBe(true);
  });
  it('ignores a stale cluster from another case and preserves confirmed multi-parcel cases',()=>{
    const context={selected:cases[0].key,query:'',nearbyKeys:[cases[0].key,'missing']};
    const grouped=cases.find(item=>item.parcels.length===4)!;
    const options=nearbyCases(cases,grouped.key,context);
    expect(options.some(item=>item.key===grouped.key&&item.parcels.length===4)).toBe(true);
    expect(options.some(item=>item.key===cases[0].key)).toBe(false);
    expect(nearbyCases(cases,'missing',context)).toEqual([]);
    expect(returnCaseContext(cases,grouped.key,context).selected).toBe(grouped.key);
  });
  it('retains the previous layer across a required fresh model document',()=>{
    const snapshot={navigation:{selected:cases[0].key,query:'',nearbyKeys:[cases[0].key,cases[1].key],expandedKeys:[cases[0].key,cases[1].key]},view:[2.1,.4,2.2,.5]};
    saveCaseMapSnapshot(sessionStorage,'test-case-map',snapshot);
    expect(readCaseMapSnapshot(sessionStorage,'test-case-map')).toEqual(snapshot);
    sessionStorage.removeItem('test-case-map');
  });
  it('ignores malformed or unavailable session state',()=>{
    expect(readCaseMapSnapshot({getItem:()=>'{bad'},'x')).toEqual({navigation:null,view:null});
    expect(readCaseMapSnapshot({getItem:()=>JSON.stringify({navigation:{selected:2},view:[1,2]})},'x')).toEqual({navigation:null,view:null});
    expect(()=>saveCaseMapSnapshot({setItem:()=>{throw Error('blocked');}},'x',{navigation:null,view:null})).not.toThrow();
  });
  it('stores a precise 2D camera span and rejects invalid camera snapshots',()=>{
    const camera={positionCartographic:{longitude:2.115,latitude:.435,height:140}};
    const view=captureCaseMapCamera(camera);
    expect(view).toEqual({kind:'camera-2d',longitude:2.115,latitude:.435,span:140});
    const snapshot={navigation:{selected:cases[1].key,query:'',nearbyKeys:[]},view};
    saveCaseMapSnapshot(sessionStorage,'precise-map-camera',snapshot);
    camera.positionCartographic.height=4e7;
    expect(readCaseMapSnapshot(sessionStorage,'precise-map-camera')).toEqual(snapshot);
    expect(captureCaseMapCamera({positionCartographic:{longitude:NaN,latitude:0,height:100}})).toBeNull();
    expect(captureCaseMapCamera({positionCartographic:{longitude:2.1,latitude:.4,height:0}})).toBeNull();
    expect(readCaseMapSnapshot({getItem:()=>JSON.stringify({view:{kind:'camera-2d',longitude:2.1,latitude:.4,span:-1}})},'x').view).toBeNull();
    sessionStorage.removeItem('precise-map-camera');
  });
});
