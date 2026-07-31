(() => {
  const config = window.LCT_VIEWER_ACCESS;
  if (!config) {
    throw new Error("缺少專案存取設定。");
  }

  const ROLE_KEY = "lct-3d-viewer-role";
  const PROJECTS_KEY = "lct-3d-viewer-projects";
  const ACTIVE_PROJECT_KEY = "lct-3d-viewer-active-project";
  const ACCESS_SESSION_POINTER = "lct-3d-viewer-access-session-key";
  const sessionKey = `lct-3d-viewer-access:${config.accessId}`;
  const gate = document.querySelector("#access-gate");
  const form = document.querySelector("#access-form");
  const input = document.querySelector("#access-password");
  const error = document.querySelector("#access-error");
  const toggle = document.querySelector("#toggle-password");

  const sha256 = async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const applyAccess = () => {
    sessionStorage.setItem(ROLE_KEY, config.role);
    sessionStorage.setItem(ACCESS_SESSION_POINTER, sessionKey);

    if (config.role === "admin") {
      sessionStorage.removeItem(PROJECTS_KEY);
      const queryProject = new URLSearchParams(window.location.search).get(
        "project"
      );
      if (queryProject) {
        sessionStorage.setItem(ACTIVE_PROJECT_KEY, queryProject);
      }
      return;
    }

    sessionStorage.setItem(PROJECTS_KEY, JSON.stringify([config.projectId]));
    sessionStorage.setItem(ACTIVE_PROJECT_KEY, config.projectId);
  };

  const loadViewer = () => {
    if (document.querySelector("script[data-viewer-app]")) return;
    gate.hidden = true;
    applyAccess();

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/3d-viewer/assets/viewer.css";
    document.head.appendChild(stylesheet);

    const script = document.createElement("script");
    script.type = "module";
    script.src = "/3d-viewer/assets/viewer.js";
    script.dataset.viewerApp = "true";
    document.body.appendChild(script);
  };

  if (sessionStorage.getItem(sessionKey) === config.passwordHash) {
    loadViewer();
  }

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
    const submittedHash = await sha256(input.value);

    if (submittedHash !== config.passwordHash) {
      error.textContent = "密碼不正確，請重新輸入。";
      input.select();
      return;
    }

    sessionStorage.setItem(sessionKey, submittedHash);
    loadViewer();
  });
})();
