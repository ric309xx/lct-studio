import {cleanup,fireEvent,render,screen,act} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {Cartesian3,Matrix4,type Viewer,type Cesium3DTileset} from 'cesium';
import {SurveyToolsPanel} from './SurveyToolsPanel';
import {HEIGHT_PROFILES,resolveModelHeight} from './heightReference';
const tracking=vi.hoisted(()=>({onPoint:null as null|((p:unknown)=>void),canSelect:null as null|(()=>boolean),clear:vi.fn(),stop:vi.fn()}));
vi.mock('./surveyPicking',()=>({selectSurveyPoint:vi.fn((_v,_m,point,canSelect)=>{tracking.onPoint=point;tracking.canSelect=canSelect;return {clear:tracking.clear,dispose:tracking.stop};})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function props(){return {viewer:{isDestroyed:()=>false} as Viewer,models:()=>[],resolution:null,ready:true,active:false,pointCount:0,draft:null,results:[],notice:'',onStart:vi.fn(),onUndo:vi.fn(),onFinish:vi.fn(),onCancel:vi.fn(),onClear:vi.fn()};}
const expand=()=>fireEvent.click(screen.getByRole('button',{name:/座標與量距/}));
it('starts distance, collapses and disposes cursor tracking',()=>{
  const p=props();render(<SurveyToolsPanel {...p}/>);
  expect(screen.getByRole('button',{name:/座標與量距/})).toHaveAttribute('aria-expanded','false');
  expect(screen.queryByRole('button',{name:/開始量距離/})).not.toBeInTheDocument();expect(tracking.stop).not.toHaveBeenCalled();
  expand();fireEvent.click(screen.getByRole('button',{name:/開始量距離/}));expect(p.onStart).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:/座標與量距/}));expect(tracking.stop).toHaveBeenCalledOnce();expect(screen.getByRole('button',{name:/座標與量距/})).toHaveAttribute('aria-expanded','false');
});
it('requires two points to finish and supports undo/cancel',()=>{
  const p={...props(),active:true,pointCount:1},r=render(<SurveyToolsPanel {...p}/>);expand();
  expect(screen.getByRole('button',{name:'完成量距'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'撤銷一點'}));expect(p.onUndo).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(p.onCancel).toHaveBeenCalledOnce();
  r.rerender(<SurveyToolsPanel {...p} pointCount={2}/>);fireEvent.click(screen.getByRole('button',{name:'完成量距'}));expect(p.onFinish).toHaveBeenCalledOnce();
});
it('renders a dock launcher that opens an associated panel',()=>{
  render(<nav aria-label="模型控制"><SurveyToolsPanel {...props()}/></nav>);
  const toggle=screen.getByRole('button',{name:'座標與量距'});
  expect(toggle.closest('nav')).toHaveAttribute('aria-label','模型控制');
  expect(screen.queryByRole('region',{name:'座標與量距面板'})).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole('region',{name:'座標與量距面板'})).toHaveAttribute('id',toggle.getAttribute('aria-controls'));
  expect(toggle).toHaveAttribute('aria-expanded','true');
});
it('keeps the selected position fixed for copy, including an unsuccessful subsequent click',async()=>{
  const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
  render(<SurveyToolsPanel {...props()}/>);expand();
  act(()=>tracking.onPoint?.({position:Cartesian3.fromDegrees(121,25,150),source:'terrain'}));
  expect(screen.getByText(/背景地形（僅供參考）/)).toBeInTheDocument();expect(screen.getAllByText('待確認')).not.toHaveLength(0);
  expect(screen.getByText(/已固定選點/)).toBeInTheDocument();
  act(()=>tracking.onPoint?.(undefined));expect(screen.getByText(/原選點不變/)).toBeInTheDocument();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'複製座標'}));});expect(copy.mock.calls[0][0]).toBe('25.00000000,121.00000000');
  expect(screen.getByText('座標已複製（緯度,經度）')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'清除選點'}));expect(tracking.clear).toHaveBeenCalledOnce();
  expect(screen.getByRole('button',{name:'複製座標'})).toBeDisabled();
});
it('pauses coordinate selection for measurement/edit tools and releases click priority on collapse',()=>{
  const onModeChange=vi.fn(),p={...props(),onModeChange},r=render(<SurveyToolsPanel {...p}/>);expand();
  expect(onModeChange).toHaveBeenLastCalledWith(true);expect(tracking.canSelect?.()).toBe(true);
  r.rerender(<SurveyToolsPanel {...p} active/>);expect(tracking.canSelect?.()).toBe(false);expect(onModeChange).toHaveBeenLastCalledWith(false);
  r.rerender(<SurveyToolsPanel {...p} blocked/>);expect(tracking.canSelect?.()).toBe(false);
  r.rerender(<SurveyToolsPanel {...p}/>);expect(tracking.canSelect?.()).toBe(true);
  expand();expect(onModeChange).toHaveBeenLastCalledWith(false);expect(tracking.stop).toHaveBeenCalledOnce();
});
it('shows three kinds of length results and the three-record limit',()=>{
  render(<SurveyToolsPanel {...props()} results={[1,2,3].map(id=>({id,spatialM:12,gridM:10,heightDifferenceM:-2,pointCount:2}))}/>);expand();
  expect(screen.getAllByText('三維直線')).toHaveLength(3);expect(screen.getAllByText('平面距離')).toHaveLength(3);expect(screen.getAllByText('-2.00 m')).toHaveLength(3);
  expect(screen.getByRole('button',{name:/開始量距離/})).toBeDisabled();
});
it('updates roof and road orthometric readings from the picked model surface without flattening them',()=>{
  const profile=HEIGHT_PROFILES[0],model={modelMatrix:Matrix4.clone(Matrix4.IDENTITY),boundingSphere:{center:Cartesian3.fromDegrees(121.2,25,135)}} as Cesium3DTileset;
  const resolution=resolveModelHeight(model,profile,profile.rootTilesetSha256);
  render(<SurveyToolsPanel {...props()} models={()=>[model]} resolution={resolution}/>);expand();
  const moveToHeight=(height:number)=>act(()=>tracking.onPoint?.({source:'model',model,position:Cartesian3.fromDegrees(121.2,25,height+resolution.undulationM!)}));
  moveToHeight(135);expect(screen.getByText('135.00 m')).toBeInTheDocument();
  moveToHeight(150);expect(screen.getByText('150.00 m')).toBeInTheDocument();expect(screen.queryByText('135.00 m')).not.toBeInTheDocument();
});
