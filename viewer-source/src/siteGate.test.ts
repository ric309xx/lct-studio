import {readFileSync} from "node:fs";
import {beforeEach, afterEach, it, expect, vi} from "vitest";
const script=readFileSync("../3d-viewer/access-gate.js","utf8");
const config=(role="admin",projectId="taoyuan-building-overlay")=>({role,projectId,accessId:"test",passwordHash:"not-a-server-credential"});
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
beforeEach(()=>{
  vi.useFakeTimers();sessionStorage.clear();
  document.head.innerHTML="";document.body.innerHTML='<div id="access-gate"><form id="access-form"><input id="access-password"><button type="submit">登入</button></form><p id="access-error"></p><button id="toggle-password"></button></div>';
  (window as any).LCT_VIEWER_ACCESS=config();
});
afterEach(()=>{vi.useRealTimers();delete window.LCT_SITE_AUTH;});
it("one website form authenticates server-side, clears the password and opens viewer",async()=>{
  const login=vi.fn().mockResolvedValue({role:"admin"});
  (window as any).LCT_SITE_AUTH={login,hasSavedSession:()=>false};window.eval(script);
  const input=document.querySelector<HTMLInputElement>("input")!;input.value="synthetic-admin";
  document.querySelector("form")!.dispatchEvent(new Event("submit",{cancelable:true}));await tick();
  expect(login).toHaveBeenCalledWith("synthetic-admin","admin");
  expect(input.value).toBe("");expect(document.querySelector("script[data-viewer-app]")).not.toBeNull();
  expect(sessionStorage.getItem("lct-3d-viewer-role")).toBe("admin");
});
it("refresh verifies the saved admin session and opens without submitting a password",async()=>{
  const restore=vi.fn().mockResolvedValue({role:"admin"});
  (window as any).LCT_SITE_AUTH={restore,hasSavedSession:()=>true};window.eval(script);await tick();
  expect(restore).toHaveBeenCalledOnce();expect(document.querySelector("script[data-viewer-app]")).not.toBeNull();
});
it("a rejected session never opens the viewer",async()=>{
  (window as any).LCT_SITE_AUTH={restore:vi.fn().mockRejectedValue(Error("expired")),hasSavedSession:()=>true};
  window.eval(script);await tick();expect(document.querySelector("script[data-viewer-app]")).toBeNull();
  expect(document.querySelector("#access-error")!.textContent).toBe("expired");
});
it("viewer sessions cannot restore into the admin gate",async()=>{
  (window as any).LCT_SITE_AUTH={restore:vi.fn().mockResolvedValue({role:"viewer"}),hasSavedSession:()=>true};
  window.eval(script);await tick();expect(document.querySelector("script[data-viewer-app]")).toBeNull();
});
it("unrelated project shares retain their existing local gate",async()=>{
  (window as any).LCT_VIEWER_ACCESS=config("viewer","sanxia-solar-2");delete window.LCT_SITE_AUTH;
  window.eval(script);await tick();
  expect(document.querySelector('script[src*="site-auth"]')).toBeNull();
});
