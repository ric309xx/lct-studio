(() => {
  const config = window.LCT_VIEWER_ACCESS;
  if (!config) {
    throw new Error("缺少專案存取設定。");
  }

  const ROLE_KEY = "lct-3d-viewer-role";
  const PROJECTS_KEY = "lct-3d-viewer-projects";
  const ACTIVE_PROJECT_KEY = "lct-3d-viewer-active-project";
  const ACTIVE_COMPARISON_KEY = "lct-3d-viewer-active-comparison";
  const COMPARISONS_KEY = "lct-3d-viewer-comparisons";
  const ACCESS_SESSION_POINTER = "lct-3d-viewer-access-session-key";
  const sessionKey = `lct-3d-viewer-access:${config.accessId}`;
  const gate = document.querySelector("#access-gate");
  const form = document.querySelector("#access-form");
  const input = document.querySelector("#access-password");
  const error = document.querySelector("#access-error");
  const toggle = document.querySelector("#toggle-password");
  let passwordEntryStarted = false;
  const unifiedLogin = config.role === "admin" ||
    config.projectId === "taoyuan-building-overlay" ||
    config.projectIds?.includes("taoyuan-building-overlay");
  const authReady = unifiedLogin ? new Promise((resolve, reject) => {
    if (window.LCT_SITE_AUTH) return resolve(window.LCT_SITE_AUTH);
    const script = document.createElement("script");
    script.src = "/3d-viewer/site-auth.js?v=20261010c";
    script.onload = () => window.LCT_SITE_AUTH ? resolve(window.LCT_SITE_AUTH) : reject(Error("登入服務無法載入。"));
    script.onerror = () => reject(Error("登入服務無法載入，請重新整理。"));
    document.head.appendChild(script);
  }) : null;

  // 避免瀏覽器密碼管理員把上一次內容帶入分享頁；使用者開始輸入後不再干預。
  input.setAttribute("autocomplete", "new-password");
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("spellcheck", "false");
  const clearAutofilledPassword = () => {
    if (!passwordEntryStarted) input.value = "";
  };
  clearAutofilledPassword();
  requestAnimationFrame(clearAutofilledPassword);
  [80, 250, 700].forEach((delay) =>
    window.setTimeout(clearAutofilledPassword, delay)
  );
  window.addEventListener("pageshow", clearAutofilledPassword);
  input.addEventListener("keydown", () => {
    passwordEntryStarted = true;
  });
  input.addEventListener("paste", () => {
    passwordEntryStarted = true;
  });

  const sha256 = async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const applyAccess = () => {
    const hasElevatedAdminSession =
      !unifiedLogin && config.role !== "admin" && sessionStorage.getItem(ROLE_KEY) === "admin";
    if (hasElevatedAdminSession) return;

    sessionStorage.setItem(ROLE_KEY, config.role);
    sessionStorage.setItem(ACCESS_SESSION_POINTER, sessionKey);

    if (config.role === "admin") {
      sessionStorage.removeItem(PROJECTS_KEY);
      sessionStorage.removeItem(COMPARISONS_KEY);
      const queryProject = new URLSearchParams(window.location.search).get(
        "project"
      );
      if (queryProject) {
        sessionStorage.setItem(ACTIVE_PROJECT_KEY, queryProject);
      }
      return;
    }

    if (config.comparisonId) {
      sessionStorage.setItem(PROJECTS_KEY, JSON.stringify(config.projectIds));
      sessionStorage.setItem(
        COMPARISONS_KEY,
        JSON.stringify([config.comparisonId])
      );
      sessionStorage.setItem(ACTIVE_COMPARISON_KEY, config.comparisonId);
      sessionStorage.setItem(ACTIVE_PROJECT_KEY, config.comparisonId);
      return;
    }

    sessionStorage.removeItem(COMPARISONS_KEY);
    sessionStorage.removeItem(ACTIVE_COMPARISON_KEY);
    sessionStorage.setItem(PROJECTS_KEY, JSON.stringify([config.projectId]));
    sessionStorage.setItem(ACTIVE_PROJECT_KEY, config.projectId);
  };

  const applyViewerRouteContext = () => {
    if (
      config.role === "admin" ||
      (!unifiedLogin && sessionStorage.getItem(ROLE_KEY) === "admin")
    ) return;

    const projectId =
      config.comparisonId || config.projectId || config.projectIds?.[0];
    if (!projectId) return;

    const url = new URL(window.location.href);
    url.searchParams.set("project", projectId);
    window.history.replaceState({}, "", url);
  };

  const loadViewer = () => {
    if (document.querySelector("script[data-viewer-app]")) return;
    gate.hidden = true;
    applyAccess();
    applyViewerRouteContext();

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/3d-viewer/assets/viewer.css?v=20261010c";
    document.head.appendChild(stylesheet);

    const script = document.createElement("script");
    script.type = "module";
    script.src = "/3d-viewer/assets/viewer.js?v=20261010d";
    script.dataset.viewerApp = "true";
    document.body.appendChild(script);
  };

  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "隱藏" : "顯示";
    toggle.setAttribute("aria-label", show ? "隱藏密碼" : "顯示密碼");
    input.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const submit = form.querySelector('[type="submit"]');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    try {
      if (unifiedLogin) {
        const auth = await authReady;
        const session = await auth.login(input.value, config.role);
        if (session.role !== config.role) throw Error("登入身分不符，請重新登入。");
      } else if (await sha256(input.value) !== config.passwordHash) {
        throw Error("密碼不正確，請重新輸入。");
      }
      input.value = "";
      sessionStorage.removeItem(sessionKey);
      loadViewer();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : "登入失敗，請重試。";
      input.select();
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  // Storage is only a hint: the server verifies the saved session before opening.
  if (authReady) void authReady.then(async auth => {
    if (!auth.hasSavedSession(config.role)) return;
    const session = await auth.restore();
    if (session.role === config.role) loadViewer();
  }).catch(reason => { error.textContent = reason.message || "請重新登入網站。"; });
})();
