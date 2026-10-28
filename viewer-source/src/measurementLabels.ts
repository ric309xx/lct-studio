import {Cartesian2,Cartesian3,Color,HorizontalOrigin,LabelStyle,Matrix4,Transforms,VerticalOrigin} from 'cesium';

/** Compact, shared styling for distance and area annotations (CSS pixels). */
export function measurementColor(kind:'distance'|'area'){
  return Color.fromCssColorString(kind==='area'?'#56c7ff':'#ffcf66');
}
export function measurementLabelStyle(kind:'distance'|'area'='distance'){
  return {font:"600 12px 'Microsoft JhengHei', sans-serif",fillColor:Color.fromCssColorString('#071019'),
    backgroundColor:measurementColor(kind).withAlpha(.92),showBackground:true,
    backgroundPadding:new Cartesian2(6,4),pixelOffset:new Cartesian2(0,-18),
    horizontalOrigin:HorizontalOrigin.CENTER,verticalOrigin:VerticalOrigin.CENTER,
    style:LabelStyle.FILL,disableDepthTestDistance:Number.POSITIVE_INFINITY};
}

/** Pick an interior horizontal span, rather than a bounding-box centre that
 * can lie outside a concave ring. Height is the mean of the selected vertices;
 * this is an annotation anchor, never an extra measurement/sample. */
export function areaLabelPosition(positions:readonly Cartesian3[]):Cartesian3{
  if(positions.length<3)throw new Error('Area label requires at least three vertices');
  const origin=Cartesian3.divideByScalar(positions.reduce((sum,p)=>Cartesian3.add(sum,p,sum),new Cartesian3()),positions.length,new Cartesian3());
  const frame=Transforms.eastNorthUpToFixedFrame(origin),inverse=Matrix4.inverseTransformation(frame,new Matrix4());
  const points=positions.map(p=>Matrix4.multiplyByPoint(inverse,p,new Cartesian3()));
  const heights=points.reduce((sum,p)=>sum+p.z,0)/points.length;
  const ys=[...new Set(points.map(p=>p.y))].sort((a,b)=>a-b);
  const middle=(ys[0]+ys.at(-1)!)/2;
  const rows=[middle,...ys.slice(1).map((y,i)=>(y+ys[i])/2)];
  let best:{x:number;y:number;score:number}|undefined;
  for(const y of rows){
    const xs:number[]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2){
      const width=xs[i+1]-xs[i],score=width/(1+Math.abs(y-middle)/Math.max(ys.at(-1)!-ys[0],.001));
      if(width>0&&(!best||score>best.score))best={x:(xs[i]+xs[i+1])/2,y,score};
    }
  }
  return best?Matrix4.multiplyByPoint(frame,new Cartesian3(best.x,best.y,heights),new Cartesian3()):Cartesian3.clone(positions[0]);
}
