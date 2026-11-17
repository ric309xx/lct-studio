// 私人專案目錄只使用伺服器登入後提供的範圍。
import type { ModelSource } from "./types/model";
import {readBootstrap} from "./bootstrap";

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

export function createProjectCatalog(_primarySource: ModelSource): ViewerProject[] {
  return readBootstrap().projects;
}
export function createComparisonCatalog(): ViewerComparison[] {
  return readBootstrap().comparisons;
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
