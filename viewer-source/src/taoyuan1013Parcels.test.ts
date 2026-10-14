import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "./taoyuan1013Parcels.json";

describe("雙嶺段三區七地號", () => {
  it("各筆登記面積獨立，尚未分析不得當作零占用", () => {
    expect(catalog.map(p => p.info.parcelNo)).toEqual(["1121", "1144", "1152", "1153", "1028", "1039", "704-1"]);
    expect(catalog.map(p => p.info.cadastralAreaM2)).toEqual([4509.15, 54.16, 22.24, 12.05, 730.73, 737.74, 1028.72]);
    expect(new Set(catalog.map(p => p.groupKey)).size).toBe(3);
    for (const parcel of catalog) {
      expect(parcel.tilesetPath).toBe("1013/tileset.json");
      expect(parcel.info.analysisStatus).toBe("awaiting-building-confirmation");
      expect(parcel.info).not.toHaveProperty("occupiedAreaM2");
      expect(parcel.info).not.toHaveProperty("occupancyPercent");
      expect(parcel.info.coordinateSystem).toContain("TWD97");
    }
  });
  it("每區保留各地號界線與可點選鍵值，共用模型並可獨立定位", () => {
    for (const parcel of catalog) {
      const geo = JSON.parse(readFileSync(new URL("../public/" + parcel.overlayUrl, import.meta.url), "utf8"));
      const members = catalog.filter(p => p.groupKey === parcel.groupKey);
      expect(geo.features.length).toBe(members.length * 2);
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
