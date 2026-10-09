import { beforeEach, describe, expect, it } from "vitest";
import {
  createComparisonCatalog,
  createProjectCatalog,
  getComparisonSharePath,
  getProjectSharePath,
  readProjectId
} from "./projects";

describe("project sharing", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("uses the project selected by the access gate", () => {
    sessionStorage.setItem(
      "lct-3d-viewer-active-project",
      "sanxia-solar"
    );

    expect(readProjectId()).toBe("sanxia-solar");
  });

  it("returns a hidden share path for each project", () => {
    const projects = createProjectCatalog({
      type: "cesium-ion",
      assetId: 5094702
    });

    expect(getProjectSharePath(projects, "sanxia-solar-2")).toBe(
      "/3d-viewer/p/T7nV2qL9bX4m/"
    );
  });

  it("defines the OBJ and B3DMS comparison and its hidden share path", () => {
    const comparisons = createComparisonCatalog();
    expect(comparisons[0]).toMatchObject({
      id: "sanxia-obj-b3dms-compare",
      leftProjectId: "sanxia-solar-2",
      rightProjectId: "sanxia-solar-b3dms",
      leftLabel: "OBJ",
      rightLabel: "B3DMS",
      defaultSplitPosition: 0.5
    });
    expect(
      getComparisonSharePath(comparisons, "sanxia-obj-b3dms-compare")
    ).toBe("/3d-viewer/p/C8vN4pR2xK7m/");
  });

  it("defines the Longdong historical comparison and 20260926 combined view", () => {
    const projects = createProjectCatalog({
      type: "cesium-ion",
      assetId: 5094702
    });
    expect(
      projects.find((project) => project.id === "gongliao-longdong-general-20260805")
    ).toMatchObject({
      name: "龍洞｜一般攝影（20260805）",
      modelSource: { type: "cesium-ion", assetId: 5119307 }
    });
    expect(
      projects.find((project) => project.id === "gongliao-longdong-manual-20260812")
    ).toMatchObject({
      name: "龍洞｜手動補拍（20260812）",
      modelSource: { type: "cesium-ion", assetId: 5131283 }
    });

    const comparisons = createComparisonCatalog();
    expect(
      comparisons.find((comparison) => comparison.id === "longdong-general-close-compare")
    ).toMatchObject({
      leftProjectId: "gongliao-longdong-general-20260805",
      rightProjectId: "gongliao-longdong-manual-20260812",
      name: "龍洞｜歷次成果比較",
      leftLabel: "一般攝影",
      rightLabel: "手動補拍",
      defaultSplitPosition: 0.5,
      projectOptions: [
        { projectId: "gongliao-longdong-general-20260805", label: "一般攝影" },
        { projectId: "gongliao-longdong-manual-20260812", label: "手動補拍" },
        { projectId: "gongliao-longdong-rock-2", label: "08/05 貼近攝影" },
        { projectId: "gongliao-longdong-twd97-20260926", label: "09/26 TWD97" },
        { projectId: "gongliao-longdong-extension-20260926", label: "09/26 延伸區" }
      ]
    });
    expect(
      comparisons.find((comparison) => comparison.id === "longdong-20260926-combined")
    ).toMatchObject({
      leftProjectId: "gongliao-longdong-extension-20260926",
      rightProjectId: "gongliao-longdong-twd97-20260926",
      displayMode: "combined"
    });
    expect(
      getComparisonSharePath(comparisons, "longdong-general-close-compare")
    ).toBe("/3d-viewer/p/V6mQ2rL8dK4x/");
  });
});
