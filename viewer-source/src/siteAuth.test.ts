import {readFileSync} from "node:fs";
import {beforeEach, afterEach, it, expect, vi} from "vitest";
const script = readFileSync("../3d-viewer/site-auth.js","utf8");
const key = "lct-site-cadastral-session-v1";
const project = "taoyuan-20261006";
const data = () => ({project,role:"admin",sessionToken:"test-session",sessionExpiresAt:Date.now()/1000+43200,token:"test-read",expiresAt:Date.now()/1000+3600});
const auth = () => (window as any).LCT_SITE_AUTH;
beforeEach(()=>{sessionStorage.clear();localStorage.clear();delete window.LCT_SITE_AUTH;});
afterEach(()=>vi.unstubAllGlobals());
it("stores only a scoped session, not the password or short read token",async()=>{
  const fetch = vi.fn().mockResolvedValue({ok:true,json:async()=>data()});vi.stubGlobal("fetch",fetch);
  window.eval(script);
  await auth().login("synthetic-password","admin");
  expect(fetch.mock.calls[0][1].credentials).toBe("omit");
  expect(sessionStorage.getItem(key)).not.toMatch(/synthetic-password|test-read/);
  expect(localStorage.length).toBe(0);
  expect(auth().getAccess(project).token).toBe("test-read");
  window.eval(script); // Reload: verify session with server; deduplicate parallel tiles.
  await Promise.all([auth().restore(),auth().restore(),auth().restore()]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toMatch(/site-access\/refresh$/);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer test-session");
});
it("rejects expired sessions without fetching and clears them",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  sessionStorage.setItem(key,JSON.stringify({...data(),sessionExpiresAt:1}));window.eval(script);
  await expect(auth().restore()).rejects.toThrow("已過期");
  expect(fetch).not.toHaveBeenCalled();expect(sessionStorage.getItem(key)).toBeNull();
});
it("clears a server-rejected session but preserves it for retry on network errors",async()=>{
  sessionStorage.setItem(key,JSON.stringify(data()));window.eval(script);
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(Error("offline")));
  await expect(auth().restore()).rejects.toThrow("網路");expect(sessionStorage.getItem(key)).not.toBeNull();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:401,json:async()=>({error:"expired"})}));
  await expect(auth().restore()).rejects.toThrow("expired");expect(sessionStorage.getItem(key)).toBeNull();
});
it("rejects cross-project and overlong token responses",async()=>{
  window.eval(script);
  for(const response of [{...data(),project:"other"},{...data(),expiresAt:Date.now()/1000+7200}]) {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>response}));
    await expect(auth().login("synthetic","admin")).rejects.toThrow("回應不正確");
    expect(sessionStorage.getItem(key)).toBeNull();
  }
});
