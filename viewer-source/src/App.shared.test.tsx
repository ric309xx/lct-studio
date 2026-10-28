import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.hoisted(() => {
  window.history.replaceState({}, "", "/3d-viewer/p/H4mT8qP2vK6x/?project=taoyuan-building-overlay&parcel=dongliao-1507-1");
  sessionStorage.setItem("lct-3d-viewer-role", "admin");
  sessionStorage.setItem("lct-3d-viewer-projects", JSON.stringify(["taoyuan-building-overlay"]));
});
vi.mock("cesium", () => ({
  Ion: { defaultAccessToken: "" }, IonWorldImageryStyle: { AERIAL: "aerial" },
  OpenStreetMapImageryProvider: vi.fn(), CallbackProperty: vi.fn(),
  Cartesian3: { fromDegreesArray: vi.fn() }, ClippingPolygon: vi.fn(),
  ClippingPolygonCollection: Object.assign(vi.fn(), { isSupported: vi.fn(() => true) }),
  Color: { fromCssColorString: vi.fn() }, Entity: vi.fn(), PolygonHierarchy: vi.fn(),
  ScreenSpaceEventHandler: vi.fn(), ScreenSpaceEventType: { LEFT_CLICK: "left-click" },
  createWorldImageryAsync: vi.fn(), createWorldTerrainAsync: vi.fn(),
  Cesium3DTileset: { fromIonAssetId: vi.fn(), fromUrl: vi.fn() },
  Viewer: vi.fn(function () { throw Error("Synthetic renderer unavailable"); })
}));
import { App } from "./App";

it("shared viewer hides home and management controls despite a stale admin role", async () => {
  vi.stubEnv("VITE_CESIUM_ION_ACCESS_TOKEN", "synthetic-public-token");
  render(<App />);
  await screen.findByRole("option", { name: "115年桃園開闢專案" });
  const areaLabel = document.querySelector('.occupancy-summary .estimated-area-label');
  expect(areaLabel).toHaveTextContent('投影面積（初估）');
  expect(areaLabel?.querySelectorAll('br')).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "返回 LCT Studio 首頁" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "切換身分" })).not.toBeInTheDocument();
  expect(screen.queryByText(/一般觀看/)).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole('button',{name:'專案瀏覽說明'}));
  expect(screen.getByRole('tooltip')).toHaveTextContent('一般觀看');
  expect(screen.queryByRole("checkbox", {name:"顯示背景底圖"})).not.toBeInTheDocument();
  expect(screen.queryByText(/可隱藏背景檢查模型/)).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "占用物件視角工具" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /展開視角工具|收合視角工具/ })).not.toBeInTheDocument();
  const selector = screen.getByRole("combobox", { name: "選擇專案" }) as HTMLSelectElement;
  expect([...selector.options].map(option => option.value)).toEqual(["taoyuan-building-overlay"]);
});
