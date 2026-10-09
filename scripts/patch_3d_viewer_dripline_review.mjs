import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]??'.codex-tmp/viewer-build-20260927');
const review=resolve('analysis/20261008-taoyuan-cadastral-test/dripline-review');
const app=join(root,'src/App.tsx');
let text=readFileSync(app,'utf8');
if(!text.includes('import driplineMetrics')) {
  text='import driplineMetrics from "./taoyuanDriplineMetrics.json";\n'+text;
  text=text.replace('  occupiedAreaM2: 36.67,','  occupiedAreaM2: driplineMetrics.occupiedAreaM2,');
  text=text.replace('  occupancyPercent: 7.33,','  occupancyPercent: driplineMetrics.occupancyPercent,');
  text=text.replace(/  analysisNote: "102-45 因分圖線[^\n]+/, '  analysisNote: driplineMetrics.note');
  text=text.replace('<strong>36.67 m²</strong>', '<strong>{TAOYUAN_102_45_INFO.occupiedAreaM2!.toFixed(2)} m²</strong>');
  text=text.replace('<strong>7.33%</strong>', '<strong>{TAOYUAN_102_45_INFO.occupancyPercent!.toFixed(2)}%</strong>');
  text=text.replace('依確認建物水平投影與地籍範圍交集估算，僅計入地號界內範圍。','依滴水線垂直投影與地籍範圍交集重算，已修除右端非屋頂尖角。');
  text=text.replace('確認建物水平投影與地籍範圍交集，以 0.1 公尺網格估算。','滴水線垂直投影輪廓與完整地號相交，以 TWD97 平面座標計算。');
  writeFileSync(app,text);
}
copyFileSync(join(review,'metrics.json'),join(root,'src/taoyuanDriplineMetrics.json'));
copyFileSync(join(review,'taoyuan-building-overlay.geojson'),join(root,'public/overlays/taoyuan-building-overlay.geojson'));
console.log('Local dripline review geometry and metrics installed.');
