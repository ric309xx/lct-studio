import {expect,it} from "vitest";
import {taoyuanModelQuality} from "./modelQuality";
it("loads detailed survey tiles without foveated or progressive coarsening",()=>{
  const options=taoyuanModelQuality();
  expect(options.maximumScreenSpaceError).toBe(1);
  expect(options.dynamicScreenSpaceError).toBe(false);
  expect(options.foveatedScreenSpaceError).toBe(false);
  expect(options.skipLevelOfDetail).toBe(false);
  expect(options.progressiveResolutionHeightFraction).toBe(0);
  expect(options.cullRequestsWhileMoving).toBe(false);
  expect(options.cacheBytes).toBe(1024**3);
  expect(options.maximumCacheOverflowBytes).toBe(512*1024**2);
});
it("retains a smaller explicit memory budget for mobile viewers",()=>{
  expect(taoyuanModelQuality(true).maximumScreenSpaceError).toBe(2);
  expect(taoyuanModelQuality(true).cacheBytes).toBe(512*1024**2);
  expect(taoyuanModelQuality(true).maximumCacheOverflowBytes).toBe(256*1024**2);
});
