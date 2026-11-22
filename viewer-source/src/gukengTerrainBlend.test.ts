import {afterEach,expect,it,vi} from 'vitest';
import {Cartesian3,Cartographic,GeographicTilingScheme,sampleTerrainMostDetailed,type Cesium3DTileset,type TerrainData,type TerrainProvider,type Viewer} from 'cesium';
import {prepareGukengTerrainBlend} from './gukengTerrainBlend';
vi.mock('cesium',async importOriginal=>({...await importOriginal<typeof import('cesium')>(),sampleTerrainMostDetailed:vi.fn()}));
afterEach(()=>vi.restoreAllMocks());
function setup(){
  const data={interpolateHeight:vi.fn(()=>100),isChildAvailable:(_x:number,_y:number,x:number,y:number)=>x%2===1&&y%2===0,
    waterMask:new Uint8Array([0]),credits:[]} as unknown as TerrainData;
  const base={availability:{},tilingScheme:new GeographicTilingScheme(),requestTileGeometry:vi.fn(async()=>data)} as unknown as TerrainProvider;
  vi.mocked(sampleTerrainMostDetailed).mockImplementation(async(_base,positions)=>positions.map(p=>{p.height=100;return p;}));
  const v={terrainProvider:base,isDestroyed:()=>false,canvas:{dataset:{}},entities:{values:[]},dataSources:{length:0},
    scene:{globe:{},requestRender:vi.fn(),sampleHeightMostDetailed:vi.fn(async(ps:Cartographic[])=>ps.map(p=>{p.height=120;return p;}))}} as unknown as Viewer;
  const model={boundingSphere:{center:Cartesian3.fromDegrees(120,23,500),radius:80}} as Cesium3DTileset;
  return {v,model,base,data};
}
it('only adapts local background tiles, preserving child availability, water, credits and model coordinates',async()=>{
  const {v,model,base,data}=setup(),before=Cartesian3.clone(model.boundingSphere.center),controller=(await prepareGukengTerrainBlend(v,model,()=>false))!;
  controller.setEnabled(true);const patched=v.terrainProvider;expect(patched).not.toBe(base);expect(patched.availability).toBe(base.availability);
  const point=Cartographic.fromDegrees(120,23),xy=base.tilingScheme.positionToTileXY(point,15)!,rect=base.tilingScheme.tileXYToRectangle(xy.x,xy.y,15);
  const local=(await patched.requestTileGeometry(xy.x,xy.y,15))!;expect(local).not.toBe(data);
  expect(local.interpolateHeight(rect,point.longitude,point.latitude)).toBeCloseTo(119.5,3);
  expect(local.isChildAvailable(xy.x,xy.y,xy.x*2+1,xy.y*2)).toBe(true);
  expect(local.isChildAvailable(xy.x,xy.y,xy.x*2,xy.y*2+1)).toBe(false);
  expect(local.waterMask).toBe(data.waterMask);expect(local.credits).toBe(data.credits);
  expect(await patched.requestTileGeometry(0,0,15)).toBe(data);expect(await patched.requestTileGeometry(0,0,0)).toBe(data);
  expect(model.boundingSphere.center).toEqual(before);
  controller.setEnabled(false);expect(v.terrainProvider).toBe(base);controller.setEnabled(true);controller.dispose();expect(v.terrainProvider).toBe(base);
  expect(v.canvas.dataset.gukengTerrainBlend).toBeUndefined();
});
it('does not install a provider after cancellation or replace another feature during cleanup',async()=>{
  const {v,model,base}=setup();expect(await prepareGukengTerrainBlend(v,model,()=>true)).toBeNull();expect(v.terrainProvider).toBe(base);
  const controller=(await prepareGukengTerrainBlend(v,model,()=>false))!;controller.setEnabled(true);
  const other={} as TerrainProvider;v.terrainProvider=other;controller.dispose();expect(v.terrainProvider).toBe(other);
});
