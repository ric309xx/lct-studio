import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Cartographic,Rectangle} from 'cesium';
import {CaseOverviewMap} from './CaseOverviewMap';
import {buildCaseOverview,caseMapBounds} from './caseOverview';
import type {CaseMapNavigation,CaseMapView} from './caseNavigation';
import parcels from './taoyuan1006Parcels.json';

const mocks=vi.hoisted(()=>({viewers:[] as any[]}));
vi.mock('./config',()=>({parseConfig:()=>({accessToken:'test-token'})}));
vi.mock('cesium',async importOriginal=>{
  const real=await importOriginal<typeof import('cesium')>();
  return {...real,Viewer:vi.fn(function(){
    const moveListeners=new Set<()=>void>();
    const camera={positionCartographic:{longitude:2.115,latitude:.435,height:160},
      moveEnd:{addEventListener:(fn:()=>void)=>{moveListeners.add(fn);return()=>moveListeners.delete(fn);}},
      setView:vi.fn(),flyTo:vi.fn(),cancelFlight:vi.fn(),
      computeViewRectangle:vi.fn(()=>{throw Error('Detached canvas extent must not be read');})};
    const v={camera,moveListeners,imageryLayers:{addImageryProvider:vi.fn()},entities:{add:vi.fn()},
      scene:{postRender:{addEventListener:()=>()=>{}},cartesianToCanvasCoordinates:()=>undefined,requestRender:vi.fn(),backgroundColor:null},
      isDestroyed:()=>false,destroy:vi.fn()};
    mocks.viewers.push(v);return v;
  })};
});
afterEach(()=>{cleanup();mocks.viewers.length=0;});
const cases=buildCaseOverview(parcels);
describe('map camera round trip',()=>{
  it('zooms to fixed case bounds before entry while preserving the original map for Back',async()=>{
    const savedView:{current:CaseMapView|null}={current:null};
    const savedNavigation:{current:CaseMapNavigation|null}={current:{selected:cases[1].key,query:'',nearbyKeys:[cases[1].key,cases[2].key]}};
    const onEnter=vi.fn();const props={cases,savedView,savedNavigation,onEnter};
    const app=render(<CaseOverviewMap {...props}/>),v=mocks.viewers[0];
    expect(v.camera.flyTo.mock.calls[0][0].destination).toEqual(Rectangle.fromDegrees(...caseMapBounds([cases[1]])));
    v.camera.positionCartographic={longitude:2.11505,latitude:.43505,height:125};
    act(()=>{for(const fn of v.moveListeners)fn();});
    fireEvent.click(screen.getByRole('button',{name:'進入 3D 現地檢視'}));
    expect(savedView.current).toEqual({kind:'camera-2d',longitude:2.11505,latitude:.43505,span:125});
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'全部案件'})).toBeDisabled();
    const zoom=v.camera.flyTo.mock.calls.at(-1)[0];
    expect(zoom.destination).toEqual(Rectangle.fromDegrees(...caseMapBounds([cases[1]],true)));
    expect(zoom.duration).toBe(.65);
    v.camera.positionCartographic={longitude:2.1151,latitude:.4351,height:80};
    act(()=>{for(const fn of v.moveListeners)fn();});
    // Remembering during the temporary zoom must not replace the Back snapshot.
    expect((savedView.current as {span:number}).span).toBe(125);
    await act(async()=>{zoom.complete();await new Promise(resolve=>requestAnimationFrame(resolve));});
    expect(onEnter).toHaveBeenCalledWith(cases[1].parcels[0].key,expect.objectContaining({view:{kind:'camera-2d',longitude:2.1151,latitude:.4351,span:80}}));
    // A transition/teardown may have a totally different camera or zero canvas.
    v.camera.positionCartographic.height=4e7;
    act(()=>{for(const fn of v.moveListeners)fn();});
    app.unmount();expect(v.camera.computeViewRectangle).not.toHaveBeenCalled();
    expect((savedView.current as {span:number}).span).toBe(125);
    render(<CaseOverviewMap {...props}/>);
    const restored=Cartographic.fromCartesian(mocks.viewers[1].camera.setView.mock.calls[0][0].destination);
    expect(restored.longitude).toBeCloseTo(2.11505,9);expect(restored.latitude).toBeCloseTo(.43505,9);expect(restored.height).toBeCloseTo(125,5);
    expect(screen.getByRole('heading',{name:cases[1].title})).toBeInTheDocument();
    expect(savedNavigation.current?.nearbyKeys).toEqual([cases[1].key,cases[2].key]);
  });
  it('uses the same close bounds from far and near overview scales, and cancels before 3D starts',async()=>{
    const savedView:{current:CaseMapView|null}={current:null},onEnter=vi.fn();
    render(<CaseOverviewMap cases={cases} initialKey={cases[1].key} savedNavigation={{current:null}} savedView={savedView} onEnter={onEnter}/>);
    const v=mocks.viewers[0];
    v.camera.positionCartographic.height=2000;
    fireEvent.click(screen.getByRole('button',{name:'進入 3D 現地檢視'}));
    const far=v.camera.flyTo.mock.calls.at(-1)[0];
    fireEvent.click(screen.getByRole('button',{name:'取消進入'}));
    await act(async()=>{far.complete();await new Promise(resolve=>requestAnimationFrame(resolve));});
    expect(onEnter).not.toHaveBeenCalled();
    expect(Cartographic.fromCartesian(v.camera.setView.mock.calls.at(-1)[0].destination).height).toBeCloseTo(2000,5);
    v.camera.positionCartographic.height=40;
    fireEvent.click(screen.getByRole('button',{name:'進入 3D 現地檢視'}));
    const near=v.camera.flyTo.mock.calls.at(-1)[0];
    expect(near.destination).toEqual(far.destination);
    fireEvent.click(screen.getByRole('button',{name:'取消進入'}));
  });
  it('keeps a loading map cancellable and disables unrelated selection controls',()=>{
    const cancel=vi.fn();render(<CaseOverviewMap cases={cases} initialKey={cases[0].key} savedView={{current:null}} savedNavigation={{current:null}} onEnter={()=>{}} entryPhase="loading" onCancelEntry={cancel}/>);
    expect(screen.getByRole('button',{name:'全部案件'})).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('正在準備現地模型');
    fireEvent.click(screen.getByRole('button',{name:'取消進入'}));expect(cancel).toHaveBeenCalledOnce();
  });
});
