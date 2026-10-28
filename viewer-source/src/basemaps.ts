import {createWorldImageryAsync,IonWorldImageryStyle,OpenStreetMapImageryProvider,WebMapTileServiceImageryProvider,WebMercatorTilingScheme,Credit,Rectangle,type Viewer,type ImageryProvider} from 'cesium';

export type Basemap='aerial'|'road'|'nlsc';
export const DEFAULT_BASEMAP:Basemap='nlsc';
// NLSC GetCapabilities verified 2026-10-28: PHOTO2, image/jpeg,
// GoogleMapsCompatible matrices 0..19. Do not confuse PHOTO2 with DMAPS.
export const NLSC_PHOTO_OPTIONS={
  url:'https://wmts.nlsc.gov.tw/wmts/PHOTO2/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}',
  layer:'PHOTO2',style:'default',format:'image/jpeg',tileMatrixSetID:'GoogleMapsCompatible',maximumLevel:19
} as const;
export async function createBasemapProvider(choice:Basemap):Promise<ImageryProvider>{
  if(choice==='aerial')return createWorldImageryAsync({style:IonWorldImageryStyle.AERIAL});
  if(choice==='road')return new OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'});
  return new WebMapTileServiceImageryProvider({...NLSC_PHOTO_OPTIONS,
    tilingScheme:new WebMercatorTilingScheme(),rectangle:Rectangle.fromDegrees(117.89,21.41,122.38,26.46),
    credit:new Credit('<a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener noreferrer">內政部國土測繪中心・正射影像</a>',true)});
}
const requests=new WeakMap<Viewer,number>();
/** Keep the preceding layer beneath the new one so a tile failure can restore
 * it. At most two basemap layers remain; no camera/model/terrain mutations. */
export async function applyBasemap(viewer:Viewer,choice:Basemap,onTileFailure?:()=>void):Promise<void>{
  const request=(requests.get(viewer)??0)+1;requests.set(viewer,request);
  const provider=await createBasemapProvider(choice);
  if(viewer.isDestroyed()||requests.get(viewer)!==request)return;
  const layers=viewer.imageryLayers,previous=layers.length?layers.get(layers.length-1):null;
  const next=layers.addImageryProvider(provider);next.show=true;
  for(let i=layers.length-1;i>=0;i--){const layer=layers.get(i);if(layer!==next&&layer!==previous)layers.remove(layer,true);}
  let failed=false;
  const removeError=provider.errorEvent?.addEventListener(()=>{
    if(failed||viewer.isDestroyed()||requests.get(viewer)!==request)return;
    failed=true;removeError?.();
    if(previous&&layers.contains(previous)){layers.remove(next,true);previous.show=true;}
    onTileFailure?.();viewer.scene.requestRender();
  });
  viewer.scene.requestRender();
}
