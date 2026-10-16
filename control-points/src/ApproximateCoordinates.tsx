import type {Point} from './types';
import CoordinatePair from './CoordinatePair';

export default function ApproximateCoordinates({point}:{point:Point}){
  return <section className="coordinate-geographic" aria-label="概略經緯度">
    <strong>概略經緯度 · WGS84</strong>
    <CoordinatePair lat={point.lat} lon={point.lon}/>
    <small>{point.crs.includes('[2010]')?'僅供地圖參考，未套用坐標年代轉換':'供地圖參考，依點位座標換算'}</small>
  </section>;
}
