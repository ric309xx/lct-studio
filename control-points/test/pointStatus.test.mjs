import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import {mapMarkerStyles,createMapMarkerStyle} from '../shared/mapMarkerStyles.mjs';
import {pointColor,pointStatusLegend} from '../shared/pointStatus.mjs';
import {pendingVisitPoints,VISIT_STATUSES} from '../shared/fieldWorkflow.mjs';
import {uniqueMapPoints,representativeMapPoint} from '../shared/mapSelection.mjs';

test('點況覆蓋來源配色，未巡查與未知點況仍保留自訂資料集顏色',()=>{
  const dataset={id:'custom',metadata:JSON.stringify({color:'#743c92'})};
  for(const [status,color] of [['未巡查','#743c92'],['其他舊狀態','#743c92'],['新設點位','#f2c53d'],['點位存在','#2e7d32'],['完好','#2e7d32'],['損壞','#c46a1a'],['找不到','#6b7280'],['滅失','#202124'],['無法進入','#80643f']]){
    const p={id:'p',code:'P1',dataset_id:dataset.id,status};
    assert.equal(pointColor(p,dataset),color);
    const f=new Feature({geometry:new Point([10,20]),point:p});
    assert.equal(mapMarkerStyles([f],17,new Map([[dataset.id,dataset]]))[0].getImage().getFill().getColor(),color);
  }
  assert.ok(VISIT_STATUSES.includes('滅失'));
  assert.deepEqual(pointStatusLegend([{status:'點位存在'},{status:'完好'},{status:'找不到'},{status:'未巡查'}]).map(s=>s.label),['已確認／完好','找不到']);
});

test('縮小群聚及近點選單優先新設 N026，找不到 GLA2 往後且可繼續選取',()=>{
  const a={id:'gla2',code:'GLA2',dataset_id:'zhongli-bade',status:'找不到'},n={id:'n026',code:'N026',dataset_id:'image-control-202610',status:'新設點位'};
  for(const input of [[a,n],[n,a]]){
    assert.equal(representativeMapPoint(input),n);assert.deepEqual(uniqueMapPoints(input).map(p=>p.code),['N026','GLA2']);
    const [marker,badge]=mapMarkerStyles(input.map(point=>new Feature({geometry:new Point([10,20]),point})),17);assert.equal(marker.getText().getText(),'N026');assert.equal(badge.getText().getText(),'2');
  }
  assert.equal(representativeMapPoint([{...a,status:'完好'},n]).code,'GLA2','同樣可用時保留原控制點優先');
  assert.equal(representativeMapPoint([{...a,status:'滅失'},{...n,status:'找不到'}]).code,'N026');
});

test('離線巡查立即改色；重新群聚後更新點況，保留控制點優先與總點數徽章',()=>{
  const control={id:'control',code:'P1',dataset_id:'zhongli-bade',status:'未巡查'},survey={id:'survey',code:'P2',dataset_id:'image-control-202610',status:'滅失'};
  const pending=pendingVisitPoints([control],[{kind:'visit',pointId:control.id,payload:{status:'找不到',visited_at:'2026-10-15T15:00:00Z'}}])[0];
  assert.equal(pointColor(pending),'#6b7280');assert.equal(pending.pending_visit,true);
  const feature=p=>new Feature({geometry:new Point([10,20]),point:p});
  const cluster=new Feature({features:[feature(control),feature(survey)]}),style=createMapMarkerStyle();
  const before=style(cluster,17);assert.equal(before[0].getImage().getFill().getColor(),'#2b6852');
  cluster.set('features',[feature(pending),feature(survey)]);
  const after=style(cluster,17);assert.equal(after[0].getImage().getFill().getColor(),'#6b7280');assert.equal(after[0].getText().getText(),'P1');assert.equal(after[1].getText().getText(),'2');
  assert.equal(before[0].getImage().getFill().getColor(),'#2b6852');
});

test('快速找點正確顯示目標原始坐標、分帶、正高與零高程，不與手機定位混用',async()=>{
  const bundle=await build({entryPoints:['src/PointCoordinates.tsx'],bundle:true,format:'cjs',platform:'node',jsx:'automatic',write:false,external:['react','react/jsx-runtime']});
  const compiled={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
  const Component=compiled.exports.default;
  const render=point=>renderToStaticMarkup(createElement(Component,{point}));
  const base={north:2762745.231,east:271372.362,height:118.12,height_type:'正高',epsg:3826,crs:'TWD97 / TM2 121 分帶',raw:'{}'};
  const html=render(base);assert.match(html,/目標點位座標/);assert.match(html,/TWD97 \/ TM2 121 分帶/);assert.match(html,/2,762,745.231/);assert.match(html,/271,372.362/);assert.match(html,/正高（m）/);assert.match(html,/118.120/);
  const zero=render({...base,epsg:3825,crs:'TWD97[2010] / TM2 119 分帶',height:0});assert.match(zero,/EPSG:3825/);assert.match(zero,/0.000/);
  const geographic=render({...base,north:24.9724724,east:121.21168588,epsg:4326,crs:'WGS84 經緯度',height:null,raw:JSON.stringify({fieldCapture:{quality:'approximate'}})});
  assert.match(geographic,/緯度/);assert.match(geographic,/經度/);assert.match(geographic,/24.9724724/);assert.match(geographic,/121.2116859/);assert.match(geographic,/概略位置（待測量）/);assert.doesNotMatch(geographic,/正高（m）/);
});
