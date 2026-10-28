import {expect,it} from 'vitest';
import {Cartesian3} from 'cesium';
import {toTwd97,fromTwd97,surveyCoordinate,measureModelPath,coordinateText} from './surveyMeasurement';
import type {HeightResolution} from './heightReference';
const resolution:HeightResolution={profileId:'test',revision:'test',sourceDatum:'TWVD2001',status:'converted-local-controls',undulationM:19.681,appliedOffsetM:19.681,reason:'test'};
it('inverts authoritative E/N using independent PROJ fixtures without changing source coordinates',()=>{
  for(const [lon,lat,e,n] of [[121,25,250000,2765777.5636462052],[121.2078,24.9628,270981.67187486193,2761673.2921338035],[120,20,145359.28081275674,2212457.3596850084],[122,27,349247.9477806184,2987724.7596458625]]){
    const result=fromTwd97(e,n)!;expect(result?.longitude).toBeCloseTo(lon,8);expect(result?.latitude).toBeCloseTo(lat,8);
  }
  expect(fromTwd97(NaN,1)).toBeNull();expect(fromTwd97(0,0)).toBeNull();
});
it('matches independent PROJ EPSG:4326 to 3826 fixtures within 1 mm across the supported zone',()=>{
  // Independently generated using pyproj/PROJ, 2026-10-28; not this implementation.
  for(const [lon,lat,e,n] of [[121,25,250000,2765777.5636462052],[121.2078,24.9628,270981.67187486193,2761673.2921338035],[120,20,145359.28081275674,2212457.3596850084],[122,27,349247.9477806184,2987724.7596458625]]){
    const p=toTwd97(lon,lat)!;expect(Math.abs(p.easting-e)).toBeLessThan(.001);expect(Math.abs(p.northing-n)).toBeLessThan(.001);
  }
  for(const p of [[119,25],[123,25],[121,0],[NaN,25]])expect(toTwd97(...p as [number,number])).toBeNull();
});
it('shows orthometric zero as valid, never invents H for unknown models or background',()=>{
  const position=Cartesian3.fromDegrees(121.2078,24.9628,19.681);
  const p=surveyCoordinate(position,'model',resolution)!;expect(p.height).toBeCloseTo(0,6);
  expect(p.easting).toBeCloseTo(270981.6719,3);expect(coordinateText(p)).toBe('24.96280000,121.20780000');
  expect(surveyCoordinate(position,'model',null)?.height).toBeNull();
  expect(surveyCoordinate(position,'model',{...resolution,status:'pending'})?.height).toBeNull();
  expect(surveyCoordinate(position,'terrain',resolution)?.height).toBeNull();
  expect(coordinateText(surveyCoordinate(position,'terrain',resolution)!)).toBe('24.96280000,121.20780000');
  expect(surveyCoordinate(Cartesian3.ZERO,'model',resolution)).toBeNull();
});
it('copies only latitude,longitude with eight decimals and no labels, units, quotes or whitespace',()=>{
  expect(coordinateText({latitude:24.95352884,longitude:121.21562036,easting:null,northing:null,height:null,source:'model'})).toBe('24.95352884,121.21562036');
});
it('distinguishes spatial, grid-planar and signed endpoint height differences',()=>{
  const a=Cartesian3.fromDegrees(121,25,100),b=Cartesian3.fromDegrees(121,25,105);
  const vertical=measureModelPath([a,b])!;expect(vertical.spatialM).toBeCloseTo(5,6);expect(vertical.gridM).toBeCloseTo(0,6);expect(vertical.heightDifferenceM).toBeCloseTo(5,6);
  const back=measureModelPath([a,b,a])!;expect(back.spatialM).toBeCloseTo(10,6);expect(back.heightDifferenceM).toBeCloseTo(0,6);expect(back.pointCount).toBe(3);
  expect(measureModelPath([b,a])!.heightDifferenceM).toBeCloseTo(-5,6);
  const east=Cartesian3.fromDegrees(121.0001,25,105),grid=measureModelPath([a,b,east])!;
  expect(grid.spatialM).toBeGreaterThan(grid.gridM!+4.99);expect(grid.gridM).toBeGreaterThan(10);
});
it('rejects invalid paths and leaves out-of-zone grid lengths unavailable',()=>{
  expect(measureModelPath([])).toBeNull();expect(measureModelPath([Cartesian3.ZERO,Cartesian3.ZERO])).toBeNull();
  expect(measureModelPath([new Cartesian3(NaN,1,1),Cartesian3.fromDegrees(121,25)])).toBeNull();
  expect(measureModelPath([Cartesian3.fromDegrees(119,25),Cartesian3.fromDegrees(119.001,25)])?.gridM).toBeNull();
});
