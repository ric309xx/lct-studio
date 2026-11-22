import {CameraEventType,Cartesian2,Cartesian3,ConstantPositionProperty,Color,Matrix3,Matrix4,
  OrthographicFrustum,Quaternion,Transforms,type Camera,type Entity,type PerspectiveFrustum,type Viewer} from 'cesium';

function orientation(direction:Cartesian3,up:Cartesian3){
  const right=Cartesian3.normalize(Cartesian3.cross(direction,up,new Cartesian3()),new Cartesian3()),matrix=new Matrix3();
  Matrix3.setColumn(matrix,0,right,matrix);Matrix3.setColumn(matrix,1,up,matrix);
  Matrix3.setColumn(matrix,2,Cartesian3.negate(direction,new Cartesian3()),matrix);return Quaternion.fromRotationMatrix(matrix);
}
function setFrame(camera:Camera,frame:Matrix4){
  const frustum=camera.frustum,width=frustum instanceof OrthographicFrustum?frustum.width:undefined;
  camera.lookAtTransform(frame);if(width!==undefined&&frustum instanceof OrthographicFrustum)frustum.width=width;
}
export function isGukengFocusClick(start:number[],end:number[],movement:number){
  return [...start,...end,movement].every(Number.isFinite)&&movement<=5&&Math.hypot(end[0]-start[0],end[1]-start[1])<=5;
}

/** Re-anchor without moving the world-space camera or changing zoom. Only
 * rotate the viewing direction; keep the ENU frame as the subsequent pivot. */
export function focusGukengPoint(viewer:Viewer,point:Cartesian3,{duration=900,onDone=()=>{}}={}){
  const camera=viewer.camera;if(![point.x,point.y,point.z].every(Number.isFinite)||Cartesian3.distance(camera.positionWC,point)<.01)return ()=>{};
  camera.cancelFlight();setFrame(camera,Transforms.eastNorthUpToFixedFrame(point));
  const from=orientation(camera.direction,camera.up),direction=Cartesian3.normalize(Cartesian3.negate(camera.position,new Cartesian3()),new Cartesian3());
  const right=Cartesian3.cross(direction,Cartesian3.UNIT_Z,new Cartesian3());
  if(Cartesian3.magnitudeSquared(right)<1e-10)Cartesian3.clone(Cartesian3.UNIT_X,right);
  Cartesian3.normalize(right,right);const up=Cartesian3.normalize(Cartesian3.cross(right,direction,new Cartesian3()),new Cartesian3()),to=orientation(direction,up);
  let cancelled=false,frame=0;const start=performance.now();
  const step=(now:number)=>{
    if(cancelled||viewer.isDestroyed())return;
    const t=duration?Math.max(0,Math.min(1,(now-start)/duration)):1,e=t*t*t*(t*(t*6-15)+10);
    const matrix=Matrix3.fromQuaternion(Quaternion.slerp(from,to,e,new Quaternion()),new Matrix3());
    Matrix3.getColumn(matrix,0,camera.right);Matrix3.getColumn(matrix,1,camera.up);
    Cartesian3.negate(Matrix3.getColumn(matrix,2,new Cartesian3()),camera.direction);viewer.scene.requestRender();
    if(t<1)frame=requestAnimationFrame(step);else onDone();
  };
  if(duration)frame=requestAnimationFrame(step);else step(start);
  return ()=>{cancelled=true;if(frame)cancelAnimationFrame(frame);};
}

export function installGukengNavigation(viewer:Viewer,canInteract:()=>boolean=()=>true,onNotice:(text:string)=>void=()=>{}){
  const canvas=viewer.canvas,controls=viewer.scene.screenSpaceCameraController,camera=viewer.camera;
  const original={enableRotate:controls.enableRotate,enableTranslate:controls.enableTranslate,enableLook:controls.enableLook,enableTilt:controls.enableTilt,
    rotateEventTypes:controls.rotateEventTypes,zoomEventTypes:controls.zoomEventTypes,minimumZoomDistance:controls.minimumZoomDistance,maximumZoomDistance:controls.maximumZoomDistance,
    enableCollisionDetection:controls.enableCollisionDetection,inertiaSpin:controls.inertiaSpin,inertiaTranslate:controls.inertiaTranslate,inertiaZoom:controls.inertiaZoom};
  const axis=camera.constrainedAxis,depth=viewer.scene.pickTranslucentDepth,touchAction=canvas.style.touchAction;
  Object.assign(controls,{enableRotate:true,enableTranslate:false,enableLook:false,enableTilt:false,rotateEventTypes:[CameraEventType.LEFT_DRAG],
    zoomEventTypes:[CameraEventType.WHEEL],minimumZoomDistance:8,maximumZoomDistance:700,enableCollisionDetection:false,inertiaSpin:0,inertiaTranslate:0,inertiaZoom:0});
  camera.constrainedAxis=Cartesian3.UNIT_Z;viewer.scene.pickTranslucentDepth=true;canvas.style.touchAction='none';
  let press:{id:number;start:number[];movement:number}|null=null,pan:{id:number;x:number;y:number;inputs:boolean}|null=null,marker:Entity|null=null;
  let cancelMotion=()=>{},multi=false,touchInputs=true;
  const touches=new Map<number,{x:number;y:number;start:number[];movement:number}>();
  const consume=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const release=(id:number)=>{if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);};
  const permitted=()=>canInteract()&&controls.enableInputs&&!viewer.isDestroyed();
  function focus(x:number,y:number){
    if(!permitted()||!viewer.scene.pickPositionSupported)return;
    const rect=canvas.getBoundingClientRect(),position=new Cartesian2(x-rect.left,y-rect.top);
    if(position.x<0||position.y<0||position.x>=rect.width||position.y>=rect.height)return;
    const hit=viewer.scene.pick(position);if(!hit||hit.id===marker)return;
    const point=viewer.scene.pickPosition(position);if(!point||![point.x,point.y,point.z].every(Number.isFinite))return;
    cancelMotion();
    if(!marker)marker=viewer.entities.add({id:'gukeng-orbit-pivot',position:point,point:{pixelSize:9,color:Color.fromCssColorString('#b9fff0'),outlineColor:Color.fromCssColorString('#173e43'),outlineWidth:2,disableDepthTestDistance:Infinity}});
    else{marker.position=new ConstantPositionProperty(point);marker.show=true;}
    onNotice('正在對準點選位置…');
    cancelMotion=focusGukengPoint(viewer,point,{duration:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:900,
      onDone:()=>onNotice('已對準點選位置，拖曳即可繞此點旋轉。')});
  }
  function panBy(dx:number,dy:number){
    if(!dx&&!dy)return;cancelMotion();
    const pivot=Matrix4.getTranslation(camera.transform,new Cartesian3()),range=Cartesian3.distance(camera.positionWC,pivot),frustum=camera.frustum;
    const height=frustum instanceof OrthographicFrustum?(frustum.width??120)/(frustum.aspectRatio??1):2*range*Math.tan((frustum as PerspectiveFrustum).fovy/2);
    const scale=height/Math.max(canvas.clientHeight,1),right=-dx*scale,up=dy*scale;
    const delta=Cartesian3.add(Cartesian3.multiplyByScalar(camera.rightWC,right,new Cartesian3()),Cartesian3.multiplyByScalar(camera.upWC,up,new Cartesian3()),new Cartesian3());
    const next=Matrix4.setTranslation(camera.transform,Cartesian3.add(pivot,delta,new Cartesian3()),new Matrix4());
    setFrame(camera,next);camera.moveRight(right);camera.moveUp(up);if(marker)marker.show=false;viewer.scene.requestRender();
  }
  function finishPan(){if(!pan)return;const old=pan;pan=null;controls.enableInputs=old.inputs;release(old.id);canvas.style.cursor='';onNotice('已平移檢視，旋轉中心會隨畫面移動。');}
  const metrics=()=>{const [a,b]=[...touches.values()];return a&&b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)}:null;};
  function reset(){press=null;cancelMotion();finishPan();if(touches.size){const ids=[...touches.keys()];touches.clear();controls.enableInputs=touchInputs;ids.forEach(release);}multi=false;if(marker)marker.show=false;}
  function down(event:PointerEvent){
    cancelMotion();press=null;
    if(!canInteract()||!controls.enableInputs&&!touches.size)return;
    if(event.pointerType==='touch'){
      consume(event);if(!touches.size){finishPan();touchInputs=controls.enableInputs;controls.enableInputs=false;multi=false;}
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY,start:[event.clientX,event.clientY],movement:0});
      if(touches.size>1)multi=true;canvas.setPointerCapture?.(event.pointerId);return;
    }
    if(event.isPrimary===false)return;
    if(event.button===2){consume(event);pan={id:event.pointerId,x:event.clientX,y:event.clientY,inputs:controls.enableInputs};controls.enableInputs=false;canvas.setPointerCapture?.(event.pointerId);canvas.style.cursor='grabbing';}
    else if(event.button===0)press={id:event.pointerId,start:[event.clientX,event.clientY],movement:0};
  }
  function move(event:PointerEvent){
    const touch=touches.get(event.pointerId);
    if(touch){
      consume(event);const previous=metrics(),dx=event.clientX-touch.x,dy=event.clientY-touch.y;
      touch.x=event.clientX;touch.y=event.clientY;touch.movement=Math.max(touch.movement,Math.hypot(touch.x-touch.start[0],touch.y-touch.start[1]));
      if(touches.size===1&&!multi&&touch.movement>5){camera.rotateRight(-dx*2*Math.PI/Math.max(canvas.clientWidth,1));camera.rotateUp(-dy*Math.PI/Math.max(canvas.clientHeight,1));}
      else if(touches.size===2){const next=metrics();if(previous&&next){panBy(next.x-previous.x,next.y-previous.y);if(previous.distance>=4&&next.distance>=4){
        const range=Cartesian3.distance(camera.positionWC,Matrix4.getTranslation(camera.transform,new Cartesian3()));
        camera.zoomIn(range-Math.max(controls.minimumZoomDistance,Math.min(controls.maximumZoomDistance,range*previous.distance/next.distance)));
      }}}
      viewer.scene.requestRender();return;
    }
    if(pan&&pan.id===event.pointerId){consume(event);panBy(event.clientX-pan.x,event.clientY-pan.y);pan.x=event.clientX;pan.y=event.clientY;return;}
    if(press&&press.id===event.pointerId)press.movement=Math.max(press.movement,Math.hypot(event.clientX-press.start[0],event.clientY-press.start[1]));
  }
  function up(event:PointerEvent){
    const touch=touches.get(event.pointerId);
    if(touch){consume(event);const tap=event.type==='pointerup'&&!multi&&isGukengFocusClick(touch.start,[event.clientX,event.clientY],touch.movement);
      touches.delete(event.pointerId);release(event.pointerId);if(!touches.size){controls.enableInputs=touchInputs;multi=false;}if(tap)focus(event.clientX,event.clientY);return;}
    if(pan&&pan.id===event.pointerId){consume(event);finishPan();return;}
    const down=press;press=null;
    if(event.type==='pointerup'&&event.button===0&&down&&down.id===event.pointerId&&isGukengFocusClick(down.start,[event.clientX,event.clientY],down.movement))focus(event.clientX,event.clientY);
  }
  const wheel=()=>cancelMotion(),menu=(event:Event)=>{if(canInteract())event.preventDefault();};
  canvas.addEventListener('pointerdown',down,{capture:true,passive:false});canvas.addEventListener('pointermove',move,{capture:true,passive:false});
  window.addEventListener('pointerup',up,{capture:true,passive:false});window.addEventListener('pointercancel',up,{capture:true,passive:false});
  canvas.addEventListener('wheel',wheel,{passive:true});canvas.addEventListener('contextmenu',menu);window.addEventListener('blur',reset);
  const lost=(event:PointerEvent)=>{if(pan?.id===event.pointerId||touches.has(event.pointerId))reset();};canvas.addEventListener('lostpointercapture',lost);
  return {reset,dispose:()=>{
    reset();canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);
    canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',menu);window.removeEventListener('blur',reset);canvas.removeEventListener('lostpointercapture',lost);
    Object.assign(controls,original);camera.constrainedAxis=axis;canvas.style.touchAction=touchAction;
    if(!viewer.isDestroyed()){viewer.scene.pickTranslucentDepth=depth;if(marker)viewer.entities.remove(marker);}
  }};
}
