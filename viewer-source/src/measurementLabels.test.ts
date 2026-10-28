import {Cartesian3,Matrix4,Transforms} from 'cesium';
import {expect,it} from 'vitest';
import {areaLabelPosition,measurementLabelStyle,measurementColor} from './measurementLabels';
const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(121.2,25,140));
const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
const world=(x:number,y:number,z=0)=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,z),new Cartesian3());
const local=(p:Cartesian3)=>Matrix4.multiplyByPoint(inverse,p,new Cartesian3());
it('uses compact identical label styling for both measurement kinds',()=>{
  const label=measurementLabelStyle();expect(label.font).toContain('12px');
  expect(label.backgroundPadding.x).toBe(6);expect(label.backgroundPadding.y).toBe(4);
});
it('distinguishes blue areas and yellow distances consistently with their labels',()=>{
  expect(measurementColor('area').toCssHexString()).toBe('#56c7ff');
  expect(measurementColor('distance').toCssHexString()).toBe('#ffcf66');
  for(const kind of ['area','distance'] as const){
    expect(measurementLabelStyle(kind).backgroundColor).toEqual(measurementColor(kind).withAlpha(.92));
  }
});
it('places an area label centrally at selected model height without changing input vertices',()=>{
  const points=[world(0,0),world(10,0),world(10,10),world(0,10)],before=points.map(p=>p.clone());
  const anchor=local(areaLabelPosition(points));
  expect(anchor.x).toBeCloseTo(5,2);expect(anchor.y).toBeCloseTo(5,2);expect(anchor.z).toBeCloseTo(0,2);
  expect(points).toEqual(before);
});
it('keeps the label inside a concave L-shaped ring rather than the empty central notch',()=>{
  const points=[[0,0],[10,0],[10,2],[2,2],[2,10],[0,10]].map(([x,y])=>world(x,y));
  const p=local(areaLabelPosition(points));
  expect(p.x).toBeGreaterThan(0);expect(p.y).toBeGreaterThan(0);
  expect(p.x<2||p.y<2).toBe(true);
});
it('handles reversed winding and degenerate rings without nonfinite positions',()=>{
  const points=[world(0,0),world(10,0),world(0,10)];
  expect(Cartesian3.distance(areaLabelPosition(points),areaLabelPosition([...points].reverse()))).toBeLessThan(.001);
  expect(areaLabelPosition([points[0],points[0],points[0]])).toEqual(points[0]);
});
