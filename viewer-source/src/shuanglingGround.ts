import { Cartesian3, Cartographic, Math as CesiumMath, type Viewer } from "cesium";
import data from "./shuanglingGround.json";

export function profileHeight(latitudeDegrees: number): number {
  const profile = data.profile;
  if (latitudeDegrees <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    if (latitudeDegrees <= profile[i][0]) {
      const a = profile[i - 1], b = profile[i];
      const t = (latitudeDegrees - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return profile.at(-1)![1];
}

/** 道路內點校準 DEM 與模型高程差；不混用正高與橢球高。 */
export async function sampleRoadOffset(viewer: Viewer): Promise<number> {
  const probes = data.probes.map(p => Cartographic.fromDegrees(p[0], p[1]));
  const sampled = await viewer.scene.sampleHeightMostDetailed(probes);
  const differences = sampled.flatMap((p, i) => p && Number.isFinite(p.height) ? [p.height - data.probes[i][2]] : []).sort((a, b) => a - b);
  if (differences.length < 10) throw new Error("道路模型高程採樣不足");
  return differences[Math.floor((differences.length - 1) * 0.25)] + 0.3;
}

export const roadGround = data;
export const roadPosition = (p: number[], offset: number) => Cartesian3.fromDegrees(p[0], p[1], p[2] + offset);
export const roadHeightAt = (latitudeRadians: number, offset: number) => profileHeight(CesiumMath.toDegrees(latitudeRadians)) + offset;
