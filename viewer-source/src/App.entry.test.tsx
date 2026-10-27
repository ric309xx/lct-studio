import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.hoisted(()=>{
  window.history.replaceState({},'', '/3d-viewer/p/H4mT8qP2vK6x/?project=taoyuan-building-overlay&view=cases');
  sessionStorage.setItem('lct-3d-viewer-role','viewer');
  sessionStorage.setItem('lct-3d-viewer-projects',JSON.stringify(['taoyuan-building-overlay']));
});
vi.mock('cesium',()=>({Viewer:vi.fn(function(){throw Error('Model renderer unavailable');}),Ion:{}}));
vi.mock('./CaseOverviewMap',()=>({CaseOverviewMap:({onEnter,savedNavigation,savedView,entryError}:any)=><main aria-label="案件總覽地圖">
  <output aria-label="保留地圖狀態">{JSON.stringify({navigation:savedNavigation.current,view:savedView.current})}</output>
  {entryError&&<p role="alert">{entryError}</p>}
  <button onClick={()=>{
    savedNavigation.current={selected:'sanzuwu-sanzuwu-646-2',query:'646',nearbyKeys:['sanzuwu-sanzuwu-646-2']};
    savedView.current={kind:'camera-2d',longitude:2.115,latitude:.435,span:120};
    onEnter('sanzuwu-sanzuwu-646-2',{view:savedView.current,reducedMotion:false});
  }}>帶動畫進入案件</button>
</main>}));
import {App} from './App';
afterEach(cleanup);
it('keeps the selected map and returns its URL when model initialization fails',async()=>{
  vi.stubEnv('VITE_CESIUM_ION_ACCESS_TOKEN','synthetic-public-token');
  render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'帶動畫進入案件'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('模型尚未載入成功');
  const snapshot=JSON.parse(screen.getByLabelText('保留地圖狀態').textContent!);
  expect(snapshot.navigation.selected).toBe('sanzuwu-sanzuwu-646-2');
  expect(snapshot.navigation.query).toBe('646');expect(snapshot.view.span).toBe(120);
  expect(new URLSearchParams(window.location.search).get('view')).toBe('cases');
  expect(new URLSearchParams(window.location.search).has('parcel')).toBe(false);
});
