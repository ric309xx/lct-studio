import { Cartesian3, Cartographic, Color, Entity, PolygonHierarchy, type Viewer } from "cesium";

function densifyRing(ring: Cartesian3[], spacing = 0.5): Cartesian3[] {
  return ring.flatMap((a, index) => {
    const b = ring[(index + 1) % ring.length];
    const count = Math.max(1, Math.ceil(Cartesian3.distance(a, b) / spacing));
    return Array.from({length:count}, (_, step) => Cartesian3.lerp(a, b, step / count, new Cartesian3()));
  });
}

/** Original model classification plus a closed hole-filling underlay. */
export async function createOccupancyUnderlay(viewer: Viewer, building: Entity,
  groundHeight: number, cancelled: () => boolean,
  options: { nearbyRoofProbeMeters?: number } = {}): Promise<Entity[]> {
  const hierarchy = building.polygon!.hierarchy!.getValue(viewer.clock.currentTime) as PolygonHierarchy;
  const continuous = building.properties?.displayWallContinuity?.getValue() === true;
  const rings: Cartesian3[][] = [];
  const collect = (ring: PolygonHierarchy): PolygonHierarchy => {
    const positions = continuous ? densifyRing(ring.positions) : ring.positions;
    rings.push(positions);
    return new PolygonHierarchy(positions, ring.holes.map(collect));
  };
  const dense = collect(hierarchy);
  const all = rings.flat();
  const boundarySamples = all.map(position => Cartographic.fromCartesian(position));
  // A narrow frontage footprint may contain only a low awning: the upper
  // roof is behind the parcel edge. Probe its height, but never use probe XY
  // positions as display vertices or as analysis/area geometry.
  const radius = continuous ? Math.min(2, Math.max(0, options.nearbyRoofProbeMeters ?? 0)) : 0;
  const probes: Cartographic[] = [];
  if (radius > 0) {
    const centers: Cartographic[] = [];
    for (const point of boundarySamples) {
      const distance = (a: Cartographic, b: Cartographic) => Math.hypot(
        (a.longitude - b.longitude) * Math.cos(a.latitude), a.latitude - b.latitude) * 6378137;
      if (centers.some(center => distance(center, point) < 1)) continue;
      centers.push(point);
      for (const offset of [radius / 2, radius]) for (let angle = 0; angle < 8; angle++) {
        const theta = angle * Math.PI / 4;
        probes.push(new Cartographic(
          point.longitude + Math.cos(theta) * offset / (6378137 * Math.cos(point.latitude)),
          point.latitude + Math.sin(theta) * offset / 6378137));
      }
    }
  }
  const sampledRoof = await viewer.scene.sampleHeightMostDetailed([...boundarySamples, ...probes]);
  if (cancelled() || viewer.isDestroyed()) return [];
  const roof = sampledRoof.slice(0, all.length);
  const probeHits = sampledRoof.slice(all.length).filter((point): point is Cartographic =>
    !!point && Number.isFinite(point.height) && point.height > groundHeight + 1.5);
  const heights = roof.map(point => point?.height)
    .filter((height): height is number => typeof height === "number" && Number.isFinite(height) && height > groundHeight + 1.5)
    .sort((a,b) => a-b);
  if (!heights.length) return [];
  const fallback = heights[Math.floor(heights.length * (continuous ? 0.75 : 0.5))];
  let index = 0;
  const elevated = (ring: PolygonHierarchy): PolygonHierarchy => new PolygonHierarchy(
    ring.positions.map(position => {
      const sampled = roof[index++]?.height;
      let height = typeof sampled === "number" && Number.isFinite(sampled) && sampled > groundHeight + 1.5 ? sampled : fallback;
      if (continuous) {
        // Roof edges can hit a window recess or the street. A local upper
        // envelope bridges only the display skin; it does not change the
        // horizontal footprint or sum wall areas into the occupancy result.
        const nearby = all.map((p, i) => ({distance:Cartesian3.distance(p, position),height:roof[i]?.height}))
          .filter((p): p is {distance:number;height:number} => p.distance < 1.25 &&
            typeof p.height === "number" && Number.isFinite(p.height) && p.height > groundHeight + 1.5)
          .map(p => p.height).sort((a,b) => a-b);
        if (nearby.length) height = Math.max(height, nearby[Math.floor(nearby.length * .75)]);
        if (radius > 0) {
          const point = Cartographic.fromCartesian(position);
          const supported = probeHits.filter(hit => Math.hypot(
            (point.longitude - hit.longitude) * Math.cos(point.latitude), point.latitude - hit.latitude
          ) * 6378137 <= radius + 0.25).map(hit => hit.height).sort((a,b) => a-b);
          // Use the highest repeated roof level, not the majority low awning
          // returns. A lone high pole/antenna ray must not lift the display.
          for (let top = supported.length - 1; top >= 2; top--) {
            const level = supported.filter(value => value <= supported[top] && value >= supported[top] - 0.6);
            if (level.length < 3) continue;
            height = Math.max(height, level[Math.floor(level.length / 2)]);
            break;
          }
        }
      }
      const point = Cartographic.fromCartesian(position);
      return Cartesian3.fromRadians(point.longitude,point.latitude,height + (radius > 0 ? 0.05 : -0.06));
    }),ring.holes.map(elevated));
  // Hole topology is essential: pole/sign exclusions must remain empty in
  // both model classification and the independently rendered repair volume.
  const elevatedHierarchy = elevated(dense);
  return [new Entity({
    id: `occupancy-roof-underlay-${building.id}`,
    properties: { kind: "occupancy-roof-underlay", parcelKey: building.properties?.parcelKey?.getValue() },
    polygon: {
      hierarchy: elevatedHierarchy,
      perPositionHeight: true, extrudedHeight: groundHeight, closeTop: true, closeBottom: true,
      material: Color.fromCssColorString("#43ee82").withAlpha(0.48)
    }
  })];
}
