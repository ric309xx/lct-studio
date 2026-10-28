import {Cartesian3,Cartographic,Ellipsoid,HeadingPitchRange,Math as CesiumMath,Matrix4,OrthographicFrustum,PerspectiveFrustum,Transforms,type Camera,type Viewer} from 'cesium';
import type {CaseMapCamera} from './caseNavigation';
import type {CameraPreset} from './projects';
import {caseMapBounds,type CaseOverviewItem} from './caseOverview';

export type CaseEntryAnchor={longitude:number;latitude:number;x:number;y:number};
export type CaseEntrySource={view:CaseMapCamera|null;reducedMotion:boolean;anchors?:CaseEntryAnchor[]};
export type CaseEntryPhase='loading'|'revealing';
export const CASE_ENTRY_FADE_MS=650;
export type CaseEntryView={headingDegrees:number;tiltDegrees:number};
const DEFAULT_ENTRY_VIEW:CaseEntryView={headingDegrees:0,tiltDegrees:30};
const CASE_ENTRY_VIEWS:Readonly<Record<string,CaseEntryView>>={
  // Road-facing canopy edges, cross-checked against the inspection photographs.
  'sanzuwu-jiushe-102-45':{headingDegrees:90,tiltDegrees:35},
  // East-side facade: the north-facing approach is hidden by foreground roofs.
  'sanzuwu-sanzuwu-239-1':{headingDegrees:270,tiltDegrees:40},
  'sanzuwu-jiushe-17-1':{headingDegrees:270,tiltDegrees:30},
  'sanzuwu-jiushe-179-71':{headingDegrees:180,tiltDegrees:35},
  // First parcel identifies entry into each multi-parcel case; membership stays unchanged.
  'sanzuwu-jiushe-255-41':{headingDegrees:180,tiltDegrees:35},
  'shuangling-1121':{headingDegrees:45,tiltDegrees:30},
  'shuangling-1028':{headingDegrees:270,tiltDegrees:35},
  'shuangling-174':{headingDegrees:180,tiltDegrees:50},
  'futai-120-1':{headingDegrees:90,tiltDegrees:30},
  'dongliao-617-1':{headingDegrees:90,tiltDegrees:30},
  'dongliao-804-5':{headingDegrees:180,tiltDegrees:40}
};
export function caseEntryViewForParcel(key?:string):CaseEntryView{
  return {...(key?CASE_ENTRY_VIEWS[key]:undefined)??DEFAULT_ENTRY_VIEW};
}

/** Compare absolute headings, not a preset used as a relative rotation.
 * At exactly half a turn both paths are equal; prefer counterclockwise map motion.
 */
export function shortestCaseHeadingDelta(current:number,target:number):number{
  const delta=((target-current)%360+540)%360-180;
  return Math.abs(delta+180)<1e-6?180:Math.abs(delta)<1e-6?0:delta;
}

/** Keep long cases inside the usable map viewport after their planned yaw. */
export function caseEntryMapBounds(item:CaseOverviewItem,width:number,height:number):[number,number,number,number]{
  const bounds=caseMapBounds([item],true);
  if(!(width>0&&height>0))return bounds;
  const angle=CesiumMath.toRadians(caseEntryViewForParcel(item.parcels[0].key).headingDegrees);
  const w=bounds[2]-bounds[0],h=bounds[3]-bounds[1],aspect=width/height;
  const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  const span=Math.max(w,h*aspect),scale=Math.max(span,w*c+h*s,(w*s+h*c)*aspect)/span;
  const x=(bounds[0]+bounds[2])/2,y=(bounds[1]+bounds[3])/2;
  return [x-w*scale/2,y-h*scale/2,x+w*scale/2,y+h*scale/2];
}

/** Multi-parcel entry rotates around the full case's map center, not whichever
 * first parcel happens to be selected at its far end. Mouse orbit is unaffected.
 */
export function caseEntryOrbitTarget(source:CaseEntrySource,target:Cartesian3|undefined):Cartesian3|undefined{
  if(!source.view||!target)return target;
  return Cartesian3.fromRadians(source.view.longitude,source.view.latitude,Cartographic.fromCartesian(target).height);
}

/** After the aligned map fade, restore real perspective before any camera turn.
 * Match the existing ground plane's screen scale at its forward depth. Keep
 * camera position/orientation and the parcel's off-center anchor unchanged;
 * raised roofs can then show the expected perspective parallax.
 */
export function useCaseEntryPerspective(viewer:Viewer,target:Cartesian3|undefined):boolean{
  if(viewer.isDestroyed()||!target)return false;
  const camera=viewer.camera,frustum=camera.frustum;
  if(!(frustum instanceof OrthographicFrustum)||!frustum.width||!frustum.aspectRatio)return false;
  const depth=Cartesian3.dot(Cartesian3.subtract(target,camera.positionWC,new Cartesian3()),camera.directionWC);
  if(!Number.isFinite(depth)||depth<=0)return false;
  // Cesium's fov is horizontal in landscape and vertical in portrait.
  const span=frustum.aspectRatio>=1?frustum.width:frustum.width/frustum.aspectRatio;
  const fov=2*Math.atan(span/(2*depth));
  if(!Number.isFinite(fov)||fov<=0||fov>=Math.PI)return false;
  camera.frustum=new PerspectiveFrustum({fov,aspectRatio:frustum.aspectRatio,near:frustum.near,far:frustum.far});
  viewer.canvas.dataset.caseEntryProjection='perspective';
  viewer.scene.requestRender();return true;
}

/** Turn gently to the case's unobstructed side after the aligned fade.
 * Keep the parcel at its existing screen anchor; no flight arc or zoom.
 * User input always wins.
 */
function caseEntryCameraPlan(viewer:Viewer,target:Cartesian3|undefined,parcelKey?:string){
  if(viewer.isDestroyed()||!target)return null;
  const camera=viewer.camera;
  if(!Matrix4.equals(camera.transform,Matrix4.IDENTITY))return null;
  const start=Cartesian3.clone(camera.positionWC),direction=Cartesian3.clone(camera.directionWC),up=Cartesian3.clone(camera.upWC),right=Cartesian3.clone(camera.rightWC);
  const normal=Ellipsoid.WGS84.geodeticSurfaceNormal(target,new Cartesian3());
  const relative=Cartesian3.subtract(target,start,new Cartesian3());
  const range=Cartesian3.dot(relative,direction),anchorX=Cartesian3.dot(relative,right),anchorY=Cartesian3.dot(relative,up);
  if(!Number.isFinite(range)||range<=0)return null;
  const view=caseEntryViewForParcel(parcelKey);
  const measuredTilt=CesiumMath.acosClamped(-Cartesian3.dot(direction,normal));
  // Heading at the camera's geodetic footpoint drifts slightly after sidebar
  // alignment. Near nadir it can read 359.9996 instead of 0 and reverse a 180
  // degree tie. Measure in the SAME pivot frame used for the actual rotation;
  // at nadir use screen-up because look-direction has no horizontal heading.
  const pivotInverse=Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(target),new Matrix4());
  const headingVector=Matrix4.multiplyByPointAsVector(pivotInverse,measuredTilt<.001?up:direction,new Cartesian3());
  const currentHeading=CesiumMath.toDegrees(Math.atan2(headingVector.x,headingVector.y));
  const yawDegrees=shortestCaseHeadingDelta(currentHeading,view.headingDegrees);
  const currentTilt=measuredTilt<1e-6?0:measuredTilt;
  const tiltDelta=CesiumMath.toRadians(view.tiltDegrees)-currentTilt;
  const duration=Math.abs(yawDegrees)>45?1500:1100;
  const turn=(v:Cartesian3,angle:number)=>{
    const c=Math.cos(angle),s=Math.sin(angle);
    return Cartesian3.add(Cartesian3.add(Cartesian3.multiplyByScalar(v,c,new Cartesian3()),
      Cartesian3.multiplyByScalar(Cartesian3.cross(normal,v,new Cartesian3()),s,new Cartesian3()),new Cartesian3()),
      Cartesian3.multiplyByScalar(normal,Cartesian3.dot(normal,v)*(1-c),new Cartesian3()),new Cartesian3());
  };
  const poseAt=(progress:number)=>{
    const angle=tiltDelta*progress,c=Math.cos(angle),s=Math.sin(angle),yaw=-CesiumMath.toRadians(yawDegrees)*progress;
    const d=turn(Cartesian3.add(Cartesian3.multiplyByScalar(direction,c,new Cartesian3()),Cartesian3.multiplyByScalar(up,s,new Cartesian3()),new Cartesian3()),yaw);
    const u=turn(Cartesian3.subtract(Cartesian3.multiplyByScalar(up,c,new Cartesian3()),Cartesian3.multiplyByScalar(direction,s,new Cartesian3()),new Cartesian3()),yaw);
    const r=Cartesian3.normalize(Cartesian3.cross(d,u,new Cartesian3()),new Cartesian3());
    const offset=Cartesian3.add(Cartesian3.add(Cartesian3.multiplyByScalar(d,range,new Cartesian3()),Cartesian3.multiplyByScalar(r,anchorX,new Cartesian3()),new Cartesian3()),Cartesian3.multiplyByScalar(u,anchorY,new Cartesian3()),new Cartesian3());
    return {position:Cartesian3.subtract(target,offset,new Cartesian3()),direction:d,up:u};
  };
  return {poseAt,yawDegrees,duration};
}

export type CaseInspectionView={position:Cartesian3;direction:Cartesian3;up:Cartesian3;target:Cartesian3;frustum:Camera['frustum']};

/** Save the intended END pose, even if the user interrupts the entry turn.
 * Retain perspective/zoom and the sidebar's off-center anchor, not just HPR.
 */
export function caseEntryInspectionView(viewer:Viewer,target:Cartesian3|undefined,key?:string):CaseInspectionView|null{
  const plan=caseEntryCameraPlan(viewer,target,key);
  return plan&&target?{...plan.poseAt(1),target:Cartesian3.clone(target),frustum:viewer.camera.frustum.clone()}:null;
}

/** No bounding-sphere flight: it can zoom out and replace the saved framing. */
export function restoreCaseInspectionView(viewer:Viewer,view:CaseInspectionView):boolean{
  if(viewer.isDestroyed())return false;
  const camera=viewer.camera;
  camera.cancelFlight();camera.lookAtTransform(Matrix4.IDENTITY);
  camera.frustum=view.frustum.clone();
  if(camera.frustum instanceof PerspectiveFrustum||camera.frustum instanceof OrthographicFrustum){
    const rect=viewer.canvas.getBoundingClientRect();
    if(rect.width>0&&rect.height>0)camera.frustum.aspectRatio=rect.width/rect.height;
  }
  camera.setView({destination:Cartesian3.clone(view.position),orientation:{direction:Cartesian3.clone(view.direction),up:Cartesian3.clone(view.up)}});
  viewer.scene.requestRender();return true;
}

export function tiltCaseEntryCamera(viewer:Viewer,target:Cartesian3|undefined,parcelKey?:string):()=>void{
  const plan=caseEntryCameraPlan(viewer,target,parcelKey);
  if(!plan)return ()=>{};
  const {poseAt,yawDegrees,duration}=plan,camera=viewer.camera,canvas=viewer.canvas;
  const frustum=camera.frustum,frustumWidth=frustum instanceof OrthographicFrustum?frustum.width:undefined;
  let frame=0,started:number|undefined,stopped=false;
  canvas.dataset.caseEntryYawDegrees=yawDegrees.toFixed(6);
  canvas.dataset.cameraMotion='turning';
  const stop=()=>{
    if(stopped)return;stopped=true;cancelAnimationFrame(frame);
    canvas.dataset.cameraMotion='idle';
    canvas.removeEventListener('pointerdown',stop);canvas.removeEventListener('wheel',stop);window.removeEventListener('keydown',stop);
  };
  const step=(time:number)=>{
    if(stopped)return;if(viewer.isDestroyed()){stop();return;}
    started??=time;
    const progress=Math.min(1,(time-started)/duration),eased=progress*progress*(3-2*progress);
    const pose=poseAt(eased);
    camera.setView({destination:pose.position,orientation:{direction:pose.direction,up:pose.up}});
    if(frustumWidth!==undefined&&frustum instanceof OrthographicFrustum)frustum.width=frustumWidth;
    viewer.scene.requestRender();
    if(progress<1)frame=requestAnimationFrame(step);else stop();
  };
  camera.cancelFlight();
  canvas.addEventListener('pointerdown',stop,{passive:true});canvas.addEventListener('wheel',stop,{passive:true});window.addEventListener('keydown',stop);
  frame=requestAnimationFrame(step);return stop;
}

/** Fit the same cadastral vertices in screen space, including the map sidebar.
 * Orthographic 3D preserves the overview's plan-view scale without a camera flight.
 * Only the camera/projection changes; source coordinates and areas remain intact.
 */
export function alignCaseEntryToMap(viewer:Viewer,source:CaseEntrySource,target:Cartesian3|undefined):boolean{
  if(viewer.isDestroyed()||!source.view||!source.anchors||source.anchors.length<3)return false;
  const rect=viewer.canvas.getBoundingClientRect();
  if(!(rect.width>0&&rect.height>0))return false;
  const height=target?Cartographic.fromCartesian(target).height:0;
  const center=Cartesian3.fromRadians(source.view.longitude,source.view.latitude,height);
  const frame=Transforms.eastNorthUpToFixedFrame(center),inverse=Matrix4.inverseTransformation(frame,new Matrix4());
  const points=source.anchors.map(a=>{
    const p=Matrix4.multiplyByPoint(inverse,Cartesian3.fromDegrees(a.longitude,a.latitude,height),new Cartesian3());
    return {east:p.x,north:p.y,x:a.x-rect.left,y:a.y-rect.top};
  });
  const fit=(axis:'east'|'north',pixel:'x'|'y')=>{
    const origin=points.reduce((s,p)=>s+p[axis],0)/points.length;
    const offset=points.reduce((s,p)=>s+p[pixel],0)/points.length;
    const variance=points.reduce((s,p)=>s+(p[axis]-origin)**2,0);
    const slope=points.reduce((s,p)=>s+(p[axis]-origin)*(p[pixel]-offset),0)/variance;
    return {slope,intercept:offset-slope*origin};
  };
  const x=fit('east','x'),y=fit('north','y');
  if(![x.slope,x.intercept,y.slope,y.intercept].every(Number.isFinite)||x.slope<=0||y.slope>=0)return false;
  const width=rect.width/x.slope,depth=-rect.height/y.slope;
  if(width<1||depth<1||width>1e6||depth>1e6)return false;
  const east=(rect.width/2-x.intercept)/x.slope,north=(rect.height/2-y.intercept)/y.slope;
  const altitude=Math.max(100,width);
  viewer.camera.cancelFlight();
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.setView({destination:Matrix4.multiplyByPoint(frame,new Cartesian3(east,north,altitude),new Cartesian3()),
    orientation:{direction:Matrix4.multiplyByPointAsVector(frame,new Cartesian3(0,0,-1),new Cartesian3()),
      up:Matrix4.multiplyByPointAsVector(frame,Cartesian3.UNIT_Y,new Cartesian3())}});
  viewer.camera.frustum=new OrthographicFrustum({width,aspectRatio:width/depth,near:1,far:Math.max(1e7,altitude*4)});
  viewer.scene.requestRender();return true;
}

/** Set the final camera behind the map before its opacity fade. Never fly/zoom. */
export function placeCaseEntryCamera(viewer:Viewer,preset:CameraPreset|undefined,
  target:Cartesian3|undefined,range=85):void{
  if(viewer.isDestroyed())return;
  viewer.camera.cancelFlight();
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  if(target){
    viewer.camera.lookAt(target,new HeadingPitchRange(0,CesiumMath.toRadians(-65),range));
    // Preserve the final world-space pose without locking mouse navigation.
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  }else if(preset){
    viewer.camera.setView({destination:Cartesian3.fromDegrees(preset.longitude,preset.latitude,preset.height),
      orientation:{heading:CesiumMath.toRadians(preset.headingDegrees),pitch:CesiumMath.toRadians(preset.pitchDegrees),roll:CesiumMath.toRadians(preset.rollDegrees)}});
  }
  viewer.scene.requestRender();
}
