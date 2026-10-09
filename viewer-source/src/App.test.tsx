import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cesium", () => ({
  Ion: { defaultAccessToken: "" },
  IonWorldImageryStyle: { AERIAL: "aerial" },
  OpenStreetMapImageryProvider: vi.fn(),
  CallbackProperty: vi.fn(),
  Cartesian3: { fromDegreesArray: vi.fn() },
  ClippingPolygon: vi.fn(),
  ClippingPolygonCollection: Object.assign(vi.fn(), {
    isSupported: vi.fn(() => true)
  }),
  Color: { fromCssColorString: vi.fn() },
  Entity: vi.fn(),
  PolygonHierarchy: vi.fn(),
  ScreenSpaceEventHandler: vi.fn(),
  ScreenSpaceEventType: { LEFT_CLICK: "left-click" },
  createWorldImageryAsync: vi.fn(),
  createWorldTerrainAsync: vi.fn(),
  Cesium3DTileset: {
    fromIonAssetId: vi.fn(),
    fromUrl: vi.fn()
  },
  Viewer: vi.fn()
}));

import { App } from "./App";

describe("App controls", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_CESIUM_ION_ACCESS_TOKEN", "");
  });

  it("renders missing-token guidance and required controls", async () => {
    render(<App />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "尚未設定 Cesium ion Access Token"
    );
    expect(screen.getByRole("button", { name: "回到模型" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "切換正上方視角" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "視角朝向正北" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切換全螢幕" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "衛星航照" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText("地形")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "平面" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "收合專案選單" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "框選顯示範圍" })
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "返回 LCT Studio 首頁" })
    ).toHaveAttribute("href", "/");
  });
});
