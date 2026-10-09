import { describe, it, expect } from "vitest";
import { Cartesian3, Cartographic, Entity, JulianDate, PolygonHierarchy, type Viewer } from "cesium";
import { createOccupancySurface } from "./occupancySurface";

const time = JulianDate.now();
const building = () => new Entity({
  id: "confirmed", properties: { parcelKey: "102-45" },
  polygon: { hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray([
    121.217, 24.962, 121.21705, 24.962,
    121.21705, 24.96205, 121.217, 24.96205
  ])) }
});
function viewer(sample: (points: Cartographic[]) => (Cartographic | undefined)[]) {
  return { clock: { currentTime: time }, isDestroyed: () => false,
    scene: { sampleHeightMostDetailed: async (points: Cartographic[]) => sample(points) }
  } as unknown as Viewer;
}
describe("continuous occupancy surface", () => {
  it("bridges missing and ground hits with one shared roof surface and no extrusion", async () => {
    const result = await createOccupancySurface(viewer(points => points.map((point, index) => {
      if (index % 3 === 0) return undefined;
      point.height = index % 3 === 1 ? 128 : 135;
      return point;
    })), building(), 128, () => false);
    expect(result.length).toBeGreaterThan(2);
    const triangles = result.filter(entity => entity.polygon);
    for (const triangle of triangles) {
      expect(triangle.polygon!.extrudedHeight).toBeUndefined();
      const ring = triangle.polygon!.hierarchy!.getValue(time) as PolygonHierarchy;
      expect(ring.positions).toHaveLength(3);
      for (const position of ring.positions) expect(Cartographic.fromCartesian(position).height).toBeCloseTo(135.1, 4);
    }
    expect(result.at(-1)?.polyline).toBeDefined();
  });
  it("leaves the existing display available when no reliable roof exists", async () => {
    expect(await createOccupancySurface(viewer(points => points.map(point => {
      point.height = 128; return point;
    })), building(), 128, () => false)).toEqual([]);
  });
  it("does not create entities after a project switch cancels sampling", async () => {
    expect(await createOccupancySurface(viewer(points => points.map(point => {
      point.height = 135; return point;
    })), building(), 128, () => true)).toEqual([]);
  });
});
