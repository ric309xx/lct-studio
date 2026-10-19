import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.hoisted(()=>{
  window.history.replaceState({},'', '/3d-viewer/p/H4mT8qP2vK6x/?project=taoyuan-building-overlay&parcel=sanzuwu-jiushe-255-41');
  sessionStorage.setItem('lct-3d-viewer-role','viewer');
  sessionStorage.setItem('lct-3d-viewer-projects',JSON.stringify(['taoyuan-building-overlay']));
});
vi.mock('cesium',()=>({
  Ion:{defaultAccessToken:''},IonWorldImageryStyle:{AERIAL:'aerial'},
  OpenStreetMapImageryProvider:vi.fn(),CallbackProperty:vi.fn(),
  Cartesian3:{fromDegreesArray:vi.fn()},ClippingPolygon:vi.fn(),
  ClippingPolygonCollection:Object.assign(vi.fn(),{isSupported:vi.fn(()=>true)}),
  Color:{fromCssColorString:vi.fn()},Entity:vi.fn(),PolygonHierarchy:vi.fn(),
  ScreenSpaceEventHandler:vi.fn(),ScreenSpaceEventType:{LEFT_CLICK:'left-click'},
  createWorldImageryAsync:vi.fn(),createWorldTerrainAsync:vi.fn(),
  Cesium3DTileset:{fromIonAssetId:vi.fn(),fromUrl:vi.fn()},
  Viewer:vi.fn(function(){throw Error('Synthetic renderer unavailable');})
}));
import {App} from './App';
it('confirmed boundaries show provisional model findings without listing 255-86',async()=>{
  vi.stubEnv('VITE_CESIUM_ION_ACCESS_TOKEN','synthetic-public-token');
  render(<App/>);
  expect(await screen.findByRole('checkbox',{name:'顯示地籍範圍'})).not.toBeDisabled();
  expect(screen.queryByRole('checkbox',{name:'地籍界線待補'})).not.toBeInTheDocument();
  expect(screen.getByRole('combobox',{name:'選擇地段地號'})).toHaveValue('sanzuwu-jiushe-255-41');
  expect(screen.queryByRole('option',{name:/255-86/})).not.toBeInTheDocument();
  expect(screen.queryByText('0.00 m²')).not.toBeInTheDocument();
  expect(screen.getByText(/本次已判讀物件.*不代表全筆已清查/)).toBeInTheDocument();
  expect(screen.queryByRole('link',{name:'返回 LCT Studio 首頁'})).not.toBeInTheDocument();
});
