import type {Point} from './types';

export default function ApproximateCoordinates({point}:{point:Point}){
  return <section className="coordinate-geographic" aria-label="概略經緯度">
    <strong>概略經緯度 · WGS84</strong>
    <dl><div><dt>緯度</dt><dd>{point.lat.toFixed(5)}°</dd></div><div><dt>經度</dt><dd>{point.lon.toFixed(5)}°</dd></div></dl>
    <small>{point.crs.includes('[2010]')?'僅供地圖參考，未套用坐標年代轉換':'供地圖參考，依點位座標換算'}</small>
  </section>;
}
