import {describe,it,expect,vi} from 'vitest';
import {Camera,Cartesian3,Cartesian4,Cartographic,GeographicProjection,Math as CesiumMath,Matrix4,OrthographicFrustum,PerspectiveFrustum,SceneMode,Transforms,type Viewer} from 'cesium';
import {alignCaseEntryToMap,caseEntryMapBounds,caseEntryOrbitTarget,caseEntryViewForParcel,placeCaseEntryCamera,shortestCaseHeadingDelta,tiltCaseEntryCamera,useCaseEntryPerspective} from './caseEntry';
import {caseMapBounds,type CaseOverviewItem} from './caseOverview';

const preset={longitude:121.214,latitude:24.956,height:220,headingDegrees:0,pitchDegrees:-65,rollDegrees:0};
const mockViewer=()=>({isDestroyed:()=>false,camera:{setView:vi.fn(),cancelFlight:vi.fn(),lookAt:vi.fn(),lookAtTransform:vi.fn(),flyTo:vi.fn(),flyToBoundingSphere:vi.fn()},scene:{requestRender:vi.fn()}});

describe('perspective after map fade',()=>{
  it.each([[1200,800],[430,900]])('preserves all ground-plane pixels in a %s x %s viewport', (width,height)=>{
    const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:width,drawingBufferHeight:height,mapProjection:new GeographicProjection()} as any);
    const target=Cartesian3.fromDegrees(121.214,24.956,140),frame=Transforms.eastNorthUpToFixedFrame(target);
    camera.setView({destination:Matrix4.multiplyByPoint(frame,new Cartesian3(-30,10,200),new Cartesian3()),orientation:{
      direction:Matrix4.multiplyByPointAsVector(frame,new Cartesian3(0,0,-1),new Cartesian3()),up:Matrix4.multiplyByPointAsVector(frame,Cartesian3.UNIT_Y,new Cartesian3())}});
    camera.frustum=new OrthographicFrustum({width:140,aspectRatio:width/height,near:1,far:1e7});
    const points=[[-10,-10],[20,-10],[20,20],[-10,20]].map(([x,y])=>Matrix4.multiplyByPoint(frame,new Cartesian3(x,y,0),new Cartesian3()));
    const pixel=(point:Cartesian3)=>{
      const p=Matrix4.multiplyByPoint(camera.viewMatrix,point,new Cartesian3());
      const clip=Matrix4.multiplyByVector(camera.frustum.projectionMatrix,new Cartesian4(p.x,p.y,p.z,1),new Cartesian4());
      return [width*(1+clip.x/clip.w)/2,height*(1-clip.y/clip.w)/2];
    };
    const before=points.map(pixel),position=Cartesian3.clone(camera.positionWC),direction=Cartesian3.clone(camera.directionWC),up=Cartesian3.clone(camera.upWC);
    const canvas=document.createElement('canvas');
    const viewer={camera,canvas,isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
    expect(useCaseEntryPerspective(viewer,target)).toBe(true);
    expect(camera.frustum).toBeInstanceOf(PerspectiveFrustum);
    expect(Cartesian3.distance(camera.positionWC,position)).toBeLessThan(1e-8);
    expect(Cartesian3.distance(camera.directionWC,direction)).toBeLessThan(1e-8);
    expect(Cartesian3.distance(camera.upWC,up)).toBeLessThan(1e-8);
    points.forEach((p,i)=>{const after=pixel(p);expect(Math.abs(after[0]-before[i][0])).toBeLessThan(.001);expect(Math.abs(after[1]-before[i][1])).toBeLessThan(.001);});
    const ground=pixel(Matrix4.multiplyByPoint(frame,new Cartesian3(20,0,0),new Cartesian3()));
    const roof=pixel(Matrix4.multiplyByPoint(frame,new Cartesian3(20,0,20),new Cartesian3()));
    expect(roof[0]-width/2).toBeGreaterThan(ground[0]-width/2); // Actual near/far perspective, not another orthographic view.
    expect(canvas.dataset.caseEntryProjection).toBe('perspective');
    const perspective=camera.frustum;
    expect(useCaseEntryPerspective(viewer,target)).toBe(false);expect(camera.frustum).toBe(perspective);
  });
  it('leaves invalid, destroyed or behind-camera views unchanged',()=>{
    const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:1000,drawingBufferHeight:800,mapProjection:new GeographicProjection()} as any);
    camera.setView({destination:Cartesian3.fromDegrees(121.214,24.956,440),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
    camera.frustum=new OrthographicFrustum({width:140,aspectRatio:1.25});
    const frustum=camera.frustum,viewer={camera,isDestroyed:()=>false} as unknown as Viewer;
    expect(useCaseEntryPerspective(viewer,undefined)).toBe(false);
    expect(useCaseEntryPerspective(viewer,Cartesian3.fromDegrees(121.214,24.956,500))).toBe(false);
    expect(useCaseEntryPerspective({camera,isDestroyed:()=>true} as unknown as Viewer,Cartesian3.fromDegrees(121.214,24.956,140))).toBe(false);
    expect(camera.frustum).toBe(frustum);
  });
});
describe('stationary case entry',()=>{
  it('chooses the shorter direction across north and never turns more than half a circle',()=>{
    expect(shortestCaseHeadingDelta(350,10)).toBe(20);
    expect(shortestCaseHeadingDelta(10,350)).toBe(-20);
    expect(shortestCaseHeadingDelta(260,270)).toBe(10);
    expect(shortestCaseHeadingDelta(0,270)).toBe(-90);
    expect(shortestCaseHeadingDelta(270,0)).toBe(90);
    expect(shortestCaseHeadingDelta(0,180)).toBe(180);
    expect(shortestCaseHeadingDelta(360,0)).toBe(0);
    for(let from=0;from<360;from+=10)for(let to=0;to<360;to+=10)
      expect(Math.abs(shortestCaseHeadingDelta(from,to))).toBeLessThanOrEqual(180);
  });
  it('adds framing room for a long case rotated across a narrow map viewport',()=>{
    const item={bounds:[121,25,121.0001,25.004],parcels:[{key:'sanzuwu-jiushe-17-1'}]} as CaseOverviewItem;
    const original=caseMapBounds([item],true),result=caseEntryMapBounds(item,650,900);
    const originalWidth=original[2]-original[0],newWidth=result[2]-result[0];
    expect(newWidth/originalWidth).toBeCloseTo(900/650,6);
    expect((result[0]+result[2])/2).toBeCloseTo((original[0]+original[2])/2,10);
    expect(item.bounds).toEqual([121,25,121.0001,25.004]);
  });
  it('uses the complete case map center for entry without changing the selected parcel target',()=>{
    const target=Cartesian3.fromDegrees(121.2,24.96,140),before=Cartesian3.clone(target);
    const source={view:{kind:'camera-2d' as const,longitude:CesiumMath.toRadians(121.21),latitude:CesiumMath.toRadians(24.95),span:400},reducedMotion:false};
    const point=Cartographic.fromCartesian(caseEntryOrbitTarget(source,target)!);
    expect(point.longitude).toBeCloseTo(source.view.longitude,10);expect(point.latitude).toBeCloseTo(source.view.latitude,10);
    expect(point.height).toBeCloseTo(140,5);expect(target).toEqual(before);
    expect(caseEntryOrbitTarget({...source,view:null},target)).toBe(target);
  });
  it('uses an east-side approach for 239-1 without changing other cases',()=>{
    expect(caseEntryViewForParcel('sanzuwu-sanzuwu-239-1')).toEqual({headingDegrees:270,tiltDegrees:40});
    expect(caseEntryViewForParcel('sanzuwu-sanzuwu-646-2')).toEqual({headingDegrees:0,tiltDegrees:30});
    const copy=caseEntryViewForParcel('sanzuwu-sanzuwu-239-1');copy.headingDegrees=0;
    expect(caseEntryViewForParcel('sanzuwu-sanzuwu-239-1').headingDegrees).toBe(270);
  });
  it('uses the requested road-facing side for 174 only',()=>{
    expect(caseEntryViewForParcel('shuangling-174')).toEqual({headingDegrees:180,tiltDegrees:50});
    expect(caseEntryViewForParcel('shuangling-704-1')).toEqual({headingDegrees:0,tiltDegrees:30});
  });
  it.each([342,685])('takes the counterclockwise map path for 174 after real alignment at x=%s',anchorX=>{
    const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;});
    vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
    const tick=(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
    try{
      const longitude=121.1681,latitude=24.95836,width=1027,height=884;
      const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:width,drawingBufferHeight:height,mapProjection:new GeographicProjection()} as any);
      const canvas=document.createElement('canvas');
      canvas.getBoundingClientRect=()=>({left:0,top:0,width,height}) as DOMRect;
      const viewer={camera,canvas,isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
      const target=Cartesian3.fromDegrees(longitude,latitude,150);
      const anchors=[[-.00005,-.00005],[.00005,-.00005],[.00005,.00005],[-.00005,.00005]].map(([dx,dy])=>({
        longitude:longitude+dx,latitude:latitude+dy,x:anchorX+dx*2e6,y:442-dy*2e6}));
      expect(alignCaseEntryToMap(viewer,{view:{kind:'camera-2d',longitude:CesiumMath.toRadians(longitude),latitude:CesiumMath.toRadians(latitude),span:100},reducedMotion:false,anchors},target)).toBe(true);
      expect(useCaseEntryPerspective(viewer,target)).toBe(true);
      const projection=camera.frustum,anchorBefore=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
      tiltCaseEntryCamera(viewer,target,'shuangling-174');
      expect(Number(canvas.dataset.caseEntryYawDegrees)).toBe(180);
      tick(0);tick(750);
      // The half-way map must turn left, not right. A bare 0->180 number test
      // misses the tiny west-of-north heading produced by sidebar alignment.
      expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(90,2);
      tick(1500);
      expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(180,2);
      expect(camera.frustum).toBe(projection);
      expect(Cartesian3.distance(anchorBefore,Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3()))).toBeLessThan(.001);
    }finally{vi.unstubAllGlobals();}
  });
  it('turns only the remaining 10 degrees from an existing 260 degree pose',()=>{
    const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;});
    vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
    const tick=(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
    try{
      const target=Cartesian3.fromDegrees(121.214,24.956,140);
      const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:1000,drawingBufferHeight:800,mapProjection:new GeographicProjection()} as any);
      camera.setView({destination:Cartesian3.fromDegrees(121.214,24.956,440),orientation:{heading:CesiumMath.toRadians(260),pitch:CesiumMath.toRadians(-60),roll:0}});
      camera.frustum=new OrthographicFrustum({width:300,aspectRatio:1.2});
      const anchor=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
      const viewer={camera,canvas:document.createElement('canvas'),isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
      tiltCaseEntryCamera(viewer,target,'sanzuwu-sanzuwu-239-1');
      tick(0);tick(550);
      expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(265,2);
      tick(1100);
      expect(CesiumMath.toDegrees(camera.heading)).toBeCloseTo(270,2);
      expect(CesiumMath.toDegrees(camera.pitch)).toBeCloseTo(-50,2);
      const end=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
      expect(Cartesian3.distance(anchor,end)).toBeLessThan(.001);
      expect((camera.frustum as OrthographicFrustum).width).toBe(300);
      expect(frames.size).toBe(0);
    }finally{vi.unstubAllGlobals();}
  });
  it('turns 239-1 horizontally while preserving its off-center screen anchor and zoom',()=>{
    const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;});
    vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
    const tick=(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
    try{
      const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:1000,drawingBufferHeight:800,mapProjection:new GeographicProjection()} as any);
      const target=Cartesian3.fromDegrees(121.214,24.956,140);
      camera.setView({destination:Cartesian3.fromDegrees(121.2136,24.9561,440),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
      camera.frustum=new OrthographicFrustum({width:300,aspectRatio:1.2});
      const initialAnchor=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
      expect(initialAnchor.x).toBeGreaterThan(20);
      const initial=Cartesian3.clone(camera.directionWC),initialPosition=Cartesian3.clone(camera.positionWC);
      const viewer={camera,canvas:document.createElement('canvas'),isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
      const stop=tiltCaseEntryCamera(viewer,target,'sanzuwu-sanzuwu-239-1');
      for(const time of [0,375,750,1125,1500]){
        tick(time);
        const current=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
        expect(Math.abs(current.x-initialAnchor.x)).toBeLessThan(.001);
        expect(Math.abs(current.y-initialAnchor.y)).toBeLessThan(.001);
        expect((camera.frustum as OrthographicFrustum).width).toBe(300);
      }
      const local=Matrix4.multiplyByPointAsVector(Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(target),new Matrix4()),camera.directionWC,new Cartesian3());
      expect(local.x).toBeLessThan(-.6);expect(Math.abs(local.y)).toBeLessThan(.001); // westward look from east
      expect(Cartesian3.dot(initial,camera.directionWC)).toBeCloseTo(Math.cos(CesiumMath.toRadians(40)),4);
      expect(Cartesian3.distance(initialPosition,camera.positionWC)).toBeGreaterThan(100);
      expect(frames.size).toBe(0);stop();
    }finally{vi.unstubAllGlobals();}
  });
  it('tilts gently without changing zoom or heading, and stops immediately for mouse input',()=>{
    const frames=new Map<number,FrameRequestCallback>();let id=0;
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;});
    vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
    const tick=(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
    try{
      const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:1000,drawingBufferHeight:800,mapProjection:new GeographicProjection()} as any);
      const target=Cartesian3.fromDegrees(121.214,24.956,140);
      camera.setView({destination:Cartesian3.fromDegrees(121.214,24.956,440),orientation:{heading:0,pitch:-Math.PI/2,roll:0}});
      camera.frustum=new OrthographicFrustum({width:300,aspectRatio:1.2});
      const canvas=document.createElement('canvas');
      const viewer={camera,canvas,isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
      const initial=Cartesian3.clone(camera.directionWC),right=Cartesian3.clone(camera.rightWC);
      const flight=vi.spyOn(camera,'flyTo'),sphere=vi.spyOn(camera,'flyToBoundingSphere');
      const stop=tiltCaseEntryCamera(viewer,target);
      tick(0);tick(550);tick(1100);
      expect(Cartesian3.dot(initial,camera.directionWC)).toBeCloseTo(Math.cos(CesiumMath.toRadians(30)),7);
      expect(Cartesian3.distance(right,camera.rightWC)).toBeLessThan(1e-7);
      expect((camera.frustum as OrthographicFrustum).width).toBe(300);
      const point=Matrix4.multiplyByPoint(camera.viewMatrix,target,new Cartesian3());
      expect(Math.abs(point.x)).toBeLessThan(1e-4);expect(Math.abs(point.y)).toBeLessThan(1e-4);
      expect(flight).not.toHaveBeenCalled();expect(sphere).not.toHaveBeenCalled();stop();
      const cancel=tiltCaseEntryCamera(viewer,target);tick(2000);tick(2200);
      const paused=Cartesian3.clone(camera.positionWC);
      canvas.dispatchEvent(new Event('pointerdown'));tick(4000);
      expect(camera.positionWC).toEqual(paused);expect(frames.size).toBe(0);cancel();
    }finally{vi.unstubAllGlobals();}
  });
  it('sets the final parcel pose immediately without starting a camera flight',()=>{
    const v=mockViewer(),target=Cartesian3.fromDegrees(121.214,24.956,120);
    const before=Cartesian3.clone(target);
    placeCaseEntryCamera(v as unknown as Viewer,preset,target,85);
    expect(v.camera.cancelFlight).toHaveBeenCalledOnce();
    expect(v.camera.lookAt).toHaveBeenCalledOnce();
    const [center,offset]=v.camera.lookAt.mock.calls[0];
    expect(center).toEqual(target);expect(offset.heading).toBe(0);
    expect(offset.pitch).toBeCloseTo(CesiumMath.toRadians(-65),9);
    expect(offset.range).toBe(85);
    expect(v.camera.lookAtTransform).toHaveBeenLastCalledWith(Matrix4.IDENTITY);
    expect(v.camera.flyTo).not.toHaveBeenCalled();
    expect(v.camera.flyToBoundingSphere).not.toHaveBeenCalled();
    expect(v.scene.requestRender).toHaveBeenCalledOnce();expect(target).toEqual(before);
  });
  it('uses the existing camera preset immediately when no parcel target exists',()=>{
    const v=mockViewer();placeCaseEntryCamera(v as unknown as Viewer,preset,undefined);
    expect(v.camera.setView).toHaveBeenCalledWith({destination:Cartesian3.fromDegrees(preset.longitude,preset.latitude,preset.height),orientation:{heading:0,pitch:CesiumMath.toRadians(-65),roll:0}});
    expect(v.camera.flyTo).not.toHaveBeenCalled();expect(v.camera.flyToBoundingSphere).not.toHaveBeenCalled();
  });
  it('ignores destroyed viewers',()=>{
    const v=mockViewer();placeCaseEntryCamera({...v,isDestroyed:()=>true} as unknown as Viewer,preset,undefined);
    expect(v.camera.cancelFlight).not.toHaveBeenCalled();expect(v.scene.requestRender).not.toHaveBeenCalled();
  });
  it('propagates positioning errors so the map can recover',()=>{
    const v=mockViewer();v.camera.lookAt.mockImplementation(()=>{throw Error('camera unavailable');});
    expect(()=>placeCaseEntryCamera(v as unknown as Viewer,preset,Cartesian3.fromDegrees(121.214,24.956))).toThrow('camera unavailable');
  });
});

describe('overview-to-3D cadastral alignment',()=>{
  it.each([{width:1200,height:800,left:350,top:0},{width:430,height:900,left:0,top:100}])('matches parcel vertices with the real Cesium camera in a $width px viewport',({width,height,left,top})=>{
    const camera=new Camera({mode:SceneMode.SCENE3D,drawingBufferWidth:width,drawingBufferHeight:height,mapProjection:new GeographicProjection()} as any);
    const canvas={getBoundingClientRect:()=>({left:0,top:0,width,height})};
    const viewer={camera,canvas,isDestroyed:()=>false,scene:{requestRender:vi.fn()}} as unknown as Viewer;
    const fly=vi.spyOn(camera,'flyTo'),flySphere=vi.spyOn(camera,'flyToBoundingSphere');
    const longitude=121.214,latitude=24.956,scale=300000;
    const anchors=[[-.00018,-.00022],[.00025,-.00022],[.00025,.00020],[-.00018,.00020]].map(([dx,dy])=>({
      longitude:longitude+dx,latitude:latitude+dy,
      x:left+(width-left)/2+dx*scale,y:top+(height-top)/2-dy*scale}));
    const source={view:{kind:'camera-2d' as const,longitude:CesiumMath.toRadians(longitude),latitude:CesiumMath.toRadians(latitude),span:400},reducedMotion:false,anchors};
    const original=JSON.stringify(source),target=Cartesian3.fromDegrees(longitude,latitude,140);
    expect(alignCaseEntryToMap(viewer,source,target)).toBe(true);
    expect(camera.frustum).toBeInstanceOf(OrthographicFrustum);
    const f=camera.frustum as OrthographicFrustum;
    for(const a of anchors){
      const p=Matrix4.multiplyByPoint(camera.viewMatrix,Cartesian3.fromDegrees(a.longitude,a.latitude,140),new Cartesian3());
      const actualX=width/2+p.x/f.width!*width,actualY=height/2-p.y/(f.width!/f.aspectRatio!)*height;
      expect(Math.abs(actualX-a.x),JSON.stringify({actualX,actualY,a,p,width:f.width,aspect:f.aspectRatio,direction:camera.directionWC,up:camera.upWC,right:camera.rightWC,position:camera.positionCartographic})).toBeLessThan(.1);
      expect(Math.abs(actualY-a.y)).toBeLessThan(.1);
    }
    expect(JSON.stringify(source)).toBe(original);expect(fly).not.toHaveBeenCalled();expect(flySphere).not.toHaveBeenCalled();
  });
  it('falls back safely when map samples are missing, degenerate or the canvas is hidden',()=>{
    const v=mockViewer() as unknown as Viewer;
    expect(alignCaseEntryToMap(v,{view:null,reducedMotion:false},undefined)).toBe(false);
    const source={view:{kind:'camera-2d' as const,longitude:2.1,latitude:.43,span:200},reducedMotion:false,
      anchors:Array.from({length:3},()=>({longitude:121,latitude:25,x:400,y:400}))};
    const canvas={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:800})};
    expect(alignCaseEntryToMap({...v,canvas} as Viewer,source,undefined)).toBe(false);
    expect(v.camera.setView).not.toHaveBeenCalled();
    expect(alignCaseEntryToMap({...v,canvas:{getBoundingClientRect:()=>({width:0,height:0})}} as unknown as Viewer,source,undefined)).toBe(false);
  });
});
