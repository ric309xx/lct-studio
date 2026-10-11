import test from 'node:test';import assert from 'node:assert/strict';
import Feature from 'ol/Feature.js';import Point from 'ol/geom/Point.js';import Cluster from 'ol/source/Cluster.js';import VectorSource from 'ol/source/Vector.js';import {get as projection} from 'ol/proj.js';
import {uniqueMapPoints,representativeMapPoint} from '../shared/mapSelection.mjs';
import {mapMarkerStyles,createMapMarkerStyle} from '../shared/mapMarkerStyles.mjs';

test('完全相同坐標、不同來源且同點號仍可各自選取',()=>{
  const a={id:'a',code:'CL01',dataset_id:'original',east:271231.8,north:2760940.7},b={...a,id:'b',dataset_id:'survey'};
  const features=[a,b].map(point=>new Feature({geometry:new Point([271231.8,2760940.7]),point}));
  const source=new VectorSource({features}),clusters=new Cluster({distance:36,minDistance:16,source});
  for(const resolution of [10,1,.01]){
    clusters.loadFeatures([-Infinity,-Infinity,Infinity,Infinity],resolution,projection('EPSG:3857'));
    assert.equal(clusters.getFeatures().length,1);
    const candidates=uniqueMapPoints(clusters.getFeatures()[0].get('features').map(f=>f.get('point')));
    assert.equal(candidates.length,2);assert.deepEqual(candidates.map(p=>p.id),['a','b']);
  }
  assert.deepEqual(features.map(f=>f.getGeometry().getCoordinates()),[[271231.8,2760940.7],[271231.8,2760940.7]]);
  clusters.setSource(null);
});
test('近點與選取圖示同時命中不重複列出；按點號自然排序',()=>{
  const a={id:'a',code:'P2',dataset_id:'survey'},b={id:'b',code:'P10',dataset_id:'survey'},c={id:'c',code:'P2',dataset_id:'original'};
  const hits=[b,a,c,a,null,undefined];const copy=[...hits];
  assert.deepEqual(uniqueMapPoints(hits).map(p=>p.id),['c','a','b']);assert.deepEqual(hits,copy);
  assert.deepEqual(uniqueMapPoints([]),[]);assert.equal(uniqueMapPoints([a]).length,1);
});

test('代表點優先控制點與一等水準點，不受匯入順序影響',()=>{
  const survey={id:'survey',code:'1020',dataset_id:'image-control-202610'},leveling={...survey,id:'leveling',dataset_id:'leveling-109'},control={id:'control',code:'GLD3',dataset_id:'zhongli-bade'};
  for(const preferred of [leveling,control]){
    assert.equal(representativeMapPoint([survey,preferred]),preferred);
    assert.equal(representativeMapPoint([preferred,survey]),preferred);
  }
  const next={...survey,id:'next',code:'1021'},points=[next,survey];
  assert.equal(representativeMapPoint(points),survey);assert.deepEqual(points,[next,survey]);
  assert.equal(representativeMapPoint([]),undefined);
});

test('近點保留優先點原坐標、配色與點號；總點數另置於旁邊徽章',()=>{
  const survey=new Feature({geometry:new Point([10,20]),point:{id:'survey',code:'1020',dataset_id:'image-control-202610'}});
  for(const [dataset,color] of [['leveling-109','#743c92'],['zhongli-bade','#2b6852']]){
    const preferred=new Feature({geometry:new Point([10.03,20]),point:{id:'preferred',code:'1020',dataset_id:dataset}});
    const [marker,badge]=mapMarkerStyles([survey,preferred],17);
    assert.equal(marker.getImage().getFill().getColor(),color);assert.equal(marker.getText().getText(),'1020');
    assert.equal(marker.getGeometry(),preferred.getGeometry());assert.equal(badge.getGeometry(),preferred.getGeometry());
    assert.equal(badge.getText().getText(),'2');assert.ok(badge.getImage().getDisplacement()[0]>marker.getImage().getRadius());
    assert.deepEqual(preferred.getGeometry().getCoordinates(),[10.03,20]);
  }
  const [single]=mapMarkerStyles([survey],17);
  assert.equal(mapMarkerStyles([survey],17).length,1);assert.equal(single.getImage().getFill().getColor(),'#f2c53d');
  assert.equal(mapMarkerStyles([survey],12)[0].getText().getText(),'');assert.deepEqual(mapMarkerStyles([],17),[]);
});

test('平移與選點重繪重用圖示，跨點號顯示層級或更新群聚才重建',()=>{
  const children=[new Feature({geometry:new Point([10,20]),point:{id:'p',code:'P1',dataset_id:'zhongli-bade'}})];
  const cluster=new Feature({features:children}),style=createMapMarkerStyle(),first=style(cluster,17);
  for(let frame=0;frame<100;frame++)assert.equal(style(cluster,17+frame/100),first);
  const overview=style(cluster,12);assert.notEqual(overview,first);assert.equal(overview[0].getText().getText(),'');
  const replacement=new Feature({geometry:new Point([20,30]),point:{id:'new',code:'P2',dataset_id:'leveling-109'}});
  cluster.set('features',[replacement]);const updated=style(cluster,17);
  assert.equal(updated[0].getText().getText(),'P2');assert.equal(updated[0].getImage().getFill().getColor(),'#743c92');
});
