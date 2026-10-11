import {useEffect,useRef} from 'react';
import Map from 'ol/Map';import View from 'ol/View';import Feature from 'ol/Feature';import PointGeometry from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';import VectorLayer from 'ol/layer/Vector';import XYZ from 'ol/source/XYZ';import VectorSource from 'ol/source/Vector';import Cluster from 'ol/source/Cluster';
import {Style,Circle as CircleStyle,Fill,Stroke,Text} from 'ol/style';import {fromLonLat} from 'ol/proj';import GeoJSON from 'ol/format/GeoJSON';
import {defaults as defaultControls} from 'ol/control';import type {Point,Position} from './types';
import 'ol/ol.css';
type Props={points:Point[];selected:Point|null;position:Position|null;basemap:string;overlay:any;overlayVisible:boolean;focus:number;onSelect:(p:Point)=>void;onMapReady:()=>void};
export default function PointMap({points,selected,position,basemap,overlay,overlayVisible,focus,onSelect,onMapReady}:Props){
  const el=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef(new VectorSource()),selectedSource=useRef(new VectorSource()),locationSource=useRef(new VectorSource()),overlaySource=useRef(new VectorSource()),baseSource=useRef<XYZ|null>(null),onSelectRef=useRef(onSelect);onSelectRef.current=onSelect;
  useEffect(()=>{
    const source=new XYZ({url:'https://wmts.nlsc.gov.tw/wmts/EMAP/default/EPSG:3857/{z}/{y}/{x}',crossOrigin:'anonymous',attributions:'© 內政部國土測繪中心',maxZoom:20});baseSource.current=source;
    const clusterSource=new Cluster({distance:36,minDistance:16,source:sourceRef.current});
    const clusters=new VectorLayer({source:clusterSource,style:f=>{const children=f.get('features') as Feature[],count=children.length,p=children[0]?.get('point') as Point|undefined,color=p?.status==='損壞'||p?.status==='找不到'?'#b65b38':p?.dataset_id==='leveling-109'?'#4779a0':'#2b6852';return new Style({image:new CircleStyle({radius:count>1?Math.min(24,14+Math.log(count)*2):7,fill:new Fill({color}),stroke:new Stroke({color:'#fff',width:count>1?2:2.5})}),text:new Text({text:count>1?String(count):mapRef.current?.getView().getZoom()!>15?p?.code||'':'',font:count>1?'600 12px sans-serif':'600 11px sans-serif',fill:new Fill({color:count>1?'#fff':'#163c33'}),stroke:count>1?undefined:new Stroke({color:'#fff',width:3}),offsetY:count>1?0:18})});}});
    const parcelLayer=new VectorLayer({source:overlaySource.current,style:new Style({stroke:new Stroke({color:'#c16c31',width:2}),fill:new Fill({color:'rgba(216,161,98,.10)'})})});
    const selectionLayer=new VectorLayer({source:selectedSource.current,style:new Style({image:new CircleStyle({radius:12,fill:new Fill({color:'#c4dd95'}),stroke:new Stroke({color:'#163e35',width:4})})})});
    const positionLayer=new VectorLayer({source:locationSource.current,style:new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'#3385f0'}),stroke:new Stroke({color:'#fff',width:3})})})});
    const map=new Map({target:el.current!,layers:[new TileLayer({source}),parcelLayer,clusters,selectionLayer,positionLayer],view:new View({center:fromLonLat([121.255,24.96]),zoom:12}),controls:defaultControls({zoom:false,rotate:false})});
    mapRef.current=map;
    map.on('singleclick',event=>{map.forEachFeatureAtPixel(event.pixel,f=>{const list=f.get('features') as Feature[]|undefined;if(!list)return;if(list.length===1)onSelectRef.current(list[0].get('point'));else{const extent=new VectorSource({features:list}).getExtent();if(extent)map.getView().fit(extent,{duration:350,padding:[100,100,100,100],maxZoom:18});}return true;});});
    map.once('rendercomplete',onMapReady);const observer=new ResizeObserver(()=>map.updateSize());observer.observe(el.current!);
    return()=>{observer.disconnect();map.setTarget(undefined);mapRef.current=null;};
  },[]);
  useEffect(()=>{sourceRef.current.clear();sourceRef.current.addFeatures(points.map(p=>new Feature({geometry:new PointGeometry(fromLonLat([p.lon,p.lat])),point:p})));},[points]);
  useEffect(()=>{selectedSource.current.clear();if(selected){selectedSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([selected.lon,selected.lat]))}));mapRef.current?.getView().animate({center:fromLonLat([selected.lon,selected.lat]),zoom:17,duration:450});}},[selected?.id]);
  useEffect(()=>{locationSource.current.clear();if(position)locationSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([position.lon,position.lat]))}));},[position]);
  useEffect(()=>{baseSource.current?.setUrl(`https://wmts.nlsc.gov.tw/wmts/${basemap==='aerial'?'PHOTO2':'EMAP'}/default/EPSG:3857/{z}/{y}/{x}`);},[basemap]);
  useEffect(()=>{overlaySource.current.clear();if(overlay&&overlayVisible)overlaySource.current.addFeatures(new GeoJSON().readFeatures(overlay,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));},[overlay,overlayVisible]);
  useEffect(()=>{if(!focus)return;if(position)mapRef.current?.getView().animate({center:fromLonLat([position.lon,position.lat]),zoom:16,duration:400});else if(points.length){const extent=sourceRef.current.getExtent();if(extent)mapRef.current?.getView().fit(extent,{padding:[80,60,80,60],duration:400,maxZoom:15});}},[focus]);
  return <div ref={el} className="map-canvas" aria-label="控制點地圖"/>;
}
