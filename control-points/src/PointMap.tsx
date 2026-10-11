import type {Place} from './PlaceSearch';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {X,ChevronRight,Crosshair,ZoomIn} from 'lucide-react';
import {uniqueMapPoints} from '../shared/mapSelection.mjs';
import {createMapMarkerStyle} from '../shared/mapMarkerStyles.mjs';
import {focusPointImmediately,mapInteractions} from '../shared/mapNavigation.mjs';
import Map from 'ol/Map';import View from 'ol/View';import Feature from 'ol/Feature';import PointGeometry from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';import VectorLayer from 'ol/layer/Vector';import XYZ from 'ol/source/XYZ';import VectorSource from 'ol/source/Vector';import Cluster from 'ol/source/Cluster';
import {Style,Circle as CircleStyle,Fill,Stroke,Text} from 'ol/style';import {fromLonLat} from 'ol/proj';import GeoJSON from 'ol/format/GeoJSON';
import {defaults as defaultControls} from 'ol/control';import {boundingExtent} from 'ol/extent';import type {Point,Position,Dataset} from './types';
import 'ol/ol.css';
type Props={place:Place|null;points:Point[];datasets:Dataset[];selected:Point|null;pointFocus:number;position:Position|null;basemap:string;roadNames:boolean;labelStyle:string;imageBrightness:number;overlay:any;overlayVisible:boolean;focus:number;onSelect:(p:Point|null)=>void;onMapReady:()=>void};
export default function PointMap({place,points,datasets,selected,pointFocus,position,basemap,roadNames,labelStyle,imageBrightness,overlay,overlayVisible,focus,onSelect,onMapReady}:Props){
  const el=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef(new VectorSource()),selectedSource=useRef(new VectorSource()),locationSource=useRef(new VectorSource()),overlaySource=useRef(new VectorSource()),baseSource=useRef<XYZ|null>(null),onSelectRef=useRef(onSelect),initialFit=useRef(false);onSelectRef.current=onSelect;
  const placeSource=useRef(new VectorSource());
  const roadNamesLayer=useRef<TileLayer<XYZ>|null>(null);
  const [choices,setChoices]=useState<Point[]>([]),choiceClose=useRef<HTMLButtonElement>(null);
  function closeChoices(){setChoices([]);el.current?.focus({preventScroll:true});}
  function zoomChoices(){const view=mapRef.current?.getView();if(!view||!choices.length)return;view.fit(boundingExtent(choices.map(p=>fromLonLat([p.lon,p.lat]))),{duration:350,padding:[90,70,90,70],maxZoom:19});}
  useEffect(()=>{if(choices.length>1)choiceClose.current?.focus({preventScroll:true});},[choices]);
  useEffect(()=>{setChoices([]);},[points,place,focus]);
  useEffect(()=>{if(selected)setChoices([]);},[selected?.id]);
  useEffect(()=>{
    const source=new XYZ({url:'https://wmts.nlsc.gov.tw/wmts/EMAP/default/EPSG:3857/{z}/{y}/{x}',crossOrigin:'anonymous',attributions:'© 內政部國土測繪中心',maxZoom:19});baseSource.current=source;
    const labels=new TileLayer({source:new XYZ({url:'https://wmts.nlsc.gov.tw/wmts/EMAP12/default/EPSG:3857/{z}/{y}/{x}',crossOrigin:'anonymous',maxZoom:19})});roadNamesLayer.current=labels;
    const clusterSource=new Cluster({distance:36,minDistance:16,source:sourceRef.current});
    const markerStyle=createMapMarkerStyle();
    const clusters=new VectorLayer({source:clusterSource,style:f=>markerStyle(f,mapRef.current?.getView().getZoom()??0)});
    const parcelLayer=new VectorLayer({source:overlaySource.current,style:new Style({stroke:new Stroke({color:'#c16c31',width:2}),fill:new Fill({color:'rgba(216,161,98,.10)'})})});
    const selectionLayer=new VectorLayer({source:selectedSource.current,style:f=>new Style({image:new CircleStyle({radius:12,fill:new Fill({color:f.get('point')?.dataset_id==='image-control-202610'?'#f2c53d':'#c4dd95'}),stroke:new Stroke({color:'#163e35',width:4})})})});
    const positionLayer=new VectorLayer({source:locationSource.current,style:new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'#3385f0'}),stroke:new Stroke({color:'#fff',width:3})})})});
    const placeLayer=new VectorLayer({source:placeSource.current,style:f=>new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'#c24531'}),stroke:new Stroke({color:'#fff',width:3})}),text:new Text({text:'搜尋：'+f.get('name'),font:'600 12px sans-serif',fill:new Fill({color:'#8d2f20'}),stroke:new Stroke({color:'#fff',width:4}),offsetY:-20})})});
    const map=new Map({target:el.current!,layers:[new TileLayer({source,className:'imagery-base-layer'}),labels,parcelLayer,clusters,selectionLayer,positionLayer,placeLayer],view:new View({center:fromLonLat([121.255,24.96]),zoom:12}),interactions:mapInteractions(),controls:defaultControls({zoom:false,rotate:false})});
    mapRef.current=map;
    const viewport=map.getViewport(),interruptNavigation=()=>{const view=map.getView();if(view.getAnimating())view.cancelAnimations();};
    viewport?.addEventListener('pointerdown',interruptNavigation,{passive:true});
    viewport?.addEventListener('wheel',interruptNavigation,{passive:true});
    map.on('singleclick',event=>{
      const hits:Point[]=[];
      map.forEachFeatureAtPixel(event.pixel,f=>{
        const list=f.get('features') as Feature[]|undefined;
        if(list)for(const child of list){const p=child.get('point') as Point|undefined;if(p)hits.push(p);}
        else {const p=f.get('point') as Point|undefined;if(p)hits.push(p);}
      },{hitTolerance:8,layerFilter:layer=>layer===clusters||layer===selectionLayer});
      const candidates=uniqueMapPoints(hits) as Point[];
      if(candidates.length>1){onSelectRef.current(null);setChoices(candidates);}
      else {setChoices([]);if(candidates[0])onSelectRef.current(candidates[0]);}
    });
    map.once('rendercomplete',onMapReady);const observer=new ResizeObserver(()=>map.updateSize());observer.observe(el.current!);
    return()=>{observer.disconnect();viewport?.removeEventListener('pointerdown',interruptNavigation);viewport?.removeEventListener('wheel',interruptNavigation);map.setTarget(undefined);mapRef.current=null;};
  },[]);
  useEffect(()=>{sourceRef.current.clear();sourceRef.current.addFeatures(points.map(p=>new Feature({geometry:new PointGeometry(fromLonLat([p.lon,p.lat])),point:p})));if(points.length&&!initialFit.current){const extent=sourceRef.current.getExtent();if(extent){initialFit.current=true;mapRef.current?.getView().fit(extent,{padding:[60,40,60,40],maxZoom:15});}}},[points]);
  useEffect(()=>{selectedSource.current.clear();if(selected)selectedSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([selected.lon,selected.lat])),point:selected}));},[selected?.id]);
  useLayoutEffect(()=>{const map=mapRef.current,view=map?.getView();if(pointFocus&&selected&&map&&view){map.updateSize();focusPointImmediately(view,fromLonLat([selected.lon,selected.lat]));}},[pointFocus]);
  useEffect(()=>{locationSource.current.clear();if(position)locationSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([position.lon,position.lat]))}));},[position]);
  useEffect(()=>{placeSource.current.clear();if(place){placeSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([place.lon,place.lat])),name:place.name}));mapRef.current?.getView().animate({center:fromLonLat([place.lon,place.lat]),zoom:16,duration:450});}},[place]);
  useEffect(()=>{baseSource.current?.setUrl(`https://wmts.nlsc.gov.tw/wmts/${basemap==='aerial'?'PHOTO2':'EMAP'}/default/EPSG:3857/{z}/{y}/{x}`);},[basemap]);
  useEffect(()=>{roadNamesLayer.current?.getSource()?.setUrl(`https://wmts.nlsc.gov.tw/wmts/${labelStyle==='full'?'EMAP2':'EMAP12'}/default/EPSG:3857/{z}/{y}/{x}`);},[labelStyle]);
  useEffect(()=>{roadNamesLayer.current?.setVisible(basemap==='aerial'&&roadNames);},[basemap,roadNames]);
  useEffect(()=>{overlaySource.current.clear();if(overlay&&overlayVisible)overlaySource.current.addFeatures(new GeoJSON().readFeatures(overlay,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));},[overlay,overlayVisible]);
  useEffect(()=>{if(!focus)return;if(position)mapRef.current?.getView().animate({center:fromLonLat([position.lon,position.lat]),zoom:16,duration:400});else if(points.length){const extent=sourceRef.current.getExtent();if(extent)mapRef.current?.getView().fit(extent,{padding:[80,60,80,60],duration:400,maxZoom:15});}},[focus]);
  return <><div ref={el} className="map-canvas" tabIndex={0} style={{'--imagery-brightness':basemap==='aerial'?imageBrightness/100:1} as CSSProperties} aria-label="控制點地圖"/>{choices.length>1&&<section className="cluster-picker" role="dialog" aria-labelledby="cluster-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeChoices();}}}><div className="cluster-heading"><div><h3 id="cluster-title">選擇點位 <small>{choices.length.toLocaleString()} 點</small></h3><p>點位靠得很近，請選擇要查看的資料。</p></div><button ref={choiceClose} className="icon-button" onClick={closeChoices} aria-label="關閉附近點位清單"><X size={19}/></button></div><div className="cluster-point-list">{choices.map(p=><button key={p.id} className="cluster-point" aria-label={`開啟點位 ${p.code} · ${datasets.find(d=>d.id===p.dataset_id)?.name||p.dataset_id}`} onClick={()=>{setChoices([]);onSelectRef.current(p);}}><span className={'point-symbol '+(p.dataset_id==='leveling-109'?'leveling':p.dataset_id==='image-control-202610'?'survey':'')}><Crosshair size={19}/></span><span className="cluster-point-text"><strong>{p.code}<small>{p.status}</small></strong><span>{datasets.find(d=>d.id===p.dataset_id)?.name||p.dataset_id}</span><small>{p.name&&p.name!==p.code?p.name:p.category||'控制點'}{p.original_code!==p.code?` · 原點號 ${p.original_code}`:''}</small></span><ChevronRight size={17}/></button>)}</div><button className="cluster-zoom" onClick={zoomChoices}><ZoomIn size={16}/>放大此範圍</button></section>}</>;
}
