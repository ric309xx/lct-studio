import proj4 from 'proj4';
import './coordinates.mjs';

export function mapCoordinates(lon,lat,epsg=3826){
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<-180||lon>180||lat<=-90||lat>=90)throw new Error('地圖位置不正確');
  if(![3826,3825].includes(epsg))throw new Error('請選擇 TWD97 分帶');
  try{
    const [east,north]=proj4('EPSG:4326',`EPSG:${epsg}`,[lon,lat]);
    if(Number.isFinite(east)&&Number.isFinite(north))return {lon,lat,east,north,epsg};
  }catch{}
  return {lon,lat,east:null,north:null,epsg};
}
