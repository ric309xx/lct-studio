import {beforeEach,expect,it,vi} from 'vitest';
import type {Viewer} from 'cesium';
const mock=vi.hoisted(()=>({nlsc:vi.fn(),aerial:vi.fn(),road:vi.fn()}));
vi.mock('cesium',()=>({
  createWorldImageryAsync:(...args:unknown[])=>mock.aerial(...args),IonWorldImageryStyle:{AERIAL:'aerial'},
  OpenStreetMapImageryProvider:class{constructor(options:unknown){mock.road(options);}},
  WebMapTileServiceImageryProvider:class{errorEvent={addEventListener:vi.fn()};constructor(options:unknown){mock.nlsc(options);}},
  WebMercatorTilingScheme:class{},Credit:class{constructor(public html:string,public showOnScreen:boolean){}},Rectangle:{fromDegrees:(...values:number[])=>values}
}));
import {applyBasemap,createBasemapProvider,DEFAULT_BASEMAP} from './basemaps';
function fixture(){const values:unknown[]=[{name:'old'}];const layers={get length(){return values.length;},get:(i:number)=>values[i],addImageryProvider:vi.fn((provider)=>{const l={provider,show:false};values.push(l);return l;}),remove:vi.fn((l)=>{values.splice(values.indexOf(l),1);}),contains:(l:unknown)=>values.includes(l)};return {values,viewer:{isDestroyed:()=>false,imageryLayers:layers,scene:{requestRender:vi.fn()}} as unknown as Viewer};}
beforeEach(()=>vi.clearAllMocks());
it('defaults to NLSC orthophoto rather than world imagery',()=>{expect(DEFAULT_BASEMAP).toBe('nlsc');});
it('uses the verified NLSC PHOTO2 WMTS matrix and visible credit, not cadastral tiles',async()=>{
  await createBasemapProvider('nlsc');const options=mock.nlsc.mock.calls[0][0];
  expect(options.layer).toBe('PHOTO2');expect(options.format).toBe('image/jpeg');expect(options.maximumLevel).toBe(19);
  expect(options.tileMatrixSetID).toBe('GoogleMapsCompatible');expect(options.url).toContain('/PHOTO2/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}');
  expect(options.credit.html).toContain('國土測繪中心');expect(options.credit.showOnScreen).toBe(true);
});
it('preserves the preceding layer and restores it on tile failure without changing camera or terrain',async()=>{
  const {values,viewer}=fixture(),previous=values[0],failure=vi.fn();
  await applyBasemap(viewer,'nlsc',failure);expect(values).toHaveLength(2);
  const provider=(values[1] as {provider:{errorEvent:{addEventListener:ReturnType<typeof vi.fn>}}}).provider;
  provider.errorEvent.addEventListener.mock.calls[0][0]();
  expect(values).toEqual([previous]);expect(failure).toHaveBeenCalledOnce();expect(viewer.scene.requestRender).toHaveBeenCalled();
});
it('retains the current layer if provider construction fails and discards outdated asynchronous requests',async()=>{
  const {values,viewer}=fixture();mock.aerial.mockRejectedValueOnce(Error('offline'));
  await expect(applyBasemap(viewer,'aerial')).rejects.toThrow('offline');expect(values).toHaveLength(1);
  let finish!:(p:unknown)=>void;mock.aerial.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const pending=applyBasemap(viewer,'aerial');await applyBasemap(viewer,'nlsc');finish({});await pending;
  expect(values).toHaveLength(2);expect(mock.nlsc).toHaveBeenCalledOnce();
});
it('never accumulates more than the selected layer and its fallback',async()=>{
  const {values,viewer}=fixture();await applyBasemap(viewer,'nlsc');await applyBasemap(viewer,'road');await applyBasemap(viewer,'nlsc');
  expect(values).toHaveLength(2);expect(mock.road).toHaveBeenCalledWith({url:'https://tile.openstreetmap.org/'});
});
