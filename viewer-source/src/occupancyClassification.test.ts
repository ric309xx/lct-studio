import {expect,it} from "vitest";
import {Cartesian3,Cartographic,ClassificationType,Entity,GeometryInstance,JulianDate,PolygonGeometry,PolygonHierarchy,type ClassificationPrimitive} from "cesium";
import {createOccupancyClassification,showOccupancyClassifications} from "./occupancyClassification";
const time=JulianDate.now();
const square=(x:number,y:number,size:number)=>Cartesian3.fromDegreesArray([x,y,x+size,y,x+size,y+size,x,y+size]);
const building=new Entity({id:"test",polygon:{hierarchy:new PolygonHierarchy(square(121.217,24.962,.0001),[new PolygonHierarchy(square(121.21703,24.96203,.00002))])}});
it("uses a height-bounded 3D-tile stencil, not a visible wall or terrain overlay",()=>{
  const calibrated=new Entity({properties:{classificationFloorHeight:140,classificationCeilingHeight:144}});
  const primitive=createOccupancyClassification(building,calibrated,time)!;
  expect(primitive.classificationType).toBe(ClassificationType.CESIUM_3D_TILE);
  expect(primitive.allowPicking).toBe(false);
  const instance=primitive.geometryInstances as GeometryInstance;
  const geometry=PolygonGeometry.createGeometry(instance.geometry as unknown as PolygonGeometry)!;
  const values=geometry.attributes.position!.values,positions:Cartographic[]=[];
  for(let i=0;i<values.length;i+=3)positions.push(Cartographic.fromCartesian(new Cartesian3(values[i],values[i+1],values[i+2])));
  for(const point of positions){
    expect(point.height).toBeGreaterThanOrEqual(139.99);expect(point.height).toBeLessThanOrEqual(144.01);
    expect(point.longitude).toBeGreaterThanOrEqual(121.217*Math.PI/180-1e-10);
    expect(point.longitude).toBeLessThanOrEqual(121.2171*Math.PI/180+1e-10);
  }
  for(let i=0;i<geometry.indices!.length;i+=3){
    const triangle=[0,1,2].map(j=>positions[geometry.indices![i+j]]);
    if(!triangle.every(p=>Math.abs(p.height-144)<.01))continue;
    const lon=triangle.reduce((s,p)=>s+p.longitude,0)/3*180/Math.PI;
    const lat=triangle.reduce((s,p)=>s+p.latitude,0)/3*180/Math.PI;
    expect(lon>121.21703&&lon<121.21705&&lat>24.96203&&lat<24.96205).toBe(false);
  }
  primitive.destroy();
});
it("refuses unsupported calibration heights",()=>{
  expect(createOccupancyClassification(building,new Entity(),time)).toBeNull();
  expect(createOccupancyClassification(building,new Entity({properties:{classificationFloorHeight:145,classificationCeilingHeight:140}}),time)).toBeNull();
});
it("honours occupancy visibility and ignores destroyed resources",()=>{
  const live={show:true,isDestroyed:()=>false},dead={show:true,isDestroyed:()=>true};
  showOccupancyClassifications([live,dead] as unknown as ClassificationPrimitive[],false);
  expect(live.show).toBe(false);expect(dead.show).toBe(true);
  showOccupancyClassifications([live] as unknown as ClassificationPrimitive[],true);expect(live.show).toBe(true);
});
