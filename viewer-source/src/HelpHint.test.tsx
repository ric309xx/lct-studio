import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {HelpHint} from './HelpHint';
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('keeps explanations hidden until hovered and allows moving into the bubble',()=>{
  vi.useFakeTimers();render(<HelpHint label="底圖說明">只切換背景，不改變模型貼圖。</HelpHint>);
  const trigger=screen.getByRole('button',{name:'底圖說明'});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(trigger);const bubble=screen.getByRole('tooltip');expect(bubble).toHaveTextContent('只切換背景');
  expect(trigger).toHaveAttribute('aria-describedby',bubble.id);expect(bubble.parentElement).toBe(document.body);
  fireEvent.mouseLeave(trigger);fireEvent.mouseEnter(bubble);act(()=>vi.advanceTimersByTime(200));expect(bubble).toBeVisible();
  fireEvent.mouseLeave(bubble);act(()=>vi.advanceTimersByTime(200));expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('supports keyboard focus, Escape and click-to-pin for touch',()=>{
  vi.useFakeTimers();render(<HelpHint label="高程說明">正高與內部定位分開處理。</HelpHint>);
  const trigger=screen.getByRole('button',{name:'高程說明'});
  fireEvent.focus(trigger);expect(screen.getByRole('tooltip')).toBeVisible();
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.blur(trigger);fireEvent.click(trigger);fireEvent.mouseLeave(trigger);act(()=>vi.advanceTimersByTime(200));
  expect(screen.getByRole('tooltip')).toBeVisible();fireEvent.click(trigger);expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.click(trigger);fireEvent.pointerDown(document.body);expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('positions help inside narrow viewports rather than the clipped sidebar',()=>{
  vi.stubGlobal('innerWidth',360);vi.stubGlobal('innerHeight',300);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return (this.tagName==='BUTTON'
    ?{left:335,right:360,top:260,bottom:285,width:25,height:25,x:335,y:260}
    :{left:0,right:290,top:0,bottom:120,width:290,height:120,x:0,y:0}) as DOMRect;});
  render(<div style={{overflow:'hidden'}}><HelpHint label="說明">測試文字</HelpHint></div>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'說明'}));const bubble=screen.getByRole('tooltip');
  expect(parseFloat(bubble.style.left)).toBeGreaterThanOrEqual(12);expect(parseFloat(bubble.style.left)+290).toBeLessThanOrEqual(348);
  expect(parseFloat(bubble.style.top)).toBeGreaterThanOrEqual(12);expect(parseFloat(bubble.style.top)+120).toBeLessThanOrEqual(288);
});
it('cleans up timers and the portal when its section unmounts',()=>{
  vi.useFakeTimers();const result=render(<HelpHint label="說明">測試</HelpHint>),trigger=screen.getByRole('button',{name:'說明'});
  fireEvent.mouseEnter(trigger);fireEvent.mouseLeave(trigger);result.unmount();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();expect(vi.getTimerCount()).toBe(0);
});
