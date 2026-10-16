import {useState} from 'react';
import {Copy,Check} from 'lucide-react';

export default function CoordinatePair({lat,lon}:{lat:number;lon:number}){
  const value=`${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const [feedback,setFeedback]=useState<{value:string;copied:boolean}|null>(null);
  const copied=feedback?.value===value&&feedback.copied;
  async function copy(){
    try{await navigator.clipboard.writeText(value);setFeedback({value,copied:true});}
    catch{setFeedback({value,copied:false});}
  }
  return <div className="coordinate-pair">
    <div><input aria-label="經緯度（緯度, 經度）" value={value} readOnly onFocus={e=>e.currentTarget.select()}/><button type="button" className="coordinate-copy" onClick={copy} aria-label="複製經緯度">{copied?<Check size={14}/>:<Copy size={14}/>}<span>{copied?'已複製':'複製'}</span></button></div>
    <small role="status">{feedback?.value===value?(copied?'已複製，可直接貼到 Google 地圖搜尋':'無法自動複製，請選取上方文字複製。'):'緯度, 經度 · 可直接貼到 Google 地圖搜尋'}</small>
  </div>;
}
