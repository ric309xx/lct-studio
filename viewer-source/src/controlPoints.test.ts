import {afterEach,expect,it,vi} from 'vitest';
import {Cartographic} from 'cesium';
import {webcrypto} from 'node:crypto';
import {Blob as NodeBlob} from 'node:buffer';
import {parseControlCatalog,controlPointPosition,loadControlCatalog,loadControlPhoto,type ControlCatalog,type ControlPoint} from './controlPoints';
import type {HeightResolution} from './heightReference';
const auth=vi.hoisted(()=>({ensure:vi.fn(),resource:vi.fn()}));
vi.mock('./r2Access',()=>({ensureR2Access:auth.ensure,privateR2Resource:auth.resource,PRIVATE_R2_ORIGIN:'https://private.example',TAOYUAN_R2_PROJECT:'taoyuan-20261006'}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks();auth.ensure.mockReset();});
export const samplePoint=():ControlPoint=>({id:'1006:TEST',profileId:'1006',code:'TEST',originalCode:'TEST',kind:'control',east:250000,north:2765777.5636462052,orthometric:130,crs:'EPSG:3826',verticalDatum:'TWVD2001',source:'test/AT/gcp_points.json',sourceSha256:'a'.repeat(64),photoNote:'待補',photos:[]});
const catalog=():ControlCatalog=>({schemaVersion:1,projectId:'taoyuan-building-overlay',revision:'test',points:[samplePoint()]});
it('preserves source fields and distinct model identities while rejecting conflicting or malformed catalogs',()=>{
  const c=catalog();c.points.push({...samplePoint(),id:'1010-cl2:TEST',profileId:'1010-cl2'});
  expect(parseControlCatalog(c)).toBe(c);
  for(const change of [{projectId:'another-project'},{schemaVersion:2},{points:[samplePoint(),samplePoint()]}])expect(()=>parseControlCatalog({...c,...change})).toThrow();
  for(const change of [{verticalDatum:'unknown'},{east:NaN},{profileId:'other'},{sourceSha256:'bad'},{orthometric:Infinity}])expect(()=>parseControlCatalog({...catalog(),points:[{...samplePoint(),...change}]})).toThrow();
});
it('only converts display height for a matching verified model and keeps public H untouched',()=>{
  const p=samplePoint(),r:HeightResolution={profileId:'1006',revision:'test',sourceDatum:'TWVD2001',status:'converted-local-controls',undulationM:19.6555,appliedOffsetM:19.6555,reason:'test'};
  expect(Cartographic.fromCartesian(controlPointPosition(p,'model',r)!).height).toBeCloseTo(149.6555,5);expect(p.orthometric).toBe(130);
  expect(controlPointPosition(p,'model',{...r,profileId:'1013'})).toBeNull();expect(controlPointPosition(p,'model',{...r,status:'pending'})).toBeNull();
  expect(Cartographic.fromCartesian(controlPointPosition(p,'map',null)!).height).toBeCloseTo(0,5);
});
it('requires authorization even for the loopback-only local preview package',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>catalog()});vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('window',{location:{hostname:'127.0.0.1'}});
  await loadControlCatalog();expect(auth.ensure).toHaveBeenCalledOnce();expect(fetcher.mock.calls[0][0]).toBe('/.local/private-control-points/taoyuan-building-overlay/catalog.json');
  auth.ensure.mockRejectedValueOnce(Error('expired'));await expect(loadControlCatalog()).rejects.toThrow('expired');expect(fetcher).toHaveBeenCalledOnce();
});
it('uses the authenticated same-project private resource in production, never a public catalog',async()=>{
  vi.stubGlobal('window',{location:{hostname:'viewer.example'}});auth.resource.mockReturnValue({fetchJson:async()=>catalog()});
  await loadControlCatalog();expect(auth.resource).toHaveBeenCalledWith('https://private.example/projects/taoyuan-20261006/tiles/controls/v1/catalog.json','taoyuan-20261006');
});
it('validates source photo bytes and rejects arbitrary paths or mismatched content',async()=>{
  vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('window',{location:{hostname:'localhost'}});
  const bytes=new TextEncoder().encode('synthetic-photo'),digest=[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const photo={path:`photos/${digest}.jpg`,sha256:digest,filename:'test.jpg',category:'近照',source:'test.csv',capturedAt:null};
  const fetcher=vi.fn().mockResolvedValue({ok:true,blob:async()=>new NodeBlob([bytes],{type:'image/jpeg'})});vi.stubGlobal('fetch',fetcher);
  expect(await loadControlPhoto(photo)).toBeDefined();
  await expect(loadControlPhoto({...photo,path:'https://other.example/photo.jpg'})).rejects.toThrow();expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockResolvedValueOnce({ok:true,blob:async()=>new NodeBlob(['changed'],{type:'image/jpeg'})});await expect(loadControlPhoto(photo)).rejects.toThrow('校驗');
});
