import {it, expect} from 'vitest';
import {Cartesian3, ClassificationType, Entity, JulianDate, PolygonHierarchy} from 'cesium';
import {parcelModelFill, parcelModelBoundary} from './parcelModelSurface';

it('drapes fill and outline on tiles without an invented plane or changing survey rings', () => {
  const ring=Cartesian3.fromDegreesArrayHeights([121.26,24.97,150, 121.261,24.97,153, 121.261,24.971,157]);
  const hole=new PolygonHierarchy(ring.slice());
  const hierarchy=new PolygonHierarchy(ring,[hole]),time=JulianDate.now();
  const entity=new Entity({polygon:parcelModelFill(hierarchy,.3),polyline:parcelModelBoundary(ring)});
  expect(entity.polygon!.hierarchy!.getValue(time)).toBe(hierarchy);
  expect(hierarchy.holes[0]).toBe(hole);
  expect(entity.polygon!.height).toBeUndefined();
  expect(entity.polygon!.extrudedHeight).toBeUndefined();
  expect(entity.polygon!.perPositionHeight!.getValue(time)).toBe(false);
  expect(entity.polygon!.classificationType!.getValue(time)).toBe(ClassificationType.CESIUM_3D_TILE);
  expect(entity.polyline!.positions!.getValue(time)).toBe(ring);
  expect(entity.polyline!.clampToGround!.getValue(time)).toBe(true);
  expect(entity.polyline!.classificationType!.getValue(time)).toBe(ClassificationType.CESIUM_3D_TILE);
  expect(entity.polyline!.depthFailMaterial).toBeUndefined();
});
