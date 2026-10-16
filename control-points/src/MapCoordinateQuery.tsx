import {useState} from 'react';
import {X,Crosshair} from 'lucide-react';
import {mapCoordinates} from '../shared/mapCoordinateQuery.mjs';

export default function MapCoordinateQuery({position,onClose}:{position:{lon:number;lat:number};onClose:()=>void}){
  const [epsg,setEpsg]=useState(3826);
  const coordinates=mapCoordinates(position.lon,position.lat,epsg);
  return <section className="map-coordinate-query" aria-label="地圖位置座標" onKeyDown={e=>{if(e.key==='Escape')onClose();}}>
    <div className="section-heading"><h3><Crosshair size={16}/>地圖位置座標</h3><button className="icon-button" onClick={onClose} aria-label="關閉座標查詢"><X size={18}/></button></div>
    <select aria-label="查詢座標分帶" value={epsg} onChange={e=>setEpsg(Number(e.target.value))}><option value="3826">TWD97 / TM2 121 分帶</option><option value="3825">TWD97 / TM2 119 分帶</option></select>
    <dl><dt>N（m）</dt><dd>{coordinates.north==null?'無法換算':coordinates.north.toFixed(3)}</dd><dt>E（m）</dt><dd>{coordinates.east==null?'無法換算':coordinates.east.toFixed(3)}</dd><dt>緯度</dt><dd>{coordinates.lat.toFixed(5)}°</dd><dt>經度</dt><dd>{coordinates.lon.toFixed(5)}°</dd></dl>
    <p>地圖點選概略位置 · WGS84 換算<br/>供位置參考，非測量成果</p>
  </section>;
}
