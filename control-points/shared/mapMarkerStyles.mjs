import {Style,Circle as CircleStyle,Fill,Stroke,Text} from 'ol/style.js';
import {representativeMapPoint} from './mapSelection.mjs';
import {pointColor} from './pointStatus.mjs';
import {isApproximate} from './fieldPoints.mjs';

// Repaints (including hit detection) reuse symbols instead of sorting the
// cluster and constructing every circle/text again. Re-clustering makes new
// feature keys; WeakMap lets obsolete clusters be collected.
/** @param {any[] | (()=>any[])} datasets */
export function createMapMarkerStyle(datasets=[]) {
  const cache=new WeakMap();
  return (feature,zoom)=>{
    const showCode=zoom>15,revision=feature.getRevision(),children=feature.get('features'),previous=cache.get(feature);
    if(previous&&previous.showCode===showCode&&previous.revision===revision&&previous.children===children)return previous.styles;
    const list=typeof datasets==='function'?datasets():datasets;
    const styles=mapMarkerStyles(children,zoom,new Map(list.map(d=>[d.id,d])));
    cache.set(feature,{showCode,revision,children,styles});
    return styles;
  };
}

export function mapMarkerStyles(children,zoom,datasets=new Map()) {
  const count=children.length,p=representativeMapPoint(children.map(f=>f.get('point')));
  if(!p)return [];
  const representative=children.find(f=>f.get('point')?.id===p.id);
  const geometry=representative.getGeometry();
  const color=pointColor(p,datasets.get(p.dataset_id));
  const approximate=isApproximate(p);
  const styles=[new Style({geometry,
    image:new CircleStyle({radius:approximate?9:7,fill:new Fill({color:approximate?'#fffef5':color}),stroke:new Stroke({color:approximate?color:color==='#f2c53d'?'#795b10':'#fff',width:2.5,lineDash:approximate?[3,2]:undefined})}),
    text:new Text({text:zoom>15?p.code||'':'',font:'600 11px sans-serif',fill:new Fill({color:'#163c33'}),stroke:new Stroke({color:'#fff',width:3}),offsetY:18})
  })];
  if(count>1){
    const label=String(count),radius=Math.max(9,5+label.length*3),offsetX=radius+9,offsetY=-12;
    styles.push(new Style({geometry,zIndex:1,
      image:new CircleStyle({radius,displacement:[offsetX,-offsetY],fill:new Fill({color:'#fffef7'}),stroke:new Stroke({color:'#34594c',width:1.5})}),
      text:new Text({text:label,font:'600 10px sans-serif',fill:new Fill({color:'#163c33'}),offsetX,offsetY})
    }));
  }
  return styles;
}
