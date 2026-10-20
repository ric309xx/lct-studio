import {useEffect,useRef,useState} from 'react';
import {Cartesian3,Color,Ion,OpenStreetMapImageryProvider,Rectangle,SceneMode,Viewer} from 'cesium';
import {MapPin,LocateFixed,ArrowRight,Search} from 'lucide-react';
import {parseConfig} from './config';
import {clusterMapMarkers,type CaseOverviewItem,type MapMarker} from './caseOverview';

type Props={cases:CaseOverviewItem[];initialKey?:string;onEnter:(parcelKey:string)=>void;savedView:{current:number[]|null}};
export function CaseOverviewMap({cases,initialKey,onEnter,savedView}:Props){
  const host=useRef<HTMLDivElement>(null),map=useRef<Viewer|null>(null);
  const [selected,setSelected]=useState(initialKey??'');
  const [markers,setMarkers]=useState<MapMarker[]>([]);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [nearby,setNearby]=useState<CaseOverviewItem[]>([]);
  const active=cases.find(c=>c.key===selected);
  const matches=query.trim()?cases.filter(c=>`${c.title} ${c.parcels.map(p=>p.info.parcelNo).join(' ')}`.includes(query.trim())):[];
  function fit(items:CaseOverviewItem[],duration=.65){
    const viewer=map.current;if(!viewer)return;
    const west=Math.min(...items.map(c=>c.bounds[0])),east=Math.max(...items.map(c=>c.bounds[2]));
    const south=Math.min(...items.map(c=>c.bounds[1])),north=Math.max(...items.map(c=>c.bounds[3]));
    const dx=Math.max((east-west)*.22,.0008),dy=Math.max((north-south)*.22,.0008);
    viewer.camera.flyTo({destination:Rectangle.fromDegrees(west-dx,south-dy,east+dx,north+dy),duration});
  }
  function choose(item:CaseOverviewItem){setSelected(item.key);setNearby([]);setQuery('');fit([item]);}
  useEffect(()=>{
    let viewer:Viewer|undefined,remove:undefined|(()=>void),frame=0,previous='';
    try{
      Ion.defaultAccessToken=parseConfig(import.meta.env).accessToken;
      viewer=new Viewer(host.current!,{sceneMode:SceneMode.SCENE2D,animation:false,timeline:false,baseLayerPicker:false,baseLayer:false,geocoder:false,homeButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,sceneModePicker:false,navigationHelpButton:false,requestRenderMode:true});
      map.current=viewer;
      viewer.imageryLayers.addImageryProvider(new OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));
      viewer.scene.backgroundColor=Color.fromCssColorString('#e0e6e1');
      for(const item of cases)for(const ring of item.rings){
        viewer.entities.add({polyline:{positions:Cartesian3.fromDegreesArray(ring.flat()),width:2,material:Color.fromCssColorString('#087e80')}});
      }
      if(savedView.current){const [w,s,e,n]=savedView.current;viewer.camera.setView({destination:new Rectangle(w,s,e,n)});}
      else fit(cases,0);
      const update=()=>{
        if(frame)return;
        frame=requestAnimationFrame(()=>{
          frame=0;if(!viewer||viewer.isDestroyed())return;
          const points=cases.flatMap(item=>{
            const p=viewer!.scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(item.longitude,item.latitude));
            return p&&p.x>=-40&&p.y>=-40&&p.x<=host.current!.clientWidth+40&&p.y<=host.current!.clientHeight+40?[{x:Math.round(p.x),y:Math.round(p.y),items:[item]}]:[];
          });
          const grouped=clusterMapMarkers(points);
          const signature=JSON.stringify(grouped.map(g=>[g.x,g.y,g.items.map(i=>i.key)]));
          if(signature!==previous){previous=signature;setMarkers(grouped);}
        });
      };
      remove=viewer.scene.postRender.addEventListener(update);
      update();
    }catch(e){setError(e instanceof Error?e.message:'地圖無法載入');}
    return ()=>{
      cancelAnimationFrame(frame);remove?.();
      if(viewer&&!viewer.isDestroyed()){
        const rect=viewer.camera.computeViewRectangle();
        if(rect)savedView.current=[rect.west,rect.south,rect.east,rect.north];
        viewer.destroy();
      }
      map.current=null;
    };
  },[cases,savedView]);
  return <main className="case-overview" aria-label="案件總覽地圖">
    <div className="case-map-area">
      <div className="case-map-host" ref={host} aria-label="案件位置地圖" />
      <div className="case-map-markers">{markers.map(marker=>{
        const single=marker.items.length===1,item=marker.items[0];
        return <button key={marker.items.map(i=>i.key).join(',')} className={`case-map-marker ${single?'':'cluster'} ${single&&selected===item.key?'selected':''}`} style={{left:marker.x,top:marker.y}} title={marker.items.map(i=>i.title).join('\n')} aria-label={single?`選取案件 ${item.title}`:`放大 ${marker.items.length} 個案件`}
          onClick={()=>{if(single)choose(item);else{setNearby(marker.items);setSelected('');fit(marker.items);}}}>
          <span className="map-pin">{single?<MapPin size={19}/>:marker.items.length}</span>
          <span className="map-pin-label">{single?item.title:`${new Set(marker.items.map(i=>i.section)).size===1?item.title.split('｜')[0]:'鄰近案件'} · ${marker.items.length} 案`}</span>
        </button>;
      })}</div>
      <button className="case-map-fit" onClick={()=>{setNearby([]);fit(cases);}}><LocateFixed size={18}/>全部案件</button>
      <div className="case-map-legend"><i/>案件位置與地籍界線 <span>鄰近標記會聚合，點選可放大</span></div>
    </div>
    <aside className="case-overview-panel">
      <header><p className="case-eyebrow">LCT · DRONE SURVEY</p><h1>案件總覽</h1><p className="case-intro">先看位置，再進入現地模型。</p><span className="case-count">{cases.length} 個案件 · {cases.reduce((n,c)=>n+c.parcels.length,0)} 筆地號</span></header>
      <label className="case-map-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋地段或地號" aria-label="搜尋案件地段或地號"/></label>
      {query&&<div className="case-map-results">{matches.length?matches.map(item=><button key={item.key} onClick={()=>choose(item)}>{item.title}</button>):<p>沒有符合的案件</p>}</div>}
      {active?<section className="case-detail-card" aria-label="選取案件資訊">
        <span className="case-eyebrow">已選取案件</span><h2>{active.title}</h2>
        <dl><div><dt>拍攝日期</dt><dd>{active.date}</dd></div><div><dt>地號</dt><dd>{active.parcels.map(p=>p.info.parcelNo).join('、')}</dd></div></dl>
        <p className="case-help">{active.parcels.length>1?'同一案件內可直接切換地號，不重新飛回地球。':'此地號獨立顯示，不與其他分散地號合併。'}</p>
        <button className="case-enter" onClick={()=>onEnter(active.parcels[0].key)}>進入 3D 現地檢視<ArrowRight size={18}/></button>
      </section>:<section className="case-map-guidance"><MapPin size={30}/><h2>從地圖選一個案件</h2><p>拖曳移動、滾輪縮放。點選地圖標記後，可查看拍攝日期及案件地號。</p></section>}
      {nearby.length>0&&<section className="case-nearby"><h2>這個位置附近的案件</h2>{nearby.map(item=><button key={item.key} onClick={()=>choose(item)}>{item.title}<ArrowRight size={14}/></button>)}</section>}
      {error&&<p role="alert" className="case-map-error">地圖暫時無法顯示：{error}。仍可用搜尋選案。</p>}
      <p className="case-map-note">地圖用於案件定位；界線與占用判讀請進入 3D 查看。底圖不是本次無人機正射影像。</p>
    </aside>
  </main>;
}
