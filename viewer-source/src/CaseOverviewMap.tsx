import {useEffect,useRef,useState} from 'react';
import {Cartesian3,Color,Ion,OpenStreetMapImageryProvider,Rectangle,SceneMode,Viewer} from 'cesium';
import {MapPin,LocateFixed,ArrowRight,Search,LoaderCircle} from 'lucide-react';
import {parseConfig} from './config';
import {caseMapBounds,clusterMapMarkers,type CaseOverviewItem,type MapMarker} from './caseOverview';
import {captureCaseMapCamera,isCaseMapCamera,type CaseMapNavigation,type CaseMapView} from './caseNavigation';
import {caseEntryMapBounds,type CaseEntryPhase,type CaseEntrySource} from './caseEntry';
import {ControlPointsLayer} from './ControlPointsLayer';
import {heightProfileForPath} from './heightReference';

type Props={cases:CaseOverviewItem[];initialKey?:string;onEnter:(parcelKey:string,source?:CaseEntrySource)=>void;savedView:{current:CaseMapView|null};savedNavigation:{current:CaseMapNavigation|null};entryPhase?:CaseEntryPhase|null;entryError?:string;onCancelEntry?:()=>void};
export function CaseOverviewMap({cases,initialKey,onEnter,savedView,savedNavigation,entryPhase,entryError,onCancelEntry}:Props){
  const [controlViewer,setControlViewer]=useState<Viewer|null>(null);
  const host=useRef<HTMLDivElement>(null),map=useRef<Viewer|null>(null);
  const [selected,setSelected]=useState(savedNavigation.current?.selected??initialKey??'');
  const [markers,setMarkers]=useState<MapMarker[]>([]);
  const [error,setError]=useState('');
  const [query,setQuery]=useState(savedNavigation.current?.query??'');
  const [nearby,setNearby]=useState<CaseOverviewItem[]>(()=>cases.filter(item=>savedNavigation.current?.nearbyKeys.includes(item.key)));
  const expandedKeysRef=useRef(savedNavigation.current?.expandedKeys??[]);
  const leavingRef=useRef(false);
  const entryRequestRef=useRef(0);
  const previousEntryPhase=useRef(entryPhase);
  const [preparing,setPreparing]=useState(false);
  const busy=!!entryPhase||preparing;
  const [expandedKeys,setExpandedKeys]=useState(expandedKeysRef.current);
  useEffect(()=>{savedNavigation.current={selected,query,nearbyKeys:nearby.map(item=>item.key),...(expandedKeys.length?{expandedKeys}:{})};},[selected,query,nearby,expandedKeys,savedNavigation]);
  const active=cases.find(c=>c.key===selected);
  useEffect(()=>{
    if(previousEntryPhase.current&&!entryPhase)leavingRef.current=false;
    previousEntryPhase.current=entryPhase;
  },[entryPhase]);
  const matches=query.trim()?cases.filter(c=>`${c.title} ${c.parcels.map(p=>p.info.parcelNo).join(' ')}`.includes(query.trim())):[];
  function fit(items:CaseOverviewItem[],duration=.65,detail=false){
    const viewer=map.current;if(!viewer)return;
    viewer.camera.flyTo({destination:Rectangle.fromDegrees(...caseMapBounds(items,detail)),duration});
  }
  function choose(item:CaseOverviewItem){setSelected(item.key);setNearby(items=>items.some(candidate=>candidate.key===item.key)?items:[]);setQuery('');fit([item],.65,expandedKeysRef.current.includes(item.key));}
  function enter(){
    if(!active||leavingRef.current||entryPhase)return;
    const viewer=map.current;
    if(viewer&&!viewer.isDestroyed()){
      viewer.camera.cancelFlight();
      savedView.current=captureCaseMapCamera(viewer.camera)??savedView.current;
    }
    // Commit the original map state BEFORE any transition or canvas teardown.
    savedNavigation.current={selected,query,nearbyKeys:nearby.map(item=>item.key),...(expandedKeys.length?{expandedKeys}:{})};
    leavingRef.current=true;
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    const finish=()=>{
      const rect=host.current?.getBoundingClientRect();
      const anchors=viewer&&rect?active.rings.flatMap(ring=>ring).filter((_,index,all)=>index%Math.max(1,Math.ceil(all.length/64))===0).flatMap(([longitude,latitude])=>{
        const p=viewer.scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(longitude,latitude));
        return p?[{longitude,latitude,x:p.x+rect.left,y:p.y+rect.top}]:[];
      }):[];
      // Alignment uses the fixed close view, while Back restores the original overview.
      const closeView=viewer?captureCaseMapCamera(viewer.camera):savedView.current;
      setPreparing(false);
      onEnter(active.parcels[0].key,{view:isCaseMapCamera(closeView)?closeView:null,anchors,reducedMotion});
    };
    if(!viewer||viewer.isDestroyed()){finish();return;}
    setPreparing(true);
    const request=++entryRequestRef.current;
    try{
      viewer.camera.flyTo({destination:Rectangle.fromDegrees(...caseEntryMapBounds(active,host.current?.clientWidth??0,host.current?.clientHeight??0)),duration:reducedMotion?0:.65,
        complete:()=>requestAnimationFrame(()=>{
          if(request!==entryRequestRef.current||viewer.isDestroyed())return;
          finish();
        }),
        cancel:()=>{if(request===entryRequestRef.current)cancelPreparation();}});
    }catch{cancelPreparation();setError('案件定位失敗，請重新進入');}
  }
  function cancelPreparation(){
    ++entryRequestRef.current;
    const viewer=map.current;
    if(viewer&&!viewer.isDestroyed()){
      viewer.camera.cancelFlight();
      if(isCaseMapCamera(savedView.current)){
        const p=savedView.current;viewer.camera.setView({destination:Cartesian3.fromRadians(p.longitude,p.latitude,p.span)});
      }
      viewer.scene.requestRender();
    }
    leavingRef.current=false;setPreparing(false);
  }
  useEffect(()=>{
    let viewer:Viewer|undefined,remove:undefined|(()=>void),removeMove:undefined|(()=>void),frame=0,previous='';
    try{
      Ion.defaultAccessToken=parseConfig(import.meta.env).accessToken;
      viewer=new Viewer(host.current!,{sceneMode:SceneMode.SCENE2D,animation:false,timeline:false,baseLayerPicker:false,baseLayer:false,geocoder:false,homeButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,sceneModePicker:false,navigationHelpButton:false,requestRenderMode:true});
      map.current=viewer;
      setControlViewer(viewer);
      viewer.imageryLayers.addImageryProvider(new OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));
      viewer.scene.backgroundColor=Color.fromCssColorString('#e0e6e1');
      for(const item of cases)for(const ring of item.rings){
        viewer.entities.add({polyline:{positions:Cartesian3.fromDegreesArray(ring.flat()),width:2,material:Color.fromCssColorString('#087e80')}});
      }
      if(isCaseMapCamera(savedView.current)){
        const p=savedView.current;viewer.camera.setView({destination:Cartesian3.fromRadians(p.longitude,p.latitude,p.span)});
      }else if(active){
        // Old rectangle snapshots may have been read from a detached canvas.
        // Recover the selected case rather than reopening the all-cases extent.
        fit([active],0,expandedKeysRef.current.includes(active.key));
      }else if(Array.isArray(savedView.current)){
        const [w,s,e,n]=savedView.current;viewer.camera.setView({destination:new Rectangle(w,s,e,n)});
      }else fit(nearby.length?nearby:cases,0);
      const remember=()=>{
        if(!leavingRef.current&&viewer&&!viewer.isDestroyed())savedView.current=captureCaseMapCamera(viewer.camera)??savedView.current;
      };
      removeMove=viewer.camera.moveEnd.addEventListener(remember);
      remember();
      const update=()=>{
        if(frame)return;
        frame=requestAnimationFrame(()=>{
          frame=0;if(!viewer||viewer.isDestroyed())return;
          const points=cases.flatMap(item=>{
            const p=viewer!.scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(item.longitude,item.latitude));
            return p&&p.x>=-40&&p.y>=-40&&p.x<=host.current!.clientWidth+40&&p.y<=host.current!.clientHeight+40?[{x:Math.round(p.x),y:Math.round(p.y),items:[item]}]:[];
          });
          // Always derive aggregation from the CURRENT screen scale. Selection
          // and previous drill-down affect camera/navigation, never exemptions.
          const grouped=clusterMapMarkers(points);
          const signature=JSON.stringify(grouped.map(g=>[g.x,g.y,g.items.map(i=>i.key)]));
          if(signature!==previous){previous=signature;setMarkers(grouped);}
        });
      };
      remove=viewer.scene.postRender.addEventListener(update);
      update();
    }catch(e){setError(e instanceof Error?e.message:'地圖無法載入');}
    return ()=>{
      ++entryRequestRef.current;
      cancelAnimationFrame(frame);remove?.();removeMove?.();
      if(viewer&&!viewer.isDestroyed()){
        viewer.destroy();
      }
      map.current=null;
      setControlViewer(null);
    };
  },[cases,savedView]);
  return <main className={`case-overview ${entryPhase?`case-entry-${entryPhase}`:preparing?'case-entry-positioning':''}`} aria-label="案件總覽地圖" aria-busy={busy} aria-hidden={entryPhase==='revealing'?true:undefined}>
    <div className="case-map-area">
      <div className="case-map-host" ref={host} aria-label="案件位置地圖" />
      <div className="case-map-markers">{markers.map(marker=>{
        const single=marker.items.length===1,item=marker.items[0];
        return <button disabled={busy} key={marker.items.map(i=>i.key).join(',')} className={`case-map-marker ${single?'':'cluster'} ${single&&selected===item.key?'selected':''}`} style={{left:marker.x,top:marker.y}} title={marker.items.map(i=>i.title).join('\n')} aria-label={single?`選取案件 ${item.title}`:`放大 ${marker.items.length} 個案件`}
          onClick={()=>{if(single)choose(item);else{
            const keys=marker.items.map(candidate=>candidate.key);
            // Remember only the close camera preference for this pair. It must
            // not bypass normal clustering when the user zooms back out.
            if(keys.length===2){expandedKeysRef.current=[...new Set([...expandedKeysRef.current,...keys])];setExpandedKeys(expandedKeysRef.current);}
            setNearby(marker.items);setSelected('');setQuery('');fit(marker.items,.65,true);map.current?.scene.requestRender();
          }}}>
          <span className="map-pin">{single?<MapPin size={19}/>:marker.items.length}</span>
          <span className="map-pin-label">{single?item.title:`${new Set(marker.items.map(i=>i.section)).size===1?item.title.split('｜')[0]:'鄰近案件'} · ${marker.items.length} 案`}</span>
        </button>;
      })}</div>
      <button disabled={busy} className="case-map-fit" onClick={()=>{expandedKeysRef.current=[];setExpandedKeys([]);setNearby([]);setSelected('');setQuery('');fit(cases);map.current?.scene.requestRender();}}><LocateFixed size={18}/>全部案件</button>
      <div className="case-map-legend"><i/>案件位置與地籍界線 <span>鄰近標記會聚合，點選可放大</span></div>
      {busy&&<div className="case-entry-progress" role="status" aria-live="polite"><LoaderCircle size={22}/><strong>正在準備現地模型</strong>{preparing?<button onClick={cancelPreparation}>取消進入</button>:entryPhase==='loading'&&onCancelEntry&&<button onClick={onCancelEntry}>取消進入</button>}</div>}
    </div>
    <aside className="case-overview-panel" inert={busy}>
      <header><p className="case-eyebrow">LCT · DRONE SURVEY</p><h1>案件總覽</h1><p className="case-intro">先看位置，再進入現地模型。</p><span className="case-count">{cases.length} 個案件 · {cases.reduce((n,c)=>n+c.parcels.length,0)} 筆地號</span></header>
      <ControlPointsLayer viewer={controlViewer} mode="map" disabled={busy} profileId={active?(active.parcels[0].key==='sanzuwu-jiushe-102-45'?'1007-ion-6000372':heightProfileForPath(active.parcels[0].tilesetPath)?.id):null}/>
      <label className="case-map-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋地段或地號" aria-label="搜尋案件地段或地號"/></label>
      {query&&<div className="case-map-results">{matches.length?matches.map(item=><button key={item.key} onClick={()=>choose(item)}>{item.title}</button>):<p>沒有符合的案件</p>}</div>}
      {active?<section className="case-detail-card" aria-label="選取案件資訊">
        <span className="case-eyebrow">已選取案件</span><h2>{active.title}</h2>
        <dl><div><dt>拍攝日期</dt><dd>{active.date}</dd></div><div><dt>地號</dt><dd>{active.parcels.map(p=>p.info.parcelNo).join('、')}</dd></div></dl>
        <p className="case-help">{active.parcels.length>1?'同一案件內可直接切換地號，不重新飛回地球。':'此地號獨立顯示，不與其他分散地號合併。'}</p>
        <button className="case-enter" onClick={enter} disabled={busy}>進入 3D 現地檢視<ArrowRight size={18}/></button>
      </section>:<section className="case-map-guidance"><MapPin size={30}/><h2>從地圖選一個案件</h2><p>拖曳移動、滾輪縮放。點選地圖標記後，可查看拍攝日期及案件地號。</p></section>}
      {nearby.length>0&&<section className="case-nearby"><h2>這個位置附近的案件</h2>{nearby.map(item=><button key={item.key} onClick={()=>choose(item)}>{item.title}<ArrowRight size={14}/></button>)}</section>}
      {error&&<p role="alert" className="case-map-error">地圖暫時無法顯示：{error}。仍可用搜尋選案。</p>}
      {entryError&&<p role="alert" className="case-map-error">{entryError}，已保留原案件與地圖位置，可重新進入。</p>}
      <p className="case-map-note">地圖用於案件定位；界線與占用判讀請進入 3D 查看。底圖不是本次無人機正射影像。</p>
    </aside>
  </main>;
}
