import {Style,Circle as CircleStyle,Fill,Stroke,Text} from 'ol/style.js';
import {representativeMapPoint} from './mapSelection.mjs';

// Repaints (including hit detection) reuse symbols instead of sorting the
// cluster and constructing every circle/text again. Re-clustering makes new
// feature keys; WeakMap lets obsolete clusters be collected.
export function createMapMarkerStyle() {
  const cache=new WeakMap();
  return (feature,zoom)=>{
    const showCode=zoom>15,revision=feature.getRevision(),previous=cache.get(feature);
    if(previous&&previous.showCode===showCode&&previous.revision===revision)return previous.styles;
    const styles=mapMarkerStyles(feature.get('features'),zoom);
    cache.set(feature,{showCode,revision,styles});
    return styles;
  };
}

export function mapMarkerStyles(children,zoom) {
  const count=children.length,p=representativeMapPoint(children.map(f=>f.get('point')));
  if(!p)return [];
  const representative=children.find(f=>f.get('point')?.id===p.id);
  const geometry=representative.getGeometry();
  const color=p.status==='損壞'||p.status==='找不到'?'#b65b38':p.dataset_id==='leveling-109'?'#743c92':p.dataset_id==='image-control-202610'?'#f2c53d':'#2b6852';
  const styles=[new Style({geometry,
    image:new CircleStyle({radius:7,fill:new Fill({color}),stroke:new Stroke({color:color==='#f2c53d'?'#795b10':'#fff',width:2.5})}),
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
