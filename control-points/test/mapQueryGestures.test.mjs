import test from 'node:test';import assert from 'node:assert/strict';
import {installMapQueryGestures} from '../shared/mapQueryGestures.mjs';

function fixture(){
  const target=new EventTarget(),timers=new Map(),queries=[];let time=0,next=0,disabled=false;
  const gestures=installMapQueryGestures(target,{query:e=>queries.push([e.clientX,e.clientY]),isDisabled:()=>disabled,now:()=>time,setTimer:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:time+delay});return id;},clearTimer:id=>timers.delete(id)});
  const send=(type,properties={})=>{const event=new Event(type);Object.assign(event,{pointerType:'touch',isPrimary:true,button:0,pointerId:1,clientX:100,clientY:200,...properties});target.dispatchEvent(event);};
  const advance=ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}};
  return {send,advance,queries,gestures,disable:()=>{disabled=true;}};
}
test('滑鼠左鍵與手機短按不開啟座標查詢',()=>{
  const f=fixture();f.send('pointerdown',{pointerType:'mouse'});f.advance(1000);assert.deepEqual(f.queries,[]);
  f.send('pointerdown');f.advance(200);f.send('pointerup');f.advance(1000);assert.deepEqual(f.queries,[]);assert.equal(f.gestures.suppressClick(),false);f.gestures.dispose();
});
test('觸控長按查詢按下位置，放開後不再觸發一般點選',()=>{
  const f=fixture();f.send('pointerdown');f.advance(599);assert.equal(f.queries.length,0);f.advance(1);assert.deepEqual(f.queries,[[100,200]]);assert.equal(f.gestures.suppressClick(),true);f.send('pointerup');f.advance(800);assert.equal(f.gestures.suppressClick(),false);f.gestures.dispose();
});
test('移動地圖、雙指操作、取消觸控均取消長按',()=>{
  for(const [type,properties] of [['pointermove',{clientX:109}],['pointerdown',{isPrimary:false,pointerId:2}],['pointercancel',{}],['pointerleave',{}]]){
    const f=fixture();f.send('pointerdown');f.advance(300);f.send(type,properties);f.advance(1000);assert.deepEqual(f.queries,[],type);f.gestures.dispose();
  }
});
test('新增點／批次選點模式與卸載時不殘留長按查詢',()=>{
  const f=fixture();f.send('pointerdown');f.disable();f.advance(1000);assert.deepEqual(f.queries,[]);f.gestures.dispose();
  const disposed=fixture();disposed.send('pointerdown');disposed.gestures.dispose();disposed.advance(1000);disposed.send('pointerdown');disposed.advance(1000);assert.deepEqual(disposed.queries,[]);
});
