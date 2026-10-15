import {pointColor,pointStatusStyle} from '../shared/pointStatus.mjs';
import {displayPointStatus} from '../shared/fieldWorkflow.mjs';
import {datasetLabel,datasetColor} from '../shared/datasets.mjs';
import type {Place} from './PlaceSearch';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {X,ChevronRight,Crosshair,ZoomIn} from 'lucide-react';
import {uniqueMapPoints} from '../shared/mapSelection.mjs';
import {createMapMarkerStyle} from '../shared/mapMarkerStyles.mjs';
import {focusPointImmediately,followLocationImmediately,pausesLocationFollow,mapInteractions} from '../shared/mapNavigation.mjs';
import Map from 'ol/Map';import View from 'ol/View';import Feature from 'ol/Feature';import PointGeometry from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';import CircleGeometry from 'ol/geom/Circle';
import TileLayer from 'ol/layer/Tile';import VectorLayer from 'ol/layer/Vector';import XYZ from 'ol/source/XYZ';import VectorSource from 'ol/source/Vector';import Cluster from 'ol/source/Cluster';
import {Style,Circle as CircleStyle,Fill,Stroke,Text} from 'ol/style';import {fromLonLat,toLonLat} from 'ol/proj';import GeoJSON from 'ol/format/GeoJSON';
import {defaults as defaultControls} from 'ol/control';import {boundingExtent} from 'ol/extent';import type {Point,Position,LocationFocus,Dataset,WalkingRoute,ReferenceLayer} from './types';
import 'ol/ol.css';
type Props={references:ReferenceLayer[];hiddenReferences:Set<string>;referenceFocus:{id:string;nonce:number}|null;onPickPosition:((position:{lon:number;lat:number})=>void)|null;pickedPosition:{lon:number;lat:number}|null;findingTarget:Point|null;walkingRoute:WalkingRoute|null;findingFocus:number;batchMode:boolean;batchIds:Set<string>;onToggleBatch:(p:Point)=>void;place:Place|null;points:Point[];datasets:Dataset[];selected:Point|null;pointFocus:number;locationFocus:LocationFocus|null;position:Position|null;basemap:string;roadNames:boolean;labelStyle:string;imageBrightness:number;overlay:any;overlayVisible:boolean;focus:number;onSelect:(p:Point|null)=>void;onInteraction:()=>void;onMapReady:()=>void};
export default function PointMap({references,hiddenReferences,referenceFocus,onPickPosition,pickedPosition,findingTarget,walkingRoute,findingFocus,batchMode,batchIds,onToggleBatch,place,points,datasets,selected,pointFocus,locationFocus,position,basemap,roadNames,labelStyle,imageBrightness,overlay,overlayVisible,focus,onSelect,onInteraction,onMapReady}:Props){
  const pickRef=useRef(onPickPosition);pickRef.current=onPickPosition;
  const referenceSource=useRef(new VectorSource());
  const pickedSource=useRef(new VectorSource());
  const datasetsRef=useRef(datasets);datasetsRef.current=datasets;
  const el=useRef<HTMLDivElement>(null),mapRef=useRef<Map|null>(null),sourceRef=useRef(new VectorSource()),selectedSource=useRef(new VectorSource()),locationSource=useRef(new VectorSource()),overlaySource=useRef(new VectorSource()),baseSource=useRef<XYZ|null>(null),onSelectRef=useRef(onSelect),initialFit=useRef(false);onSelectRef.current=onSelect;
  const batchSource=useRef(new VectorSource()),batchRef=useRef({batchMode,onToggleBatch});batchRef.current={batchMode,onToggleBatch};
  const placeSource=useRef(new VectorSource()),findingSource=useRef(new VectorSource()),routeSource=useRef(new VectorSource()),framedTarget=useRef('');
  const onInteractionRef=useRef(onInteraction);onInteractionRef.current=onInteraction;
  const roadNamesLayer=useRef<TileLayer<XYZ>|null>(null);
  const locationFocusRef=useRef(locationFocus);locationFocusRef.current=locationFocus?.follow?locationFocus:null;
  const [choices,setChoices]=useState<Point[]>([]),choiceClose=useRef<HTMLButtonElement>(null);
  function closeChoices(){setChoices([]);el.current?.focus({preventScroll:true});}
  function zoomChoices(){const view=mapRef.current?.getView();if(!view||!choices.length)return;view.fit(boundingExtent(choices.map(p=>fromLonLat([p.lon,p.lat]))),{duration:350,padding:[90,70,90,70],maxZoom:19});}
  useEffect(()=>{if(choices.length>1)choiceClose.current?.focus({preventScroll:true});},[choices]);
  useEffect(()=>{setChoices([]);},[points,place,focus,locationFocus]);
  useEffect(()=>{setChoices([]);},[batchMode]);
  useEffect(()=>{if(selected)setChoices([]);},[selected?.id,selected?.lon,selected?.lat,selected?.status]);
  useEffect(()=>{
    const source=new XYZ({url:'https://wmts.nlsc.gov.tw/wmts/EMAP/default/EPSG:3857/{z}/{y}/{x}',crossOrigin:'anonymous',attributions:'© 內政部國土測繪中心',maxZoom:19});baseSource.current=source;
    const labels=new TileLayer({source:new XYZ({url:'https://wmts.nlsc.gov.tw/wmts/EMAP12/default/EPSG:3857/{z}/{y}/{x}',crossOrigin:'anonymous',maxZoom:19})});roadNamesLayer.current=labels;
    const clusterSource=new Cluster({distance:36,minDistance:16,source:sourceRef.current});
    const markerStyle=createMapMarkerStyle(()=>datasetsRef.current);
    const clusters=new VectorLayer({source:clusterSource,style:f=>markerStyle(f,mapRef.current?.getView().getZoom()??0)});
    const parcelLayer=new VectorLayer({source:overlaySource.current,style:new Style({stroke:new Stroke({color:'#c16c31',width:2}),fill:new Fill({color:'rgba(216,161,98,.10)'})})});
    const referenceLayer=new VectorLayer({source:referenceSource.current,style:new Style({stroke:new Stroke({color:'#df6c19',width:2.5}),fill:new Fill({color:'rgba(223,108,25,.08)'})})});
    const selectionLayer=new VectorLayer({source:selectedSource.current,style:f=>new Style({image:new CircleStyle({radius:12,fill:new Fill({color:pointColor(f.get('point'),datasetsRef.current.find(d=>d.id===f.get('point')?.dataset_id))}),stroke:new Stroke({color:'#163e35',width:4})})})});
    const batchLayer=new VectorLayer({source:batchSource.current,style:new Style({image:new CircleStyle({radius:18,fill:new Fill({color:'rgba(255,255,255,.12)'}),stroke:new Stroke({color:'#e44622',width:4})})})});
    const positionLayer=new VectorLayer({source:locationSource.current,style:new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'#3385f0'}),stroke:new Stroke({color:'#fff',width:3})})})});
    const placeLayer=new VectorLayer({source:placeSource.current,style:f=>new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'#c24531'}),stroke:new Stroke({color:'#fff',width:3})}),text:new Text({text:'搜尋：'+f.get('name'),font:'600 12px sans-serif',fill:new Fill({color:'#8d2f20'}),stroke:new Stroke({color:'#fff',width:4}),offsetY:-20})})});
    const pickedLayer=new VectorLayer({source:pickedSource.current,style:new Style({image:new CircleStyle({radius:10,fill:new Fill({color:'#fff9ed'}),stroke:new Stroke({color:'#c77d32',width:4,lineDash:[4,3]})}),text:new Text({text:'概略新點',offsetY:-22,fill:new Fill({color:'#82501e'}),stroke:new Stroke({color:'#fff',width:3})})})});
    const findingLayer=new VectorLayer({source:findingSource.current,style:f=>f.get('accuracy')?new Style({stroke:new Stroke({color:'#3385f066',width:1}),fill:new Fill({color:'#3385f016'})}):new Style({stroke:new Stroke({color:'#bb692c',width:3,lineDash:[8,8]})})});
    const routeLayer=new VectorLayer({source:routeSource.current,style:[new Style({stroke:new Stroke({color:'#ffffff',width:8})}),new Style({stroke:new Stroke({color:'#246bbd',width:5})})]});
    const map=new Map({target:el.current!,layers:[new TileLayer({source,className:'imagery-base-layer'}),labels,parcelLayer,referenceLayer,findingLayer,routeLayer,clusters,selectionLayer,batchLayer,positionLayer,placeLayer,pickedLayer],view:new View({center:fromLonLat([121.255,24.96]),zoom:12}),interactions:mapInteractions(),controls:defaultControls({zoom:false,rotate:false})});
    mapRef.current=map;
    const viewport=map.getViewport(),interruptNavigation=()=>{const view=map.getView();if(view.getAnimating())view.cancelAnimations();};
    viewport?.addEventListener('pointerdown',interruptNavigation,{passive:true});
    viewport?.addEventListener('wheel',interruptNavigation,{passive:true});
    map.on('pointerdrag',event=>{if(pausesLocationFollow(event)){locationFocusRef.current=null;onInteractionRef.current();}});
    map.on('moveend',()=>{const p=locationFocusRef.current;if(p)followLocationImmediately(map.getView(),fromLonLat([p.lon,p.lat]));});
    map.on('singleclick',event=>{
      if(pickRef.current){const [lon,lat]=toLonLat(event.coordinate);pickRef.current({lon,lat});return;}
      const hits:Point[]=[];
      map.forEachFeatureAtPixel(event.pixel,f=>{
        const list=f.get('features') as Feature[]|undefined;
        if(list)for(const child of list){const p=child.get('point') as Point|undefined;if(p)hits.push(p);}
        else {const p=f.get('point') as Point|undefined;if(p)hits.push(p);}
      },{hitTolerance:8,layerFilter:layer=>layer===clusters||layer===selectionLayer});
      const candidates=uniqueMapPoints(hits) as Point[];
      if(candidates.length>1){if(!batchRef.current.batchMode)onSelectRef.current(null);setChoices(candidates);}
      else {setChoices([]);if(candidates[0]){if(batchRef.current.batchMode)batchRef.current.onToggleBatch(candidates[0]);else onSelectRef.current(candidates[0]);}}
    });
    map.once('rendercomplete',onMapReady);const observer=new ResizeObserver(()=>map.updateSize());observer.observe(el.current!);
    return()=>{observer.disconnect();viewport?.removeEventListener('pointerdown',interruptNavigation);viewport?.removeEventListener('wheel',interruptNavigation);map.setTarget(undefined);mapRef.current=null;};
  },[]);
  useEffect(()=>{sourceRef.current.clear();sourceRef.current.addFeatures(points.map(p=>new Feature({geometry:new PointGeometry(fromLonLat([p.lon,p.lat])),point:p})));if(points.length&&!initialFit.current){const extent=sourceRef.current.getExtent();if(extent){initialFit.current=true;mapRef.current?.getView().fit(extent,{padding:[60,40,60,40],maxZoom:15});}}},[points]);
  useEffect(()=>{pickedSource.current.clear();if(pickedPosition)pickedSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([pickedPosition.lon,pickedPosition.lat]))}));},[pickedPosition]);
  useEffect(()=>{selectedSource.current.clear();if(selected)selectedSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([selected.lon,selected.lat])),point:selected}));},[selected?.id,selected?.lon,selected?.lat,selected?.status]);
  useEffect(()=>{batchSource.current.clear();if(batchMode)batchSource.current.addFeatures(points.filter(p=>batchIds.has(p.id)).map(p=>new Feature({geometry:new PointGeometry(fromLonLat([p.lon,p.lat]))})));},[batchMode,batchIds,points]);
  useLayoutEffect(()=>{const map=mapRef.current,view=map?.getView();if(pointFocus&&selected&&map&&view){map.updateSize();focusPointImmediately(view,fromLonLat([selected.lon,selected.lat]));}},[pointFocus]);
  useEffect(()=>{locationSource.current.clear();if(position)locationSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([position.lon,position.lat]))}));},[position]);
  useEffect(()=>{if(locationFocus)followLocationImmediately(mapRef.current!.getView(),fromLonLat([locationFocus.lon,locationFocus.lat]),locationFocus.initial);},[locationFocus]);
  useEffect(()=>{
    findingSource.current.clear();if(!findingTarget||!position)return;
    findingSource.current.addFeature(new Feature({geometry:new LineString([fromLonLat([position.lon,position.lat]),fromLonLat([findingTarget.lon,findingTarget.lat])])}));
    findingSource.current.addFeature(new Feature({geometry:new CircleGeometry(fromLonLat([position.lon,position.lat]),Math.min(position.accuracy,10000)/Math.cos(position.lat*Math.PI/180)),accuracy:true}));
  },[findingTarget,position]);
  useEffect(()=>{routeSource.current.clear();if(walkingRoute&&findingTarget)routeSource.current.addFeature(new Feature({geometry:new LineString(walkingRoute.coordinates.map(c=>fromLonLat(c)))}));},[walkingRoute,findingTarget?.id]);
  useEffect(()=>{
    if(!findingTarget){framedTarget.current='';return;}
    const key=findingTarget.id+':'+findingFocus+':'+!!position;
    if(key===framedTarget.current)return;framedTarget.current=key;
    const map=mapRef.current;if(!map)return;map.updateSize();
    const coords=[fromLonLat([findingTarget.lon,findingTarget.lat]),...(position?[fromLonLat([position.lon,position.lat])]:[]),...(walkingRoute?.coordinates.map(c=>fromLonLat(c))||[])];
    const mobile=map.getSize()![0]<=720;
    map.getView().fit(boundingExtent(coords),{padding:mobile?[105,40,Math.min(430,map.getSize()![1]*.57),40]:[100,420,75,55],maxZoom:18});
  },[findingTarget?.id,findingFocus,position,walkingRoute]);
  useEffect(()=>{placeSource.current.clear();if(place){placeSource.current.addFeature(new Feature({geometry:new PointGeometry(fromLonLat([place.lon,place.lat])),name:place.name}));mapRef.current?.getView().animate({center:fromLonLat([place.lon,place.lat]),zoom:16,duration:450});}},[place]);
  useEffect(()=>{baseSource.current?.setUrl(`https://wmts.nlsc.gov.tw/wmts/${basemap==='aerial'?'PHOTO2':'EMAP'}/default/EPSG:3857/{z}/{y}/{x}`);},[basemap]);
  useEffect(()=>{roadNamesLayer.current?.getSource()?.setUrl(`https://wmts.nlsc.gov.tw/wmts/${labelStyle==='full'?'EMAP2':'EMAP12'}/default/EPSG:3857/{z}/{y}/{x}`);},[labelStyle]);
  useEffect(()=>{roadNamesLayer.current?.setVisible(basemap==='aerial'&&roadNames);},[basemap,roadNames]);
  useEffect(()=>{overlaySource.current.clear();if(overlay&&overlayVisible)overlaySource.current.addFeatures(new GeoJSON().readFeatures(overlay,{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));},[overlay,overlayVisible]);
  useEffect(()=>{referenceSource.current.clear();const format=new GeoJSON();for(const r of references||[])if(!hiddenReferences?.has(r.id))referenceSource.current.addFeatures(format.readFeatures({type:'FeatureCollection',features:r.data.features.filter((f:any)=>!['Point','MultiPoint'].includes(f.geometry.type))},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}));},[references,hiddenReferences]);
  useEffect(()=>{if(!referenceFocus)return;const r=references?.find(r=>r.id===referenceFocus.id),map=mapRef.current;if(!r||!map)return;
    const features=new GeoJSON().readFeatures({type:'FeatureCollection',features:r.data.features.filter((f:any)=>!['Point','MultiPoint'].includes(f.geometry.type))},{dataProjection:'EPSG:4326',featureProjection:'EPSG:3857'}),source=new VectorSource({features});
    const extent=source.getExtent();if(features.length&&extent){locationFocusRef.current=null;setChoices([]);map.updateSize();map.getView().cancelAnimations();map.getView().fit(extent,{padding:[110,40,80,40],maxZoom:19,duration:0});}
  },[referenceFocus,references]);
  useEffect(()=>{if(!focus)return;if(points.length){const extent=sourceRef.current.getExtent();if(extent)mapRef.current?.getView().fit(extent,{padding:[80,60,80,60],duration:400,maxZoom:15});}},[focus]);
  return <><div ref={el} className="map-canvas" tabIndex={0} style={{'--imagery-brightness':basemap==='aerial'?imageBrightness/100:1} as CSSProperties} aria-label="控制點地圖"/>{choices.length>1&&<section className="cluster-picker" role="dialog" aria-labelledby="cluster-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();closeChoices();}}}><div className="cluster-heading"><div><h3 id="cluster-title">{batchMode?'勾選點位':'選擇點位'} <small>{choices.length.toLocaleString()} 點</small></h3><p>{batchMode?'可勾選多個點位，完成後關閉清單。':'點位靠得很近，請選擇要查看的資料。'}</p></div><button ref={choiceClose} className="icon-button" onClick={closeChoices} aria-label="關閉附近點位清單"><X size={19}/></button></div><div className="cluster-point-list">{choices.map(p=><button key={p.id} className={'cluster-point '+(batchMode&&batchIds.has(p.id)?'batch-checked':'')} aria-pressed={batchMode?batchIds.has(p.id):undefined} aria-label={`${batchMode?'勾選點之記':'開啟點位'} ${p.code} · ${datasetLabel(datasets.find(d=>d.id===p.dataset_id))}`} onClick={()=>{if(batchMode)onToggleBatch(p);else{setChoices([]);onSelectRef.current(p);}}}>{batchMode&&<span className="batch-choice-check" aria-hidden="true">{batchIds.has(p.id)?'☑':'☐'}</span>}<span className="point-symbol" style={{color:pointColor(p,datasets.find(d=>d.id===p.dataset_id)),backgroundColor:pointColor(p,datasets.find(d=>d.id===p.dataset_id))+'18'}}><Crosshair size={19}/></span><span className="cluster-point-text"><strong>{p.code}<small style={{color:pointStatusStyle(p.status)?.color}}>{displayPointStatus(p.status)}</small></strong><span>{datasetLabel(datasets.find(d=>d.id===p.dataset_id))}</span><small>{p.name&&p.name!==p.code?p.name:p.category||'控制點'}{p.original_code!==p.code?` · 原點號 ${p.original_code}`:''}</small></span><ChevronRight size={17}/></button>)}</div><button className="cluster-zoom" onClick={zoomChoices}><ZoomIn size={16}/>放大此範圍</button></section>}</>;
}
