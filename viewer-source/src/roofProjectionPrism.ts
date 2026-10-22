import {Cartesian3,Color,Entity,PolygonHierarchy} from 'cesium';

/** User-requested diagram of horizontal projection, not measured 3D volume. */
export function roofProjectionPrism(building:Entity,offset:number,groundAt:(lonRadians:number,latRadians:number)=>number):Entity[]{
  if(building.properties?.displayGroundProjectionVolume?.getValue()!==true)return [];
  const source=building.properties?.displayGroundProjectionRings?.getValue() as number[][][]|undefined;
  if(!source?.length||!Number.isFinite(offset))return [];
  const rings=source.map(ring=>ring.flatMap((a,i)=>{
    if(i===ring.length-1)return [a];
    const b=ring[i+1],distance=Cartesian3.distance(Cartesian3.fromDegrees(a[0],a[1]),Cartesian3.fromDegrees(b[0],b[1]));
    const steps=Math.max(1,Math.ceil(distance/.5));
    return Array.from({length:steps},(_,j)=>a.map((v,k)=>v+(b[k]-v)*j/steps));
  }));
  const properties={kind:'occupancy-roof-underlay',displayRole:'projection-prism',parcelKey:building.properties?.parcelKey?.getValue()};
  const bottomRings:Cartesian3[][]=[];const walls:Entity[]=[];
  for(const [i,ring] of rings.entries()){
    const minimum=ring.map(p=>groundAt(p[0]*Math.PI/180,p[1]*Math.PI/180));
    const maximum=ring.map(p=>p[2]+offset+.12);
    if(minimum.some((v,j)=>!Number.isFinite(v)||v>=maximum[j]))return [];
    bottomRings.push(ring.slice(0,-1).map((p,j)=>Cartesian3.fromDegrees(p[0],p[1],minimum[j]+.015)));
    walls.push(new Entity({id:`occupancy-projection-wall-${building.id}-${i}`,properties,
      wall:{positions:ring.map(p=>Cartesian3.fromDegrees(p[0],p[1])),minimumHeights:minimum,maximumHeights:maximum,
        material:Color.fromCssColorString('#43ee82').withAlpha(.26),outline:false}}));
  }
  return [...walls,new Entity({id:`occupancy-projection-base-${building.id}`,properties,
    polygon:{hierarchy:new PolygonHierarchy(bottomRings[0],bottomRings.slice(1).map(r=>new PolygonHierarchy(r))),perPositionHeight:true,
      material:Color.fromCssColorString('#43ee82').withAlpha(.14)}})];
}
