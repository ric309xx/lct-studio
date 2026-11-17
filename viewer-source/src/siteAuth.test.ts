import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const script=readFileSync(process.env.LCT_PROJECT_ROOT+'/3d-viewer/site-auth.js','utf8');
const original=window.LCT_VIEWER_BOOTSTRAP;
const data=()=>({...original!,role:'admin',access:{accessId:'admin',role:'admin'},r2:{project:'taoyuan-20261006',role:'admin',token:'synthetic-read',expiresAt:Date.now()/1000+600},sessionExpiresAt:Date.now()/1000+3600});
const auth=()=>window.LCT_SITE_AUTH!;
beforeEach(()=>{sessionStorage.clear();(window as any).LCT_VIEWER_ACCESS={accessId:'admin',role:'admin'};delete window.LCT_SITE_AUTH;});
afterEach(()=>{vi.unstubAllGlobals();window.LCT_VIEWER_BOOTSTRAP=original;});
it('只儲存 UI 提示且以同源 Cookie 還原',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>data()});vi.stubGlobal('fetch',fetch);window.eval(script);
 await auth().login('synthetic-password','admin');expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
 expect(sessionStorage.getItem('lct-viewer-ui-v3')).not.toMatch(/synthetic-password|synthetic-read|sessionToken/);
 window.eval(script);await Promise.all([auth().restore(),auth().restore()]);expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
});
it('伺服器拒絕後清除目錄與記憶體授權',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:'expired'})}));window.eval(script);
 await expect(auth().restore()).rejects.toThrow('expired');expect(window.LCT_VIEWER_BOOTSTRAP).toBeUndefined();
});
it('含長效 bearer 或過期的回應不能開啟 Viewer',async()=>{
 window.eval(script);for(const body of [{...data(),sessionToken:'must-not-enter-js'},{...data(),sessionExpiresAt:1}]){
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>body}));await expect(auth().login('synthetic','admin')).rejects.toThrow('回應不正確');
 }
});
it('登出期間完成的舊請求不能恢復授權',async()=>{
 let finish:any;const pending=new Promise(resolve=>{finish=resolve;});
 vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>pending).mockResolvedValue({ok:true,json:async()=>({ok:true})}));window.eval(script);
 const restoring=auth().restore();auth().clear();finish({ok:true,json:async()=>data()});await expect(restoring).rejects.toThrow('登入狀態已變更');
});
