import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "./taoyuan1006Parcels.json";

describe("桃園 1006 六筆地號匯入", () => {
  it("keeps registered area separate and explicitly marks interpreted occupancy provisional", () => {
    expect(catalog.map(p => p.info.parcelNo)).toEqual(["471-7", "99-1", "221", "239-1", "646-2", "1051-1"]);
    expect(catalog.map(p => p.info.cadastralAreaM2)).toEqual([102, 180, 127, 228, 221, 84]);
    expect(new Set(catalog.map(p => p.key)).size).toBe(6);
    for (const parcel of catalog) {
      expect(parcel.info.analysisStatus).toBe("interpreted-draft");
      expect(parcel.info.occupiedAreaM2).toBeGreaterThan(0);
      expect(parcel.info.occupancyPercent).toBeCloseTo(parcel.info.occupiedAreaM2 / parcel.info.cadastralAreaM2 * 100, 2);
      expect(parcel.info.analysisNote).toContain("待複核");
      expect(parcel.info.analysisNote).toContain("不是正式");
      expect(parcel.info.reviewImageUrl).toContain("-interpreted.png");
      expect(parcel.info.geometryAreaM2).toBeGreaterThan(0);
      expect(parcel.info.crs).toContain("EPSG:3826");
      expect(parcel.info.coordinateSystem).toContain("TWD67");
      expect(parcel.info.integrationCoordinateSystem).toContain("TWD97");
    }
  });
  it("links each selector to a closed polygon and correct parcel key", () => {
    for (const parcel of catalog) {
      const geo = JSON.parse(readFileSync(new URL("../public/" + parcel.overlayUrl, import.meta.url), "utf8"));
      const fill = geo.features.find((f: { id: string }) => f.id === parcel.fillEntityId);
      expect(fill.properties.parcelKey).toBe(parcel.key);
      const ring = fill.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
      expect(parcel.focus.longitude).toBeGreaterThan(121);
      expect(parcel.focus.latitude).toBeGreaterThan(24);
      const targets = geo.features.filter((f: { properties: { kind: string } }) => f.properties.kind === "occupancy-building");
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        expect(target.properties.analysisStatus).toBe("interpreted-draft");
        expect(target.properties.parcelKey).toBe(parcel.key);
        expect(target.properties.category).toMatch(/建物|棚架|雨遮/);
      }
      expect(readFileSync(new URL("../public/" + parcel.info.reviewImageUrl, import.meta.url)).length).toBeGreaterThan(1000);
    }
  });
});
