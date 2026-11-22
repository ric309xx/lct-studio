import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Axis,BoundingSphere,Cartesian3,ClippingPlane,ClippingPlaneCollection,Color,CustomDataSource,HeadingPitchRange,
  Math as CesiumMath,Matrix4,Model,Transforms,type Viewer,type Cesium3DTileset} from 'cesium';
import {ensureR2Access,GUKENG_R2_PROJECT,PRIVATE_R2_ORIGIN,privateR2Resource} from './r2Access';
import './gukeng.css';

export const GUKENG_VIEWER_PROJECT='gukeng-slope-20261019';
const root=`${PRIVATE_R2_ORIGIN}/projects/${GUKENG_R2_PROJECT}/tiles/`;
type Point=[number,number,number];
type Part='completed'|'unperformed';
type DocumentInfo={title:string;url:string;note?:string;preview_pages?:string[]};
type Manifest={transform:number[];metadata_url:string;partition_url:string;results_date:string;documents:Record<string,DocumentInfo>};
type Partition={completed:{title:string;area_m2:number;model_url:string};unperformed:{title:string;area_m2:number;model_url:string};
  boundaries:{completed_local_rings:Point[][];unperformed_local_rings:Point[][]};view_center_local:Point;note:string};
type Meta={origin_local:Point;basis_columns:number[][]};
type Display={context_bounds:Point[];context_extra_planes?:Array<{context_normal:Point;minimum:number}>;
  original_home_range_m:number;original_home_heading_degrees:number;original_home_pitch_degrees:number};
type Data={manifest:Manifest;partition:Partition;meta:Meta;display:Display};
const parts:Part[]=['completed','unperformed'];
const label:Record<Part,string>={completed:'已施作',unperformed:'應施作未施作'};
const format=(n:number)=>n.toLocaleString('zh-TW',{minimumFractionDigits:1,maximumFractionDigits:1});

// Only server-owned release paths are accepted. Credentials stay in request headers.
function resource(path:string){
  if(!/^\/(?:model|output)\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').some(x=>x==='.'||x==='..'))throw Error('成果檔案路徑不正確');
  return privateR2Resource(root+path.slice(1),GUKENG_R2_PROJECT);
}
async function getJSON<T>(path:string):Promise<T>{
  await ensureR2Access(GUKENG_R2_PROJECT);
  const data=await resource(path).fetchJson();if(!data)throw Error('成果資料尚未載入');return data as T;
}
function clippingPlanes(meta:Meta,display:Display){
  const u=meta.basis_columns.map(row=>row[0]);
  const axes=[u,[-u[1],u[0],0],[0,0,1]],dot=(a:number[],b:number[])=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const specs=axes.flatMap((axis,i)=>[
    {normal:axis,distance:-dot(axis,meta.origin_local)-display.context_bounds[0][i]},
    {normal:axis.map(x=>-x),distance:dot(axis,meta.origin_local)+display.context_bounds[1][i]}
  ]);
  for(const extra of display.context_extra_planes??[]){
    const n=axes[0].map((_,i)=>axes.reduce((sum,axis,j)=>sum+axis[i]*extra.context_normal[j],0)),length=Math.hypot(...n);
    specs.push({normal:n.map(x=>x/length),distance:(-dot(n,meta.origin_local)-extra.minimum)/length});
  }
  return specs.map(p=>new ClippingPlane(Cartesian3.fromArray(p.normal),p.distance));
}

export function GukengResults({viewer,tileset,ready,onBeforeFocus,registerReset}:{viewer:Viewer|null;tileset:Cesium3DTileset|null;ready:boolean;
  onBeforeFocus?:()=>void;registerReset?:(reset:(()=>boolean)|null)=>void}){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[mode,setMode]=useState<'original'|'underlying'>('original');
  const [selected,setSelected]=useState<Record<Part,boolean>>({completed:true,unperformed:true}),[busy,setBusy]=useState(false);
  const [pdf,setPdf]=useState<{url:string;title:string;filename:string;note?:string;pages:string[]}|null>(null),[reportBusy,setReportBusy]=useState(false);
  const sceneRef=useRef<{models:Map<Part,Model>;borders:CustomDataSource;transform:Matrix4;disposed:boolean}|null>(null);
  const alive=useRef(true),reportUrls=useRef<string[]>([]);
  const releaseReport=()=>{reportUrls.current.forEach(url=>URL.revokeObjectURL(url));reportUrls.current=[];};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;releaseReport();};},[]);

  const focus=(value:Data,part?:Part)=>{
    if(!viewer||viewer.isDestroyed())return;
    onBeforeFocus?.();const transform=Matrix4.fromArray(value.manifest.transform);
    const sphere=part?BoundingSphere.fromPoints(value.partition.boundaries[`${part}_local_rings`].flat().map(p=>Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(p),new Cartesian3()))):null;
    const target=sphere?.center??Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(value.partition.view_center_local),new Cartesian3());
    const display=value.display;
    viewer.camera.cancelFlight();
    viewer.camera.lookAt(target,new HeadingPitchRange(CesiumMath.toRadians(display.original_home_heading_degrees),
      CesiumMath.toRadians(display.original_home_pitch_degrees),Math.max(part?30:90,sphere?sphere.radius*3:display.original_home_range_m)*Math.max(1,1.2/viewer.canvas.clientWidth*viewer.canvas.clientHeight)));
    // Keep this local frame: left drag must orbit the slope, not Earth centre.
    viewer.scene.requestRender();
  };
  const front=()=>{
    if(!data||!viewer||viewer.isDestroyed())return;onBeforeFocus?.();viewer.camera.cancelFlight();
    const transform=Matrix4.fromArray(data.manifest.transform),center=Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(data.partition.view_center_local),new Cartesian3());
    const normal=Cartesian3.normalize(Matrix4.multiplyByPointAsVector(transform,Cartesian3.fromArray(data.meta.basis_columns.map(r=>r[2])),new Cartesian3()),new Cartesian3());
    const up=Cartesian3.normalize(Matrix4.multiplyByPointAsVector(transform,Cartesian3.fromArray(data.meta.basis_columns.map(r=>r[1])),new Cartesian3()),new Cartesian3());
    const range=65*Math.max(1,1.2/viewer.canvas.clientWidth*viewer.canvas.clientHeight);
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);viewer.camera.setView({destination:Cartesian3.add(center,Cartesian3.multiplyByScalar(normal,range,new Cartesian3()),new Cartesian3()),orientation:{direction:Cartesian3.negate(normal,new Cartesian3()),up}});
    viewer.camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(center));viewer.scene.requestRender();
  };
  const home=(value:Data)=>{setSelected({completed:true,unperformed:true});focus(value);};
  useEffect(()=>{
    if(!data||!viewer)return;registerReset?.(()=>{if(viewer.isDestroyed())return false;home(data);return true;});
    return()=>registerReset?.(null);
  },[data,viewer,registerReset]);
  useEffect(()=>{
    if(!ready||!viewer||!tileset||viewer.isDestroyed())return;
    setData(null);setMode('original');setError('');
    let disposed=false;let borders:CustomDataSource|null=null;
    void (async()=>{
      try{
        const manifest=await getJSON<Manifest>('/output/results-manifest.json');
        const [partition,meta,display]=await Promise.all([getJSON<Partition>(manifest.partition_url),getJSON<Meta>(manifest.metadata_url),getJSON<Display>('/output/display-settings.json')]);
        if(disposed||viewer.isDestroyed())return;
        const transform=Matrix4.fromArray(manifest.transform),clipOrigin=Transforms.eastNorthUpToFixedFrame(tileset.boundingSphere.center);
        tileset.clippingPlanes=new ClippingPlaneCollection({planes:clippingPlanes(meta,display),
          modelMatrix:Matrix4.multiply(Matrix4.inverse(clipOrigin,new Matrix4()),transform,new Matrix4()),unionClippingRegions:true,edgeWidth:0});
        borders=new CustomDataSource('gukeng-scope');await viewer.dataSources.add(borders);
        if(disposed||viewer.isDestroyed()){if(!viewer.isDestroyed())viewer.dataSources.remove(borders,true);return;}
        for(const part of parts)for(const ring of partition.boundaries[`${part}_local_rings`]){
          borders.entities.add({properties:{part},polyline:{positions:ring.map(p=>Matrix4.multiplyByPoint(transform,Cartesian3.fromArray(p),new Cartesian3())),
            width:3,material:Color.fromCssColorString(part==='completed'?'#26eb91':'#ffa72a'),depthFailMaterial:Color.fromCssColorString(part==='completed'?'#26eb91':'#ffa72a').withAlpha(.5)}});
        }
        const result={manifest,partition,meta,display};
        sceneRef.current={models:new Map(),borders,transform,disposed:false};setData(result);focus(result);
      }catch{if(!disposed)setError('古坑成果載入失敗，請重新載入或稍後重試。');}
    })();
    return()=>{disposed=true;const scene=sceneRef.current;if(scene){scene.disposed=true;sceneRef.current=null;}
      if(!viewer.isDestroyed()){for(const model of scene?.models.values()??[])viewer.scene.primitives.remove(model);if(borders)viewer.dataSources.remove(borders,true);}};
  },[viewer,tileset,ready]);

  useEffect(()=>{
    const scene=sceneRef.current;if(!scene||!viewer||viewer.isDestroyed()||!tileset||tileset.isDestroyed())return;
    tileset.show=mode==='original';for(const [key,model] of scene.models)model.show=mode==='underlying'&&selected[key];
    for(const entity of scene.borders.entities.values){const part=entity.properties?.part?.getValue() as Part;entity.show=selected[part];}
    viewer.scene.requestRender();
  },[mode,selected,data,viewer,tileset]);

  async function showMode(next:'original'|'underlying'){
    const scene=sceneRef.current;if(!data||!viewer||!scene||busy)return;
    setBusy(true);setError('');
    try{
      if(next==='underlying')for(const key of parts){
        if(scene.models.has(key))continue;
        await ensureR2Access(GUKENG_R2_PROJECT);
        const path=data.partition[key].model_url;
        if(!new RegExp('^/output/partition-\\d{8}-v\\d+/'+key+'\\.glb$').test(path))throw Error('分區模型路徑不正確');
        const model=await Model.fromGltfAsync({url:resource(path),modelMatrix:scene.transform,upAxis:Axis.Y,forwardAxis:Axis.X,
          incrementallyLoadTextures:false,environmentMapOptions:{enabled:false}});
        if(scene.disposed||viewer.isDestroyed()){model.destroy();return;}
        model.show=false;viewer.scene.primitives.add(model);scene.models.set(key,model);
      }
      if(!scene.disposed)setMode(next);
    }catch{if(!scene.disposed)setError('計算坡面載入失敗，保留原始模型，請重試。');}
    finally{if(alive.current)setBusy(false);}
  }
  async function openReport(doc:DocumentInfo){
    if(reportBusy)return;setReportBusy(true);setError('');
    try{
      if(!/^\/output\/pdf\/[A-Za-z0-9_-]+\.pdf$/.test(doc.url))throw Error('報告路徑不正確');
      const pagePaths=doc.preview_pages??[];
      if(pagePaths.length>40||pagePaths.some(path=>!/^\/output\/pdf\/preview\/[A-Za-z0-9_-]+\.(?:jpg|png|webp)$/.test(path)))throw Error('報告頁面路徑不正確');
      await ensureR2Access(GUKENG_R2_PROJECT);
      const paths=[doc.url,...pagePaths],buffers:ArrayBuffer[]=[];
      // Fetch small groups instead of starting every report page at once.
      for(let i=0;i<paths.length;i+=3){
        const chunk=await Promise.all(paths.slice(i,i+3).map(path=>resource(path).fetchArrayBuffer()));
        if(chunk.some(bytes=>!bytes))throw Error('報告尚未載入');buffers.push(...chunk as ArrayBuffer[]);
      }
      if(!alive.current)return;releaseReport();
      const urls=buffers.map((bytes,index)=>URL.createObjectURL(new Blob([bytes],{type:index===0?'application/pdf':paths[index].endsWith('.png')?'image/png':paths[index].endsWith('.webp')?'image/webp':'image/jpeg'})));
      reportUrls.current=urls;setPdf({url:urls[0],pages:urls.slice(1),filename:doc.url.split('/').pop()!,title:doc.title,note:doc.note});
    }catch(reason){if(alive.current){const status=(reason as {statusCode?:number})?.statusCode;setError(`成果報告載入失敗${Number.isInteger(status)?'（HTTP '+status+'）':''}，請重試。`);}}
    finally{if(alive.current)setReportBusy(false);}
  }
  function closePdf(){releaseReport();setPdf(null);}
  return <section className="setting-group gukeng-results" aria-label="古坑成果">
    <span className="setting-label">古坑噴凝土邊坡 · 2026/10/19</span>
    {!data&&!error&&<p role="status">{ready?'正在讀取坡面成果…':'模型載入後顯示坡面成果。'}</p>}
    {error&&<p role="alert">{error}</p>}
    {data&&<>
      <p className="overlay-hint">左鍵點選對焦 · 拖曳繞焦點旋轉 · 右鍵平移 · 滾輪縮放</p>
      <div className="segmented-control"><button type="button" aria-pressed={mode==='original'} className={mode==='original'?'active':''} disabled={busy} onClick={()=>void showMode('original')}>原始實景</button><button type="button" aria-pressed={mode==='underlying'} className={mode==='underlying'?'active':''} disabled={busy} onClick={()=>void showMode('underlying')}>{busy?'載入中…':'計算坡面'}</button></div>
      <button type="button" className="gukeng-focus" onClick={()=>home(data)}>回到坡面全景</button>
      <button type="button" className="gukeng-focus" onClick={front}>正視坡面</button>
      {parts.map(key=><div className={`gukeng-quantity ${key}`} key={key}><label><input type="checkbox" checked={selected[key]} onChange={e=>setSelected(old=>({...old,[key]:e.target.checked}))}/>{label[key]}</label><strong>{format(data.partition[key].area_m2)} <small>m²</small></strong><button type="button" className="gukeng-region-focus" onClick={()=>{setSelected({completed:key==='completed',unperformed:key==='unperformed'});focus(data,key);}}>查看{label[key]}範圍</button></div>)}
      <p className="overlay-hint">{data.partition.note} 成果日期：{data.manifest.results_date.replaceAll('-','/')}。</p>
      <div className="gukeng-reports">{Object.entries(data.manifest.documents).map(([key,doc])=><button type="button" key={key} disabled={reportBusy} onClick={()=>void openReport(doc)}>{reportBusy?'讀取報告中…':doc.title}</button>)}</div>
    </>}
    {pdf&&createPortal(<div className="gukeng-pdf-backdrop"><div className="gukeng-pdf" role="dialog" aria-modal="true" aria-label={pdf.title} onKeyDown={e=>{if(e.key==='Escape')closePdf();}}><header><strong>{pdf.title}</strong><a href={pdf.url} download={pdf.filename}>下載 PDF</a><button type="button" autoFocus onClick={closePdf}>關閉報告</button></header>{pdf.note&&<p>{pdf.note}</p>}{pdf.pages.length?<div className="gukeng-report-pages">{pdf.pages.map((url,index)=><figure key={url}><figcaption>第 {index+1} 頁／共 {pdf.pages.length} 頁</figcaption><img src={url} alt={`${pdf.title} 第 ${index+1} 頁`} loading="lazy"/></figure>)}</div>:<iframe title={pdf.title} src={pdf.url}/>}</div></div>,document.body)}
  </section>;
}
