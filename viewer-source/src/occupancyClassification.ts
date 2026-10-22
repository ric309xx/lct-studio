import {
  Cartesian3, Cartographic, ClassificationPrimitive, ClassificationType,
  Color, ColorGeometryInstanceAttribute, Entity, GeometryInstance,
  PerInstanceColorAppearance, PolygonGeometry, PolygonHierarchy, type JulianDate
} from "cesium";
import {reviewedRoofHierarchy} from './reviewedRoofDisplay';

/** Colour existing mesh, not an artificial curtain in front of the facade.
 * The watertight volume is only a stencil: its walls/caps are never drawn.
 * Its exact XY hierarchy includes all semantic exclusion holes.
 */
export function createOccupancyClassification(building: Entity, calibrated: Entity, time: JulianDate) {
  const floor=Number(calibrated.properties?.classificationFloorHeight?.getValue());
  const ceiling=Number(calibrated.properties?.classificationCeilingHeight?.getValue());
  if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || floor>=ceiling) return null;
  const input=reviewedRoofHierarchy(building,time);
  const flatten=(ring:PolygonHierarchy):PolygonHierarchy=>new PolygonHierarchy(ring.positions.map(p=>{
    const c=Cartographic.fromCartesian(p);return Cartesian3.fromRadians(c.longitude,c.latitude,0);
  }),ring.holes.map(flatten));
  const geometry=new PolygonGeometry({polygonHierarchy:flatten(input),height:ceiling,extrudedHeight:floor,
    closeTop:true,closeBottom:true,vertexFormat:PerInstanceColorAppearance.VERTEX_FORMAT});
  return new ClassificationPrimitive({
    geometryInstances:new GeometryInstance({id:`occupancy-mesh-${building.id}`,geometry,
      attributes:{color:ColorGeometryInstanceAttribute.fromColor(Color.fromCssColorString("#30e67e").withAlpha(.62))}}),
    classificationType:ClassificationType.CESIUM_3D_TILE,
    allowPicking:false,asynchronous:true
  });
}

export function showOccupancyClassifications(primitives:ClassificationPrimitive[],visible:boolean) {
  for(const primitive of primitives)if(!primitive.isDestroyed())primitive.show=visible;
}
