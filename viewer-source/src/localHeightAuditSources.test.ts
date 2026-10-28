import {afterEach,expect,it,vi} from 'vitest';
import {loadLocalHeightAuditReferences} from './localHeightAuditSources';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('never requests private audit inputs on non-loopback or normal builds',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  vi.stubEnv('VITE_LOCAL_HEIGHT_AUDIT','1');vi.stubGlobal('location',{hostname:'example.com'});
  await expect(loadLocalHeightAuditReferences()).rejects.toThrow('Local audit only');
  vi.stubGlobal('location',{hostname:'127.0.0.1'});vi.stubEnv('VITE_LOCAL_HEIGHT_AUDIT','0');
  await expect(loadLocalHeightAuditReferences()).rejects.toThrow('Local audit only');
  expect(fetcher).not.toHaveBeenCalled();
});
it('loads optional local inputs only when explicitly enabled and fails clearly if absent',async()=>{
  vi.stubEnv('VITE_LOCAL_HEIGHT_AUDIT','1');vi.stubGlobal('location',{hostname:'127.0.0.1'});
  const values=[[],{id:'synthetic',points:[]},{samples:[]}];
  const fetcher=vi.fn().mockImplementation(async()=>({ok:true,json:async()=>values.shift()}));
  vi.stubGlobal('fetch',fetcher);
  await expect(loadLocalHeightAuditReferences()).resolves.toEqual({sources:[],ion1007Source:{id:'synthetic',points:[]},ion1007Dem:{samples:[]}});
  expect(fetcher.mock.calls.map(call=>call[0])).toEqual([
    '/analysis/20261027-height-audit/control-pairs.json',
    '/analysis/20261028-height-audit/1007-ion-source.json',
    '/analysis/20261028-height-audit/1007-dem-reference.json'
  ]);
  fetcher.mockResolvedValue({ok:false});
  await expect(loadLocalHeightAuditReferences()).rejects.toThrow('Local audit source unavailable');
});
