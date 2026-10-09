// 此檔案由 scripts/generate-projects.mjs 產生，請修改 project-data/projects.json。
import type { ModelSource } from "./types/model";

export type CameraPreset = {
  longitude: number;
  latitude: number;
  height: number;
  headingDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
};

export type ViewerProject = {
  id: string;
  name: string;
  location: string;
  sharePath: string;
  modelSource: ModelSource;
  camera?: CameraPreset;
  overlayUrl?: string;
};

export type ViewerComparison = {
  id: string;
  name: string;
  location: string;
  sharePath: string;
  leftProjectId: string;
  rightProjectId: string;
  leftLabel: string;
  rightLabel: string;
  defaultSplitPosition: number;
  projectOptions?: Array<{
    projectId: string;
    label: string;
  }>;
  displayMode?: "split" | "combined";
};

export function createProjectCatalog(primarySource: ModelSource): ViewerProject[] {
  return [
    {
      id: "ruifang-nanya-rock-20260810",
      name: "20260810 南雅奇岩",
      location: "新北市瑞芳區南雅奇岩",
      sharePath: "/3d-viewer/p/Y8nA4rK2mP7x/",
      modelSource: { type: "cesium-ion", assetId: 5124638 },
      camera: {
              longitude: 121.89251409,
              latitude: 25.11970394,
              height: 69.3,
              headingDegrees: 56.958,
              pitchDegrees: -39.588,
              rollDegrees: 0
      }
    },
    {
      id: "ruifang-shuinandong-smelter-20260811",
      name: "水湳洞選煉廠遺址",
      location: "新北市瑞芳區水湳洞",
      sharePath: "/3d-viewer/p/S5nD8gR2mK6x/",
      modelSource: { type: "cesium-ion", assetId: 5125623 },
      camera: {
              longitude: 121.86372189,
              latitude: 25.1197547,
              height: 184.63,
              headingDegrees: 150.689,
              pitchDegrees: -24.604,
              rollDegrees: 360
      }
    },
    {
      id: "sanxia-solar-2",
      name: "新北市三峽區太陽能板2",
      location: "新北市三峽區",
      sharePath: "/3d-viewer/p/T7nV2qL9bX4m/",
      modelSource: { type: "cesium-ion", assetId: 5105006 },
      camera: {
              longitude: 121.36918107,
              latitude: 24.90029173,
              height: 144.52,
              headingDegrees: 50.51,
              pitchDegrees: -33.616,
              rollDegrees: 0
      }
    },
    {
      id: "sanxia-solar-b3dms",
      name: "新北市三峽區太陽能板_b3dms",
      location: "新北市三峽區",
      sharePath: "/3d-viewer/p/B3dM7sQ2kL9x/",
      modelSource: { type: "cesium-ion", assetId: 5105647 },
      camera: {
              longitude: 121.36918107,
              latitude: 24.90029173,
              height: 144.52,
              headingDegrees: 50.51,
              pitchDegrees: -33.616,
              rollDegrees: 0
      }
    },
    {
      id: "ion-5107551-test",
      name: "新北市瑞芳區邊坡測試_OBJ",
      location: "新北市瑞芳區",
      sharePath: "/3d-viewer/p/L5cT7iQ1nA9x/",
      modelSource: { type: "cesium-ion", assetId: 5107551 },
      camera: {
              longitude: 121.84342978,
              latitude: 25.12720965,
              height: 93.29,
              headingDegrees: 141.554,
              pitchDegrees: -21.041,
              rollDegrees: 360
      }
    },
    {
      id: "gongliao-longdong-rock-2",
      name: "龍洞｜貼近攝影（20260805）",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/G7rN4xP2mQ8v/",
      modelSource: { type: "cesium-ion", assetId: 5117313 },
      camera: {
              longitude: 121.92214411,
              latitude: 25.10834929,
              height: 198.45,
              headingDegrees: 354.942,
              pitchDegrees: -38.005,
              rollDegrees: 0
      }
    },
    {
      id: "gongliao-longdong-general-20260805",
      name: "龍洞｜一般攝影（20260805）",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/N5cR8vT2mQ6x/",
      modelSource: { type: "cesium-ion", assetId: 5119307 },
      camera: {
              longitude: 121.92214411,
              latitude: 25.10834929,
              height: 198.45,
              headingDegrees: 354.942,
              pitchDegrees: -38.005,
              rollDegrees: 0
      }
    },
    {
      id: "gongliao-longdong-manual-20260812",
      name: "龍洞｜手動補拍（20260812）",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/M8dR3nQ7vK2x/",
      modelSource: { type: "cesium-ion", assetId: 5131283 },
      camera: {
              longitude: 121.92214411,
              latitude: 25.10834929,
              height: 198.45,
              headingDegrees: 354.942,
              pitchDegrees: -38.005,
              rollDegrees: 0
      }
    },
    {
      id: "gongliao-longdong-twd97-20260926",
      name: "龍洞｜TWD97成果（20260926）",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/R7nD3vQ9mK5x/",
      modelSource: { type: "cesium-ion", assetId: 5943670 },
      camera: {
              longitude: 121.92214411,
              latitude: 25.10834929,
              height: 198.45,
              headingDegrees: 354.942,
              pitchDegrees: -38.005,
              rollDegrees: 0
      }
    },
    {
      id: "gongliao-longdong-extension-20260926",
      name: "龍洞｜延伸區成果（20260926）",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/D9vK4mQ7rN2x/",
      modelSource: { type: "cesium-ion", assetId: 5943671 },
      camera: {
              longitude: 121.92214411,
              latitude: 25.10834929,
              height: 198.45,
              headingDegrees: 354.942,
              pitchDegrees: -38.005,
              rollDegrees: 0
      }
    },
    {
      id: "taoyuan-building-overlay",
      name: "桃園建物套繪",
      location: "桃園市｜三座屋段舊社小段",
      sharePath: "/3d-viewer/p/H4mT8qP2vK6x/",
      modelSource: { type: "cesium-ion", assetId: 6000372 },
      camera: {
              longitude: 121.21695555,
              latitude: 24.961801831,
              height: 210,
              headingDegrees: 0,
              pitchDegrees: -90,
              rollDegrees: 0
      }
    }
  ];
}

export function createComparisonCatalog(): ViewerComparison[] {
  return [
    {
      id: "sanxia-obj-b3dms-compare",
      name: "新北市三峽區太陽能板 OBJ／B3DMS 對比",
      location: "新北市三峽區",
      sharePath: "/3d-viewer/p/C8vN4pR2xK7m/",
      leftProjectId: "sanxia-solar-2",
      rightProjectId: "sanxia-solar-b3dms",
      leftLabel: "OBJ",
      rightLabel: "B3DMS",
      defaultSplitPosition: 0.5
    },
    {
      id: "longdong-general-close-compare",
      name: "龍洞｜歷次成果比較",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/V6mQ2rL8dK4x/",
      leftProjectId: "gongliao-longdong-general-20260805",
      rightProjectId: "gongliao-longdong-manual-20260812",
      leftLabel: "一般攝影",
      rightLabel: "手動補拍",
      defaultSplitPosition: 0.5,
      projectOptions: [
              {
                      projectId: "gongliao-longdong-general-20260805",
                      label: "一般攝影"
              },
              {
                      projectId: "gongliao-longdong-manual-20260812",
                      label: "手動補拍"
              },
              {
                      projectId: "gongliao-longdong-rock-2",
                      label: "08/05 貼近攝影"
              },
              {
                      projectId: "gongliao-longdong-twd97-20260926",
                      label: "09/26 TWD97"
              },
              {
                      projectId: "gongliao-longdong-extension-20260926",
                      label: "09/26 延伸區"
              }
      ]
    },
    {
      id: "longdong-20260926-combined",
      name: "龍洞｜20260926 雙區合併檢視",
      location: "新北市貢寮區龍洞岩場",
      sharePath: "/3d-viewer/p/Q6mL9vR3dT8x/",
      leftProjectId: "gongliao-longdong-extension-20260926",
      rightProjectId: "gongliao-longdong-twd97-20260926",
      leftLabel: "09/26 延伸區",
      rightLabel: "09/26 TWD97主區",
      defaultSplitPosition: 0.5,
      displayMode: "combined"
    }
  ];
}

export function readProjectId(): string {
  return (
    new URLSearchParams(window.location.search).get("project") ??
    sessionStorage.getItem("lct-3d-viewer-active-project") ??
    "ruifang-nanya-rock-20260810"
  );
}

export function getProjectSharePath(
  projects: ViewerProject[],
  projectId: string
): string {
  return (
    projects.find((project) => project.id === projectId)?.sharePath ??
    "/3d-viewer/"
  );
}

export function getComparisonSharePath(
  comparisons: ViewerComparison[],
  comparisonId: string
): string {
  return (
    comparisons.find((comparison) => comparison.id === comparisonId)?.sharePath ??
    "/3d-viewer/"
  );
}
