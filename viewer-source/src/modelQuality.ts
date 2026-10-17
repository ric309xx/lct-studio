/** Taoyuan survey review prioritises detail over coarse/progressive preview. */
export function taoyuanModelQuality(compactDevice = false) {
  return {
    maximumScreenSpaceError: compactDevice ? 2 : 1,
    dynamicScreenSpaceError: false,
    foveatedScreenSpaceError: false,
    skipLevelOfDetail: false,
    progressiveResolutionHeightFraction: 0,
    cullRequestsWhileMoving: false,
    preloadFlightDestinations: true,
    loadSiblings: false,
    cacheBytes: (compactDevice ? 512 : 1024) * 1024 * 1024,
    maximumCacheOverflowBytes: (compactDevice ? 256 : 512) * 1024 * 1024
  };
}
