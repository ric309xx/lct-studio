import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {ensureR2Access,privateR2Resource,PRIVATE_R2_ORIGIN,TAOYUAN_R2_PROJECT,R2AuthorizationRequired} from "./r2Access";
import type {Resource} from "cesium";
// Internal Cesium helper is exercised at runtime but omitted from its public d.ts.
const retry=(resource:Resource,statusCode:number)=>(resource as Resource & {retryOnError(error:{statusCode:number}):Promise<boolean>}).retryOnError({statusCode});
// Use the real Cesium Resource: derived tiles must inherit authenticated retries.
const project=TAOYUAN_R2_PROJECT,url=`${PRIVATE_R2_ORIGIN}/projects/${project}/tiles/tileset.json`;
let current={project,role:"admin" as const,token:"test-read",expiresAt:Date.now()/1000+3600};
beforeEach(()=>{
  current={...current,token:"test-read"};
  window.LCT_SITE_AUTH={login:vi.fn(),clear:vi.fn(),getAccess:id=>id===project?current:null,
    restore:vi.fn(async()=>{current={...current,token:"renewed-read"};return current;})};
});
afterEach(()=>{delete window.LCT_SITE_AUTH;vi.restoreAllMocks();});
it("never falls back to anonymous loading without website authentication",async()=>{
  delete window.LCT_SITE_AUTH;
  await expect(ensureR2Access()).rejects.toThrow(R2AuthorizationRequired);
  expect(()=>privateR2Resource(url,project)).toThrow(R2AuthorizationRequired);
});
it("automatically reuses website authentication without any popup",async()=>{
  const open=vi.spyOn(window,"open");await ensureR2Access();await ensureR2Access();
  expect(open).not.toHaveBeenCalled();
  expect(privateR2Resource(url,project).headers.Authorization).toBe("Bearer renewed-read");
  await expect(ensureR2Access("nanya")).rejects.toThrow("專案不允許");
  expect(()=>privateR2Resource("https://evil.test/tileset.json",project)).toThrow("網址與授權專案不符");
});
it("derived tile 401 renews and retries once; other status codes do not renew",async()=>{
  const root=privateR2Resource(url,project),tile=root.getDerivedResource({url:"Block/a.b3dm"});
  expect(tile.headers.Authorization).toBe("Bearer test-read");
  expect(await retry(tile,401)).toBe(true);
  expect(tile.headers.Authorization).toBe("Bearer renewed-read");
  expect(await retry(tile,401)).toBe(false);
  const other=root.getDerivedResource({url:"Block/b.b3dm"});
  expect(await retry(other,404)).toBe(false);
  expect(window.LCT_SITE_AUTH!.restore).toHaveBeenCalledOnce();
});
it("stale concurrent tiles reuse an already renewed token; never renew for another origin",async()=>{
  const root=privateR2Resource(url,project);
  current={...current,token:"renewed-elsewhere"};
  expect(await retry(root,401)).toBe(true);
  expect(root.headers.Authorization).toBe("Bearer renewed-elsewhere");
  expect(window.LCT_SITE_AUTH!.restore).not.toHaveBeenCalled();
  const unsafe=privateR2Resource(url,project).getDerivedResource({url:"https://evil.test/a.b3dm"});
  expect(await retry(unsafe,401)).toBe(false);
});
