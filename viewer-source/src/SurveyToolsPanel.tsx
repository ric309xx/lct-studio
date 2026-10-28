import {useEffect,useRef,useState} from 'react';
import {Ruler} from 'lucide-react';
import type {Cesium3DTileset,Viewer} from 'cesium';
import {resolvedTilesetHeight,type HeightResolution} from './heightReference';
import {coordinateText,surveyCoordinate,type DistanceResult,type DistanceSummary,type SurveyCoordinate} from './surveyMeasurement';
import {selectSurveyPoint,type SurveySelection} from './surveyPicking';
import './surveyTools.css';

type Props={viewer:Viewer|null;models:()=>readonly Cesium3DTileset[];resolution:HeightResolution|null;ready:boolean;
  active:boolean;blocked?:boolean;onModeChange?:(active:boolean)=>void;pointCount:number;draft:DistanceSummary|null;results:DistanceResult[];notice:string;
  onStart:()=>void;onUndo:()=>void;onFinish:()=>void;onCancel:()=>void;onClear:()=>void};
const meters=(n:number|null)=>n===null?'待確認':`${n.toFixed(2)} m`;
function DistanceValues({value}:{value:DistanceSummary}){
  return <dl className="survey-distance-values">
    <div><dt>{value.pointCount>2?'三維折線':'三維直線'}</dt><dd>{meters(value.spatialM)}</dd></div>
    <div><dt>平面距離</dt><dd>{meters(value.gridM)}</dd></div>
    <div><dt>端點高差（末－首）</dt><dd>{value.heightDifferenceM>=0?'+':''}{meters(value.heightDifferenceM)}</dd></div>
  </dl>;
}
export function SurveyToolsPanel(props:Props){
  const [expanded,setExpanded]=useState(false),[point,setPoint]=useState<SurveyCoordinate|null>(null),[pickNotice,setPickNotice]=useState(''),[copyNotice,setCopyNotice]=useState('');
  const selection=useRef<SurveySelection|null>(null),blocked=useRef(false);
  blocked.current=Boolean(props.blocked||props.active);
  useEffect(()=>{
    props.onModeChange?.(expanded&&props.ready&&!props.blocked&&!props.active);
    return ()=>props.onModeChange?.(false);
  },[expanded,props.ready,props.blocked,props.active,props.onModeChange]);
  useEffect(()=>{
    setPoint(null);setPickNotice('');setCopyNotice('');
    if(!expanded||!props.ready||!props.viewer||props.viewer.isDestroyed())return;
    const controller=selectSurveyPoint(props.viewer,props.models,p=>{
      if(!p){setPickNotice('未命中模型，請點選屋頂、牆面或路面；原選點不變。');return;}
      const coordinate=surveyCoordinate(p.position,p.source,p.model?resolvedTilesetHeight(p.model):null);
      if(!coordinate)return;
      setPoint(coordinate);setPickNotice('');setCopyNotice('');
    },()=>!blocked.current);
    selection.current=controller;
    return ()=>{controller.dispose();if(selection.current===controller)selection.current=null;};
  },[expanded,props.ready,props.viewer,props.models,props.resolution]);
  const clearPoint=()=>{selection.current?.clear();setPoint(null);setPickNotice('');setCopyNotice('');};
  const copy=async()=>{if(!point)return;try{await navigator.clipboard.writeText(coordinateText(point));setCopyNotice('座標已複製（緯度,經度）');}catch{setCopyNotice('複製失敗，請手動選取座標文字');}};
  return <div className="survey-tools" role="group" aria-label="座標與量距工具">
    <button type="button" className="survey-tools-toggle" aria-expanded={expanded} aria-controls="survey-tools-body" onClick={()=>setExpanded(v=>!v)}><Ruler size={20} aria-hidden="true"/><span>座標與量距</span></button>
    <section id="survey-tools-body" className="survey-tools-body" aria-label="座標與量距面板" hidden={!expanded}>
      <p className="survey-grid-name">TWD97 / TM2 121 · EPSG:3826</p>
      <div className="survey-coordinate" aria-label="選取點座標">
        {point?<><p>已固定選點 · {point.source==='model'?'模型表面':'背景地形（僅供參考）'}</p>
          <dl><div><dt>E 東座標</dt><dd>{meters(point.easting)}</dd></div><div><dt>N 北座標</dt><dd>{meters(point.northing)}</dd></div>
            <div><dt>H 正高</dt><dd>{meters(point.height)}</dd></div></dl>
          <small>經度 {point.longitude.toFixed(7)}° · 緯度 {point.latitude.toFixed(7)}°</small>
          {point.height===null&&<small>未驗證高程基準，或未命中模型，不提供正高讀值。</small>}
        </>:<p>{props.ready?'點一下模型表面固定座標，藍色圓點會標示選取位置；再點另一處即可更新。':'模型載入後可選取座標及量距。'}</p>}
      </div>
      <button type="button" onClick={()=>void copy()} disabled={!point} title="緯度,經度，小數 8 位，可貼入 Google 地圖搜尋">複製座標</button>
      {' '}<button type="button" onClick={clearPoint} disabled={!point}>清除選點</button>
      {pickNotice&&<p role="status">{pickNotice}</p>}
      {copyNotice&&<p role="status">{copyNotice}</p>}
      <div className="survey-measure-actions">
        {props.active?<><button type="button" onClick={props.onUndo} disabled={!props.pointCount}>撤銷一點</button><button type="button" onClick={props.onCancel}>取消</button><button type="button" className="primary" onClick={props.onFinish} disabled={props.pointCount<2}>完成量距</button></>
          :<button type="button" className="primary" onClick={props.onStart} disabled={!props.ready||props.results.length>=3}>開始量距離 {props.results.length}/3</button>}
        {props.results.length>0&&<button type="button" onClick={props.onClear}>清除量測</button>}
      </div>
      {props.active&&<p role="status">依序點選模型，已選 {props.pointCount} 點；按「完成量距」結束。</p>}
      {props.active&&props.draft&&<DistanceValues value={props.draft}/>}
      {props.results.length>0&&<div className="survey-distance-results" aria-label="距離量測結果">{props.results.map(value=><section key={value.id}><strong>距離 {value.id}</strong><DistanceValues value={value}/></section>)}</div>}
      {props.notice&&<p className="survey-measure-notice">{props.notice}</p>}
      <small>平面距離為 TWD97 格網累計；三維距離為選點間直線累計，不是貼地表長度。沿用模型定位，未做坐標曆元轉換；模型讀值，非實測成果。</small>
    </section>
  </div>;
}
