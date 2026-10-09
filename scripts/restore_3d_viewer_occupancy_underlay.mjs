import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]??'.codex-tmp/viewer-build-20260927');
const app=join(root,'src/App.tsx');
let text=readFileSync(app,'utf8');
text=text.replace('import { createOccupancySurface } from "./occupancySurface";', 'import { createOccupancyUnderlay } from "./occupancyUnderlay";');
text=text.replaceAll('createOccupancySurface(viewer, building, groundHeight, () => cancelled)', 'createOccupancyUnderlay(viewer, building, groundHeight, () => cancelled)');
text=text.replace('entity.show = occupancyVisibleRef.current;', 'entity.show = initialCadastralMode === "model-ground" && occupancyVisibleRef.current;');
text=text.replace('                    building.properties!.addProperty("continuousOccupancy", true);','');
text=text.replaceAll('"occupancy-surface"','"occupancy-roof-underlay"');
text=text.replace('visible && (kind === "occupancy-roof-underlay" ? occupancyVisible : cadastralDisplayMode === "model-ground")',
  'visible && cadastralDisplayMode === "model-ground" && (kind !== "occupancy-roof-underlay" || occupancyVisible)');
text=text.replace('cadastralVisible && (kind === "occupancy-roof-underlay" ? occupancyVisible : mode === "model-ground")',
  'cadastralVisible && mode === "model-ground" && (kind !== "occupancy-roof-underlay" || occupancyVisible)');
text=text.replace('entity.show = cadastralVisible && visible;', 'entity.show = cadastralVisible && cadastralDisplayMode === "model-ground" && visible;');
text=text.replace('地籍面位於估算地面；綠色面呈現確認建物占用範圍，模型缺口以鄰近屋頂高度銜接。',
  '地籍面位於估算地面；綠色為建物滴水線投影範圍，模型缺口保留補洞面。');
writeFileSync(app,text);
copyFileSync(resolve('scripts/viewer/occupancyUnderlay.ts'),join(root,'src/occupancyUnderlay.ts'));
console.log('Original occupancy classification and underlay restored.');
