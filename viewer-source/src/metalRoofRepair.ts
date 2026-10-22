import {Cartesian2,Cartesian3,CustomShader,Matrix4,Transforms,UniformType,type Cesium3DTileset,type Entity,type JulianDate,type Viewer} from 'cesium';
import {reviewedRoofHierarchy} from './reviewedRoofDisplay';

export const isNeutralMetalColor=(r:number,g:number,b:number)=>{
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  return hi>=.22&&hi-lo<=Math.max(.06,hi*.3);
};

/** Re-colour existing distorted grey-metal facets, never a new measured roof. */
export function createMetalRoofRepair(viewer:Viewer,tileset:Cesium3DTileset,building:Entity,calibrated:Entity,time:JulianDate){
  if(building.properties?.displayCleanRoofSurface?.getValue()===true||building.properties?.displayMetalMeshRepair?.getValue()!==true||tileset.customShader)return null;
  const hierarchy=reviewedRoofHierarchy(building,time);
  const source=building.properties?.modelRoofSamples?.getValue() as number[][];
  const offset=Number(calibrated.properties?.sourceHeightOffset?.getValue());
  const band=building.properties?.displayMetalRepairRangeSourceZ?.getValue() as number[];
  if(!source?.length||!Number.isFinite(offset)||band?.length!==2||band[1]<=band[0]||band[1]-band[0]>4)return null;
  const origin=Cartesian3.fromDegrees(source[0][0],source[0][1],0);
  const worldToRoof=Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(origin),new Matrix4());
  const rings=[hierarchy,...hierarchy.holes].map(r=>r.positions.map(p=>Matrix4.multiplyByPoint(worldToRoof,p,new Cartesian3())));
  const number=(v:number)=>v.toFixed(7);
  const functions=rings.map((ring,index)=>`bool inRoof${index}(vec2 p){bool inside=false;\n`+ring.map((a,i)=>{
    const b=ring[(i+1)%ring.length];
    if(Math.abs(a.y-b.y)<1e-9)return '';
    return `if(((${number(a.y)}>p.y)!=(${number(b.y)}>p.y))&&(p.x<(${number(a.x)})+(p.y-(${number(a.y)}))*(${number(b.x-a.x)})/(${number(b.y-a.y)})))inside=!inside;`;
  }).join('\n')+'return inside;}').join('\n');
  const xs=rings[0].map(p=>p.x),ys=rings[0].map(p=>p.y);
  const shader=new CustomShader({uniforms:{
    u_roofEnabled:{type:UniformType.BOOL,value:true},
    u_eyeToRoof:{type:UniformType.MAT4,value:Matrix4.multiply(worldToRoof,viewer.camera.inverseViewMatrix,new Matrix4())},
    u_roofBand:{type:UniformType.VEC2,value:new Cartesian2(band[0]+offset,band[1]+offset)}
  },fragmentShaderText:functions+`
void fragmentMain(FragmentInput fsInput,inout czm_modelMaterial material){
  if(!u_roofEnabled)return;
  vec3 p=(u_eyeToRoof*vec4(fsInput.attributes.positionEC,1.0)).xyz;
  if(p.x<${number(Math.min(...xs))}||p.x>${number(Math.max(...xs))}||p.y<${number(Math.min(...ys))}||p.y>${number(Math.max(...ys))}||p.z<u_roofBand.x||p.z>u_roofBand.y)return;
  if(!inRoof0(p.xy)${rings.slice(1).map((_,i)=>`||inRoof${i+1}(p.xy)`).join('')})return;
  float hi=max(material.diffuse.r,max(material.diffuse.g,material.diffuse.b));
  float lo=min(material.diffuse.r,min(material.diffuse.g,material.diffuse.b));
  if(hi<0.22||hi-lo>max(0.06,hi*0.30))return;
  material.diffuse=mix(material.diffuse,vec3(0.12,0.90,0.38),0.72);
}`});
  tileset.customShader=shader;
  // Camera-relative coordinates avoid half-metre float rounding of ECEF XY.
  const remove=viewer.scene.preRender.addEventListener(()=>shader.setUniform('u_eyeToRoof',Matrix4.multiply(worldToRoof,viewer.camera.inverseViewMatrix,new Matrix4())));
  return {setVisible:(visible:boolean)=>shader.setUniform('u_roofEnabled',visible),destroy:()=>{remove();if(tileset.customShader===shader)tileset.customShader=undefined;if(!shader.isDestroyed())shader.destroy();}};
}
