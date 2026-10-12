import test from 'node:test';import assert from 'node:assert/strict';
import View from 'ol/View.js';
import DragPan from 'ol/interaction/DragPan.js';import MouseWheelZoom from 'ol/interaction/MouseWheelZoom.js';
import {focusPointImmediately,followLocationImmediately,pausesLocationFollow,mapInteractions} from '../shared/mapNavigation.mjs';

test('連續跟隨與縮放後置中保留比例，雙指操作完成後才追到最新位置',()=>{
  const view=new View({center:[0,0],zoom:10});
  followLocationImmediately(view,[100,120],true);assert.equal(view.getZoom(),16);
  view.setZoom(13);followLocationImmediately(view,[200,220]);assert.equal(view.getZoom(),13);assert.deepEqual(view.getCenter(),[200,220]);
  // A pinch can move its anchor; keep the chosen zoom when re-centering.
  view.setCenter([230,240]);followLocationImmediately(view,[200,220]);assert.deepEqual(view.getCenter(),[200,220]);assert.equal(view.getZoom(),13);
  view.beginInteraction();followLocationImmediately(view,[300,320]);assert.deepEqual(view.getCenter(),[200,220]);
  view.endInteraction(0);followLocationImmediately(view,[300,320]);assert.deepEqual(view.getCenter(),[300,320]);assert.equal(view.getAnimating(),false);
});

test('單指拖曳暫停跟隨，觸碰、滾輪及雙指縮放不會退出跟隨',()=>{
  assert.equal(pausesLocationFollow({type:'pointerdrag',activePointers:[{}]}),true);
  for(const event of [{type:'pointerdown',activePointers:[{}]},{type:'wheel'},{type:'pointerdrag',activePointers:[{},{}]}])assert.equal(pausesLocationFollow(event),false);
});

test('清單選點立即定位，不留動畫等待，並保留已放大的比例',t=>{
  const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  t.after(()=>{if(oldRequest)globalThis.requestAnimationFrame=oldRequest;else delete globalThis.requestAnimationFrame;if(oldCancel)globalThis.cancelAnimationFrame=oldCancel;else delete globalThis.cancelAnimationFrame;});
  const view=new View({center:[0,0],zoom:19});
  view.animate({center:[200,200],duration:5000});assert.equal(view.getAnimating(),true);
  focusPointImmediately(view,[100,120]);
  assert.equal(view.getAnimating(),false);assert.deepEqual(view.getCenter(),[100,120]);assert.equal(view.getZoom(),19);
  // An immediate subsequent gesture must not be undone by a selection animation.
  view.adjustCenter([20,30]);view.adjustZoom(-1);
  assert.deepEqual(view.getCenter(),[120,150]);assert.equal(view.getZoom(),18);assert.equal(view.getAnimating(),false);
  view.setZoom(10);focusPointImmediately(view,[200,220]);assert.equal(view.getZoom(),17);
});

test('焦點留在點位按鈕時，第一下拖曳與滾輪仍改變地圖',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  // Only DragZoom's unused box constructor needs a DOM element in this Node test.
  const oldDocument=globalThis.document,oldWheelEvent=globalThis.WheelEvent;
  globalThis.document={createElement:()=>({style:{}})};globalThis.WheelEvent={DOM_DELTA_LINE:1,DOM_DELTA_PAGE:2};
  t.after(()=>{if(oldDocument)globalThis.document=oldDocument;else delete globalThis.document;if(oldWheelEvent)globalThis.WheelEvent=oldWheelEvent;else delete globalThis.WheelEvent;});
  const view=new View({center:[0,0],zoom:17});
  const map={getView:()=>view,getEventPixel:e=>[e.clientX,e.clientY],getCoordinateFromPixel:p=>p,
    getTargetElement:()=>{throw new Error('拖曳／滾輪不應要求先切換焦點');}};
  const interactions=mapInteractions().getArray(),drag=interactions.find(i=>i instanceof DragPan),wheel=interactions.find(i=>i instanceof MouseWheelZoom);
  let prevented=0;const pointer=(x,y)=>({clientX:x,clientY:y,pointerId:1,isPrimary:true,pointerType:'mouse',button:0,preventDefault:()=>prevented++});
  const event=(type,x,y)=>({map,type,originalEvent:pointer(x,y),activePointers:type==='pointerup'?[]:[pointer(x,y)],pixel:[x,y]});
  drag.handleEvent(event('pointerdown',100,100));drag.handleEvent(event('pointerdrag',110,100));drag.handleEvent(event('pointerdrag',150,100));
  assert.notDeepEqual(view.getCenter(),[0,0]);
  // No focus transfer occurs before wheel input. A trackpad delta changes zoom immediately.
  wheel.handleEvent({map,type:'wheel',pixel:[150,100],originalEvent:{deltaY:-1,deltaMode:0,ctrlKey:false,preventDefault:()=>prevented++}});
  assert.ok(view.getZoom()>17);assert.ok(prevented>0);t.mock.timers.tick(100);
});
