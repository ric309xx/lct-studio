import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const viewerPath = path.resolve(scriptDirectory, "../3d-viewer/assets/viewer.js");
const source = await readFile(viewerPath, "utf8");

const generated = "maximumScreenSpaceError:t?20:n?4:16,dynamicScreenSpaceError:t||!n,progressiveResolutionHeightFraction:t?.45:n?0:.3,cullRequestsWhileMoving:t||!n,cacheBytes:t?256*1024*1024:n?1024*1024*1024:512*1024*1024,maximumCacheOverflowBytes:t?128*1024*1024:n?1024*1024*1024:512*1024*1024";
const previousPatch = "maximumScreenSpaceError:n?t?2:1:t?20:16,dynamicScreenSpaceError:!n&&(t||!n),foveatedScreenSpaceError:!n,skipLevelOfDetail:!1,preloadFlightDestinations:n,progressiveResolutionHeightFraction:n?0:t?.45:.3,cullRequestsWhileMoving:!n&&(t||!n),cacheBytes:t?256*1024*1024:n?1024*1024*1024:512*1024*1024,maximumCacheOverflowBytes:t?128*1024*1024:n?1024*1024*1024:512*1024*1024";
const patched = "maximumScreenSpaceError:n?t?2:1:t?20:16,dynamicScreenSpaceError:n?!1:t||!n,foveatedScreenSpaceError:n?!1:void 0,skipLevelOfDetail:n?!1:void 0,preloadFlightDestinations:n?!0:void 0,progressiveResolutionHeightFraction:n?0:t?.45:.3,cullRequestsWhileMoving:n?!1:t||!n,cacheBytes:t?256*1024*1024:n?1024*1024*1024:512*1024*1024,maximumCacheOverflowBytes:t?128*1024*1024:n?1024*1024*1024:512*1024*1024";

if (source.includes(patched)) {
  console.log("B3DMS high-detail settings are already applied.");
  process.exit(0);
}

const sourceSettings = source.includes(previousPatch) ? previousPatch : generated;

if (!source.includes(sourceSettings)) {
  throw new Error("Expected B3DMS quality settings were not found; the Viewer bundle may have changed.");
}

await writeFile(viewerPath, source.replace(sourceSettings, patched), "utf8");
console.log("Applied self-hosted high-detail LOD settings to the B3DMS comparison model.");
