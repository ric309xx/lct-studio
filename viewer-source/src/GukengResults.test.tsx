import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {Cartesian3,Matrix4,Model,type Viewer,type Cesium3DTileset} from 'cesium';
import {GukengResults} from './GukengResults';

const mock=vi.hoisted(()=>({json:new Map<string,unknown>(),ensure:vi.fn()}));
vi.mock('./r2Access',()=>({GUKENG_R2_PROJECT:'gukeng-20261019',PRIVATE_R2_ORIGIN:'https://worker.test',ensureR2Access:mock.ensure,
  privateR2Resource:(url:string)=>({url,fetchJson:async()=>mock.json.get(new URL(url).pathname.split('/tiles')[1]),fetchArrayBuffer:async()=>new Uint8Array([37,80,68,70]).buffer})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();mock.json.clear();mock.ensure.mockClear();});
const ring=[[0,0,0],[10,0,0],[10,10,0],[0,0,0]];
function setup(){
  mock.json.set('/output/results-manifest.json',{transform:Matrix4.toArray(Matrix4.IDENTITY),metadata_url:'/output/meta.json',partition_url:'/output/partition.json',results_date:'2026-10-24',documents:{calculation:{title:'分區面積報告',url:'/output/pdf/classified.pdf?v=3ff1165a8b52b53709cb',preview_pages:['/output/pdf/preview/classified-01.jpg?v=d906be02209722b28b2d']}}});
  mock.json.set('/output/meta.json',{origin_local:[0,0,0],basis_columns:[[1,0,0],[0,1,0],[0,0,1]]});
  mock.json.set('/output/display-settings.json',{context_bounds:[[-10,-10,-10],[20,20,20]],original_home_range_m:100,original_home_heading_degrees:2,original_home_pitch_degrees:-20});
  mock.json.set('/output/partition.json',{completed:{title:'已施作',area_m2:123,model_url:'/output/partition-20261024-v2/completed.glb'},unperformed:{title:'應施作未施作',area_m2:45,model_url:'/output/partition-20261024-v2/unperformed.glb'},boundaries:{completed_local_rings:[ring],unperformed_local_rings:[ring]},view_center_local:[5,5,5],note:'遮蔽區坡面推估，非直接量得。'});
  const viewer={isDestroyed:()=>false,canvas:{clientWidth:1000,clientHeight:800},dataSources:{add:vi.fn(async (x:unknown)=>x),remove:vi.fn()},
    camera:{cancelFlight:vi.fn(),lookAt:vi.fn(),lookAtTransform:vi.fn()},scene:{requestRender:vi.fn(),primitives:{add:vi.fn(),remove:vi.fn()}}} as unknown as Viewer;
  const tileset={show:true,isDestroyed:()=>false,boundingSphere:{center:Cartesian3.fromDegrees(120,23)}} as unknown as Cesium3DTileset;
  return {viewer,tileset};
}
it('waits for the original model before requesting protected report data',()=>{
  render(<GukengResults viewer={null} tileset={null} ready={false}/>);
  expect(screen.getByRole('status')).toHaveTextContent('模型載入後');expect(mock.ensure).not.toHaveBeenCalled();
});
it('displays the existing classified quantities and switches layers without moving the camera',async()=>{
  const {viewer,tileset}=setup(),models:Model[]=[];
  vi.spyOn(Model,'fromGltfAsync').mockImplementation(async()=>{const model={show:false,destroy:vi.fn()} as unknown as Model;models.push(model);return model;});
  render(<GukengResults viewer={viewer} tileset={tileset} ready/>);
  expect(await screen.findByRole('button',{name:'分區面積報告'})).toBeInTheDocument();
  expect(screen.getByText(/123.0/)).toBeInTheDocument();expect(screen.getByText(/非直接量得/)).toBeInTheDocument();
  expect(viewer.camera.lookAt).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'計算坡面'}));
  await waitFor(()=>expect(tileset.show).toBe(false));expect(models).toHaveLength(2);expect(models.every(x=>x.show)).toBe(true);
  expect(viewer.camera.lookAt).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox',{name:'應施作未施作'}));await act(async()=>{});
  expect(models[1].show).toBe(false);expect(models[0].show).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'原始實景'}));await waitFor(()=>expect(tileset.show).toBe(true));
  expect(models.every(x=>!x.show)).toBe(true);expect(viewer.camera.lookAt).toHaveBeenCalledTimes(1);
});
it('opens report pages outside the filtered sidebar and releases private object URLs when closed',async()=>{
  const {viewer,tileset}=setup(),oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let sequence=0;
  URL.createObjectURL=vi.fn(()=>`blob:synthetic-${++sequence}`);URL.revokeObjectURL=vi.fn();
  try{
    const {container}=render(<aside><GukengResults viewer={viewer} tileset={tileset} ready/></aside>);
    fireEvent.click(await screen.findByRole('button',{name:'分區面積報告'}));
    const dialog=await screen.findByRole('dialog',{name:'分區面積報告'});
    expect(container.contains(dialog)).toBe(false);
    expect(screen.getByRole('img',{name:'分區面積報告 第 1 頁'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'下載 PDF'})).toHaveAttribute('download','classified.pdf');
    expect(dialog.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'關閉報告'}));expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
