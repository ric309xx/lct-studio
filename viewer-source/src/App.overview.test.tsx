import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
vi.hoisted(()=>window.history.replaceState({},'', '/3d-viewer/p/H4mT8qP2vK6x/?project=taoyuan-building-overlay'));
vi.mock('cesium',()=>({Viewer:vi.fn(),Ion:{},Cesium3DTileset:{fromUrl:vi.fn()}}));
vi.mock('./CaseOverviewMap',()=>({CaseOverviewMap:({cases,onEnter}:any)=><main aria-label="案件總覽地圖"><span>{cases.length} 個案件</span><button onClick={()=>onEnter('sanzuwu-sanzuwu-99-1')}>測試選案</button></main>}));
import {App} from './App';
import {Cesium3DTileset,Viewer} from 'cesium';
it('opens case map before any 3D viewer or private model is requested',()=>{
  render(<App/>);
  expect(screen.getByLabelText('案件總覽地圖')).toBeInTheDocument();
  expect(screen.getByText('18 個案件')).toBeInTheDocument();
  expect(screen.queryByRole('combobox',{name:'選擇案件區塊'})).not.toBeInTheDocument();
  expect(Viewer).not.toHaveBeenCalled();
  expect(Cesium3DTileset.fromUrl).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('測試選案'));
  expect(new URLSearchParams(window.location.search).get('parcel')).toBe('sanzuwu-sanzuwu-99-1');
  expect(screen.queryByLabelText('案件總覽地圖')).not.toBeInTheDocument();
});
