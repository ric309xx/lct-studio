import {it,expect,vi} from 'vitest';
import {Cartesian3,Entity,JulianDate,Matrix4,PolygonHierarchy,type Viewer,type Cesium3DTileset} from 'cesium';
import {isNeutralMetalColor,createMetalRoofRepair} from './metalRoofRepair';
it('matches grey/white metal, not green leaves or dark tree branches',()=>{
  expect(isNeutralMetalColor(.8,.8,.75)).toBe(true);
  expect(isNeutralMetalColor(.3,.32,.31)).toBe(true);
  expect(isNeutralMetalColor(.15,.4,.12)).toBe(false);
  expect(isNeutralMetalColor(.05,.08,.04)).toBe(false);
});
it('requires explicit target approval, keeps holes and bounds, and releases its GPU shader',()=>{
  const removed=vi.fn(),viewer={camera:{inverseViewMatrix:Matrix4.IDENTITY},scene:{preRender:{addEventListener:()=>removed}}} as unknown as Viewer;
  const tileset={customShader:undefined} as unknown as Cesium3DTileset;
  const outer=Cartesian3.fromDegreesArray([121.2,24.9,121.2001,24.9,121.2001,24.9001,121.2,24.9001]);
  const hole=Cartesian3.fromDegreesArray([121.20002,24.90002,121.20003,24.90002,121.20003,24.90003]);
  const building=new Entity({polygon:{hierarchy:new PolygonHierarchy(outer,[new PolygonHierarchy(hole)])},properties:{modelRoofSamples:[[121.2,24.9,137.5]],displayMetalRepairRangeSourceZ:[137.1,140.8]}});
  const calibrated=new Entity({properties:{sourceHeightOffset:.02}});
  const time=JulianDate.now();
  expect(createMetalRoofRepair(viewer,tileset,building,calibrated,time)).toBeNull();
  building.properties!.addProperty('displayMetalMeshRepair',true);
  const repair=createMetalRoofRepair(viewer,tileset,building,calibrated,time)!;
  const shader=tileset.customShader!;
  expect(shader.fragmentShaderText).toContain('||inRoof1(p.xy)');
  expect(shader.fragmentShaderText).toContain('hi-lo>max(0.06,hi*0.30)');
  expect(shader.fragmentShaderText).toContain('fsInput.attributes.positionEC');
  expect(shader.fragmentShaderText).not.toContain('p.y--');
  repair.setVisible(false);expect(shader.uniforms.u_roofEnabled.value).toBe(false);
  expect(building.polygon!.hierarchy!.getValue(time).positions).toHaveLength(4);
  repair.destroy();expect(removed).toHaveBeenCalledOnce();expect(tileset.customShader).toBeUndefined();expect(shader.isDestroyed()).toBe(true);
});
