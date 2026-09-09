import { landmarksApi, landmarkClient } from './landmarks.mjs';
import { DEFAULT_PROJECT, PROJECTS, getProject } from './projects.mjs';
const COOKIE_NAME = "lct_3d_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;


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
  const project = getProject(url.searchParams.get('project') ?? DEFAULT_PROJECT);
  if (url.pathname === '/api/landmarks') {
    if (!session) return textResponse('Unauthorized', 401);
    if (!project) return textResponse('Unknown project', 404);
    return landmarksApi(request, env, session, project);
  }

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
    return assetResponse(APP_CSS + NAV_CSS, "text/css; charset=utf-8");
  }

  if (url.pathname === "/app.js" && request.method === "GET") {
    return assetResponse(APP_JS, "text/javascript; charset=utf-8");
  }

  if (url.pathname.startsWith("/tiles/")) {
    if (!session) {
      return textResponse("Unauthorized", 401);
    }
    // Preserve all legacy /tiles/... URLs for Nanya.
    return servePrivateTile(request, env, url.pathname.slice('/tiles/'.length), getProject());
  }

  const projectTile = url.pathname.match(/^\/projects\/([^/]+)\/tiles\/(.*)$/);
  if (projectTile) {
    if (!session) return textResponse('Unauthorized', 401);
    const tileProject = getProject(projectTile[1]);
    if (!tileProject) return textResponse('Unknown project', 404);
    return servePrivateTile(request, env, projectTile[2], tileProject);
  }

  if (url.pathname === "/viewer") {
    if (!session) {
      return new Response(null, {status: 302, headers: withSecurityHeaders({Location: '/?project=' + encodeURIComponent(project?.id ?? DEFAULT_PROJECT)})});
    }
    if (!project) return textResponse('Unknown project', 404);
    return htmlResponse(viewerHtml(session.role, project));
  }

  if (url.pathname === "/" && request.method === "GET") {
    if (session) {
      return new Response(null, {
        status: 302,
        headers: withSecurityHeaders({ Location: "/viewer?project=" + encodeURIComponent(project?.id ?? DEFAULT_PROJECT) })
      });
    }
    return htmlResponse(loginHtml(url.searchParams.get("error") === "1", project?.id ?? DEFAULT_PROJECT), true);
  }

  return textResponse("Not found", 404);
}

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
  const project = getProject(String(form.get("project") || DEFAULT_PROJECT));
  if (!project) return textResponse("Unknown project", 404);
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
      Location: "/viewer?project=" + encodeURIComponent(project.id),
      "Set-Cookie": sessionCookie(token)
    })
  });
}

async function servePrivateTile(request, env, encodedRelative, project) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return textResponse("Method not allowed", 405, { Allow: "GET, HEAD" });
  }


  let relative;
  try {
    relative = decodeURIComponent(encodedRelative);
  } catch {
    return textResponse("Invalid path", 400);
  }

  if (!relative || relative.includes("..") || relative.includes("\\") || relative.startsWith("/") || /[\u0000-\u001f?#%]/.test(relative)) {
    return textResponse("Invalid path", 400);
  }

  const key = `${project.prefix}${relative}`;
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

  const range = request.headers.has("range") && "range" in object ? object.range : null;
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

function loginHtml(showError, projectId = DEFAULT_PROJECT) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>私人三維模型｜LCT Studio</title><style>${LOGIN_CSS}</style></head><body><main class="gate"><section class="card" aria-labelledby="gate-title"><p class="eyebrow">PRIVATE 3D ARCHIVE</p><h1 id="gate-title">三維模型私人瀏覽</h1><p class="lead">模型存放於私人 R2，通過驗證後才會載入 CesiumJS 與 3D Tiles。</p><form action="/login" method="post"><input type="hidden" name="project" value="${projectId}"><label for="password">存取密碼</label><input id="password" name="password" type="password" inputmode="numeric" autocomplete="current-password" maxlength="64" required autofocus>${showError ? '<p class="error" role="alert">密碼不正確，請重新輸入。</p>' : ''}<button type="submit">進入模型</button></form><p class="note">授權工作階段將於 12 小時後自動失效。</p></section></main></body></html>`;
}

function viewerHtml(role, project) {
  const roleLabel = role === "admin" ? "管理員模式" : "專案觀看";
  const options = Object.values(PROJECTS).map(p => '<option value="' + p.id + '"' + (p.id === project.id ? ' selected' : '') + '>' + p.name + '</option>').join('');
return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#06111d"><title>${project.name}｜LCT Studio</title><link rel="stylesheet" href="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Widgets/widgets.css"><link rel="stylesheet" href="/app.css"><script defer src="https://cesium.com/downloads/cesiumjs/releases/1.143/Build/Cesium/Cesium.js"></script><script defer src="/app.js?v=longteng-20260906-v11"></script></head><body data-role="${role}" data-project="${project.id}"><main class="viewer-shell"><div id="cesium-container" aria-label="${project.name}"></div><header class="topbar"><div><p class="eyebrow">PRIVATE 3D ARCHIVE</p><h1>${project.name}</h1></div><div class="top-actions"><label class="project-picker">專案 <select id="project-select" aria-label="選擇專案">${options}</select></label><span class="role-badge">${roleLabel}</span><form action="/logout" method="post"><button class="logout" type="submit">登出</button></form></div></header><section class="tool-panel" aria-label="模型工具"><p class="panel-label">MODEL TOOLS</p><div class="tool-grid"><button id="distance-button" type="button">距離量測</button><button id="area-button" type="button">面積量測</button><button id="clear-button" type="button">清除量測</button><button id="sun-button" type="button" aria-pressed="false">日照模擬</button></div><label class="sun-time" for="sun-time" hidden><span>時間 <strong id="sun-time-label">09:00</strong></span><input id="sun-time" type="range" min="5" max="19" step="0.25" value="9"></label><button id="cadastral-button" class="cadastral-button" type="button" disabled>地籍圖套繪</button><p id="tool-hint" class="tool-hint">選擇工具後直接點選模型。</p><p class="cadastral-note">地籍資料尚未匯入，稍後可由 GeoJSON 掛載。</p></section><div id="load-status" class="status" role="status">正在以極致品質連接私人模型…</div><button id="home-button" class="home-button" type="button" disabled>回到模型</button></main></body></html>`;
}

const APP_JS = `(() => {
  // Wrangler may add __name() calls while bundling the embedded function.
  const __name = (value) => value;
  const projects = ${JSON.stringify(Object.fromEntries(Object.values(PROJECTS).map(({id,name,date,camera}) => [id,{id,name,date,camera}])))};
  const project = projects[document.body.dataset.project];
  document.querySelector('#project-select').addEventListener('change', event => { location.href = '/viewer?project=' + encodeURIComponent(event.target.value); });
  const status = document.querySelector("#load-status");
  const homeButton = document.querySelector("#home-button");
  const distanceButton = document.querySelector("#distance-button");
  const areaButton = document.querySelector("#area-button");
  const clearButton = document.querySelector("#clear-button");
  const sunButton = document.querySelector("#sun-button");
  const cadastralButton = document.querySelector("#cadastral-button");
  const topActions = document.querySelector(".top-actions");
  const sunTime = document.querySelector("#sun-time");
  const sunTimeLabel = document.querySelector("#sun-time-label");
  const sunTimeRow = document.querySelector(".sun-time");
  const toolHint = document.querySelector("#tool-hint");
  const isMobile = window.matchMedia("(max-width: 920px)").matches;
  sunTime.min = "6";
  sunTime.max = "18";
  const extremeSse = isMobile ? 2 : 1;
  const NANYA_VIEW = project.camera;
  const CADASTRAL_GEOJSON_URL = null;
  let activeTileset;
  let viewer;
  let measureMode = null;
  let measurePoints = [];
  let measureEntities = [];
  let currentPointEntities = [];
  let cadastralDataSource;

  const siteBack = document.createElement("a");
  siteBack.className = "site-back";
  siteBack.href = ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:5500/archive/"
    : "https://lctstudio.tw/archive/";
  siteBack.textContent = "← 返回數位典藏";
  topActions.prepend(siteBack);

  const measureActions = document.createElement("div");
  measureActions.className = "measure-actions";
  measureActions.hidden = true;
  measureActions.innerHTML = '<button id="undo-measure" type="button">撤銷一點</button><button id="finish-area" type="button">完成面積</button><button id="cancel-measure" type="button">取消</button>';
  document.querySelector(".tool-grid").after(measureActions);
  const undoMeasureButton = document.querySelector("#undo-measure");
  const finishAreaButton = document.querySelector("#finish-area");
  const cancelMeasureButton = document.querySelector("#cancel-measure");

  function setStatus(message, ready = false) {
    status.textContent = message;
    status.classList.toggle("ready", ready);
  }

  function setNanyaView() {
    if (!viewer) return;
    if (!project.camera || project.camera.rangeFactor) {
      if (activeTileset) {
        const relativeView = project.camera ?? { heading: 0, pitch: -34.379, rangeFactor: 2.5 };
        void viewer.flyTo(activeTileset, { duration: 0.8, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(relativeView.heading), Cesium.Math.toRadians(relativeView.pitch), Math.max(activeTileset.boundingSphere.radius * relativeView.rangeFactor, 50)) });
      }
      return;
    }
    viewer.camera.cancelFlight();
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(NANYA_VIEW.longitude, NANYA_VIEW.latitude, NANYA_VIEW.height),
      orientation: {
        heading: Cesium.Math.toRadians(NANYA_VIEW.heading),
        pitch: Cesium.Math.toRadians(NANYA_VIEW.pitch),
        roll: Cesium.Math.toRadians(NANYA_VIEW.roll)
      }
    });
    viewer.scene.requestRender();
  }

  function setMeasureMode(mode) {
    cancelCurrentMeasurement();
    measureMode = measureMode === mode ? null : mode;
    distanceButton.classList.toggle("active", measureMode === "distance");
    areaButton.classList.toggle("active", measureMode === "area");
    measureActions.hidden = measureMode !== "area";
    updateAreaActions();
    toolHint.textContent = measureMode === "distance" ? "請在模型上點選兩點。" : measureMode === "area" ? "請依序點選範圍，至少三點後按完成面積。" : "選擇工具後直接點選模型。";
  }

  function updateAreaActions() {
    undoMeasureButton.disabled = measurePoints.length === 0;
    finishAreaButton.disabled = measurePoints.length < 3;
  }

  function cancelCurrentMeasurement() {
    if (viewer) for (const entity of currentPointEntities) viewer.entities.remove(entity);
    currentPointEntities = [];
    measurePoints = [];
    if (viewer) viewer.scene.requestRender();
  }

  function undoMeasurePoint() {
    if (!measurePoints.length) return;
    measurePoints.pop();
    const entity = currentPointEntities.pop();
    if (entity) viewer.entities.remove(entity);
    updateAreaActions();
    toolHint.textContent = "已撤銷上一點，目前 " + measurePoints.length + " 點。";
    viewer.scene.requestRender();
  }

  function clearMeasurements() {
    for (const entity of measureEntities) viewer.entities.remove(entity);
    measureEntities = [];
    cancelCurrentMeasurement();
    setMeasureMode(null);
    viewer.scene.requestRender();
  }

  function pickPosition(position) {
    if (viewer.scene.pickPositionSupported) {
      const picked = viewer.scene.pickPosition(position);
      if (Cesium.defined(picked)) return picked;
    }
    const ray = viewer.camera.getPickRay(position);
    return ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
  }

  function addPoint(position) {
    const entity = viewer.entities.add({ position, point: { pixelSize: 9, color: Cesium.Color.fromCssColorString("#61d4ea"), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    measureEntities.push(entity);
    currentPointEntities.push(entity);
  }

  function finishDistance() {
    const distance = Cesium.Cartesian3.distance(measurePoints[0], measurePoints[1]);
    const midpoint = Cesium.Cartesian3.midpoint(measurePoints[0], measurePoints[1], new Cesium.Cartesian3());
    measureEntities.push(viewer.entities.add({ polyline: { positions: [...measurePoints], width: 3, material: Cesium.Color.fromCssColorString("#61d4ea"), depthFailMaterial: Cesium.Color.fromCssColorString("#d8b269") } }));
    measureEntities.push(viewer.entities.add({ position: midpoint, label: { text: distance >= 1000 ? (distance / 1000).toFixed(2) + " km" : distance.toFixed(2) + " m", fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#06111d").withAlpha(0.86), pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
    toolHint.textContent = "距離量測完成。";
    setMeasureMode(null);
  }

  function finishArea() {
    if (measurePoints.length < 3) return;
    const center = Cesium.BoundingSphere.fromPoints(measurePoints).center;
    const inverseEnu = Cesium.Matrix4.inverse(Cesium.Transforms.eastNorthUpToFixedFrame(center), new Cesium.Matrix4());
    const localPoints = measurePoints.map((point) => Cesium.Matrix4.multiplyByPoint(inverseEnu, point, new Cesium.Cartesian3()));
    let twiceArea = 0;
    for (let index = 0; index < localPoints.length; index += 1) {
      const current = localPoints[index];
      const next = localPoints[(index + 1) % localPoints.length];
      twiceArea += current.x * next.y - next.x * current.y;
    }
    const area = Math.abs(twiceArea) / 2;
    measureEntities.push(viewer.entities.add({ polygon: { hierarchy: new Cesium.PolygonHierarchy([...measurePoints]), material: Cesium.Color.fromCssColorString("#61d4ea").withAlpha(0.28), outline: true, outlineColor: Cesium.Color.fromCssColorString("#61d4ea"), perPositionHeight: true } }));
    measureEntities.push(viewer.entities.add({ position: center, label: { text: area >= 10000 ? (area / 10000).toFixed(2) + " ha" : area.toFixed(2) + " m²", fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#06111d").withAlpha(0.86), pixelOffset: new Cesium.Cartesian2(0, -18), disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
    toolHint.textContent = "面積量測完成。";
    currentPointEntities = [];
    measurePoints = [];
    setMeasureMode(null);
  }

  function updateSun() {
    const value = Number(sunTime.value);
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    const localIso = project.date + "T" + String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":00+08:00";
    sunTimeLabel.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(localIso);
    viewer.scene.requestRender();
  }

  function toggleSun() {
    const enabled = sunButton.getAttribute("aria-pressed") !== "true";
    sunButton.setAttribute("aria-pressed", String(enabled));
    sunButton.classList.toggle("active", enabled);
    sunTimeRow.hidden = !enabled;
    viewer.scene.globe.enableLighting = enabled;
    viewer.shadows = enabled;
    activeTileset.shadows = enabled ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;
    updateSun();
    toolHint.textContent = enabled ? "日照模擬已開啟；日期為 " + project.date + "（台灣時間）。" : "日照模擬已關閉。";
  }

  async function toggleCadastral() {
    if (!CADASTRAL_GEOJSON_URL) return;
    if (!cadastralDataSource) {
      cadastralDataSource = await Cesium.GeoJsonDataSource.load(CADASTRAL_GEOJSON_URL, { clampToGround: false, stroke: Cesium.Color.fromCssColorString("#ff5d5d"), strokeWidth: 3, fill: Cesium.Color.TRANSPARENT });
      await viewer.dataSources.add(cadastralDataSource);
    } else {
      cadastralDataSource.show = !cadastralDataSource.show;
    }
    const visible = cadastralDataSource.show;
    cadastralButton.classList.toggle("active", visible);
    cadastralButton.setAttribute("aria-pressed", String(visible));
    toolHint.textContent = visible ? "地籍圖套繪已顯示；成果僅供參考。" : "地籍圖套繪已隱藏。";
    viewer.scene.requestRender();
  }

  async function start() {
    viewer = new Cesium.Viewer("cesium-container", { animation: false, timeline: false, fullscreenButton: false, geocoder: false, homeButton: false, infoBox: false, selectionIndicator: false, sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false, baseLayer: false, terrainProvider: new Cesium.EllipsoidTerrainProvider(), requestRenderMode: true, maximumRenderTimeChange: Infinity });
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#10232d");
    viewer.scene.globe.depthTestAgainstTerrain = true;
    const startTime = performance.now();
    activeTileset = await Cesium.Cesium3DTileset.fromUrl("/projects/" + project.id + "/tiles/tileset.json", { maximumScreenSpaceError: extremeSse, dynamicScreenSpaceError: false, foveatedScreenSpaceError: false, skipLevelOfDetail: false, preloadFlightDestinations: true, cacheBytes: isMobile ? 268435456 : 536870912, maximumCacheOverflowBytes: isMobile ? 268435456 : 536870912 });
    viewer.scene.primitives.add(activeTileset);
    setNanyaView();
    if (project.camera) requestAnimationFrame(setNanyaView);
    activeTileset.loadProgress.addEventListener((pending, processing) => { if (pending + processing > 0) setStatus("細節載入中… " + (pending + processing)); });
    if (project.camera) activeTileset.initialTilesLoaded.addEventListener(() => setNanyaView());
    activeTileset.tileFailed.addEventListener(error => { console.error("Tile load failed", error.message); setStatus("部分模型載入失敗，請重新整理。", false); });
    activeTileset.allTilesLoaded.addEventListener(() => { setStatus("模型已完成載入", true); });
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((event) => {
      if (!measureMode) return;
      const position = pickPosition(event.position);
      if (!Cesium.defined(position)) return;
      measurePoints.push(position);
      addPoint(position);
      updateAreaActions();
      if (measureMode === "distance" && measurePoints.length === 2) finishDistance();
      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    homeButton.disabled = false;
    cadastralButton.disabled = !CADASTRAL_GEOJSON_URL;
  }

  homeButton.addEventListener("click", setNanyaView);
  distanceButton.addEventListener("click", () => setMeasureMode("distance"));
  areaButton.addEventListener("click", () => setMeasureMode("area"));
  clearButton.addEventListener("click", clearMeasurements);
  sunButton.addEventListener("click", toggleSun);
  sunTime.addEventListener("input", updateSun);
  undoMeasureButton.addEventListener("click", undoMeasurePoint);
  finishAreaButton.addEventListener("click", finishArea);
  cancelMeasureButton.addEventListener("click", () => { setMeasureMode(null); });
  cadastralButton.addEventListener("click", () => { void toggleCadastral(); });
  window.addEventListener("unhandledrejection", (event) => { console.error(event.reason); setStatus("模型載入失敗，請重新整理或重新登入。", false); });
  start().then(() => { (${landmarkClient.toString()})(viewer, Cesium, document.body.dataset.role, () => setMeasureMode(null), project); }).catch((error) => { console.error(error); setStatus(error && error.message ? error.message : "模型載入失敗", false); });
})();`;

const APP_CSS = `:root{color-scheme:dark;--bg:#06111d;--panel:rgba(5,18,29,.86);--line:rgba(95,207,230,.35);--text:#f3f8fb;--muted:#9fb3c1;--cyan:#61d4ea;--gold:#d8b269}*{box-sizing:border-box}html,body,.viewer-shell,#cesium-container{width:100%;height:100%;margin:0;overflow:hidden}body{background:var(--bg);color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}.topbar{position:fixed;z-index:5;top:18px;left:18px;right:18px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);backdrop-filter:blur(16px);box-shadow:0 16px 50px rgba(0,0,0,.24)}.eyebrow{margin:0 0 4px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.27em}.topbar h1{margin:0;font-size:clamp(18px,2.4vw,28px)}.top-actions{display:flex;align-items:center;gap:10px}.role-badge,.logout{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(3,13,22,.65);color:var(--text);font:700 13px inherit}.logout{cursor:pointer}.tool-panel{position:fixed;z-index:5;left:18px;bottom:18px;width:min(360px,calc(100vw - 36px));padding:15px;border:1px solid var(--line);border-radius:8px;background:var(--panel);backdrop-filter:blur(16px);box-shadow:0 16px 50px rgba(0,0,0,.24)}.panel-label{display:block;margin:0 0 10px;color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.2em}.tool-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.tool-panel button,.home-button{min-height:40px;border:1px solid var(--line);border-radius:5px;background:rgba(4,17,28,.78);color:var(--text);font-weight:800;cursor:pointer}.tool-panel button.active,.tool-panel button[aria-pressed="true"]{border-color:var(--cyan);background:rgba(97,212,234,.18);box-shadow:0 0 24px rgba(97,212,234,.12)}.tool-panel button:disabled{cursor:not-allowed;opacity:.48}.cadastral-button{width:100%;margin-top:9px}.sun-time{display:grid;gap:7px;margin-top:11px;color:var(--muted);font-size:12px}.sun-time span{display:flex;justify-content:space-between}.sun-time input{width:100%;accent-color:var(--cyan)}.tool-hint,.cadastral-note{margin:9px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.cadastral-note{color:#758d9a}.status{position:fixed;z-index:5;right:18px;bottom:18px;max-width:min(460px,calc(100vw - 36px));padding:11px 14px;border:1px solid var(--line);border-radius:999px;background:rgba(4,15,25,.85);color:var(--muted);font-size:13px}.status.ready{color:#9be7bc;border-color:rgba(83,211,143,.42)}.home-button{position:fixed;z-index:5;right:18px;bottom:72px;padding:0 16px}.home-button:disabled{opacity:.45;cursor:wait}.cesium-viewer-bottom{display:none}@media(max-width:720px){.topbar{align-items:flex-start;left:10px;right:10px;top:10px;padding:12px}.role-badge{display:none}.tool-panel{left:10px;bottom:62px;width:min(310px,calc(100vw - 20px));padding:11px}.status{left:10px;right:auto;bottom:10px;max-width:calc(100vw - 130px)}.home-button{right:10px;bottom:10px}.cadastral-note{display:none}}`;

const NAV_CSS = `.project-picker{font-size:13px;white-space:nowrap}.project-picker select{max-width:150px;padding:7px;border:1px solid var(--line);border-radius:5px;background:#06111d;color:var(--text)}.top-actions{flex-wrap:wrap;justify-content:flex-end}@media(max-width:720px){.topbar{gap:8px}.top-actions{max-width:65%}.project-picker select{max-width:100px}}.topbar{z-index:20;right:28px;overflow:visible}.site-back{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(3,13,22,.65);color:var(--text);font:700 13px inherit;text-decoration:none;white-space:nowrap}.site-back:hover,.site-back:focus-visible{border-color:var(--cyan);color:var(--cyan)}.measure-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.measure-actions[hidden]{display:none}.measure-actions button{min-height:36px;font-size:12px}.measure-actions #finish-area:not(:disabled){border-color:var(--cyan);background:rgba(97,212,234,.18)}@media(max-width:720px){.topbar{right:10px}.site-back{padding:7px 9px;font-size:12px}.top-actions{gap:6px}.logout{padding:7px 9px}}`;

const LOGIN_CSS = `:root{color-scheme:dark;--bg:#05111c;--panel:rgba(8,25,39,.88);--line:rgba(94,210,230,.38);--text:#f2f7fa;--muted:#9eb3c0;--cyan:#61d4ea;--gold:#d8b269}*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{background:linear-gradient(rgba(97,212,234,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(97,212,234,.035) 1px,transparent 1px),radial-gradient(circle at 25% 20%,rgba(37,127,149,.28),transparent 34rem),var(--bg);background-size:18px 18px,18px 18px,auto,auto;color:var(--text);font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}.gate{min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(520px,100%);padding:clamp(28px,6vw,52px);border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 28px 100px rgba(0,0,0,.36);backdrop-filter:blur(18px)}.eyebrow{margin:0 0 16px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.3em}h1{margin:0;font-size:clamp(30px,7vw,50px);line-height:1.08}.lead,.note{color:var(--muted);line-height:1.8}.lead{margin:18px 0 28px}.note{margin:20px 0 0;font-size:12px}form{display:grid;gap:12px}label{font-size:13px;font-weight:800;color:var(--muted)}input,button{min-height:52px;border:1px solid var(--line);border-radius:6px;font:inherit}input{padding:0 15px;outline:none;background:rgba(2,10,18,.7);color:var(--text);font-size:20px;letter-spacing:.12em}input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(97,212,234,.14)}button{margin-top:4px;background:rgba(97,212,234,.17);color:var(--text);font-weight:900;cursor:pointer}button:hover{background:rgba(97,212,234,.25)}.error{margin:0;color:#ff9b9b;font-size:13px}`;
