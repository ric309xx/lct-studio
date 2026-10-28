import {expect,it} from 'vitest';
import {summarizeSurfaceHeightPairs} from './surfaceHeightAudit';
it('summarizes matched-height differences without treating missing samples as zero',()=>{
  const result=summarizeSurfaceHeightPairs([-21,-20,null,-19,NaN].map(d=>({longitude:121,latitude:25,sceneHeight:null,terrainHeight:null,differenceM:d})));
  expect(result).toEqual({validPairs:3,minimumDifferenceM:-21,medianDifferenceM:-20,maximumDifferenceM:-19});
  expect(summarizeSurfaceHeightPairs([]).medianDifferenceM).toBeNull();
});
