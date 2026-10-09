import {
  Cartesian3, Cartographic, Color, Entity, PolygonGeometry, PolygonHierarchy,
  VertexFormat, type Viewer
} from "cesium";

/** Display geometry only. The confirmed horizontal footprint remains authoritative. */
export async function createOccupancySurface(
  viewer: Viewer, building: Entity, groundHeight: number, cancelled: () => boolean
): Promise<Entity[]> {
  const hierarchy = building.polygon!.hierarchy!.getValue(viewer.clock.currentTime) as PolygonHierarchy;
  const geometry = PolygonGeometry.createGeometry(new PolygonGeometry({
    polygonHierarchy: hierarchy,
    // Subdivide the interior as well as the boundary; neighbouring triangles
    // share exactly the same sampled/interpolated vertices.
    granularity: 0.75 / 6378137,
    vertexFormat: VertexFormat.POSITION_ONLY
  }));
  if (!geometry?.indices || !geometry.attributes.position) return [];
  const values = geometry.attributes.position.values;
  const samples: Cartographic[] = [];
  for (let i = 0; i < values.length; i += 3) {
    samples.push(Cartographic.fromCartesian(new Cartesian3(values[i], values[i + 1], values[i + 2])));
  }
  const roof = await viewer.scene.sampleHeightMostDetailed(samples.map(point => Cartographic.clone(point)));
  if (cancelled() || viewer.isDestroyed()) return [];
  const valid = roof.flatMap((point, index) =>
    point && Number.isFinite(point.height) && point.height > groundHeight + 1.5
      ? [{ index, height: point.height }] : []);
  if (!valid.length) return [];
  const cosLatitude = Math.cos(samples[0].latitude);
  const distanceSquared = (a: Cartographic, b: Cartographic) =>
    ((a.longitude - b.longitude) * cosLatitude) ** 2 + (a.latitude - b.latitude) ** 2;
  const positions = samples.map((point, index) => {
    const sampled = roof[index]?.height;
    let height: number;
    if (typeof sampled === "number" && Number.isFinite(sampled) && sampled > groundHeight + 1.5) {
      height = sampled;
    } else {
      // A hole may return the street beneath it rather than undefined. Reject
      // those ground hits and interpolate from the six nearest roof vertices.
      const nearby = valid.map(hit => ({ ...hit, distance: distanceSquared(point, samples[hit.index]) }))
        .sort((a, b) => a.distance - b.distance).slice(0, 6);
      let weighted = 0, weights = 0;
      for (const hit of nearby) {
        const weight = 1 / Math.max(hit.distance, 1e-20);
        weighted += hit.height * weight;
        weights += weight;
      }
      height = weighted / weights;
    }
    return Cartesian3.fromRadians(point.longitude, point.latitude, height + 0.1);
  });
  const properties = { kind: "occupancy-surface", parcelKey: building.properties?.parcelKey?.getValue() };
  const entities: Entity[] = [];
  for (let i = 0; i < geometry.indices.length; i += 3) {
    entities.push(new Entity({
      id: `occupancy-surface-${building.id}-${i / 3}`, properties,
      polygon: {
        hierarchy: new PolygonHierarchy([
          positions[geometry.indices[i]], positions[geometry.indices[i + 1]], positions[geometry.indices[i + 2]]
        ]),
        perPositionHeight: true,
        material: Color.fromCssColorString("#38c98c").withAlpha(0.3),
        outline: false
      }
    }));
  }
  const boundary = hierarchy.positions.map(position => {
    const point = Cartographic.fromCartesian(position);
    let closest = 0;
    for (let i = 1; i < samples.length; i++) {
      if (distanceSquared(point, samples[i]) < distanceSquared(point, samples[closest])) closest = i;
    }
    const height = Cartographic.fromCartesian(positions[closest]).height;
    return Cartesian3.fromRadians(point.longitude, point.latitude, height + 0.02);
  });
  entities.push(new Entity({
    id: `occupancy-surface-outline-${building.id}`, properties,
    polyline: {
      positions: [...boundary, boundary[0]], width: 1.5,
      material: Color.fromCssColorString("#65dba7").withAlpha(0.8), clampToGround: false
    }
  }));
  return entities;
}
