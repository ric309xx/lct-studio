import {describe,it,expect} from 'vitest';
import {Cartographic} from 'cesium';
import {fitParcel174Ground} from './parcel174Ground';
const lon=121.1681*Math.PI/180,lat=24.95836*Math.PI/180,R=6378137;
const point=(x:number,y:number,z:number)=>new Cartographic(lon+x/(R*Math.cos(lat)),lat+y/R,z);
describe('174 display-only road plane',()=>{
  it('follows the slope without pulling the boundary toward poles or wires',()=>{
    const road=Array.from({length:12},(_,i)=>{const x=(i%3)*2,y=Math.floor(i/3)*3;return point(x,y,150+.03*x+.12*y);});
    const samples=[...road,point(1,2,161),point(3,7,168),point(0,8,159),undefined];
    const before=JSON.stringify(samples),heightAt=fitParcel174Ground(samples)!;
    expect(heightAt).toBeTypeOf('function');
    for(const p of road)expect(heightAt(p.latitude,p.longitude)).toBeCloseTo(p.height+.18,5);
    expect(heightAt(road[11].latitude,road[11].longitude)-heightAt(road[0].latitude,road[0].longitude)).toBeCloseTo(1.2,5);
    expect(JSON.stringify(samples)).toBe(before);
  });
  it('does not invent a road plane from sparse, collinear, steep or mostly inconsistent samples',()=>{
    expect(fitParcel174Ground([point(0,0,150)])).toBeNull();
    expect(fitParcel174Ground(Array.from({length:8},(_,i)=>point(0,i,150+i*.1)))).toBeNull();
    expect(fitParcel174Ground(Array.from({length:9},(_,i)=>point(i%3,Math.floor(i/3),150+(i%3)*2)))).toBeNull();
    expect(fitParcel174Ground(Array.from({length:9},(_,i)=>point(i%3,Math.floor(i/3),150+i*3)))).toBeNull();
  });
});
