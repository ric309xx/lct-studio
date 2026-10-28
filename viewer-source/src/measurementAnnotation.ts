import {Cartesian3,SceneTransforms,type Viewer} from 'cesium';
import {measurementColor,measurementLabelStyle} from './measurementLabels';

type Layer={element:HTMLDivElement;count:number};
const layers=new WeakMap<Viewer,Layer>();
/** DOM annotations are above the entire WebGL canvas. Disabling label depth
 * alone does not guarantee draw order against translucent measurement lines. */
export function createMeasurementAnnotation(viewer:Viewer,kind:'area'|'distance',position:()=>Cartesian3,text:()=>string):()=>void{
  let layer=layers.get(viewer);
  if(!layer){
    const element=document.createElement('div');element.className='measurement-label-layer';
    Object.assign(element.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none',zIndex:'10'});
    (viewer.canvas.parentElement??viewer.container).appendChild(element);
    layer={element,count:0};layers.set(viewer,layer);
  }
  layer.count++;
  const label=document.createElement('div'),style=measurementLabelStyle(kind);
  label.className=`measurement-scene-label measurement-scene-label-${kind}`;
  Object.assign(label.style,{position:'absolute',transform:'translate(-50%, -50%)',whiteSpace:'pre',textAlign:'center',
    pointerEvents:'none',font:style.font,fontWeight:'700',color:measurementColor(kind).toCssColorString(),
    WebkitTextStroke:'3px #071019',paintOrder:'stroke fill',lineHeight:'1.3'});
  layer.element.appendChild(label);
  let disposed=false;
  const update=()=>{
    if(disposed||viewer.isDestroyed())return;
    const p=position(),screen=SceneTransforms.worldToWindowCoordinates(viewer.scene,p);
    const toPoint=Cartesian3.subtract(p,viewer.camera.positionWC,new Cartesian3());
    const hidden=!screen||Cartesian3.dot(toPoint,viewer.camera.directionWC)<=0
      ||screen.x<0||screen.y<0||screen.x>viewer.canvas.clientWidth||screen.y>viewer.canvas.clientHeight;
    label.hidden=hidden;if(hidden||!screen)return;
    const canvasRect=viewer.canvas.getBoundingClientRect(),layerRect=layer.element.getBoundingClientRect();
    label.style.left=`${screen.x+canvasRect.left-layerRect.left+style.pixelOffset.x}px`;
    label.style.top=`${screen.y+canvasRect.top-layerRect.top+style.pixelOffset.y}px`;
    const value=text();if(label.textContent!==value)label.textContent=value;
  };
  const remove=viewer.scene.postRender.addEventListener(update);update();viewer.scene.requestRender();
  return ()=>{if(disposed)return;disposed=true;remove();label.remove();layer.count--;
    if(layer.count===0){layer.element.remove();layers.delete(viewer);}
  };
}
