import {Cartesian3, ClassificationType, Color, PolygonHierarchy, type PolygonGraphics, type PolylineGraphics} from 'cesium';

// Display only: preserve the original horizontal boundary, including holes.
// Leaving polygon height unset enables ground classification on the actual mesh.
export function parcelModelFill(hierarchy: PolygonHierarchy, alpha: number): PolygonGraphics.ConstructorOptions {
  return {hierarchy, perPositionHeight: false, classificationType: ClassificationType.CESIUM_3D_TILE,
    material: Color.fromCssColorString('#ef626c').withAlpha(alpha)};
}

export function parcelModelBoundary(positions: Cartesian3[]): PolylineGraphics.ConstructorOptions {
  return {positions, width: 3, clampToGround: true, classificationType: ClassificationType.CESIUM_3D_TILE,
    material: Color.fromCssColorString('#ffbf47')};
}
