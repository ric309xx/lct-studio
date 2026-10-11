export type ModelSource =
  | { type: "cesium-ion"; assetId: number }
  | { type: "tileset-url"; tilesetUrl: string; privateProjectId?: string };

export type ViewerPhase =
  | "initializing"
  | "loading"
  | "ready"
  | "error";

export type ViewerStatus = {
  phase: ViewerPhase;
  message: string;
};
