import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "./taoyuan1013Parcels.json";

describe("雙嶺段三區七地號", () => {
  it("各筆登記面積獨立，1153 模型判讀與六筆外業參考區別來源", () => {
    expect(catalog.map(p => p.info.parcelNo)).toEqual(["1121", "1144", "1152", "1153", "1028", "1039", "704-1"]);
    expect(catalog.map(p => p.info.cadastralAreaM2)).toEqual([4509.15, 54.16, 22.24, 12.05, 730.73, 737.74, 1028.72]);
    expect(new Set(catalog.map(p => p.groupKey)).size).toBe(3);
    for (const parcel of catalog) {
      expect(parcel.tilesetPath).toBe("1013/tileset.json");
      if (parcel.info.parcelNo === "1153") {
        expect(parcel.info.analysisStatus).toBe("model-derived");
        expect(parcel.info.occupiedAreaM2).toBeCloseTo(10.3643, 4);
        expect(parcel.info.occupancyPercent).toBeCloseTo(86.01043, 4);
      } else {
        expect(parcel.info.analysisStatus).toBe("survey-reference");
        expect(parcel.info.occupiedAreaM2).toBeGreaterThan(0);
        expect(parcel.info.occupancyPercent).toBeCloseTo(parcel.info.occupiedAreaM2! / parcel.info.cadastralAreaM2 * 100, 3);
      }
      expect(parcel.info.coordinateSystem).toContain("TWD97");
    }
  });
  it("1153 模型判讀圖層與稽核一致，其他六筆仍為外業參考", () => {
    const parcel = catalog.find(p => p.info.parcelNo === "1153")!;
    const geo = JSON.parse(readFileSync(new URL("../public/" + parcel.overlayUrl, import.meta.url), "utf8"));
    const audit = JSON.parse(readFileSync("../analysis/20261014-taoyuan-1013/model-1153-audit.json", "utf8"));
    const features = geo.features.filter((f: {properties: {kind: string; parcelKey: string}}) => f.properties.kind === "occupancy-building" && f.properties.parcelKey === parcel.key);
    expect(features).toHaveLength(1);
    expect(features[0].properties.analysisStatus).toBe("model-derived");
    expect(features[0].properties.projectedAreaM2).toBeCloseTo(audit.intersectionAreaM2, 6);
    expect(audit.intersectionAreaM2).toBeLessThan(audit.registeredAreaM2);
    expect(catalog.filter(p => p.info.analysisStatus === "survey-reference")).toHaveLength(6);
    expect(catalog.filter(p => p.info.parcelNo !== "1153").map(p => p.info.occupiedAreaM2)).toEqual([3.3766, 12.219, 5.4592, 8.2353, 265.3278, 10.2686]);
  });
  it("每區保留各地號界線與可點選鍵值，共用模型並可獨立定位", () => {
    for (const parcel of catalog) {
      const geo = JSON.parse(readFileSync(new URL("../public/" + parcel.overlayUrl, import.meta.url), "utf8"));
      const members = catalog.filter(p => p.groupKey === parcel.groupKey);
      expect(geo.features.filter((f: {properties: {kind: string}}) => f.properties.kind !== "occupancy-building").length).toBe(members.length * 2);
      for (const member of members) {
        const fill = geo.features.find((f: {id: string}) => f.id === member.fillEntityId);
        expect(fill.properties.parcelKey).toBe(member.key);
        expect(fill.properties.cadastralAreaM2).toBe(member.info.cadastralAreaM2);
        const ring = fill.geometry.coordinates[0];
        expect(ring[0]).toEqual(ring.at(-1));
        expect(member.focus.longitude).toBeGreaterThan(121.15);
        expect(member.focus.longitude).toBeLessThan(121.17);
      }
    }
  });
});
