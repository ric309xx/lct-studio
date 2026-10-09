import driplineMetrics from "./taoyuanDriplineMetrics.json";
import { CadastralInfoPanel } from "./CadastralInfoPanel";
import { focusParcelOrbit, tuneParcelNavigation } from "./parcelNavigation";
import { createOccupancyUnderlay } from "./occupancyUnderlay";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CallbackProperty,
  CallbackPositionProperty,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Cesium3DTileset,
  ClassificationType,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  ConstantProperty,
  createWorldImageryAsync,
  createWorldTerrainAsync,
  EllipsoidTangentPlane,
  Entity,
  GeoJsonDataSource,
  HeadingPitchRange,
  HorizontalOrigin,
  Ion,
  IonWorldImageryStyle,
  JulianDate,
  LabelStyle,
  Matrix3,
  Matrix4,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  PolygonHierarchy,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ShadowMode,
  SplitDirection,
  Transforms,
  VerticalOrigin,
  Viewer,
  type Primitive
} from "cesium";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Expand,
  Focus,
  Frame,
  LoaderCircle,
  Map as MapIcon,
  Pentagon,
  Pause,
  Play,
  RefreshCw,
  Ruler,
  RotateCcw,
  Share2,
  Sun,
  TriangleAlert
} from "lucide-react";
import { parseConfig } from "./config";
import { readSavedClipping, type ClipCoordinate } from "./clipping";
import { toViewerError } from "./errors";
import {
  createComparisonCatalog,
  createProjectCatalog,
  getComparisonSharePath,
  getProjectSharePath,
  readProjectId,
  type CameraPreset,
  type ViewerComparison
} from "./projects";
import type { ModelSource, ViewerStatus } from "./types/model";
import { BuildingSectionTool } from "./BuildingSectionTool";

const INITIAL_STATUS: ViewerStatus = {
  phase: "initializing",
  message: "正在初始化 3D 檢視器…"
};

const STORED_ROLE = sessionStorage.getItem("lct-3d-viewer-role");
const REQUESTED_PROJECT_ID = new URLSearchParams(window.location.search).get(
  "project"
);
const IS_LOCAL_DIRECT_ENTRY =
  ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
  REQUESTED_PROJECT_ID === null;
const IS_ADMIN =
  IS_LOCAL_DIRECT_ENTRY ||
  STORED_ROLE === "admin" ||
  (import.meta.env.MODE !== "production" && STORED_ROLE !== "viewer");
const ALLOWED_PROJECT_IDS = (() => {
  try {
    const stored = sessionStorage.getItem("lct-3d-viewer-projects");
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
})();
const ALLOWED_COMPARISON_IDS = (() => {
  try {
    const stored = sessionStorage.getItem("lct-3d-viewer-comparisons");
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
})();
const PROJECT_CATALOG_ORDER = [
  "ruifang-nanya-rock-20260810",
  "ruifang-shuinandong-smelter-20260811",
  "ion-5107551-test",
  "sanxia-obj-b3dms-compare",
  "sanxia-solar-2",
  "sanxia-solar-b3dms",
  "taoyuan-building-overlay",
  "longdong-20260926-combined",
  "longdong-general-close-compare",
  "gongliao-longdong-twd97-20260926",
  "gongliao-longdong-extension-20260926",
  "gongliao-longdong-general-20260805",
  "gongliao-longdong-rock-2",
  "gongliao-longdong-manual-20260812"
];

type ClipMode = "idle" | "drawing" | "applied";
type MeasureMode = "idle" | "distance" | "area";
type MeasureKind = "distance" | "area";
type CadastralDisplayMode = "original" | "model-ground";
const TAIWAN_UTC_OFFSET = "+08:00";

function getTaiwanDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatSunTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}`;
}
type AreaResult = { id: number; value: string };
type ProjectLandmark = {
  id: string;
  title: string;
  category: string;
  description: string;
  longitude: number;
  latitude: number;
  height: number;
};
type AreaCameraView = {
  destination: Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
};

type ModelCalibration = {
  longitude: number;
  latitude: number;
  height: number;
  east: number;
  north: number;
  heading: number;
};

const LONGDONG_DEFAULT_CALIBRATION: ModelCalibration = {
  longitude: 121.922111,
  latitude: 25.109526,
  height: 53,
  east: 0,
  north: 0,
  heading: 0
};

const LONGDONG_CALIBRATION_KEY = "drone-viewer-model-transform-5115409-v2";

function readLongdongCalibration(): ModelCalibration {
  try {
    const saved = JSON.parse(
      localStorage.getItem(LONGDONG_CALIBRATION_KEY) ?? "{}"
    ) as Partial<ModelCalibration>;
    return Object.fromEntries(
      Object.entries(LONGDONG_DEFAULT_CALIBRATION).map(([key, fallback]) => [
        key,
        Number.isFinite(saved[key as keyof ModelCalibration])
          ? saved[key as keyof ModelCalibration]
          : fallback
      ])
    ) as ModelCalibration;
  } catch {
    return { ...LONGDONG_DEFAULT_CALIBRATION };
  }
}

function saveLongdongCalibration(calibration: ModelCalibration): void {
  localStorage.setItem(LONGDONG_CALIBRATION_KEY, JSON.stringify(calibration));
}

type CadastralInfo = {
  parcelNo: string;
  county: string;
  landOffice: string;
  sectionName: string;
  sectionCode: string;
  sectionExtensionCode?: string;
  townCode: string;
  surveyMethod: string;
  surveyType: string;
  mapDate: string;
  crs: string;
  coordinateSystem?: string;
  scale: string;
  digitizedDate?: string;
  registrationDate?: string;
  announcedLandValue?: string;
  rightsCategory?: string;
  useZone?: string;
  landUseCategory?: string;
  cadastralAreaM2?: number;
  occupiedAreaM2?: number;
  occupancyPercent?: number;
  analysisNote?: string;
};

type CadastralParcel = {
  key: string;
  label: string;
  fillEntityId: string;
  info: CadastralInfo;
  focus?: CameraPreset;
};

type CadastralProject = {
  url: string;
  parcels: CadastralParcel[];
};

const SANXIA_CADASTRAL_INFO: CadastralInfo = {
  parcelNo: "388",
  county: "新北市",
  landOffice: "樹林",
  sectionName: "十三添一段",
  sectionCode: "1988",
  townCode: "15",
  surveyMethod: "數值法",
  surveyType: "地籍圖重測",
  mapDate: "2020-09",
  crs: "TWD97 二度 TM（EPSG:3826）",
  scale: "1:500"
};

const TAOYUAN_102_45_INFO: CadastralInfo = {
  parcelNo: "102-45",
  county: "桃園市",
  landOffice: "中壢",
  sectionName: "三座屋段舊社小段",
  sectionCode: "0205",
  sectionExtensionCode: "0",
  townCode: "03",
  surveyMethod: "圖解法",
  surveyType: "修正測量",
  mapDate: "1959-09",
  crs: "TWD97 二度 TM（EPSG:3826）／TWVD2001",
  coordinateSystem: "TWD97 二度分帶（EPSG:3826）",
  scale: "1:600",
  digitizedDate: "2002-11",
  registrationDate: "民國 053 年 07 月 15 日",
  announcedLandValue: "135,000 元／平方公尺",
  rightsCategory: "鄉鎮市・100.00%",
  useZone: "—",
  landUseCategory: "—",
  cadastralAreaM2: 500,
  occupiedAreaM2: driplineMetrics.occupiedAreaM2,
  occupancyPercent: driplineMetrics.occupancyPercent,
  analysisNote: driplineMetrics.note
};

const CADASTRAL_PROJECTS: Record<string, CadastralProject> = {
  "sanxia-solar-2": {
    url: "overlays/sanxia-solar-2-cadastral.geojson",
    parcels: [{
      key: "shisantianyi-388",
      label: "十三添一段 388 地號",
      fillEntityId: "parcel-388-fill",
      info: SANXIA_CADASTRAL_INFO
    }]
  },
  "taoyuan-building-overlay": {
    url: "overlays/taoyuan-building-overlay.geojson",
    parcels: [{
      key: "sanzuwu-jiushe-102-45",
      label: "三座屋段舊社小段 102-45 地號",
      fillEntityId: "parcel-102-45-fill-1",
      info: TAOYUAN_102_45_INFO,
      focus: {
        longitude: 121.21695555,
        latitude: 24.961801831,
        height: 210,
        headingDegrees: 0,
        pitchDegrees: -90,
        rollDegrees: 0
      }
    }]
  }
};

function applyCadastralDisplayMode(
  dataSource: GeoJsonDataSource,
  mode: CadastralDisplayMode,
  occupancyVisible = true
) {
  for (const entity of dataSource.entities.values) {
    const kind = entity.properties?.kind?.getValue();
    entity.show =
      kind === "occupancy-building" ? occupancyVisible && !entity.properties?.continuousOccupancy?.getValue() : mode === "original";
    if (entity.polygon) {
      entity.polygon.material = new ColorMaterialProperty(
        kind === "occupancy-building"
          ? Color.fromCssColorString("#30e67e").withAlpha(0.62)
          : Color.fromCssColorString("#ef626c").withAlpha(0.3)
      );
      entity.polygon.classificationType = new ConstantProperty(
        ClassificationType.BOTH
      );
    }
    if (entity.polyline) {
      entity.polyline.show = new ConstantProperty(true);
      entity.polyline.width = new ConstantProperty(3);
      entity.polyline.material = new ColorMaterialProperty(
        Color.fromCssColorString("#ffbf47")
      );
      entity.polyline.classificationType = new ConstantProperty(
        ClassificationType.BOTH
      );
      entity.polyline.depthFailMaterial = new ColorMaterialProperty(
        Color.fromCssColorString("#ffd99a").withAlpha(0.9)
      );
    }
  }
}

function densifyBoundaryForGroundSampling(
  positions: Cartesian3[],
  spacingMeters = 2
): Cartographic[] {
  const samples: Cartographic[] = [];
  for (let index = 0; index < positions.length - 1; index += 1) {
    const start = positions[index];
    const end = positions[index + 1];
    const steps = Math.max(
      1,
      Math.ceil(Cartesian3.distance(start, end) / spacingMeters)
    );
    for (let step = 0; step < steps; step += 1) {
      samples.push(
        Cartographic.fromCartesian(
          Cartesian3.lerp(start, end, step / steps, new Cartesian3())
        )
      );
    }
  }
  return samples;
}

const PROJECT_LANDMARKS: Record<string, ProjectLandmark[]> = {
  "sanxia-solar-2": [
    {
      id: "office",
      title: "辦公室",
      category: "行政空間",
      description: "廠區主要辦公與行政作業空間。",
      longitude: 121.36992,
      latitude: 24.90072,
      height: 118
    },
    {
      id: "storage",
      title: "儲藏室",
      category: "倉儲空間",
      description: "廠區物料與設備儲放空間。",
      longitude: 121.36966,
      latitude: 24.90081,
      height: 116
    }
  ]
};

function readProjectLandmarks(projectId: string): ProjectLandmark[] {
  const defaults = PROJECT_LANDMARKS[projectId] ?? [];
  try {
    const saved = JSON.parse(
      localStorage.getItem(`drone-viewer-landmarks-${projectId}`) ?? "[]"
    ) as Array<Pick<ProjectLandmark, "id" | "longitude" | "latitude" | "height">>;
    return defaults.map((item) => ({
      ...item,
      ...(saved.find((position) => position.id === item.id) ?? {})
    }));
  } catch {
    return defaults.map((item) => ({ ...item }));
  }
}

function saveProjectLandmarks(projectId: string, landmarks: ProjectLandmark[]) {
  localStorage.setItem(
    `drone-viewer-landmarks-${projectId}`,
    JSON.stringify(
      landmarks.map(({ id, longitude, latitude, height }) => ({
        id,
        longitude,
        latitude,
        height
      }))
    )
  );
}

async function loadModel(
  source: ModelSource,
  comparisonMode = false
): Promise<Cesium3DTileset> {
  if (source.type === "cesium-ion") {
    const detailedLongdongB3dms = [5943670, 5943671].includes(source.assetId);
    const highQualityB3dms = source.assetId === 5105647;
    return Cesium3DTileset.fromIonAssetId(source.assetId, {
      maximumScreenSpaceError: detailedLongdongB3dms
        ? 0.5
        : comparisonMode
          ? 20
          : highQualityB3dms
            ? 4
            : 16,
      dynamicScreenSpaceError: detailedLongdongB3dms
        ? false
        : comparisonMode || !highQualityB3dms,
      progressiveResolutionHeightFraction: detailedLongdongB3dms
        ? 0
        : comparisonMode
          ? 0.45
          : highQualityB3dms
            ? 0
            : 0.3,
      cullRequestsWhileMoving: detailedLongdongB3dms
        ? true
        : comparisonMode || !highQualityB3dms,
      foveatedScreenSpaceError: !detailedLongdongB3dms,
      preloadFlightDestinations: true,
      preloadWhenHidden: false,
      loadSiblings: false,
      cacheBytes: detailedLongdongB3dms
        ? 1024 * 1024 * 1024
        : comparisonMode
          ? 256 * 1024 * 1024
          : highQualityB3dms
            ? 1024 * 1024 * 1024
            : 512 * 1024 * 1024,
      maximumCacheOverflowBytes: detailedLongdongB3dms
        ? 512 * 1024 * 1024
        : comparisonMode
          ? 128 * 1024 * 1024
          : highQualityB3dms
            ? 1024 * 1024 * 1024
            : 512 * 1024 * 1024
    });
  }
  return Cesium3DTileset.fromUrl(source.tilesetUrl, comparisonMode
    ? {
        maximumScreenSpaceError: 20,
        dynamicScreenSpaceError: true,
        progressiveResolutionHeightFraction: 0.45,
        cullRequestsWhileMoving: true,
        cacheBytes: 256 * 1024 * 1024,
        maximumCacheOverflowBytes: 128 * 1024 * 1024
      }
    : undefined);
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const parcelOrbitTargetRef = useRef<Cartesian3 | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const secondaryTilesetRef = useRef<Cesium3DTileset | null>(null);
  const overlayDataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const cadastralDataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const cadastralModelGroundEntitiesRef = useRef<Entity[]>([]);
  const cadastralLabelEntitiesRef = useRef<Entity[]>([]);
  const cadastralHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const landmarkHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const calibrationHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const landmarkEntitiesRef = useRef<Entity[]>([]);
  const clippingRef = useRef<ClippingPolygonCollection | null>(null);
  const clippingHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const previewEntitiesRef = useRef<Entity[]>([]);
  const drawPositionsRef = useRef<Cartesian3[]>([]);
  const appliedCoordinatesRef = useRef<ClipCoordinate[]>([]);
  const clippingStorageKeyRef = useRef("");
  const measurementHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const measurementDragHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const measurementDraftEntitiesRef = useRef<Entity[]>([]);
  const completedMeasurementsRef = useRef<Record<MeasureKind, Entity[][]>>({
    distance: [],
    area: []
  });
  const areaCameraViewsRef = useRef<AreaCameraView[]>([]);
  const measurementPositionsRef = useRef<Cartesian3[]>([]);
  const distancePositionsRef = useRef<Cartesian3[][]>([]);
  const distancePointLookupRef = useRef(
    new globalThis.Map<string, { measurementIndex: number; pointIndex: number }>()
  );
  const measurementKindRef = useRef<MeasureKind>("distance");
  const cameraPresetRef = useRef<CameraPreset | null>(null);
  const overlayVisibleRef = useRef(true);
  const overlayXrayRef = useRef(false);
  const landmarksVisibleRef = useRef(true);
  const landmarkEditEnabledRef = useRef(false);
  const calibrationPickEnabledRef = useRef(false);
  const longdongLocalCenterRef = useRef<Cartesian3 | null>(null);
  const modelCalibrationRef = useRef<ModelCalibration>(
    LONGDONG_DEFAULT_CALIBRATION
  );
  const [status, setStatus] = useState<ViewerStatus>(INITIAL_STATUS);
  const [reloadKey, setReloadKey] = useState(0);
  const [basemap, setBasemap] = useState<"aerial" | "road">("aerial");
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [overlayXray, setOverlayXray] = useState(false);
  const [cadastralVisible, setCadastralVisible] = useState(true);
  const [occupancyVisible, setOccupancyVisible] = useState(true);
  const occupancyVisibleRef = useRef(true);
  const [cadastralDisplayMode, setCadastralDisplayMode] =
    useState<CadastralDisplayMode>("original");
  const [projectHasCadastral, setProjectHasCadastral] = useState(false);
  const [modelGroundAvailable, setModelGroundAvailable] = useState(false);
  const [selectedCadastral, setSelectedCadastral] =
    useState<CadastralInfo | null>(null);
  const [selectedCadastralParcelKey, setSelectedCadastralParcelKey] = useState("");
  const [projectHasOverlay, setProjectHasOverlay] = useState(false);
  const [projectHasLandmarks, setProjectHasLandmarks] = useState(false);
  const [projectHasSunSimulation, setProjectHasSunSimulation] = useState(false);
  const [sunSimulationEnabled, setSunSimulationEnabled] = useState(false);
  const [sunSimulationPlaying, setSunSimulationPlaying] = useState(false);
  const [sunDate, setSunDate] = useState(getTaiwanDateString);
  const [sunMinutes, setSunMinutes] = useState(12 * 60);
  const [landmarksVisible, setLandmarksVisible] = useState(true);
  const [landmarkEditEnabled, setLandmarkEditEnabled] = useState(false);
  const [calibrationPickEnabled, setCalibrationPickEnabled] = useState(false);
  const [modelCalibration, setModelCalibration] = useState<ModelCalibration>(
    LONGDONG_DEFAULT_CALIBRATION
  );
  const [selectedLandmark, setSelectedLandmark] =
    useState<ProjectLandmark | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");
  const [mapNotice, setMapNotice] = useState("");
  const [clipMode, setClipMode] = useState<ClipMode>("idle");
  const [clipPointCount, setClipPointCount] = useState(0);
  const [clipNotice, setClipNotice] = useState("");
  const [measureMode, setMeasureMode] = useState<MeasureMode>("idle");
  const [measurePointCount, setMeasurePointCount] = useState(0);
  const [measureNotice, setMeasureNotice] = useState("");
  const [distanceMeasureCount, setDistanceMeasureCount] = useState(0);
  const [areaMeasureCount, setAreaMeasureCount] = useState(0);
  const [areaResults, setAreaResults] = useState<AreaResult[]>([]);
  const [selectedAreaIndex, setSelectedAreaIndex] = useState<number | null>(
    null
  );
  const [cameraNotice, setCameraNotice] = useState("");
  const [projectId, setProjectId] = useState(readProjectId);
  const [sectionViewer, setSectionViewer] = useState<Viewer | null>(null);
  const [sectionTileset, setSectionTileset] = useState<Cesium3DTileset | null>(null);
  const [projectName, setProjectName] = useState("新北市林口區工廠廠房");
  const [activeComparison, setActiveComparison] =
    useState<ViewerComparison | null>(null);
  const [splitPosition, setSplitPosition] = useState(0.5);
  const [comparisonSwapped, setComparisonSwapped] = useState(false);
  const [comparisonSelection, setComparisonSelection] = useState<{
    comparisonId: string;
    leftProjectId: string;
    rightProjectId: string;
  } | null>(null);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [projectOptions, setProjectOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let viewer: Viewer | null = null;
    let disposeParcelNavigation: (() => void) | undefined;

    async function initialize() {
      try {
        setStatus(INITIAL_STATUS);
        distancePositionsRef.current = [];
        distancePointLookupRef.current.clear();
        const config = parseConfig(import.meta.env);
        const allProjects = createProjectCatalog(config.modelSource);
        const allComparisons = createComparisonCatalog();
        const projects = IS_ADMIN
          ? allProjects
          : allProjects.filter((item) =>
              (ALLOWED_PROJECT_IDS.length > 0
                ? ALLOWED_PROJECT_IDS
                : [projectId]
              ).includes(item.id)
            );
        const comparisons = IS_ADMIN
          ? allComparisons
          : allComparisons.filter((item) =>
              ALLOWED_COMPARISON_IDS.includes(item.id)
            );
        if (projects.length === 0 && comparisons.length === 0) {
          throw new Error("目前帳號沒有這個專案的觀看權限。");
        }
        const comparison = comparisons.find((item) => item.id === projectId);
        const selectedComparison =
          comparison && comparisonSelection?.comparisonId === comparison.id
            ? comparisonSelection
            : comparison
              ? {
                  comparisonId: comparison.id,
                  leftProjectId: comparison.leftProjectId,
                  rightProjectId: comparison.rightProjectId
                }
              : null;
        const project = comparison
          ? allProjects.find(
              (item) => item.id === selectedComparison?.leftProjectId
            )
          : projects.find((item) => item.id === projectId) ?? projects[0];
        if (!project) throw new Error("找不到對比使用的左側專案。");
        const rightProject = comparison
          ? allProjects.find(
              (item) => item.id === selectedComparison?.rightProjectId
            )
          : undefined;
        if (comparison && !rightProject) {
          throw new Error("找不到對比使用的右側專案。");
        }
        const catalogEntries = [
          ...projects.map(({ id, name }) => ({ id, name })),
          ...comparisons.map(({ id, name }) => ({ id, name }))
        ];
        setProjectOptions(
          catalogEntries
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
              const leftCatalog = PROJECT_CATALOG_ORDER.indexOf(left.item.id);
              const rightCatalog = PROJECT_CATALOG_ORDER.indexOf(right.item.id);
              const leftOrder =
                leftCatalog >= 0 ? leftCatalog : 10_000 + left.index;
              const rightOrder =
                rightCatalog >= 0 ? rightCatalog : 10_000 + right.index;
              return leftOrder - rightOrder;
            })
            .map(({ item }) => item)
        );
        setActiveComparison(comparison ?? null);
        setComparisonSelection(
          comparison
            ? {
                comparisonId: comparison.id,
                leftProjectId: comparison.leftProjectId,
                rightProjectId: comparison.rightProjectId
              }
            : null
        );
        setComparisonSwapped(false);
        const initialSplit = comparison?.defaultSplitPosition ?? 0.5;
        setSplitPosition(initialSplit);
        setProjectName(comparison?.name ?? project.name);
        setProjectHasOverlay(Boolean(!comparison && project.overlayUrl));
        const cadastralConfig = !comparison ? CADASTRAL_PROJECTS[project.id] : undefined;
        const hasCadastral = Boolean(cadastralConfig);
        setProjectHasCadastral(hasCadastral);
        setModelGroundAvailable(false);
        const initialCadastralMode: CadastralDisplayMode =
          project.id === "taoyuan-building-overlay"
            ? "model-ground"
            : "original";
        setCadastralVisible(true);
        setOccupancyVisible(true);
        occupancyVisibleRef.current = true;
        setCadastralDisplayMode(initialCadastralMode);
        setSelectedCadastral(project.id === "taoyuan-building-overlay"
          ? cadastralConfig?.parcels[0]?.info ?? null
          : null);
        setSelectedCadastralParcelKey(cadastralConfig?.parcels[0]?.key ?? "");
        const projectLandmarks = comparison
          ? []
          : readProjectLandmarks(project.id);
        setProjectHasLandmarks(projectLandmarks.length > 0);
        setProjectHasSunSimulation(!comparison && project.id === "sanxia-solar-2");
        setSunSimulationEnabled(false);
        setSunSimulationPlaying(false);
        setSelectedLandmark(null);
        landmarkEditEnabledRef.current = false;
        setLandmarkEditEnabled(false);
        calibrationPickEnabledRef.current = false;
        setCalibrationPickEnabled(false);
        const savedCalibration = readLongdongCalibration();
        modelCalibrationRef.current = savedCalibration;
        setModelCalibration(savedCalibration);
        longdongLocalCenterRef.current = null;
        cameraPresetRef.current = project.camera ?? null;
        Ion.defaultAccessToken = config.accessToken;
        clippingStorageKeyRef.current =
          project.modelSource.type === "cesium-ion"
            ? `drone-viewer-clip-${project.modelSource.assetId}`
            : `drone-viewer-clip-${project.modelSource.tilesetUrl}`;

        viewer = new Viewer(containerRef.current!, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          navigationHelpButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          terrainProvider: undefined
        });
        viewerRef.current = viewer;
        if (project.id === "taoyuan-building-overlay") disposeParcelNavigation = tuneParcelNavigation(viewer, () => parcelOrbitTargetRef.current, () => !measurementHandlerRef.current && !clippingHandlerRef.current && !calibrationPickEnabledRef.current && !landmarkEditEnabledRef.current);
        setSectionViewer(viewer);
        viewer.scene.splitPosition = initialSplit;

        void Promise.all([
          applyBasemap(viewer, "aerial").catch(() => {
            if (!cancelled) {
              setBasemap("road");
              setMapNotice(
                "衛星底圖無法載入，已切回道路圖。請確認 token 可讀取 Cesium World Imagery。"
              );
              return applyBasemap(viewer!, "road");
            }
          }),
          createWorldTerrainAsync({ requestVertexNormals: true })
            .then((provider) => {
              if (!cancelled && viewer && !viewer.isDestroyed()) {
                viewer.terrainProvider = provider;
              }
            })
            .catch(() => {
              if (!cancelled) {
                setMapNotice(
                  "真實地形無法載入。請確認 token 可讀取 Cesium World Terrain。"
                );
              }
            })
        ]);

        setStatus({
          phase: "loading",
          message: comparison
            ? `正在載入 ${comparison.projectOptions?.find((item) => item.projectId === project.id)?.label ?? comparison.leftLabel} 與 ${comparison.projectOptions?.find((item) => item.projectId === rightProject?.id)?.label ?? comparison.rightLabel} 模型…`
            : "正在串流無人機模型…"
        });
        const loadResults = await Promise.allSettled([
          loadModel(project.modelSource, Boolean(comparison)),
          ...(rightProject
            ? [loadModel(rightProject.modelSource, Boolean(comparison))]
            : [])
        ]);
        if (cancelled || !viewer || viewer.isDestroyed()) return;

        const leftResult = loadResults[0];
        const rightResult = loadResults[1];
        const leftTileset = leftResult?.status === "fulfilled" ? leftResult.value : null;
        const rightTileset = rightResult?.status === "fulfilled" ? rightResult.value : null;
        if (!leftTileset && !rightTileset) {
          throw leftResult?.status === "rejected"
            ? leftResult.reason
            : new Error("兩側模型皆無法載入。");
        }
        if (leftTileset) {
          tilesetRef.current = leftTileset;
          setSectionTileset(leftTileset);
          if (project.id === "gongliao-longdong-rock") {
            const localCenter = Cartesian3.clone(leftTileset.boundingSphere.center);
            longdongLocalCenterRef.current = localCenter;
            applyLongdongCalibration(leftTileset, localCenter, savedCalibration);
          }
          leftTileset.splitDirection =
            comparison && comparison.displayMode !== "combined"
              ? SplitDirection.LEFT
              : SplitDirection.NONE;
          viewer.scene.primitives.add(leftTileset as unknown as Primitive);
          leftTileset.shadows = comparison
            ? ShadowMode.DISABLED
            : ShadowMode.ENABLED;
          if (project.id === "gongliao-longdong-rock") {
            const center = Cartographic.fromCartesian(leftTileset.boundingSphere.center);
            if (center) {
              setMapNotice(
                `龍洞模型中心：${CesiumMath.toDegrees(center.longitude).toFixed(6)}, ${CesiumMath.toDegrees(center.latitude).toFixed(6)}；高程 ${center.height.toFixed(1)}m；半徑 ${leftTileset.boundingSphere.radius.toFixed(1)}m`
              );
            } else {
              setMapNotice("龍洞模型的包圍範圍無法轉換為地球座標，Asset 定位可能有誤。 ");
            }
          }
        }
        if (project.id === "gongliao-longdong-rock" && leftTileset && IS_ADMIN) {
          const activeViewer = viewer;
          const calibrationHandler = new ScreenSpaceEventHandler(
            activeViewer.scene.canvas
          );
          calibrationHandler.setInputAction((event: { position: Cartesian2 }) => {
            if (!calibrationPickEnabledRef.current) return;
            const picked = activeViewer.scene.pickPosition(event.position);
            if (!picked) {
              setMapNotice("這個位置無法取得地表座標，請改點附近可見的地面。");
              return;
            }
            const cartographic = Cartographic.fromCartesian(picked);
            const next = {
              ...modelCalibrationRef.current,
              longitude: CesiumMath.toDegrees(cartographic.longitude),
              latitude: CesiumMath.toDegrees(cartographic.latitude),
              height: cartographic.height,
              east: 0,
              north: 0
            };
            modelCalibrationRef.current = next;
            setModelCalibration(next);
            const localCenter = longdongLocalCenterRef.current;
            if (localCenter) {
              applyLongdongCalibration(leftTileset, localCenter, next);
              activeViewer.scene.requestRender();
            }
            setMapNotice("已移動模型中心；確認後請按「儲存校正」。");
          }, ScreenSpaceEventType.LEFT_CLICK);
          calibrationHandlerRef.current = calibrationHandler;
        }
        if (rightTileset) {
          secondaryTilesetRef.current = rightTileset;
          rightTileset.splitDirection =
            comparison?.displayMode === "combined"
              ? SplitDirection.NONE
              : SplitDirection.RIGHT;
          viewer.scene.primitives.add(rightTileset as unknown as Primitive);
          rightTileset.shadows = ShadowMode.DISABLED;
        }
        if (
          comparison?.displayMode === "combined" &&
          leftTileset &&
          rightTileset
        ) {
          try {
            const seamOverlap = applyAutomaticCombinedSeam(leftTileset, rightTileset);
            setMapNotice(
              `延伸區完整保留作為左側補洞底層；TWD97 主區從右側接入，接縫約 ${seamOverlap.toFixed(1)} 公尺重疊。`
            );
          } catch {
            setMapNotice(
              "自動分區無法建立，已保留兩個模型完整顯示。"
            );
          }
        }
        if (!comparison && leftTileset) {
          const savedCoordinates = readSavedClipping(clippingStorageKeyRef.current);
          if (savedCoordinates.length >= 3) {
            appliedCoordinatesRef.current = savedCoordinates;
            applyClippingPolygon(leftTileset, savedCoordinates, clippingRef);
            setClipMode("applied");
          }
        } else {
          setClipMode("idle");
        }
        if (!comparison && project.overlayUrl) {
          const overlayUrl = `${import.meta.env.BASE_URL}${project.overlayUrl}`;
          const overlay = await GeoJsonDataSource.load(overlayUrl, {
            stroke: Color.fromCssColorString("#f59e0b"),
            strokeWidth: 2,
            clampToGround: false
          });
          for (const entity of [...overlay.entities.values]) {
            const elevation = Number(entity.properties?.ELEV?.getValue());
            if (Number.isFinite(elevation) && Math.round(elevation) % 5 !== 0) {
              overlay.entities.remove(entity);
            }
          }
          applyOverlayXray(overlay, overlayXrayRef.current);
          if (!cancelled && viewer && !viewer.isDestroyed()) {
            await viewer.dataSources.add(overlay);
            overlay.show = overlayVisibleRef.current;
            overlayDataSourceRef.current = overlay;
          }
        }
        if (hasCadastral) {
          const cadastral = await GeoJsonDataSource.load(
            `${import.meta.env.BASE_URL}${cadastralConfig!.url}`,
            { clampToGround: true }
          );
          applyCadastralDisplayMode(cadastral, initialCadastralMode);
          await viewer.dataSources.add(cadastral);
          cadastral.show = true;
          cadastralDataSourceRef.current = cadastral;

          const fillHierarchies = cadastral.entities.values
            .filter(
              (entity) =>
                entity.polygon &&
                entity.properties?.kind?.getValue(viewer!.clock.currentTime) ===
                  "cadastral-fill"
            )
            .map(
              (entity) =>
                entity.polygon?.hierarchy?.getValue(
                  viewer!.clock.currentTime
                ) as PolygonHierarchy | undefined
            )
            .filter(
              (hierarchy): hierarchy is PolygonHierarchy =>
                Boolean(hierarchy?.positions.length)
            );
          const boundaryPositionSets = cadastral.entities.values
            .filter(
              (entity) =>
                entity.polyline &&
                entity.properties?.kind?.getValue(viewer!.clock.currentTime) ===
                  "cadastral-boundary"
            )
            .map(
              (entity) =>
                entity.polyline?.positions?.getValue(
                  viewer!.clock.currentTime
                ) as Cartesian3[] | undefined
            )
            .filter(
              (positions): positions is Cartesian3[] =>
                Boolean(positions?.length)
            );
          if (fillHierarchies.length && boundaryPositionSets.length) {
            try {
              const samples = boundaryPositionSets.flatMap(
                (positions) => densifyBoundaryForGroundSampling(positions)
              );
              const sampled = await viewer.scene.sampleHeightMostDetailed(samples);
              const heights = sampled
                .filter((position): position is Cartographic => Boolean(position))
                .map((position) => position.height)
                .filter((height) => Number.isFinite(height))
                .sort((left, right) => left - right);
              if (heights.length > 0 && !cancelled) {
                const groundHeight =
                  heights[Math.floor((heights.length - 1) * 0.25)] + 0.35;
                if (project.id === "taoyuan-building-overlay") {
                  const focus = cadastralConfig!.parcels[0].focus!;
                  parcelOrbitTargetRef.current = Cartesian3.fromDegrees(focus.longitude, focus.latitude, groundHeight);
                }
                const toGroundPosition = (position: Cartesian3) => {
                  const cartographic = Cartographic.fromCartesian(position);
                  return Cartesian3.fromRadians(
                    cartographic.longitude,
                    cartographic.latitude,
                    groundHeight
                  );
                };
                const groundEntities: Entity[] = [];
                if (project.id === "taoyuan-building-overlay") {
                  const buildings = cadastral.entities.values.filter(entity =>
                    entity.polygon && entity.properties?.kind?.getValue() === "occupancy-building");
                  for (const building of buildings) {
                    const surface = await createOccupancyUnderlay(viewer, building, groundHeight, () => cancelled);
                    if (cancelled || viewer.isDestroyed()) return;
                    if (!surface.length) continue;
                    for (const entity of surface) {
                      entity.show = initialCadastralMode === "model-ground" && occupancyVisibleRef.current;
                      groundEntities.push(viewer.entities.add(entity));
                    }

                  }
                }
                fillHierarchies.forEach((hierarchy, index) => {
                  groundEntities.push(viewer!.entities.add({
                    id: `cadastral-model-ground-fill-${index + 1}`,
                    show: initialCadastralMode === "model-ground",
                    properties: { kind: "cadastral-fill" },
                    polygon: {
                      hierarchy: new PolygonHierarchy(
                        hierarchy.positions.map(toGroundPosition)
                      ),
                      perPositionHeight: true,
                      material: Color.fromCssColorString("#ef626c").withAlpha(0.3)
                    }
                  }));
                });
                boundaryPositionSets.forEach((positions, index) => {
                  groundEntities.push(viewer!.entities.add({
                    id: `cadastral-model-ground-boundary-${index + 1}`,
                    show: initialCadastralMode === "model-ground",
                    properties: { kind: "cadastral-boundary" },
                    polyline: {
                      positions: positions.map(toGroundPosition),
                      width: 3,
                      material: Color.fromCssColorString("#ffbf47"),
                      depthFailMaterial: new PolylineDashMaterialProperty({
                        color: Color.fromCssColorString("#ffe2a8").withAlpha(0.58),
                        dashLength: 12
                      })
                    }
                  }));
                });
                // Pick an interior scanline midpoint instead of averaging separate
                // CAD pieces, which can put the leader on the map-sheet seam.
                const labelRings = fillHierarchies.map(
                  (item) =>
                    item.positions.map((position) =>
                      Cartographic.fromCartesian(position)
                    )
                );
                let interiorAnchor: { longitude: number; latitude: number; width: number } | undefined;
                const anchorRings = project.id === "taoyuan-building-overlay"
                  ? [...labelRings].sort((a, b) =>
                      a.reduce((sum, p) => sum + p.longitude, 0) / a.length -
                      b.reduce((sum, p) => sum + p.longitude, 0) / b.length
                    ).slice(0, 1)
                  : labelRings;
                for (const ring of anchorRings) {
                  if (ring.length < 3) continue;
                  const latitude = (Math.min(...ring.map(p => p.latitude)) +
                    Math.max(...ring.map(p => p.latitude))) / 2;
                  const crossings: number[] = [];
                  for (let i = 0; i < ring.length; i++) {
                    const a = ring[i];
                    const b = ring[(i + 1) % ring.length];
                    if ((a.latitude > latitude) !== (b.latitude > latitude)) {
                      crossings.push(a.longitude + (latitude - a.latitude) *
                        (b.longitude - a.longitude) / (b.latitude - a.latitude));
                    }
                  }
                  crossings.sort((a, b) => a - b);
                  for (let i = 0; i + 1 < crossings.length; i += 2) {
                    const width = crossings[i + 1] - crossings[i];
                    if (width > 0 && (!interiorAnchor || width > interiorAnchor.width)) {
                      interiorAnchor = { longitude: (crossings[i] + crossings[i + 1]) / 2,
                        latitude, width };
                    }
                  }
                }
                if (interiorAnchor) {
                  const { longitude, latitude } = interiorAnchor;
                  const anchorPosition = Cartesian3.fromRadians(
                    longitude,
                    latitude,
                    groundHeight + 0.6
                  );
                  const labelPosition = () => {
                    const activeViewer = viewer!;
                    const metresPerPixel = activeViewer.camera.getPixelSize(
                      new BoundingSphere(anchorPosition, 1),
                      activeViewer.scene.drawingBufferWidth,
                      activeViewer.scene.drawingBufferHeight
                    );
                    return Cartesian3.add(anchorPosition,
                      Cartesian3.multiplyByScalar(activeViewer.camera.upWC,
                        metresPerPixel * 110, new Cartesian3()), new Cartesian3());
                  };
                  const parcel = cadastralConfig!.parcels[0];
                  cadastralLabelEntitiesRef.current = [viewer.entities.add({
                    id: `cadastral-label-${parcel.key}`,
                    show: true,
                    position: new CallbackPositionProperty(() => labelPosition(), false),
                    properties: {
                      kind: "cadastral-label",
                      parcelKey: parcel.key
                    },
                    label: {
                      text: `${parcel.info.sectionName}\n地號 ${parcel.info.parcelNo}`,
                      font: "600 18px 'Noto Sans TC', sans-serif",
                      style: LabelStyle.FILL_AND_OUTLINE,
                      fillColor: Color.fromCssColorString("#f8fffd"),
                      outlineColor: Color.fromCssColorString("#07262b"),
                      outlineWidth: 4,
                      showBackground: true,
                      backgroundColor: Color.fromCssColorString("#09242a").withAlpha(0.9),
                      backgroundPadding: new Cartesian2(12, 8),
                      horizontalOrigin: HorizontalOrigin.CENTER,
                      verticalOrigin: VerticalOrigin.BOTTOM,
                      pixelOffset: new Cartesian2(0, -8),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    point: {
                      pixelSize: 10,
                      color: Color.fromCssColorString("#7cf1d5"),
                      outlineColor: Color.fromCssColorString("#06252b"),
                      outlineWidth: 3,
                      disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    polyline: {
                      positions: new CallbackProperty(() => [anchorPosition, labelPosition()], false),
                      width: 2,
                      material: Color.fromCssColorString("#7cf1d5"),
                      depthFailMaterial: new ColorMaterialProperty(
                        Color.fromCssColorString("#b8fff0").withAlpha(0.7)
                      )
                    }
                  })];
                }
                applyCadastralDisplayMode(cadastral, initialCadastralMode, occupancyVisibleRef.current);
                cadastralModelGroundEntitiesRef.current = groundEntities;
                setModelGroundAvailable(true);
              }
            } catch {
              setModelGroundAvailable(false);
            }
          }

          const cadastralHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
          cadastralHandler.setInputAction((event: { position: Cartesian2 }) => {
            const picked = viewer!.scene.pick(event.position) as
              | { id?: Entity }
              | undefined;
            const entity = picked?.id;
            if (!(entity instanceof Entity)) return;
            const kind = entity.properties?.kind?.getValue();
            if (!["cadastral-fill", "cadastral-boundary", "occupancy-building", "occupancy-roof-underlay", "cadastral-label"].includes(kind)) return;
            const parcelKey = entity.properties?.parcelKey?.getValue();
            const parcel = cadastralConfig!.parcels.find((item) => item.key === parcelKey)
              ?? cadastralConfig!.parcels[0];
            setSelectedCadastralParcelKey(parcel.key);
            setSelectedCadastral(parcel.info);
          }, ScreenSpaceEventType.LEFT_CLICK);
          cadastralHandlerRef.current = cadastralHandler;
        }
        if (projectLandmarks.length > 0) {
          const activeViewer = viewer;
          if (!activeViewer || activeViewer.isDestroyed()) return;
          const landmarksByEntityId = new globalThis.Map<string, ProjectLandmark>();
          for (const landmark of projectLandmarks) {
            const entity = activeViewer.entities.add({
              id: `landmark-${landmark.id}`,
              position: Cartesian3.fromDegrees(
                landmark.longitude,
                landmark.latitude,
                landmark.height
              ),
              point: {
                pixelSize: 12,
                color: Color.fromCssColorString("#7cf1d5"),
                outlineColor: Color.fromCssColorString("#06252b"),
                outlineWidth: 3,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              },
              label: {
                text: landmark.title,
                font: "700 23px 'Microsoft JhengHei', 'Noto Sans TC', sans-serif",
                scale: 0.88,
                fillColor: Color.WHITE,
                outlineColor: Color.fromCssColorString("#06252b"),
                outlineWidth: 2,
                style: LabelStyle.FILL_AND_OUTLINE,
                showBackground: true,
                backgroundColor: Color.fromCssColorString("#07191e").withAlpha(0.86),
                backgroundPadding: new Cartesian2(10, 7),
                pixelOffset: new Cartesian2(0, -32),
                horizontalOrigin: HorizontalOrigin.CENTER,
                verticalOrigin: VerticalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
              },
              show: landmarksVisibleRef.current
            });
            landmarkEntitiesRef.current.push(entity);
            landmarksByEntityId.set(entity.id, landmark);
          }
          const landmarkHandler = new ScreenSpaceEventHandler(activeViewer.scene.canvas);
          let draggedEntity: Entity | null = null;
          let draggedLandmark: ProjectLandmark | null = null;
          let draggedPositionChanged = false;
          let suppressNextLandmarkClick = false;
          const updateDraggedPosition = (screenPosition: Cartesian2) => {
            if (!draggedEntity || !draggedLandmark) return;
            const position = activeViewer.scene.pickPosition(screenPosition);
            if (!position) return;
            draggedEntity.position = new ConstantPositionProperty(position);
            const cartographic = Cartographic.fromCartesian(position);
            draggedLandmark.longitude = CesiumMath.toDegrees(cartographic.longitude);
            draggedLandmark.latitude = CesiumMath.toDegrees(cartographic.latitude);
            draggedLandmark.height = cartographic.height;
            setSelectedLandmark({ ...draggedLandmark });
          };
          if (IS_ADMIN) {
            landmarkHandler.setInputAction((event: { position: Cartesian2 }) => {
              if (!landmarkEditEnabledRef.current) return;
              const picked = activeViewer.scene.pick(event.position) as
                | { id?: Entity }
                | undefined;
              const entity = picked?.id;
              if (!(entity instanceof Entity)) return;
              const landmark = landmarksByEntityId.get(entity.id);
              if (!landmark) return;
              draggedEntity = entity;
              draggedLandmark = landmark;
              draggedPositionChanged = false;
              setSelectedLandmark({ ...landmark });
              activeViewer.scene.screenSpaceCameraController.enableInputs = false;
              activeViewer.canvas.style.cursor = "grabbing";
            }, ScreenSpaceEventType.LEFT_DOWN);
            landmarkHandler.setInputAction((event: { endPosition: Cartesian2 }) => {
              if (draggedEntity) draggedPositionChanged = true;
              updateDraggedPosition(event.endPosition);
            }, ScreenSpaceEventType.MOUSE_MOVE);
            landmarkHandler.setInputAction((event: { position: Cartesian2 }) => {
              if (!draggedEntity || !draggedLandmark) return;
              updateDraggedPosition(event.position);
              saveProjectLandmarks(project.id, projectLandmarks);
              suppressNextLandmarkClick = draggedPositionChanged;
              draggedEntity = null;
              draggedLandmark = null;
              activeViewer.scene.screenSpaceCameraController.enableInputs = true;
              activeViewer.canvas.style.cursor = "";
              setMapNotice("三維標的位置已儲存");
            }, ScreenSpaceEventType.LEFT_UP);
          }
          landmarkHandler.setInputAction((event: { position: Cartesian2 }) => {
            if (suppressNextLandmarkClick) {
              suppressNextLandmarkClick = false;
              return;
            }
            const picked = activeViewer.scene.pick(event.position) as
              | { id?: Entity }
              | undefined;
            const entity = picked?.id;
            if (!(entity instanceof Entity)) return;
            const landmark = landmarksByEntityId.get(entity.id);
            if (!landmark) return;
            setSelectedLandmark(landmark);
            void activeViewer.flyTo(entity, {
              duration: 1.2,
              offset: new HeadingPitchRange(
                CesiumMath.toRadians(25),
                CesiumMath.toRadians(-32),
                105
              )
            });
          }, ScreenSpaceEventType.LEFT_CLICK);
          landmarkHandlerRef.current = landmarkHandler;
        }
        focusModels(
          viewer,
          [leftTileset, rightTileset].filter(
            (item): item is Cesium3DTileset => item !== null
          ),
          project.camera,
          parcelOrbitTargetRef.current ?? undefined
        );
        if (!cancelled) {
          const partialFailure = comparison && (!leftTileset || !rightTileset);
          setStatus({
            phase: "ready",
            message: partialFailure
              ? `${leftTileset ? comparison?.rightLabel : comparison?.leftLabel} 載入失敗，已保留另一側模型`
              : comparison
                ? `${comparison.leftLabel}／${comparison.rightLabel} 對比已載入`
                : "模型已載入"
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({ phase: "error", message: toViewerError(error) });
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      disposeParcelNavigation?.();
      clippingHandlerRef.current?.destroy();
      clippingHandlerRef.current = null;
      measurementHandlerRef.current?.destroy();
      measurementHandlerRef.current = null;
      measurementDragHandlerRef.current?.destroy();
      measurementDragHandlerRef.current = null;
      landmarkHandlerRef.current?.destroy();
      landmarkHandlerRef.current = null;
      calibrationHandlerRef.current?.destroy();
      calibrationHandlerRef.current = null;
      cadastralHandlerRef.current?.destroy();
      cadastralHandlerRef.current = null;
      landmarkEntitiesRef.current = [];
      distancePositionsRef.current = [];
      longdongLocalCenterRef.current = null;
      tilesetRef.current = null;
      secondaryTilesetRef.current = null;
      overlayDataSourceRef.current = null;
      parcelOrbitTargetRef.current = null;
      cadastralDataSourceRef.current = null;
      cadastralModelGroundEntitiesRef.current = [];
      cadastralLabelEntitiesRef.current = [];
      viewerRef.current = null;
      setSectionViewer(null);
      setSectionTileset(null);
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [projectId, reloadKey]);

  const updateModelCalibration = useCallback(
    (updates: Partial<ModelCalibration>) => {
      const next = { ...modelCalibrationRef.current, ...updates };
      modelCalibrationRef.current = next;
      setModelCalibration(next);
      const tileset = tilesetRef.current;
      const localCenter = longdongLocalCenterRef.current;
      if (tileset && localCenter) {
        applyLongdongCalibration(tileset, localCenter, next);
        viewerRef.current?.scene.requestRender();
      }
    },
    []
  );

  const saveModelCalibration = useCallback(() => {
    saveLongdongCalibration(modelCalibrationRef.current);
    setMapNotice("龍洞模型位置校正已儲存在這台裝置。");
  }, []);

  const resetModelCalibration = useCallback(() => {
    localStorage.removeItem(LONGDONG_CALIBRATION_KEY);
    updateModelCalibration({ ...LONGDONG_DEFAULT_CALIBRATION });
    setMapNotice("已重設為龍洞模型的暫定位置，尚未儲存。");
  }, [updateModelCalibration]);

  const copyModelCalibration = useCallback(async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(modelCalibrationRef.current, null, 2)
    );
    setMapNotice("模型校正設定已複製。");
  }, []);

  const returnToModel = useCallback(async () => {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current;
    const secondaryTileset = secondaryTilesetRef.current;
    if (viewer && (tileset || secondaryTileset)) {
      focusModels(
        viewer,
        [tileset, secondaryTileset].filter(
          (item): item is Cesium3DTileset => item !== null
        ),
        cameraPresetRef.current ?? undefined,
        parcelOrbitTargetRef.current ?? undefined
      );
    }
  }, []);

  const switchToTopView = useCallback(() => {
    const viewer = viewerRef.current;
    const tilesets = getLoadedTilesets(
      tilesetRef.current,
      secondaryTilesetRef.current
    );
    if (!viewer || tilesets.length === 0) return;

    if (parcelOrbitTargetRef.current) {
      focusParcelOrbit(viewer, parcelOrbitTargetRef.current, 0, -90, 85);
      return;
    }
    const sphere = getCombinedBoundingSphere(tilesets);
    viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.5,
      offset: new HeadingPitchRange(
        0,
        -CesiumMath.PI_OVER_TWO,
        Math.max(sphere.radius * 2.4, 30)
      )
    });
  }, []);

  const alignViewNorth = useCallback(() => {
    const viewer = viewerRef.current;
    const tilesets = getLoadedTilesets(
      tilesetRef.current,
      secondaryTilesetRef.current
    );
    if (!viewer || tilesets.length === 0) return;

    if (parcelOrbitTargetRef.current) {
      focusParcelOrbit(viewer, parcelOrbitTargetRef.current, 0, CesiumMath.toDegrees(viewer.camera.pitch),
        Math.max(25, Cartesian3.distance(viewer.camera.positionWC, parcelOrbitTargetRef.current)));
      return;
    }
    const sphere = getCombinedBoundingSphere(tilesets);
    const range = Math.max(
      Cartesian3.distance(viewer.camera.positionWC, sphere.center),
      sphere.radius * 1.2,
      30
    );
    viewer.camera.flyToBoundingSphere(sphere, {
      duration: 1.25,
      offset: new HeadingPitchRange(0, viewer.camera.pitch, range)
    });
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  const updateSplitPosition = useCallback((nextPosition: number) => {
    const normalized = Math.min(1, Math.max(0, nextPosition));
    setSplitPosition(normalized);
    const viewer = viewerRef.current;
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.splitPosition = normalized;
      viewer.scene.requestRender();
    }
  }, []);

  const handleDividerPointer = useCallback(
    (clientX: number) => {
      const host = containerRef.current;
      if (!host) return;
      const bounds = host.getBoundingClientRect();
      updateSplitPosition((clientX - bounds.left) / bounds.width);
    },
    [updateSplitPosition]
  );

  const swapComparisonSides = useCallback(() => {
    if (activeComparison?.projectOptions && comparisonSelection) {
      const leftTileset = tilesetRef.current;
      const rightTileset = secondaryTilesetRef.current;
      if (leftTileset) leftTileset.splitDirection = SplitDirection.RIGHT;
      if (rightTileset) rightTileset.splitDirection = SplitDirection.LEFT;
      tilesetRef.current = rightTileset;
      secondaryTilesetRef.current = leftTileset;
      setComparisonSelection({
        ...comparisonSelection,
        leftProjectId: comparisonSelection.rightProjectId,
        rightProjectId: comparisonSelection.leftProjectId
      });
      viewerRef.current?.scene.requestRender();
      return;
    }
    const leftTileset = tilesetRef.current;
    const rightTileset = secondaryTilesetRef.current;
    setComparisonSwapped((swapped) => {
      const next = !swapped;
      if (leftTileset) {
        leftTileset.splitDirection = next
          ? SplitDirection.RIGHT
          : SplitDirection.LEFT;
      }
      if (rightTileset) {
        rightTileset.splitDirection = next
          ? SplitDirection.LEFT
          : SplitDirection.RIGHT;
      }
      viewerRef.current?.scene.requestRender();
      return next;
    });
  }, [activeComparison, comparisonSelection]);

  const changeComparisonProject = useCallback(
    async (side: "left" | "right", nextProjectId: string) => {
      if (!activeComparison?.projectOptions) return;
      const current =
        comparisonSelection?.comparisonId === activeComparison.id
          ? comparisonSelection
          : {
              comparisonId: activeComparison.id,
              leftProjectId: activeComparison.leftProjectId,
              rightProjectId: activeComparison.rightProjectId
            };
      if (
        (side === "left" && nextProjectId === current.rightProjectId) ||
        (side === "right" && nextProjectId === current.leftProjectId)
      ) return;
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      const config = parseConfig(import.meta.env);
      const nextProject = createProjectCatalog(config.modelSource).find(
        (project) => project.id === nextProjectId
      );
      if (!nextProject) return;

      setStatus({ phase: "loading", message: `正在切換${side === "left" ? "左" : "右"}側模型…` });
      try {
        const nextTileset = await loadModel(nextProject.modelSource, true);
        if (viewer.isDestroyed()) {
          nextTileset.destroy();
          return;
        }
        nextTileset.splitDirection =
          side === "left" ? SplitDirection.LEFT : SplitDirection.RIGHT;
        nextTileset.shadows = ShadowMode.DISABLED;
        viewer.scene.primitives.add(nextTileset as unknown as Primitive);

        const previousTileset =
          side === "left" ? tilesetRef.current : secondaryTilesetRef.current;
        if (side === "left") tilesetRef.current = nextTileset;
        else secondaryTilesetRef.current = nextTileset;
        if (previousTileset && !previousTileset.isDestroyed()) {
          viewer.scene.primitives.remove(previousTileset as unknown as Primitive);
        }

        setComparisonSwapped(false);
        setComparisonSelection({
          ...current,
          [side === "left" ? "leftProjectId" : "rightProjectId"]: nextProjectId
        });
        viewer.scene.requestRender();
        setStatus({
          phase: "ready",
          message: `${activeComparison.name}已切換，視角保持不變`
        });
      } catch (error) {
        setStatus({
          phase: "ready",
          message: `模型切換失敗，已保留原模型：${toViewerError(error)}`
        });
      }
    },
    [activeComparison, comparisonSelection]
  );

  const changeBasemap = useCallback(
    async (nextBasemap: "aerial" | "road") => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      setMapNotice("");
      try {
        await applyBasemap(viewer, nextBasemap);
        setBasemap(nextBasemap);
      } catch {
        setMapNotice(
          nextBasemap === "aerial"
            ? "衛星底圖無法載入。請確認 token 可讀取 Cesium World Imagery。"
            : "道路圖無法載入，請檢查網路連線。"
        );
      }
    },
    []
  );

  const applySunSimulation = useCallback(
    (enabled: boolean, date = sunDate, minutes = sunMinutes) => {
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed()) return;
      viewer.shadows = enabled;
      viewer.scene.globe.enableLighting = enabled;
      viewer.scene.globe.shadows = enabled
        ? ShadowMode.ENABLED
        : ShadowMode.RECEIVE_ONLY;
      viewer.shadowMap.enabled = enabled;
      viewer.shadowMap.softShadows = enabled;
      viewer.shadowMap.darkness = 0.35;
      viewer.shadowMap.maximumDistance = 3000;
      if (enabled) {
        viewer.clock.currentTime = JulianDate.fromDate(
          new Date(`${date}T${formatSunTime(minutes)}:00${TAIWAN_UTC_OFFSET}`)
        );
      }
      viewer.scene.requestRender();
    },
    [sunDate, sunMinutes]
  );

  const changeSunSimulation = useCallback(
    (enabled: boolean) => {
      setSunSimulationEnabled(enabled);
      if (!enabled) setSunSimulationPlaying(false);
      applySunSimulation(enabled);
    },
    [applySunSimulation]
  );

  useEffect(() => {
    if (sunSimulationEnabled) {
      applySunSimulation(true, sunDate, sunMinutes);
    }
  }, [applySunSimulation, sunDate, sunMinutes, sunSimulationEnabled]);

  useEffect(() => {
    if (!sunSimulationPlaying || !sunSimulationEnabled) return;
    const timer = window.setInterval(() => {
      setSunMinutes((current) => (current >= 18 * 60 ? 6 * 60 : current + 10));
    }, 300);
    return () => window.clearInterval(timer);
  }, [sunSimulationEnabled, sunSimulationPlaying]);

  const changeOverlayVisibility = useCallback((visible: boolean) => {
    overlayVisibleRef.current = visible;
    setOverlayVisible(visible);
    if (overlayDataSourceRef.current) {
      overlayDataSourceRef.current.show = visible;
      viewerRef.current?.scene.requestRender();
    }
  }, []);

  const changeOverlayXray = useCallback((enabled: boolean) => {
    overlayXrayRef.current = enabled;
    setOverlayXray(enabled);
    if (overlayDataSourceRef.current) {
      applyOverlayXray(overlayDataSourceRef.current, enabled);
      viewerRef.current?.scene.requestRender();
    }
  }, []);

  const changeCadastralVisibility = useCallback((visible: boolean) => {
    setCadastralVisible(visible);
    if (cadastralDataSourceRef.current) {
      cadastralDataSourceRef.current.show = visible;
      applyCadastralDisplayMode(
        cadastralDataSourceRef.current,
        cadastralDisplayMode,
        occupancyVisible
      );
    }
    for (const entity of cadastralModelGroundEntitiesRef.current) {
      const kind = entity.properties?.kind?.getValue();
      entity.show =
        visible && cadastralDisplayMode === "model-ground" && (kind !== "occupancy-roof-underlay" || occupancyVisible);
    }
    for (const entity of cadastralLabelEntitiesRef.current) {
      entity.show = visible;
    }
    viewerRef.current?.scene.requestRender();
    if (!visible) setSelectedCadastral(null);
  }, [cadastralDisplayMode, occupancyVisible]);

  const changeCadastralDisplayMode = useCallback(
    (mode: CadastralDisplayMode) => {
      setCadastralDisplayMode(mode);
      if (cadastralDataSourceRef.current) {
        applyCadastralDisplayMode(cadastralDataSourceRef.current, mode, occupancyVisible);
        cadastralDataSourceRef.current.show = cadastralVisible;
      }
      for (const entity of cadastralModelGroundEntitiesRef.current) {
        const kind = entity.properties?.kind?.getValue();
        entity.show =
          cadastralVisible && mode === "model-ground" && (kind !== "occupancy-roof-underlay" || occupancyVisible);
      }
      viewerRef.current?.scene.requestRender();
    },
    [cadastralVisible, occupancyVisible]
  );

  const changeOccupancyVisibility = (visible: boolean) => {
    occupancyVisibleRef.current = visible;
    setOccupancyVisible(visible);
    if (cadastralDataSourceRef.current) {
      applyCadastralDisplayMode(cadastralDataSourceRef.current, cadastralDisplayMode, visible);
    }
    for (const entity of cadastralModelGroundEntitiesRef.current) {
      if (entity.properties?.kind?.getValue() === "occupancy-roof-underlay") {
        entity.show = cadastralVisible && cadastralDisplayMode === "model-ground" && visible;
      }
    }
    viewerRef.current?.scene.requestRender();
  };

  const selectCadastralParcel = useCallback((parcelKey: string) => {
    const config = CADASTRAL_PROJECTS[projectId];
    const parcel = config?.parcels.find((item) => item.key === parcelKey);
    if (!parcel) return;
    setSelectedCadastralParcelKey(parcel.key);
    setSelectedCadastral(parcel.info);
    const viewer = viewerRef.current;
    const entity = cadastralDataSourceRef.current?.entities.values.find(
      (candidate) =>
        candidate.id === parcel.fillEntityId ||
        (candidate.polygon &&
          candidate.properties?.kind?.getValue() === "cadastral-fill" &&
          candidate.properties?.parcelKey?.getValue() === parcel.key)
    );
    if (viewer && parcel.focus) {
      focusModels(viewer, [], parcel.focus, parcelOrbitTargetRef.current ?? undefined);
    } else if (entity && viewer) {
      void viewer.flyTo(entity, {
        duration: 1.5,
        offset: new HeadingPitchRange(
          0,
          CesiumMath.toRadians(-55),
          projectId === "taoyuan-building-overlay" ? 95 : 140
        )
      });
    }
    const url = new URL(window.location.href);
    url.searchParams.set("parcel", parcel.key);
    window.history.replaceState({}, "", url);
  }, [projectId]);


  const changeLandmarksVisibility = useCallback((visible: boolean) => {
    landmarksVisibleRef.current = visible;
    setLandmarksVisible(visible);
    for (const entity of landmarkEntitiesRef.current) entity.show = visible;
    if (!visible) setSelectedLandmark(null);
    viewerRef.current?.scene.requestRender();
  }, []);

  const clearDrawingPreview = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      for (const entity of previewEntitiesRef.current) {
        viewer.entities.remove(entity);
      }
    }
    previewEntitiesRef.current = [];
    drawPositionsRef.current = [];
    setClipPointCount(0);
    clippingHandlerRef.current?.destroy();
    clippingHandlerRef.current = null;
  }, []);

  const restoreAppliedClipping = useCallback(() => {
    const tileset = tilesetRef.current;
    if (tileset && appliedCoordinatesRef.current.length >= 3) {
      applyClippingPolygon(
        tileset,
        appliedCoordinatesRef.current,
        clippingRef
      );
      setClipMode("applied");
    } else {
      setClipMode("idle");
    }
  }, []);

  const startClipping = useCallback(() => {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current;
    if (!viewer || !tileset) return;

    if (!ClippingPolygonCollection.isSupported(viewer.scene)) {
      setClipNotice("這個瀏覽器不支援多邊形裁切，請使用支援 WebGL 2 的瀏覽器。");
      return;
    }

    clearDrawingPreview();
    if (clippingRef.current) clippingRef.current.enabled = false;
    setClipMode("drawing");
    setClipNotice("沿著要保留的範圍逐點點選，至少三點後按「完成框選」。");

    const positions = drawPositionsRef.current;
    const outline = viewer.entities.add({
      polyline: {
        positions: new CallbackProperty(() => [...positions], false),
        width: 3,
        material: Color.fromCssColorString("#8ae6d4")
      }
    });
    const fill = viewer.entities.add({
      polygon: {
        hierarchy: new CallbackProperty(
          () =>
            positions.length >= 3
              ? new PolygonHierarchy([...positions])
              : undefined,
          false
        ),
        material: Color.fromCssColorString("#8ae6d4").withAlpha(0.18)
      }
    });
    previewEntitiesRef.current.push(outline, fill);

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const position = pickWorldPosition(viewer, event.position);
      if (!position) {
        setClipNotice("這個位置無法定位，請點選模型或地表。");
        return;
      }
      positions.push(position);
      previewEntitiesRef.current.push(
        viewer.entities.add({
          position,
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString("#8ae6d4"),
            outlineColor: Color.fromCssColorString("#071019"),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      );
      setClipPointCount(positions.length);
      setClipNotice(
        positions.length >= 3
          ? `已選 ${positions.length} 點，可以完成框選或繼續增加節點。`
          : `已選 ${positions.length} 點，至少還需要 ${3 - positions.length} 點。`
      );
    }, ScreenSpaceEventType.LEFT_CLICK);
    clippingHandlerRef.current = handler;
  }, [clearDrawingPreview]);

  const undoClipPoint = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || drawPositionsRef.current.length === 0) return;
    drawPositionsRef.current.pop();
    const pointEntity = previewEntitiesRef.current.pop();
    if (pointEntity) viewer.entities.remove(pointEntity);
    setClipPointCount(drawPositionsRef.current.length);
  }, []);

  const cancelClipping = useCallback(() => {
    clearDrawingPreview();
    restoreAppliedClipping();
    setClipNotice("");
  }, [clearDrawingPreview, restoreAppliedClipping]);

  const finishClipping = useCallback(() => {
    const tileset = tilesetRef.current;
    if (!tileset || drawPositionsRef.current.length < 3) return;

    const coordinates = drawPositionsRef.current.map((position) => {
      const cartographic = viewerRef.current!.scene.globe.ellipsoid.cartesianToCartographic(
        position
      );
      return [
        (cartographic.longitude * 180) / Math.PI,
        (cartographic.latitude * 180) / Math.PI
      ] as ClipCoordinate;
    });

    appliedCoordinatesRef.current = coordinates;
    applyClippingPolygon(tileset, coordinates, clippingRef);
    localStorage.setItem(
      clippingStorageKeyRef.current,
      JSON.stringify(coordinates)
    );
    clearDrawingPreview();
    setClipMode("applied");
    setClipNotice("裁切範圍已儲存在這台裝置。");
  }, [clearDrawingPreview]);

  const removeClipping = useCallback(() => {
    clearDrawingPreview();
    if (clippingRef.current) clippingRef.current.enabled = false;
    clippingRef.current = null;
    appliedCoordinatesRef.current = [];
    localStorage.removeItem(clippingStorageKeyRef.current);
    setClipMode("idle");
    setClipNotice("");
  }, [clearDrawingPreview]);

  const clearMeasurementDraft = useCallback(() => {
    const viewer = viewerRef.current;
    measurementHandlerRef.current?.destroy();
    measurementHandlerRef.current = null;
    if (viewer) {
      for (const entity of measurementDraftEntitiesRef.current) {
        viewer.entities.remove(entity);
      }
    }
    measurementDraftEntitiesRef.current = [];
    measurementPositionsRef.current = [];
    setMeasurePointCount(0);
    setMeasureMode("idle");
  }, []);

  const clearAllMeasurements = useCallback(() => {
    const viewer = viewerRef.current;
    clearMeasurementDraft();
    if (viewer) {
      for (const records of Object.values(completedMeasurementsRef.current)) {
        for (const entities of records) {
          for (const entity of entities) viewer.entities.remove(entity);
        }
      }
    }
    completedMeasurementsRef.current = { distance: [], area: [] };
    distancePositionsRef.current = [];
    distancePointLookupRef.current.clear();
    areaCameraViewsRef.current = [];
    setDistanceMeasureCount(0);
    setAreaMeasureCount(0);
    setAreaResults([]);
    setSelectedAreaIndex(null);
    setMeasureNotice("");
  }, [clearMeasurementDraft]);


  const startMeasurement = useCallback(
    (kind: MeasureKind) => {
      const viewer = viewerRef.current;
      if (!viewer || status.phase !== "ready") return;
      if (completedMeasurementsRef.current[kind].length >= 3) {
        setMeasureNotice(
          `${kind === "distance" ? "距離" : "面積"}標註已達 3 筆上限，請先清除全部後再重新標註。`
        );
        return;
      }

      if (clipMode === "drawing") {
        clearDrawingPreview();
        restoreAppliedClipping();
        setClipNotice("");
      }
      clearMeasurementDraft();
      measurementKindRef.current = kind;
      setMeasureMode(kind);
      setMeasureNotice(
        kind === "distance"
          ? "在模型表面依序點選，至少兩點後可完成量測。"
          : "沿著範圍逐點點選，至少三點後可完成面積量測。"
      );

      const positions = measurementPositionsRef.current;
      measurementDraftEntitiesRef.current.push(
        viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => [...positions], false),
            width: 3,
            material: Color.fromCssColorString("#ffcf66"),
            clampToGround: false
          }
        })
      );
      if (kind === "area") {
        measurementDraftEntitiesRef.current.push(
          viewer.entities.add({
            polygon: {
              hierarchy: new CallbackProperty(
                () =>
                  positions.length >= 3
                    ? new PolygonHierarchy([...positions])
                    : undefined,
                false
              ),
              material: Color.fromCssColorString("#ffcf66").withAlpha(0.2)
            }
          })
        );
      }

      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        const position = pickWorldPosition(viewer, event.position);
        if (!position) {
          setMeasureNotice("這個位置無法定位，請點選模型或地表。");
          return;
        }
        positions.push(position);
        measurementDraftEntitiesRef.current.push(
          viewer.entities.add({
            position,
            point: {
              pixelSize: 9,
              color: Color.fromCssColorString("#ffcf66"),
              outlineColor: Color.fromCssColorString("#071019"),
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY
            }
          })
        );
        setMeasurePointCount(positions.length);
        setMeasureNotice(
          kind === "distance"
            ? positions.length >= 2
              ? `目前距離 ${formatDistance(calculateDistance(positions))}，可完成或繼續加點。`
              : "已選 1 點，請再選下一點。"
            : positions.length >= 3
              ? `目前面積 ${formatArea(calculateArea(positions))}，可完成或繼續加點。`
              : `已選 ${positions.length} 點，至少還需要 ${3 - positions.length} 點。`
        );
      }, ScreenSpaceEventType.LEFT_CLICK);
      measurementHandlerRef.current = handler;
    },
    [
      clearDrawingPreview,
      clearMeasurementDraft,
      clipMode,
      restoreAppliedClipping,
      status.phase
    ]
  );

  const undoMeasurementPoint = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || measurementPositionsRef.current.length === 0) return;
    measurementPositionsRef.current.pop();
    const pointEntity = measurementDraftEntitiesRef.current.pop();
    if (pointEntity) viewer.entities.remove(pointEntity);
    const count = measurementPositionsRef.current.length;
    setMeasurePointCount(count);
    setMeasureNotice(count === 0 ? "請在模型表面點選起點。" : `目前已選 ${count} 點。`);
  }, []);

  const finishMeasurement = useCallback(() => {
    const viewer = viewerRef.current;
    const positions = measurementPositionsRef.current;
    const kind = measurementKindRef.current;
    const minimum = kind === "distance" ? 2 : 3;
    if (!viewer || positions.length < minimum) return;

    measurementHandlerRef.current?.destroy();
    measurementHandlerRef.current = null;
    const result =
      kind === "distance"
        ? formatDistance(calculateDistance(positions))
        : formatArea(calculateArea(positions));
    if (kind === "area") {
      const polygon = measurementDraftEntitiesRef.current.find(
        (entity) => entity.polygon
      );
      if (polygon?.polygon) {
        polygon.polygon.material = new ColorMaterialProperty(
          Color.fromCssColorString("#ffcf66").withAlpha(0.25)
        );
      }
    } else {
      measurementDraftEntitiesRef.current.push(
        viewer.entities.add({
          position: new ConstantPositionProperty(
            positions[positions.length - 1]
          ),
          label: {
            text: new CallbackProperty(
              () => formatDistance(calculateDistance(positions)),
              false
            ),
            font: "700 16px sans-serif",
            fillColor: Color.fromCssColorString("#071019"),
            backgroundColor: Color.fromCssColorString("#ffcf66"),
            showBackground: true,
            backgroundPadding: new Cartesian2(10, 7),
            pixelOffset: new Cartesian2(0, -28),
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.CENTER,
            style: LabelStyle.FILL,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        })
      );
    }

    const completedEntities = [...measurementDraftEntitiesRef.current];
    if (kind === "distance") {
      const measurementIndex = distancePositionsRef.current.length;
      distancePositionsRef.current.push(positions);
      completedEntities
        .filter((entity) => entity.point)
        .forEach((entity, pointIndex) => {
          distancePointLookupRef.current.set(entity.id, {
            measurementIndex,
            pointIndex
          });
        });

      if (!measurementDragHandlerRef.current) {
        const dragHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
        let draggedPoint: Entity | null = null;
        let draggedReference: { measurementIndex: number; pointIndex: number } | null = null;
        let previousInertiaSpin = viewer.scene.screenSpaceCameraController.inertiaSpin;
        let previousInertiaTranslate =
          viewer.scene.screenSpaceCameraController.inertiaTranslate;
        let dragCameraView: AreaCameraView | null = null;

        const restoreDragCamera = () => {
          if (!dragCameraView) return;
          viewer.camera.setView({
            destination: dragCameraView.destination,
            orientation: {
              heading: dragCameraView.heading,
              pitch: dragCameraView.pitch,
              roll: dragCameraView.roll
            }
          });
        };

        const updateDraggedPoint = (screenPosition: Cartesian2) => {
          if (!draggedPoint || !draggedReference) return;
          const nextPosition = pickWorldPosition(viewer, screenPosition);
          if (!nextPosition) return;
          const activePositions =
            distancePositionsRef.current[draggedReference.measurementIndex];
          if (!activePositions) return;
          activePositions[draggedReference.pointIndex] = nextPosition;
          draggedPoint.position = new ConstantPositionProperty(nextPosition);
          restoreDragCamera();
          viewer.scene.requestRender();
        };

        dragHandler.setInputAction((event: { position: Cartesian2 }) => {
          if (measurementHandlerRef.current || clippingHandlerRef.current) return;
          const picked = viewer.scene.pick(event.position) as
            | { id?: Entity }
            | undefined;
          const entity = picked?.id;
          if (!(entity instanceof Entity)) return;
          const reference = distancePointLookupRef.current.get(entity.id);
          if (!reference) return;
          draggedPoint = entity;
          draggedReference = reference;
          dragCameraView = {
            destination: viewer.camera.positionWC.clone(),
            heading: viewer.camera.heading,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll
          };
          const controller = viewer.scene.screenSpaceCameraController;
          previousInertiaSpin = controller.inertiaSpin;
          previousInertiaTranslate = controller.inertiaTranslate;
          controller.inertiaSpin = 0;
          controller.inertiaTranslate = 0;
          controller.enableInputs = false;
          viewer.canvas.style.cursor = "grabbing";
        }, ScreenSpaceEventType.LEFT_DOWN);

        dragHandler.setInputAction((event: { endPosition: Cartesian2 }) => {
          updateDraggedPoint(event.endPosition);
        }, ScreenSpaceEventType.MOUSE_MOVE);

        dragHandler.setInputAction((event: { position: Cartesian2 }) => {
          if (!draggedPoint || !draggedReference) return;
          updateDraggedPoint(event.position);
          const activePositions =
            distancePositionsRef.current[draggedReference.measurementIndex];
          const updatedDistance = activePositions
            ? formatDistance(calculateDistance(activePositions))
            : "";
          restoreDragCamera();
          draggedPoint = null;
          draggedReference = null;
          dragCameraView = null;
          const controller = viewer.scene.screenSpaceCameraController;
          controller.enableInputs = true;
          window.requestAnimationFrame(() => {
            if (viewer.isDestroyed()) return;
            controller.inertiaSpin = previousInertiaSpin;
            controller.inertiaTranslate = previousInertiaTranslate;
          });
          viewer.canvas.style.cursor = "";
          setMeasureNotice(`距離端點已更新：${updatedDistance}`);
        }, ScreenSpaceEventType.LEFT_UP);

        measurementDragHandlerRef.current = dragHandler;
      }
    }

    completedMeasurementsRef.current[kind].push([
      ...completedEntities
    ]);
    viewer.scene.requestRender();
    measurementDraftEntitiesRef.current = [];
    measurementPositionsRef.current = [];
    const count = completedMeasurementsRef.current[kind].length;
    if (kind === "distance") setDistanceMeasureCount(count);
    else {
      setAreaMeasureCount(count);
      areaCameraViewsRef.current.push({
        destination: viewer.camera.positionWC.clone(),
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll
      });
      setAreaResults((current) => [
        ...current,
        { id: count, value: result }
      ]);
    }
    setMeasurePointCount(0);
    setMeasureMode("idle");
    setMeasureNotice(
      kind === "distance"
        ? `距離標註 ${count}/3：${result}。可拖曳黃色端點調整。`
        : `面積標註 ${count}/3：${result}`
    );
  }, []);

  const focusArea = useCallback(async (index: number) => {
    const viewer = viewerRef.current;
    const areas = completedMeasurementsRef.current.area;
    if (!viewer || !areas[index]) return;

    areas.forEach((entities, areaIndex) => {
      const polygon = entities.find((entity) => entity.polygon);
      if (polygon?.polygon) {
        polygon.polygon.material = new ColorMaterialProperty(
          Color.fromCssColorString(
            areaIndex === index ? "#ff4d4f" : "#ffcf66"
          ).withAlpha(areaIndex === index ? 0.48 : 0.25)
        );
      }
    });
    setSelectedAreaIndex(index);
    viewer.scene.requestRender();
    const savedView = areaCameraViewsRef.current[index];
    if (!savedView) return;
    viewer.camera.flyTo({
      destination: savedView.destination,
      duration: 1.25,
      orientation: {
        heading: savedView.heading,
        pitch: savedView.pitch,
        roll: savedView.roll
      }
    });
  }, []);

  const copyCameraView = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const camera = viewer.camera;
    const position = camera.positionCartographic;
    const view = {
      longitude: Number(CesiumMath.toDegrees(position.longitude).toFixed(8)),
      latitude: Number(CesiumMath.toDegrees(position.latitude).toFixed(8)),
      height: Number(position.height.toFixed(2)),
      heading: Number(CesiumMath.toDegrees(camera.heading).toFixed(3)),
      pitch: Number(CesiumMath.toDegrees(camera.pitch).toFixed(3)),
      roll: Number(CesiumMath.toDegrees(camera.roll).toFixed(3))
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(view, null, 2));
      setCameraNotice("目前視角參數已複製，貼給我即可設定成起始視角。");
    } catch {
      setCameraNotice(`視角參數：${JSON.stringify(view)}`);
    }
  }, []);

  const copyShareLink = useCallback(async () => {
    const config = parseConfig(import.meta.env);
    const projects = createProjectCatalog(config.modelSource);
    const comparisons = createComparisonCatalog();
    const shareUrl = new URL(
      activeComparison
        ? getComparisonSharePath(comparisons, activeComparison.id)
        : getProjectSharePath(projects, projectId),
      window.location.origin
    );
    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setCameraNotice(
        "專案分享連結已複製，連結不包含密碼。請另外將該專案密碼提供給收件者。"
      );
    } catch {
      setCameraNotice(`分享網址：${shareUrl.toString()}`);
    }
  }, [activeComparison, projectId]);

  return (
    <main
      className={
        clipMode === "drawing" ||
        measureMode === "distance" ||
        measureMode === "area"
          ? "viewer-shell interaction-active"
          : "viewer-shell"
      }
    >
      <div ref={containerRef} className="cesium-host" aria-label="3D 模型畫面" />

      {activeComparison && (
        <section
          className="comparison-overlay"
          aria-label={`${activeComparison.leftLabel}與${activeComparison.rightLabel}模型對比`}
        >
          {(() => {
            const selection =
              comparisonSelection?.comparisonId === activeComparison.id
                ? comparisonSelection
                : {
                    leftProjectId: activeComparison.leftProjectId,
                    rightProjectId: activeComparison.rightProjectId
                  };
            const optionLabel = (id: string, fallback: string) =>
              activeComparison.projectOptions?.find(
                (option) => option.projectId === id
              )?.label ?? fallback;
            return activeComparison.projectOptions ? (
              <>
                <label className="comparison-label comparison-label-left">
                  <span>左側</span>
                  <select
                    value={selection.leftProjectId}
                    onChange={(event) =>
                      changeComparisonProject("left", event.target.value)
                    }
                  >
                    {activeComparison.projectOptions.map((option) => (
                      <option
                        key={option.projectId}
                        value={option.projectId}
                        disabled={option.projectId === selection.rightProjectId}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="comparison-label comparison-label-right">
                  <span>右側</span>
                  <select
                    value={selection.rightProjectId}
                    onChange={(event) =>
                      changeComparisonProject("right", event.target.value)
                    }
                  >
                    {activeComparison.projectOptions.map((option) => (
                      <option
                        key={option.projectId}
                        value={option.projectId}
                        disabled={option.projectId === selection.leftProjectId}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <span className="comparison-label comparison-label-left">
                  {comparisonSwapped
                    ? optionLabel(selection.rightProjectId, activeComparison.rightLabel)
                    : optionLabel(selection.leftProjectId, activeComparison.leftLabel)}
                </span>
                <span className="comparison-label comparison-label-right">
                  {comparisonSwapped
                    ? optionLabel(selection.leftProjectId, activeComparison.leftLabel)
                    : optionLabel(selection.rightProjectId, activeComparison.rightLabel)}
                </span>
              </>
            );
          })()}
          {activeComparison.displayMode !== "combined" && <><div
            className="comparison-divider"
            style={{ left: `${splitPosition * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label={`調整 ${
              comparisonSwapped
                ? activeComparison.rightLabel
                : activeComparison.leftLabel
            } 與 ${
              comparisonSwapped
                ? activeComparison.leftLabel
                : activeComparison.rightLabel
            } 顯示比例`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(splitPosition * 100)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              handleDividerPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                handleDividerPointer(event.clientX);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                event.preventDefault();
                updateSplitPosition(splitPosition - 0.02);
              } else if (
                event.key === "ArrowRight" ||
                event.key === "ArrowUp"
              ) {
                event.preventDefault();
                updateSplitPosition(splitPosition + 0.02);
              } else if (event.key === "Home") {
                event.preventDefault();
                updateSplitPosition(0);
              } else if (event.key === "End") {
                event.preventDefault();
                updateSplitPosition(1);
              }
            }}
          >
            <span className="comparison-handle" aria-hidden="true">
              <ChevronLeft size={18} />
              <ChevronRight size={18} />
            </span>
          </div>
          <div className="comparison-actions">
            <button type="button" onClick={swapComparisonSides}>
              <ArrowLeftRight size={15} aria-hidden="true" />
              交換左右
            </button>
            <button type="button" onClick={() => updateSplitPosition(0.5)}>
              回到 50%
            </button>
          </div></>}
        </section>
      )}

      <header className="brand-panel">
        <span className="brand-mark" aria-hidden="true">
          <Focus size={18} />
        </span>
        <div>
          <p className="eyebrow">DRONE SURVEY</p>
          <h1>3D 現地檢視器</h1>
        </div>
      </header>

      <a className="site-back-link" href="/" aria-label="返回 LCT Studio 首頁">
        <ArrowLeft size={17} aria-hidden="true" />
        <span>返回 LCT Studio</span>
      </a>

      <div className={`status-pill status-${status.phase}`} role="status">
        {status.phase === "error" ? (
          <TriangleAlert size={16} aria-hidden="true" />
        ) : status.phase === "ready" ? (
          <span className="status-dot" aria-hidden="true" />
        ) : (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        )}
        <span>{status.message}</span>
      </div>

      <aside
        className={`map-settings${settingsCollapsed ? " is-collapsed" : ""}`}
        aria-label="地圖設定"
      >
        <button
          type="button"
          className="settings-collapse-button"
          aria-expanded={!settingsCollapsed}
          aria-label={settingsCollapsed ? "展開專案選單" : "收合專案選單"}
          onClick={() => setSettingsCollapsed((collapsed) => !collapsed)}
        >
          {settingsCollapsed ? (
            <ChevronRight size={20} aria-hidden="true" />
          ) : (
            <ChevronLeft size={20} aria-hidden="true" />
          )}
        </button>
        <div className="settings-content">
          <div className="setting-group project-group">
          <span className="setting-label">專案</span>
          <select
            value={projectId}
            aria-label="選擇專案"
            onChange={(event) => {
              const nextProjectId = event.target.value;
              setProjectId(nextProjectId);
              sessionStorage.setItem(
                "lct-3d-viewer-active-project",
                nextProjectId
              );
              const url = new URL(window.location.href);
              if (IS_ADMIN) {
                url.searchParams.set("project", nextProjectId);
                window.history.replaceState({}, "", url);
              }
            }}
          >
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="project-access-row">
            <p className="project-name">
              {projectName} · {IS_ADMIN ? "管理員模式" : "一般觀看"}
            </p>
            <button
              type="button"
              className="switch-role"
              onClick={() => {
                if (IS_ADMIN) {
                  sessionStorage.setItem(
                    "lct-3d-viewer-role",
                    "viewer"
                  );
                  sessionStorage.setItem(
                    "lct-3d-viewer-projects",
                    JSON.stringify([projectId])
                  );
                  window.location.reload();
                  return;
                }
                setAdminPassword("");
                setAdminLoginError("");
                setShowAdminLogin(true);
              }}
            >
              切換身分
            </button>
          </div>
          </div>
          <div className="setting-group">
          <span className="setting-label">
            <MapIcon size={15} aria-hidden="true" />
            底圖
          </span>
          <div className="segmented-control">
            <button
              type="button"
              className={basemap === "aerial" ? "active" : ""}
              aria-pressed={basemap === "aerial"}
              onClick={() => void changeBasemap("aerial")}
            >
              衛星航照
            </button>
            <button
              type="button"
              className={basemap === "road" ? "active" : ""}
              aria-pressed={basemap === "road"}
              onClick={() => void changeBasemap("road")}
            >
              道路圖
            </button>
          </div>
          </div>
          {projectHasSunSimulation && (
            <div className="setting-group sun-simulation-group">
              <span className="setting-label">
                <Sun size={15} aria-hidden="true" />
                日照模擬
              </span>
              <label className="overlay-toggle sun-toggle">
                <input
                  type="checkbox"
                  checked={sunSimulationEnabled}
                  onChange={(event) =>
                    changeSunSimulation(event.currentTarget.checked)
                  }
                />
                <span>啟用太陽光照與陰影</span>
              </label>
              <div className="sun-controls" aria-disabled={!sunSimulationEnabled}>
                <label className="sun-date-field">
                  <span>日期</span>
                  <input
                    type="date"
                    value={sunDate}
                    disabled={!sunSimulationEnabled}
                    onChange={(event) => setSunDate(event.currentTarget.value)}
                  />
                </label>
                <div className="sun-time-row">
                  <span>台灣時間</span>
                  <strong>{formatSunTime(sunMinutes)}</strong>
                </div>
                <input
                  className="sun-time-slider"
                  type="range"
                  min={6 * 60}
                  max={18 * 60}
                  step={10}
                  value={sunMinutes}
                  disabled={!sunSimulationEnabled}
                  aria-label="日照模擬時間"
                  onChange={(event) => setSunMinutes(Number(event.currentTarget.value))}
                />
                <div className="sun-presets">
                  {[8, 12, 16].map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      disabled={!sunSimulationEnabled}
                      className={sunMinutes === hour * 60 ? "active" : ""}
                      onClick={() => setSunMinutes(hour * 60)}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sun-play-button"
                  disabled={!sunSimulationEnabled}
                  onClick={() => setSunSimulationPlaying((playing) => !playing)}
                >
                  {sunSimulationPlaying ? (
                    <Pause size={14} aria-hidden="true" />
                  ) : (
                    <Play size={14} aria-hidden="true" />
                  )}
                  {sunSimulationPlaying ? "暫停模擬" : "播放一天"}
                </button>
              </div>
              <p className="overlay-hint">依專案位置、日期與台灣時間模擬日照；僅供視覺判讀。</p>
            </div>
          )}
          {projectHasOverlay && (
            <div className="setting-group overlay-group">
              <span className="setting-label">套繪圖層</span>
              <label className="overlay-toggle">
                <input
                  type="checkbox"
                  checked={overlayVisible}
                  onChange={(event) =>
                    changeOverlayVisibility(event.currentTarget.checked)
                  }
                />
                <span>顯示套繪圖層</span>
              </label>
              <label className="overlay-toggle overlay-toggle-secondary">
                <input
                  type="checkbox"
                  checked={overlayXray}
                  onChange={(event) =>
                    changeOverlayXray(event.currentTarget.checked)
                  }
                />
                <span>穿透遮擋物</span>
              </label>
              <p className="overlay-hint">目前以每 5m 主要等高線作為套繪測試</p>
            </div>
          )}
          {projectHasCadastral && (
            <div className="setting-group cadastral-group">
              <span className="setting-label">地籍圖層</span>
              {CADASTRAL_PROJECTS[projectId]?.parcels.length > 0 && (
                <label className="cadastral-parcel-picker">
                  <span>地段／地號</span>
                  <select
                    aria-label="選擇地段地號"
                    value={selectedCadastralParcelKey}
                    onChange={(event) => selectCadastralParcel(event.currentTarget.value)}
                  >
                    {CADASTRAL_PROJECTS[projectId].parcels.map((parcel) => (
                      <option key={parcel.key} value={parcel.key}>{parcel.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="overlay-toggle cadastral-toggle">
                <input
                  type="checkbox"
                  checked={cadastralVisible}
                  onChange={(event) =>
                    changeCadastralVisibility(event.currentTarget.checked)
                  }
                />
                <span>顯示地籍範圍</span>
              </label>
              {cadastralVisible && (
                <>
                  <div className="cadastral-style-options" role="group" aria-label="地籍套繪樣式">
                    {(
                      [
                        ["original", "原始顯示"],
                        ["model-ground", "模型地面套繪"]
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={
                          mode === "model-ground" && !modelGroundAvailable
                        }
                        className={cadastralDisplayMode === mode ? "active" : ""}
                        aria-pressed={cadastralDisplayMode === mode}
                        onClick={() => changeCadastralDisplayMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="overlay-toggle overlay-toggle-secondary">
                    <input type="checkbox" checked={occupancyVisible}
                      onChange={event => changeOccupancyVisibility(event.currentTarget.checked)} />
                    <span>顯示占用範圍</span>
                  </label>
                  <p className="cadastral-disclaimer">
                    地籍線套繪僅供參考，最終成果以地政單位實地鑑界為準。
                  </p>
                  {cadastralDisplayMode === "model-ground" && (
                    <p className="overlay-hint cadastral-terrain-notice">
                      地籍面位於估算地面；綠色為建物滴水線投影範圍，模型缺口保留補洞面。
                    </p>
                  )}
                  {!modelGroundAvailable && (
                    <p className="overlay-hint cadastral-terrain-notice">
                      正在從目前的三維模型估算地面高度，完成後即可切換套繪。
                    </p>
                  )}
                </>
              )}
              <button
                type="button"
                className="cadastral-summary"
                onClick={() => selectCadastralParcel(selectedCadastralParcelKey)}
              >
                <span>{CADASTRAL_PROJECTS[projectId]?.parcels.find(
                  (parcel) => parcel.key === selectedCadastralParcelKey
                )?.info.sectionName}</span>
                <strong>地號 {CADASTRAL_PROJECTS[projectId]?.parcels.find(
                  (parcel) => parcel.key === selectedCadastralParcelKey
                )?.info.parcelNo}</strong>
              </button>
              {projectId === "taoyuan-building-overlay" && (
                <div className="occupancy-summary" aria-label="建物占用分析">
                  <div><span>地籍面積</span><strong>500 m²</strong></div>
                  <div><span>建物占用投影面積</span><strong>{TAOYUAN_102_45_INFO.occupiedAreaM2!.toFixed(2)} m²</strong></div>
                  <div className="emphasis"><span>占用比例</span><strong>{TAOYUAN_102_45_INFO.occupancyPercent!.toFixed(2)}%</strong></div>
                  <p>依滴水線垂直投影與地籍範圍交集重算，已修除右端非屋頂尖角。</p>
                </div>
              )}
              <p className="overlay-hint">點選紅色範圍可查看土地與地籍資料</p>
            </div>
          )}
          {projectHasLandmarks && (
            <div className="setting-group landmark-group">
              <span className="setting-label">三維標的</span>
              <label className="overlay-toggle">
                <input
                  type="checkbox"
                  checked={landmarksVisible}
                  onChange={(event) =>
                    changeLandmarksVisibility(event.currentTarget.checked)
                  }
                />
                <span>顯示辦公室與儲藏室</span>
              </label>
              {IS_ADMIN && (
                <>
                  <label className="overlay-toggle overlay-toggle-secondary">
                    <input
                      type="checkbox"
                      checked={landmarkEditEnabled}
                      onChange={(event) => {
                        const enabled = event.currentTarget.checked;
                        landmarkEditEnabledRef.current = enabled;
                        setLandmarkEditEnabled(enabled);
                      }}
                    />
                    <span>啟用標示位置編輯</span>
                  </label>
                </>
              )}
              <p className="overlay-hint">
                {IS_ADMIN && landmarkEditEnabled
                  ? "編輯已解鎖；拖曳標示後會儲存在此瀏覽器"
                  : "點選標示可查看資訊；位置編輯預設鎖定"}
              </p>
            </div>
          )}
          {IS_ADMIN &&
            !activeComparison &&
            projectId === "gongliao-longdong-rock" && (
              <div className="setting-group model-calibration-group">
                <span className="setting-label">
                  <Compass size={15} aria-hidden="true" />
                  模型位置校正
                </span>
                <label className="overlay-toggle calibration-toggle">
                  <input
                    type="checkbox"
                    checked={calibrationPickEnabled}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked;
                      calibrationPickEnabledRef.current = enabled;
                      setCalibrationPickEnabled(enabled);
                    }}
                  />
                  <span>啟用點選地圖移動模型</span>
                </label>
                <p className="overlay-hint">
                  {calibrationPickEnabled
                    ? "請直接點選模型應在的中心位置；點擊後仍需儲存。"
                    : "目前已鎖定，操作地圖不會改變模型位置。"}
                </p>
                <div className="calibration-grid">
                  <label>
                    <span>經度</span>
                    <input
                      type="number"
                      step="0.000001"
                      value={modelCalibration.longitude}
                      onChange={(event) =>
                        updateModelCalibration({ longitude: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>緯度</span>
                    <input
                      type="number"
                      step="0.000001"
                      value={modelCalibration.latitude}
                      onChange={(event) =>
                        updateModelCalibration({ latitude: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>高程 m</span>
                    <input
                      type="number"
                      step="0.5"
                      value={modelCalibration.height}
                      onChange={(event) =>
                        updateModelCalibration({ height: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>旋轉 °</span>
                    <input
                      type="number"
                      step="1"
                      value={modelCalibration.heading}
                      onChange={(event) =>
                        updateModelCalibration({ heading: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>向東 m</span>
                    <input
                      type="number"
                      step="1"
                      value={modelCalibration.east}
                      onChange={(event) =>
                        updateModelCalibration({ east: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    <span>向北 m</span>
                    <input
                      type="number"
                      step="1"
                      value={modelCalibration.north}
                      onChange={(event) =>
                        updateModelCalibration({ north: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
                <div className="clip-actions calibration-actions">
                  <button type="button" className="primary" onClick={saveModelCalibration}>
                    儲存校正
                  </button>
                  <button type="button" onClick={() => void copyModelCalibration()}>
                    複製設定
                  </button>
                  <button type="button" onClick={resetModelCalibration}>
                    重設
                  </button>
                </div>
              </div>
            )}
          {IS_ADMIN && !activeComparison && (
          <div className="setting-group clipping-group">
            <span className="setting-label">
              <Frame size={15} aria-hidden="true" />
              模型範圍
            </span>
            {clipMode === "drawing" ? (
              <div className="clip-actions">
                <button
                  type="button"
                  onClick={undoClipPoint}
                  disabled={clipPointCount === 0}
                >
                  撤銷一點
                </button>
                <button type="button" onClick={cancelClipping}>
                  取消
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={finishClipping}
                  disabled={clipPointCount < 3}
                >
                  完成框選
                </button>
              </div>
            ) : (
              <div className="clip-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={startClipping}
                  disabled={status.phase !== "ready"}
                >
                  {clipMode === "applied" ? "重新框選" : "框選顯示範圍"}
                </button>
                {clipMode === "applied" && (
                  <button type="button" onClick={removeClipping}>
                    取消裁切
                  </button>
                )}
              </div>
            )}
            {clipNotice && <p className="clip-notice">{clipNotice}</p>}
          </div>
          )}
          <BuildingSectionTool
            enabled={
              IS_ADMIN &&
              !activeComparison &&
              projectId === "sanxia-solar-b3dms"
            }
            viewer={sectionViewer}
            tileset={sectionTileset}
            projectName={projectName}
          />
          <div className="setting-group measurement-group">
          <span className="setting-label">
            <Ruler size={15} aria-hidden="true" />
            工程量測
          </span>
          {measureMode === "distance" || measureMode === "area" ? (
            <div className="measure-actions">
              <button
                type="button"
                onClick={undoMeasurementPoint}
                disabled={measurePointCount === 0}
              >
                撤銷一點
              </button>
              <button type="button" onClick={clearMeasurementDraft}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={finishMeasurement}
                disabled={
                  measurePointCount <
                  (measureMode === "distance" ? 2 : 3)
                }
              >
                完成量測
              </button>
            </div>
          ) : (
            <div className="measure-actions">
              <button
                type="button"
                onClick={() => startMeasurement("distance")}
                disabled={
                  status.phase !== "ready" || distanceMeasureCount >= 3
                }
              >
                <Ruler size={14} aria-hidden="true" />
                距離 {distanceMeasureCount}/3
              </button>
              <button
                type="button"
                onClick={() => startMeasurement("area")}
                disabled={status.phase !== "ready" || areaMeasureCount >= 3}
              >
                <Pentagon size={14} aria-hidden="true" />
                面積 {areaMeasureCount}/3
              </button>
              {distanceMeasureCount + areaMeasureCount > 0 && (
                <button type="button" onClick={clearAllMeasurements}>
                  清除全部
                </button>
              )}
            </div>
          )}
          {measureNotice && <p className="measure-notice">{measureNotice}</p>}
          {areaResults.length > 0 && (
            <div className="area-results" aria-label="面積量測結果">
              <span className="area-results-title">面積標註</span>
              {areaResults.map((area, index) => (
                <button
                  key={area.id}
                  type="button"
                  className={selectedAreaIndex === index ? "active" : ""}
                  aria-pressed={selectedAreaIndex === index}
                  onClick={() => void focusArea(index)}
                >
                  <span>面積 {area.id}</span>
                  <strong>{area.value}</strong>
                </button>
              ))}
            </div>
          )}
          </div>
          {mapNotice && <p className="map-notice">{mapNotice}</p>}
        </div>
      </aside>

      {status.phase === "error" && (
        <section className="error-card" role="alert">
          <TriangleAlert size={22} aria-hidden="true" />
          <div>
            <strong>目前無法顯示模型</strong>
            <p>{status.message}</p>
          </div>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={16} />
            重新嘗試
          </button>
        </section>
      )}

      {selectedLandmark && (
        <aside className="landmark-card" aria-label={`${selectedLandmark.title}資訊`}>
          <button
            type="button"
            className="landmark-card-close"
            aria-label="關閉標的資訊"
            onClick={() => setSelectedLandmark(null)}
          >
            ×
          </button>
          <p className="landmark-card-kicker">3D LANDMARK</p>
          <h2>{selectedLandmark.title}</h2>
          <span className="landmark-card-category">
            {selectedLandmark.category}
          </span>
          <p>{selectedLandmark.description}</p>
          <dl>
            <div>
              <dt>經度</dt>
              <dd>{selectedLandmark.longitude.toFixed(6)}</dd>
            </div>
            <div>
              <dt>緯度</dt>
              <dd>{selectedLandmark.latitude.toFixed(6)}</dd>
            </div>
          </dl>
        </aside>
      )}

      {selectedCadastral && (
        <CadastralInfoPanel key={selectedCadastral.parcelNo} parcelNo={selectedCadastral.parcelNo} onClose={() => setSelectedCadastral(null)}>
          <p className="landmark-card-kicker">CADASTRAL INFO</p>
          <h2>{selectedCadastral.sectionName}</h2>
          <span className="landmark-card-category">地號 {selectedCadastral.parcelNo}</span>
          <dl className="cadastral-details">
            <div><dt>縣市</dt><dd>{selectedCadastral.county}</dd></div>
            <div><dt>地政事務所</dt><dd>{selectedCadastral.landOffice}</dd></div>
            <div><dt>段代碼</dt><dd>{selectedCadastral.sectionCode}</dd></div>
            {selectedCadastral.sectionExtensionCode !== undefined && (
              <div><dt>段延伸碼</dt><dd>{selectedCadastral.sectionExtensionCode}</dd></div>
            )}
            <div><dt>鄉鎮市區代碼</dt><dd>{selectedCadastral.townCode}</dd></div>
            <div><dt>測量方式</dt><dd>{selectedCadastral.surveyMethod}</dd></div>
            <div><dt>測量類別</dt><dd>{selectedCadastral.surveyType}</dd></div>
            <div><dt>成圖年月</dt><dd>{selectedCadastral.mapDate}</dd></div>
            <div><dt>比例尺</dt><dd>{selectedCadastral.scale}</dd></div>
            {selectedCadastral.coordinateSystem && (
              <div><dt>坐標系統</dt><dd>{selectedCadastral.coordinateSystem}</dd></div>
            )}
            {selectedCadastral.digitizedDate && (
              <div><dt>數化年月</dt><dd>{selectedCadastral.digitizedDate}</dd></div>
            )}
            {selectedCadastral.registrationDate && (
              <div className="wide"><dt>登記日期</dt><dd>{selectedCadastral.registrationDate}</dd></div>
            )}
            {selectedCadastral.announcedLandValue && (
              <div className="wide"><dt>公告土地現值</dt><dd>{selectedCadastral.announcedLandValue}</dd></div>
            )}
            {selectedCadastral.rightsCategory && (
              <div className="wide"><dt>權利人類別</dt><dd>{selectedCadastral.rightsCategory}</dd></div>
            )}
            {selectedCadastral.useZone && (
              <div><dt>使用分區</dt><dd>{selectedCadastral.useZone}</dd></div>
            )}
            {selectedCadastral.landUseCategory && (
              <div><dt>使用地類別</dt><dd>{selectedCadastral.landUseCategory}</dd></div>
            )}
            <div className="wide"><dt>原始座標</dt><dd>{selectedCadastral.crs}</dd></div>
            {selectedCadastral.cadastralAreaM2 !== undefined && (
              <div><dt>地籍面積</dt><dd>{Number.isInteger(selectedCadastral.cadastralAreaM2) ? selectedCadastral.cadastralAreaM2.toFixed(0) : selectedCadastral.cadastralAreaM2.toFixed(3)} m²</dd></div>
            )}
            {selectedCadastral.occupiedAreaM2 !== undefined && (
              <div><dt>建物占用投影面積</dt><dd>{selectedCadastral.occupiedAreaM2.toFixed(2)} m²</dd></div>
            )}
            {selectedCadastral.occupancyPercent !== undefined && (
              <div className="wide occupancy-card-result"><dt>占用比例</dt><dd>{selectedCadastral.occupancyPercent.toFixed(2)}%</dd></div>
            )}
            {selectedCadastral.occupiedAreaM2 !== undefined && (
              <div className="wide"><dt>計算方式</dt><dd>滴水線垂直投影輪廓與完整地號相交，以 TWD97 平面座標計算。</dd></div>
            )}
          </dl>
          {selectedCadastral.analysisNote && (
            <p className="cadastral-analysis-note">{selectedCadastral.analysisNote}</p>
          )}
        </CadastralInfoPanel>
      )}

      {showAdminLogin && (
        <div className="role-login-backdrop" role="presentation">
          <form
            className="role-login-dialog"
            aria-label="管理員登入"
            onSubmit={(event) => {
              event.preventDefault();
              if (adminPassword !== "1111") {
                setAdminLoginError("管理員密碼不正確");
                return;
              }
              sessionStorage.setItem("lct-3d-viewer-role", "admin");
              sessionStorage.removeItem("lct-3d-viewer-projects");
              sessionStorage.setItem("lct-3d-viewer-active-project", projectId);
              window.location.reload();
            }}
          >
            <button
              type="button"
              className="role-login-close"
              aria-label="關閉管理員登入"
              onClick={() => setShowAdminLogin(false)}
            >
              ×
            </button>
            <p className="role-login-kicker">ADMIN MODE</p>
            <h2>切換管理員模式</h2>
            <label htmlFor="admin-password">管理員密碼</label>
            <input
              id="admin-password"
              type="password"
              autoFocus
              value={adminPassword}
              onChange={(event) => {
                setAdminPassword(event.currentTarget.value);
                setAdminLoginError("");
              }}
            />
            {adminLoginError && <p className="role-login-error">{adminLoginError}</p>}
            <button type="submit" className="role-login-submit">
              進入管理員模式
            </button>
          </form>
        </div>
      )}

      <nav className="control-dock" aria-label="模型控制">
        {IS_ADMIN && (
          <button
            type="button"
            onClick={() => void copyCameraView()}
            disabled={status.phase !== "ready"}
            aria-label="複製目前視角"
          >
            <Copy size={20} />
            <span>複製視角</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => void copyShareLink()}
          aria-label="複製分享連結"
        >
          <Share2 size={20} />
          <span>分享連結</span>
        </button>
        <button
          type="button"
          onClick={() => void returnToModel()}
          disabled={status.phase !== "ready"}
          aria-label="回到模型"
        >
          <Focus size={20} />
          <span>回到模型</span>
        </button>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          aria-label="重新載入"
        >
          <RotateCcw size={20} />
          <span>重新載入</span>
        </button>
        <button
          type="button"
          onClick={() => void enterFullscreen()}
          aria-label="切換全螢幕"
        >
          <Expand size={20} />
          <span>全螢幕</span>
        </button>
      </nav>
      <nav className="map-navigation-tools" aria-label="地圖方向工具">
        <button
          type="button"
          onClick={switchToTopView}
          disabled={status.phase !== "ready"}
          aria-label="切換正上方視角"
          title="正上方"
        >
          <ArrowUp size={18} />
          <span>俯視</span>
        </button>
        <button
          type="button"
          onClick={alignViewNorth}
          disabled={status.phase !== "ready"}
          aria-label="視角朝向正北"
          title="正北"
        >
          <Compass size={18} />
          <span>正北</span>
        </button>
      </nav>
      {cameraNotice && (
        <div className="camera-notice" role="status">
          {cameraNotice}
        </div>
      )}
    </main>
  );
}

async function applyBasemap(
  viewer: Viewer,
  basemap: "aerial" | "road"
): Promise<void> {
  const provider =
    basemap === "aerial"
      ? await createWorldImageryAsync({
          style: IonWorldImageryStyle.AERIAL
        })
      : new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/"
        });

  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);
}

function pickWorldPosition(
  viewer: Viewer,
  screenPosition: Cartesian2
): Cartesian3 | undefined {
  if (viewer.scene.pickPositionSupported) {
    const picked = viewer.scene.pickPosition(screenPosition);
    if (picked) return picked;
  }
  const ray = viewer.camera.getPickRay(screenPosition);
  return ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
}

function focusModels(
  viewer: Viewer,
  tilesets: Cesium3DTileset[],
  preset?: CameraPreset,
  orbitTarget?: Cartesian3
): void {
  if (orbitTarget) {
    focusParcelOrbit(viewer, orbitTarget);
    return;
  }
  if (!preset) {
    if (tilesets.length === 1) {
      void viewer.flyTo(tilesets[0]);
      return;
    }
    if (tilesets.length > 1) {
      viewer.camera.flyToBoundingSphere(
        BoundingSphere.fromBoundingSpheres(
          tilesets.map((tileset) => tileset.boundingSphere)
        ),
        { duration: 1.8 }
      );
    }
    return;
  }
  viewer.camera.flyTo({
    duration: 1.8,
    destination: Cartesian3.fromDegrees(
      preset.longitude,
      preset.latitude,
      preset.height
    ),
    orientation: {
      heading: CesiumMath.toRadians(preset.headingDegrees),
      pitch: CesiumMath.toRadians(preset.pitchDegrees),
      roll: CesiumMath.toRadians(preset.rollDegrees)
    }
  });
}

function getLoadedTilesets(
  primary: Cesium3DTileset | null,
  secondary: Cesium3DTileset | null
): Cesium3DTileset[] {
  return [primary, secondary].filter(
    (tileset): tileset is Cesium3DTileset => tileset !== null
  );
}

function getCombinedBoundingSphere(
  tilesets: Cesium3DTileset[]
): BoundingSphere {
  return tilesets.length === 1
    ? tilesets[0].boundingSphere
    : BoundingSphere.fromBoundingSpheres(
        tilesets.map((tileset) => tileset.boundingSphere)
      );
}

function applyLongdongCalibration(
  tileset: Cesium3DTileset,
  localCenter: Cartesian3,
  calibration: ModelCalibration
): void {
  const anchor = Cartesian3.fromDegrees(
    calibration.longitude,
    calibration.latitude,
    calibration.height
  );
  const localCenterToOrigin = Matrix4.fromTranslation(
    Cartesian3.negate(localCenter, new Cartesian3())
  );
  const eastNorthUp = Transforms.eastNorthUpToFixedFrame(anchor);
  const enuOffset = Matrix4.fromTranslation(
    new Cartesian3(calibration.east, calibration.north, 0)
  );
  const heading = Matrix4.fromRotationTranslation(
    Matrix3.fromRotationZ(CesiumMath.toRadians(calibration.heading))
  );
  const anchorWithOffset = Matrix4.multiply(eastNorthUp, enuOffset, new Matrix4());
  const orientedAnchor = Matrix4.multiply(anchorWithOffset, heading, new Matrix4());
  tileset.modelMatrix = Matrix4.multiply(orientedAnchor, localCenterToOrigin, new Matrix4());
}

function calculateDistance(positions: Cartesian3[]): number {
  return positions.slice(1).reduce(
    (total, position, index) =>
      total + Cartesian3.distance(positions[index], position),
    0
  );
}

function calculateArea(positions: Cartesian3[]): number {
  const tangentPlane = EllipsoidTangentPlane.fromPoints(positions);
  const projected = tangentPlane.projectPointsOntoPlane(positions);
  if (projected.length < 3) return 0;

  let twiceArea = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2)} km`
    : `${meters.toFixed(2)} m`;
}

function formatArea(squareMeters: number): string {
  return squareMeters >= 10000
    ? `${(squareMeters / 10000).toFixed(2)} ha`
    : `${squareMeters.toFixed(2)} m²`;
}

function applyClippingPolygon(
  tileset: Cesium3DTileset,
  coordinates: ClipCoordinate[],
  clippingRef: React.MutableRefObject<ClippingPolygonCollection | null>
): void {
  if (clippingRef.current) clippingRef.current.enabled = false;
  const positions = Cartesian3.fromDegreesArray(coordinates.flat());
  const collection = new ClippingPolygonCollection({
    polygons: [new ClippingPolygon({ positions })],
    inverse: true
  });
  tileset.clippingPolygons = collection;
  clippingRef.current = collection;
}

function applyAutomaticCombinedSeam(
  primaryTileset: Cesium3DTileset,
  extensionTileset: Cesium3DTileset
): number {
  const primaryCenter = primaryTileset.boundingSphere.center;
  const extensionCenter = extensionTileset.boundingSphere.center;
  const tangentPlane = EllipsoidTangentPlane.fromPoints([
    primaryCenter,
    extensionCenter
  ]);
  const primaryPoint = tangentPlane.projectPointToNearestOnPlane(primaryCenter);
  const extensionPoint = tangentPlane.projectPointToNearestOnPlane(extensionCenter);
  const deltaX = extensionPoint.x - primaryPoint.x;
  const deltaY = extensionPoint.y - primaryPoint.y;
  const centerDistance = Math.hypot(deltaX, deltaY);
  if (centerDistance < 1) {
    throw new Error("兩個模型中心過於接近，無法建立自動接縫。");
  }

  const directionX = deltaX / centerDistance;
  const directionY = deltaY / centerDistance;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const midpointX = (primaryPoint.x + extensionPoint.x) / 2;
  const midpointY = (primaryPoint.y + extensionPoint.y) / 2;
  const seamOverlap = Math.min(8, Math.max(2, centerDistance * 0.02));
  const halfOverlap = seamOverlap / 2;
  const extent = Math.max(
    5000,
    centerDistance * 8,
    primaryTileset.boundingSphere.radius * 8,
    extensionTileset.boundingSphere.radius * 8
  );

  const createHalfPolygon = (directionSign: -1 | 1) => {
    const seamX = midpointX - directionX * halfOverlap * directionSign;
    const seamY = midpointY - directionY * halfOverlap * directionSign;
    const farX = seamX + directionX * extent * directionSign;
    const farY = seamY + directionY * extent * directionSign;
    const points = [
      new Cartesian2(
        seamX + perpendicularX * extent,
        seamY + perpendicularY * extent
      ),
      new Cartesian2(
        seamX - perpendicularX * extent,
        seamY - perpendicularY * extent
      ),
      new Cartesian2(
        farX - perpendicularX * extent,
        farY - perpendicularY * extent
      ),
      new Cartesian2(
        farX + perpendicularX * extent,
        farY + perpendicularY * extent
      )
    ];
    return new ClippingPolygon({
      positions: tangentPlane.projectPointsOntoEllipsoid(points)
    });
  };

  extensionTileset.clippingPolygons = new ClippingPolygonCollection({
    polygons: [createHalfPolygon(1)],
    inverse: true
  });
  return seamOverlap;
}

function applyOverlayXray(
  overlay: GeoJsonDataSource,
  enabled: boolean
): void {
  for (const entity of overlay.entities.values) {
    if (entity.polyline) {
      entity.polyline.depthFailMaterial = enabled
        ? new ColorMaterialProperty(
            Color.fromCssColorString("#ffe0ad").withAlpha(0.9)
          )
        : undefined!;
    }
  }
}
