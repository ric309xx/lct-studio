import {sourceAttributes} from './attributes.mjs';
import {datasetYear} from './datasets.mjs';
import {fieldCapture,coordinateQuality} from './fieldPoints.mjs';
export const recordCategory=value=>value==='環境照'?'環境':value;
export function recordPhotos(attachments){return attachments.filter(a=>a.mime.startsWith('image/')&&!/heic|heif/.test(a.mime)).slice().sort((a,b)=>a.filename.localeCompare(b.filename,'zh-TW',{numeric:true})||a.id.localeCompare(b.id));}
export function defaultRecordPhotos(attachments){const photos=recordPhotos(attachments);return [...photos.filter(a=>recordCategory(a.category)==='近照').slice(0,1),...photos.filter(a=>recordCategory(a.category)==='遠照').slice(0,4)].map(a=>a.id);}
export function recordFields(point,dataset){
 const n=(v,d=3)=>v==null?'未提供':Number(v).toLocaleString('en-US',{useGrouping:false,minimumFractionDigits:d,maximumFractionDigits:d});
 const year=datasetYear(dataset||{id:point.dataset_id});
 const notes=point.notes?.replace(/座標系統待確認（暫以 TWD97 \/ TM2 121 分帶顯示）；原註記：確認座標系統/g,'坐標系統待確認')||'無';
 return [['點號',point.code],...(fieldCapture(point)?[['坐標品質',coordinateQuality(point)]]:[]),['成果年份',year?`民國 ${year} 年`:'未提供'],['點位分類',point.category||'未提供'],['坐標系統',`${point.crs}（EPSG:${point.epsg}）`],[point.epsg===4326?'緯度（°）':'N 縱坐標（m）',n(point.north,point.epsg===4326?7:3)],[point.epsg===4326?'經度（°）':'E 橫坐標（m）',n(point.east,point.epsg===4326?7:3)],[`${point.height_type||'高度'}（m）`,n(point.height,point.dataset_id==='leveling-109'?5:3)],['高程基準',point.height_datum||'待確認'],['地圖經緯度',`${Number(point.lat).toFixed(8)}, ${Number(point.lon).toFixed(8)}`],['備註',notes]];
}
export function recordImageLayout(width,height){const rotate=height>width;const scale=Math.min(1,1600/Math.max(width,height));return {rotate,width:Math.round((rotate?height:width)*scale),height:Math.round((rotate?width:height)*scale)};}
export const recordAttributes=point=>sourceAttributes(point.raw).map(a=>[a.label,a.text]);
export function mapPixel(lon,lat,zoom){if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<-180||lon>180||lat<-85||lat>85)throw new Error('點位經緯度無法繪圖');const size=256*2**zoom,sin=Math.sin(lat*Math.PI/180);return [(lon+180)/360*size,(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size];}
export const escapeRecord=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const recordFilename=code=>`點之記_${String(code).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}`;
