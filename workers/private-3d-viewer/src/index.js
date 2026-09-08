const COOKIE_NAME = "lct_3d_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MODEL_PREFIX = "20260810/terra_b3dms/";

const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
};

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: "unhandled_error",
        message: error instanceof Error ? error.message : String(error)
      }));
      return textResponse("服務暫時無法使用，請稍後再試。", 500);
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const session = await readSession(request, env);

  if (request.method === "POST" && url.pathname === "/login") {
    return handleLogin(request, env);
  }

  if (request.method === "POST" && url.pathname === "/logout") {
    return new Response(null, {
      status: 303,
      headers: withSecurityHeaders({
        Location: "/",
        "Set-Cookie": clearSessionCookie()
      })
    });
  }

  if (url.pathname === "/health") {
    return Response.json({ ok: true, storage: "private-r2" }, {
      headers: withSecurityHeaders({ "Cache-Control": "no-store" })
    });
  }

  if (url.pathname === "/app.css" && request.method === "GET") {
    return assetResponse(APP_CSS, "text/css; charset=utf-8");
  }

  if (url.pathname === "/app.js" && request.method === "GET") {
    return assetResponse(ARCHIVE_BACK_JS + APP_JS, "text/javascript; charset=utf-8");
  }

  if (url.pathname.startsWith("/tiles/")) {
    if (!session) {
      return textResponse("Unauthorized", 401);
    }
    return servePrivateTile(request, env, url.pathname);
  }

  if (url.pathname === "/viewer") {
    if (!session) {
      return redirectToLogin();
    }
    return htmlResponse(viewerHtml(session.role));
  }

  if (url.pathname === "/" && request.method === "GET") {
    if (session) {
      return new Response(null, {
        status: 302,
        headers: withSecurityHeaders({ Location: "/viewer" })
      });
    }
    return htmlResponse(loginHtml(url.searchParams.get("error") === "1"), true);
  }

  return textResponse("Not found", 404);
}

// Keep archive navigation independent of model loading and experimental tools.
const ARCHIVE_BACK_JS = `(() => {
  const actions = document.querySelector(".top-actions");
  if (!actions) return;
  const link = document.createElement("a");
  link.className = "site-back logout";
  link.href = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:5500/archive/"
    : "https://lctstudio.tw/archive/";
  link.textContent = "← 返回數位典藏";
  link.style.textDecoration = "none";
  actions.prepend(link);
})();\n`;

async function handleLogin(request, env) {
  if (!hasRequiredSecrets(env)) {
    return textResponse("Worker secrets 尚未設定。", 503);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return textResponse("Request too large", 413);
  }

  const form = await request.formData();
  const password = String(form.get("password") || "");
  if (password.length < 1 || password.length > 64) {
    return invalidLoginResponse();
  }

  const suppliedHash = await sha256Hex(password);
  let role = null;
  if (constantTimeEqual(suppliedHash, env.ADMIN_PASSWORD_HASH)) {
    role = "admin";
  } else if (constantTimeEqual(suppliedHash, env.PROJECT_PASSWORD_HASH)) {
    role = "viewer";
  }

  if (!role) {
    await delay(350);
    return invalidLoginResponse();
  }

  const token = await createSessionToken(role, env.SESSION_SECRET);
  return new Response(null, {
    status: 303,
    headers: withSecurityHeaders({
      Location: "/viewer",
      "Set-Cookie": sessionCookie(token)
    })
  });
}

async function servePrivateTile(request, env, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
  }

  const encodedRelative = pathname.slice("/tiles/".length);
  let relative;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    return textResponse("Invalid path", 400);
  }

  if (!relative || relative.includes("..") || relative.includes("\\") || relative.startsWith("/")) {
    return textResponse("Invalid path", 400);
  }

  const key = `${MODEL_PREFIX}${relative}`;
  const object = request.method === "HEAD"
    ? await env.MODELS.head(key)
    : await env.MODELS.get(key, { range: request.headers });

  if (!object) {
    return textResponse("Tile not found", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Vary", "Cookie");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  const range = "range" in object ? object.range : null;
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
  }

  return new Response(request.method === "HEAD" ? null : object.body, {
    status: range ? 206 : 200,
    headers
  });
}

function hasRequiredSecrets(env) {
  return Boolean(env.PROJECT_PASSWORD_HASH && env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET);
}

async function createSessionToken(role, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    nonce: crypto.randomUUID()
  }));
  const signature = await hmacHex(payload, secret);
  return `${payload}.${signature}`;
}

async function readSession(request, env) {
  if (!hasRequiredSecrets(env)) return null;

  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  const expected = await hmacHex(payload, env.SESSION_SECRET);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const data = JSON.parse(base64UrlDecode(payload));
    const now = Math.floor(Date.now() / 1000);
    if (data.exp <= now || !["viewer", "admin"].includes(data.role)) return null;
    return data;
  } catch {
    return null;
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(signature));
}

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function invalidLoginResponse() {
  return new Response(null, { status: 303, headers: withSecurityHeaders({ Location: "/?error=1" }) });
}

function redirectToLogin() {
  return new Response(null, { status: 302, headers: withSecurityHeaders({ Location: "/" }) });
}

function withSecurityHeaders(initial = {}) {
  const headers = new Headers(initial);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return headers;
}

function htmlResponse(html, isLogin = false) {
  const headers = withSecurityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": isLogin
      ? "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      : "default-src 'self'; script-src 'self' 'unsafe-eval' https://cesium.com; style-src 'self' https://cesium.com; img-src 'self' data: blob: https://cesium.com; font-src 'self' data: https://cesium.com; connect-src 'self' https://cesium.com; worker-src 'self' blob: https://cesium.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  });
  return new Response(html, { headers });
}

function assetResponse(content, contentType) {
  return new Response(content, {
    headers: withSecurityHeaders({ "Content-Type": contentType, "Cache-Control": "public, max-age=300" })
  });
}

function textResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: withSecurityHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    })
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function loginHtml(showError) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>私人三維模型｜LCT Studio</title><style>${LOGIN_CSS}</style></head><body><main class="gate"><section class="card" aria-labelledby="gate-title"><p class="eyebrow">PRIVATE 3D ARCHIVE</p><h1 id="gate-title">三維模型私人瀏覽</h1><p class="lead">模型存放於私人 R2，通過驗證後才會載入 CesiumJS 與 3D Tiles。</p><form action="/login" method="post"><label for="password">存取密碼</label><input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" maxlength="64" required autofocus>${showError ? '<p class="error" role="alert">密碼不正確，請重新輸入。</p>' : ''}<button type="submit">進入模型</button></form><p class="note">授權工作階段將於 12 小時後自動失效。</p></section></main></body></html>`;
}

function viewerHtml(role) {
  const roleLabel = role === "admin" ? "管理員模式" : "專案觀看";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#06111d"><title>南雅奇岩模型｜LCT Studio</title><link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Widgets/widgets.css"><link rel="stylesheet" href="/app.css"><script defer src="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Cesium.js"></script><script defer src="/app.js"></script></head><body data-role="${role}"><main class="viewer-shell"><div id="cesium-container" aria-label="南雅奇岩模型"></div><header class="topbar"><div><p class="eyebrow">PRIVATE 3D ARCHIVE</p><h1>南雅奇岩模型</h1></div><div class="top-actions"><span class="role-badge">${roleLabel}</span><form action="/logout" method="post"><button class="logout" type="submit">登出</button></form></div></header><div id="load-status" class="status" role="status">正在以極致品質連接私人模型…</div><button id="home-button" class="home-button" type="button" disabled>回到模型</button></main></body></html>`;
}

const APP_JS = `(() => {const status=document.querySelector("#load-status");const homeButton=document.querySelector("#home-button");const isMobile=window.matchMedia("(max-width: 920px)").matches;const extremeSse=isMobile?2:1;let activeTileset;let viewer;function setStatus(message,ready=false){status.textContent=message;status.classList.toggle("ready",ready)}async function start(){viewer=new Cesium.Viewer("cesium-container",{animation:false,timeline:false,fullscreenButton:true,geocoder:false,homeButton:false,sceneModePicker:false,baseLayerPicker:false,navigationHelpButton:false,baseLayer:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),requestRenderMode:true,maximumRenderTimeChange:Infinity});viewer.scene.globe.baseColor=Cesium.Color.fromCssColorString("#10232d");viewer.scene.globe.depthTestAgainstTerrain=true;const startTime=performance.now();activeTileset=await Cesium.Cesium3DTileset.fromUrl("/tiles/tileset.json",{maximumScreenSpaceError:extremeSse,dynamicScreenSpaceError:false,foveatedScreenSpaceError:false,skipLevelOfDetail:false,preloadFlightDestinations:true,cacheBytes:isMobile?268435456:536870912,maximumCacheOverflowBytes:isMobile?268435456:536870912});viewer.scene.primitives.add(activeTileset);activeTileset.loadProgress.addEventListener((pending,processing)=>{if(pending+processing>0)setStatus("極致細節載入中… "+(pending+processing))});activeTileset.allTilesLoaded.addEventListener(()=>{const seconds=((performance.now()-startTime)/1000).toFixed(1);setStatus("目前視角已完成極致品質載入 · "+seconds+"s",true)});await viewer.zoomTo(activeTileset);homeButton.disabled=false}homeButton.addEventListener("click",()=>{if(viewer&&activeTileset)void viewer.zoomTo(activeTileset)});window.addEventListener("unhandledrejection",(event)=>{console.error(event.reason);setStatus("模型載入失敗，請重新整理或重新登入。",false)});start().catch((error)=>{console.error(error);setStatus(error&&error.message?error.message:"模型載入失敗",false)})})();`;

const APP_CSS = `:root{color-scheme:dark;--bg:#06111d;--panel:rgba(5,18,29,.82);--line:rgba(95,207,230,.35);--text:#f3f8fb;--muted:#9fb3c1;--cyan:#61d4ea;--gold:#d8b269}*{box-sizing:border-box}html,body,.viewer-shell,#cesium-container{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--bg);color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}.topbar{position:fixed;z-index:5;top:18px;left:18px;right:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);backdrop-filter:blur(16px);box-shadow:0 16px 50px rgba(0,0,0,.24)}.eyebrow{margin:0 0 4px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.27em}.topbar h1{margin:0;font-size:clamp(18px,2.4vw,28px)}.top-actions{display:flex;align-items:center;gap:10px}.role-badge,.logout{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(3,13,22,.65);color:var(--text);font:700 13px inherit}.logout{cursor:pointer}.quality-panel{position:fixed;z-index:5;left:18px;bottom:18px;width:min(380px,calc(100vw - 36px));padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel);backdrop-filter:blur(16px)}.panel-label{display:block;margin-bottom:10px;color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.16em}.quality-options{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.quality-options button,.home-button{min-height:40px;border:1px solid var(--line);border-radius:5px;background:rgba(4,17,28,.74);color:var(--text);font-weight:800;cursor:pointer}.quality-options button.active{border-color:var(--cyan);background:rgba(97,212,234,.18);box-shadow:0 0 24px rgba(97,212,234,.12)}.quality-panel p{margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.status{position:fixed;z-index:5;right:18px;bottom:18px;max-width:min(460px,calc(100vw - 36px));padding:11px 14px;border:1px solid var(--line);border-radius:999px;background:rgba(4,15,25,.85);color:var(--muted);font-size:13px}.status.ready{color:#9be7bc;border-color:rgba(83,211,143,.42)}.home-button{position:fixed;z-index:5;right:18px;bottom:72px;padding:0 16px}.home-button:disabled{opacity:.45;cursor:wait}.cesium-viewer-bottom{display:none}@media(max-width:720px){.topbar{align-items:flex-start}.role-badge{display:none}.quality-panel{bottom:72px}.status{left:18px;right:auto;bottom:18px}.home-button{right:18px;bottom:18px}.topbar{padding:12px}.quality-panel{padding:12px}}`;

const LOGIN_CSS = `:root{color-scheme:dark;--bg:#05111c;--panel:rgba(8,25,39,.88);--line:rgba(94,210,230,.38);--text:#f2f7fa;--muted:#9eb3c0;--cyan:#61d4ea;--gold:#d8b269}*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{background:linear-gradient(rgba(97,212,234,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(97,212,234,.035) 1px,transparent 1px),radial-gradient(circle at 25% 20%,rgba(37,127,149,.28),transparent 34rem),var(--bg);background-size:18px 18px,18px 18px,auto,auto;color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}.gate{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(520px,100%);padding:clamp(28px,6vw,52px);border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 28px 100px rgba(0,0,0,.36);backdrop-filter:blur(18px)}.eyebrow{margin:0 0 16px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.3em}h1{margin:0;font-size:clamp(30px,7vw,50px);line-height:1.08}.lead,.note{color:var(--muted);line-height:1.8}.lead{margin:18px 0 28px}.note{margin:20px 0 0;font-size:12px}form{display:grid;gap:12px}label{font-size:13px;font-weight:800;color:var(--muted)}input,button{min-height:52px;border:1px solid var(--line);border-radius:6px;font:inherit}input{padding:0 15px;outline:none;background:rgba(2,10,18,.7);color:var(--text);font-size:20px;letter-spacing:.12em}input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(97,212,234,.14)}button{margin-top:4px;background:rgba(97,212,234,.17);color:var(--text);font-weight:900;cursor:pointer}button:hover{background:rgba(97,212,234,.25)}.error{margin:0;color:#ff9b9b;font-size:13px}`;
