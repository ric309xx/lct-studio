import {ArcType,Cartesian3,ColorGeometryInstanceAttribute,GeometryInstance,PerInstanceColorAppearance,
  PolygonGeometry,PolygonHierarchy,PolylineColorAppearance,PolylineGeometry,Primitive,PrimitiveCollection,type Viewer} from 'cesium';
import {measurementColor} from './measurementLabels';
import {createMeasurementAnnotation} from './measurementAnnotation';

export type MeasurementOverlay={update:(positions:readonly Cartesian3[])=>void;highlight:(selected:boolean)=>void;
  annotate:(position:()=>Cartesian3,text:()=>string)=>void;dispose:()=>void};
/** Annotation-only geometry. Never raises survey points or changes global
 * terrain/model depth testing; only this small overlay ignores scene depth. */
export function createMeasurementOverlay(viewer:Viewer,kind:'distance'|'area'):MeasurementOverlay{
  const root=viewer.scene.primitives;
  const collection=root.add(new PrimitiveCollection()) as PrimitiveCollection;
  let points:Cartesian3[]=[],selected=false,disposed=false;
  let removeAnnotation:(()=>void)|undefined;
  const render=()=>{
    if(disposed||viewer.isDestroyed()||collection.isDestroyed())return;
    collection.removeAll();
    const color=measurementColor(kind);
    // No depth writes: annotations must not obscure future model picking.
    const renderState={depthTest:{enabled:false},depthMask:false,cull:{enabled:false}};
    if(kind==='area'&&points.length>=3){
      const geometry=PolygonGeometry.createGeometry(new PolygonGeometry({
        polygonHierarchy:new PolygonHierarchy(points),perPositionHeight:true,
        vertexFormat:PerInstanceColorAppearance.FLAT_VERTEX_FORMAT
      }));
      if(geometry)collection.add(new Primitive({
        geometryInstances:new GeometryInstance({geometry,attributes:{color:ColorGeometryInstanceAttribute.fromColor(color.withAlpha(selected?.22:.12))}}),
        appearance:new PerInstanceColorAppearance({flat:true,translucent:true,closed:false,renderState}),
        asynchronous:false,allowPicking:false
      }));
    }
    if(points.length>=2)collection.add(new Primitive({
      geometryInstances:new GeometryInstance({geometry:new PolylineGeometry({
        positions:kind==='area'&&points.length>=3?[...points,points[0]]:points,
        width:3,arcType:ArcType.NONE,vertexFormat:PolylineColorAppearance.VERTEX_FORMAT
      }),attributes:{color:ColorGeometryInstanceAttribute.fromColor(color)}}),
      appearance:new PolylineColorAppearance({translucent:true,renderState}),asynchronous:false,allowPicking:false
    }));
    viewer.scene.requestRender();
  };
  return {
    update(positions){points=positions.map(p=>Cartesian3.clone(p));render();},
    highlight(value){if(selected!==value){selected=value;render();}},
    annotate(position,text){if(disposed)return;removeAnnotation?.();removeAnnotation=createMeasurementAnnotation(viewer,kind,position,text);},
    dispose(){if(disposed)return;disposed=true;removeAnnotation?.();if(!root.isDestroyed()&&!collection.isDestroyed())root.remove(collection);}
  };
}
