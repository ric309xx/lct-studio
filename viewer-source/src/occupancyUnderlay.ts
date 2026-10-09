import { Cartesian3, Cartographic, Color, Entity, PolygonHierarchy, type Viewer } from "cesium";

/** Original model classification plus a closed hole-filling underlay. */
export async function createOccupancyUnderlay(viewer: Viewer, building: Entity,
  groundHeight: number, cancelled: () => boolean): Promise<Entity[]> {
  const hierarchy = building.polygon!.hierarchy!.getValue(viewer.clock.currentTime) as PolygonHierarchy;
  const roof = await viewer.scene.sampleHeightMostDetailed(hierarchy.positions.map(position => Cartographic.fromCartesian(position)));
  if (cancelled() || viewer.isDestroyed()) return [];
  const heights = roof.map(point => point?.height)
    .filter((height): height is number => typeof height === "number" && Number.isFinite(height) && height > groundHeight + 1.5)
    .sort((a,b) => a-b);
  if (!heights.length) return [];
  const fallback = heights[Math.floor(heights.length / 2)];
  return [new Entity({
    id: `occupancy-roof-underlay-${building.id}`,
    properties: { kind: "occupancy-roof-underlay", parcelKey: building.properties?.parcelKey?.getValue() },
    polygon: {
      hierarchy: new PolygonHierarchy(hierarchy.positions.map((position,index) => {
        const point = Cartographic.fromCartesian(position), sampled = roof[index]?.height;
        const height = typeof sampled === "number" && Number.isFinite(sampled) && sampled > groundHeight + 1.5 ? sampled : fallback;
        return Cartesian3.fromRadians(point.longitude,point.latitude,height - 0.1);
      })),
      perPositionHeight: true, extrudedHeight: groundHeight, closeTop: true, closeBottom: true,
      material: Color.fromCssColorString("#43ee82").withAlpha(0.48)
    }
  })];
}
