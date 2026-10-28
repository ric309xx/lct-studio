import {Cartesian2,Cartesian3,ConstantPositionProperty,EllipsoidTangentPlane,SceneTransforms,type Entity,type Viewer} from 'cesium';

export type EditableMeasurement={kind:'distance'|'area';index:number;positions:Cartesian3[];points:Entity[]};
export type MeasurementEditor={dispose:()=>void;cancel:()=>void;isDragging:()=>boolean};
type Options={records:()=>EditableMeasurement[];enabled:()=>boolean;
  pick:(screen:Cartesian2)=>Cartesian3|undefined;onChange:(record:EditableMeasurement)=>void;
  onFinish:(record:EditableMeasurement)=>void;onInvalid?:()=>void};

export function validMeasurementEdit(kind:'distance'|'area',points:readonly Cartesian3[]):boolean{
  if(points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)||Cartesian3.magnitudeSquared(p)<1))return false;
  if(points.some((p,i)=>i>0&&Cartesian3.distance(p,points[i-1])<.005))return false;
  if(kind==='distance')return points.length>=2;
  if(points.length<3||Cartesian3.distance(points[0],points.at(-1)!)<.005)return false;
  const p=EllipsoidTangentPlane.fromPoints([...points]).projectPointsOntoPlane([...points]);
  if(p.length!==points.length)return false;
  const cross=(a:Cartesian2,b:Cartesian2,c:Cartesian2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  let area=0;
  for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length];area+=a.x*b.y-b.x*a.y;
    for(let j=i+1;j<p.length;j++){
      if(j===i+1||(i===0&&j===p.length-1))continue;
      const c=p[j],d=p[(j+1)%p.length];
      // Reject crossings and touching non-neighbouring edges.
      if(Math.min(a.x,b.x)<=Math.max(c.x,d.x)&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)
        &&Math.min(a.y,b.y)<=Math.max(c.y,d.y)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)
        &&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return false;
    }
  }
  return Math.abs(area)>.0002;
}

/** Screen-distance hit testing also reaches points whose model depth would
 * otherwise win scene.pick. A miss leaves ordinary camera navigation intact. */
export function createMeasurementEditor(viewer:Viewer,options:Options):MeasurementEditor{
  const canvas=viewer.canvas,controller=viewer.scene.screenSpaceCameraController;
  let active:{record:EditableMeasurement;pointIndex:number;changed:boolean;pointerId:number}|null=null,disposed=false,releaseFrame=0;
  let saved:{inputs:boolean;spin:number;translate:number;zoom:number;cursor:string}|null=null;
  let cameraView:{position:Cartesian3;direction:Cartesian3;up:Cartesian3;right:Cartesian3}|null=null;
  // Directly restore the existing local camera vectors. setView() would also
  // recompute an orthographic frustum, which is unwanted during vertex edits.
  const restorePose=()=>{if(cameraView&&!viewer.isDestroyed()){
    Cartesian3.clone(cameraView.position,viewer.camera.position);Cartesian3.clone(cameraView.direction,viewer.camera.direction);
    Cartesian3.clone(cameraView.up,viewer.camera.up);Cartesian3.clone(cameraView.right,viewer.camera.right);
  }};
  const restore=()=>{if(saved&&!viewer.isDestroyed()){
    controller.enableInputs=saved.inputs;controller.inertiaSpin=saved.spin;controller.inertiaTranslate=saved.translate;
    controller.inertiaZoom=saved.zoom;viewer.canvas.style.cursor=saved.cursor;
  }saved=null;releaseFrame=0;};
  const nearest=(screen:Cartesian2):{record:EditableMeasurement;pointIndex:number}|null=>{
    let best:{record:EditableMeasurement;pointIndex:number}|null=null,distance=12;
    for(const record of options.records())record.positions.forEach((position,pointIndex)=>{
      const projected=SceneTransforms.worldToWindowCoordinates(viewer.scene,position);
      if(!projected)return;const d=Cartesian2.distance(projected,screen);
      if(d<=distance){distance=d;best={record,pointIndex};}
    });return best;
  };
  const update=(screen:Cartesian2)=>{
    if(!active)return;
    const next=options.pick(screen);if(!next)return;
    const {record,pointIndex}=active,candidate=[...record.positions];candidate[pointIndex]=next;
    if(Cartesian3.distance(record.positions[pointIndex],next)<.0001)return;
    if(!validMeasurementEdit(record.kind,candidate)){options.onInvalid?.();return;}
    record.positions[pointIndex]=Cartesian3.clone(next);
    active.changed=true;
    record.points[pointIndex].position=new ConstantPositionProperty(next);
    options.onChange(record);
    restorePose();
    viewer.scene.requestRender();
  };
  const finish=()=>{
    if(!active)return;const {record,changed,pointerId}=active;active=null;
    try{if(canvas.hasPointerCapture?.(pointerId))canvas.releasePointerCapture(pointerId);}catch{/* Pointer may already be released. */}
    restorePose();cameraView=null;
    releaseFrame=window.requestAnimationFrame(restore);if(changed)options.onFinish(record);
  };
  const cancel=()=>{const pointerId=active?.pointerId;active=null;restorePose();cameraView=null;
    try{if(pointerId!==undefined&&canvas.hasPointerCapture?.(pointerId))canvas.releasePointerCapture(pointerId);}catch{/* Already released. */}
    if(releaseFrame)window.cancelAnimationFrame(releaseFrame);restore();};
  const screen=(event:PointerEvent)=>{const rect=canvas.getBoundingClientRect();return new Cartesian2(event.clientX-rect.left,event.clientY-rect.top);};
  const consume=(event:Event)=>{event.preventDefault();event.stopImmediatePropagation();};
  const down=(event:PointerEvent)=>{
    if(disposed||event.button!==0||!options.enabled()||!controller.enableInputs)return;
    const hit=nearest(screen(event));if(!hit)return;
    // Capture BEFORE Cesium's camera-event aggregator sees this gesture; merely
    // disabling inputs until mouse-up still leaves native inertia queued.
    consume(event);cancel();active={...hit,changed:false,pointerId:event.pointerId};viewer.camera.cancelFlight();
    saved={inputs:controller.enableInputs,spin:controller.inertiaSpin,translate:controller.inertiaTranslate,zoom:controller.inertiaZoom,cursor:viewer.canvas.style.cursor};
    cameraView={position:viewer.camera.position.clone(),direction:viewer.camera.direction.clone(),up:viewer.camera.up.clone(),right:viewer.camera.right.clone()};
    controller.enableInputs=false;controller.inertiaSpin=controller.inertiaTranslate=controller.inertiaZoom=0;
    viewer.canvas.style.cursor='grabbing';
    try{canvas.setPointerCapture?.(event.pointerId);}catch{/* Window release listener remains available. */}
  };
  const move=(event:PointerEvent)=>{
    if(active){if(event.pointerId!==active.pointerId)return;consume(event);update(screen(event));}
    else if(!saved&&event.target===canvas){
      if(options.enabled()&&nearest(screen(event)))viewer.canvas.style.cursor='grab';
      else if(viewer.canvas.style.cursor==='grab')viewer.canvas.style.cursor='';
    }
  };
  const up=(event:PointerEvent)=>{if(active&&event.pointerId===active.pointerId){consume(event);update(screen(event));finish();}};
  const click=(event:MouseEvent)=>{if(active||releaseFrame)consume(event);};
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('click',click,true);
  window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);
  window.addEventListener('blur',finish);window.addEventListener('pointercancel',finish);
  return {cancel,isDragging:()=>Boolean(active||releaseFrame),dispose(){if(disposed)return;disposed=true;cancel();
    canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('click',click,true);
    window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);
    window.removeEventListener('blur',finish);window.removeEventListener('pointercancel',finish);
    if(!viewer.isDestroyed()&&viewer.canvas.style.cursor==='grab')viewer.canvas.style.cursor='';
  }};
}
