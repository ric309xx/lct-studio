import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ControlPointsLayer} from './ControlPointsLayer';
import type {ControlCatalog,ControlPoint} from './controlPoints';
const loader=vi.hoisted(()=>({catalog:vi.fn(),photo:vi.fn()}));
vi.mock('./controlPoints',async original=>({...await original<typeof import('./controlPoints')>(),loadControlCatalog:loader.catalog,loadControlPhoto:loader.photo}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();});
const point=():ControlPoint=>({id:'1006:TEST',profileId:'1006',code:'TEST',originalCode:'TEST-SOURCE',kind:'control',east:250000,north:2765777.5636,orthometric:130,crs:'EPSG:3826',verticalDatum:'TWVD2001',source:'source/AT/gcp_points.json',sourceSha256:'a'.repeat(64),photoNote:'尚無可確認照片',photos:[]});
const catalog=():ControlCatalog=>({schemaVersion:1,projectId:'taoyuan-building-overlay',revision:'test',points:[point(),{...point(),id:'1013:OTHER',profileId:'1013',code:'OTHER'}]});
const enable=()=>fireEvent.click(screen.getByRole('checkbox',{name:'顯示控制點'}));
it('is opt-in and displays only the selected model batch without changing source coordinates',async()=>{
  loader.catalog.mockResolvedValue(catalog());const view=render(<ControlPointsLayer viewer={null} mode="map" profileId="1006"/>);
  expect(loader.catalog).not.toHaveBeenCalled();enable();
  await screen.findByText('本案模型批次 1006 · 1 點');
  expect(screen.queryByRole('option',{name:/OTHER/})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox',{name:'選擇控制點'}),{target:{value:'1006:TEST'}});
  expect(screen.getByText('250000.0000 m')).toBeInTheDocument();expect(screen.getByText('130.0000 m')).toBeInTheDocument();
  expect(screen.getByText(/來源控制點，非模型讀值/)).toBeInTheDocument();expect(screen.getByText(/照片待補/)).toBeInTheDocument();
  view.rerender(<ControlPointsLayer viewer={null} mode="map" profileId="1013"/>);
  expect(screen.queryByRole('region',{name:'控制點 TEST 資訊'})).not.toBeInTheDocument();
});
it('leaves unavailable data explicit and creates no coordinate placeholders on failure',async()=>{
  loader.catalog.mockRejectedValueOnce(Error('網站登入已過期'));render(<ControlPointsLayer viewer={null} mode="map"/>);enable();
  expect(await screen.findByRole('status')).toHaveTextContent('網站登入已過期');
  expect(screen.queryByRole('combobox',{name:'選擇控制點'})).not.toBeInTheDocument();
});
it('loads photos only after point selection, supports enlargement and revokes object URLs on close',async()=>{
  const c=catalog();c.points[0].photos=[{path:`photos/${'b'.repeat(64)}.jpg`,sha256:'b'.repeat(64),filename:'source.jpg',category:'近照',source:'classification.csv',capturedAt:null}];
  loader.catalog.mockResolvedValue(c);loader.photo.mockResolvedValue(new Blob(['photo'],{type:'image/jpeg'}));
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:private-photo')});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});
  render(<ControlPointsLayer viewer={null} mode="map" profileId="1006"/>);enable();await screen.findByRole('combobox',{name:'選擇控制點'});
  expect(loader.photo).not.toHaveBeenCalled();fireEvent.change(screen.getByRole('combobox',{name:'選擇控制點'}),{target:{value:'1006:TEST'}});
  const enlarge=await screen.findByRole('button',{name:'放大 TEST 近照 1'});fireEvent.click(enlarge);
  expect(screen.getByRole('dialog',{name:'TEST 點位照片'})).toBeInTheDocument();expect(screen.getByText(/原始拍攝時間未知/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'關閉點位照片'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'關閉控制點資訊'}));await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-photo'));
});
