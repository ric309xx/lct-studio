(() => {
  const ACCESS_PROFILES = {
    "0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c": "admin",
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4": "viewer"
  };
  const SESSION_KEY = "lct-3d-viewer-access";
  const ROLE_KEY = "lct-3d-viewer-role";
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

  const loadViewer = () => {
    if (document.querySelector("script[data-viewer-app]")) return;
    gate.hidden = true;

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.crossOrigin = "anonymous";
    stylesheet.href = "/3d-viewer/assets/index-B9DwooyM.css";
    document.head.appendChild(stylesheet);

    const script = document.createElement("script");
    script.type = "module";
    script.crossOrigin = "anonymous";
    script.src = "/3d-viewer/assets/index-0N5MIB4X.js";
    script.dataset.viewerApp = "true";
    document.body.appendChild(script);
  };

  const storedHash = sessionStorage.getItem(SESSION_KEY);
  if (storedHash && ACCESS_PROFILES[storedHash]) {
    sessionStorage.setItem(ROLE_KEY, ACCESS_PROFILES[storedHash]);
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

    const role = ACCESS_PROFILES[submittedHash];
    if (!role) {
      error.textContent = "密碼不正確，請重新輸入。";
      input.select();
      return;
    }

    sessionStorage.setItem(SESSION_KEY, submittedHash);
    sessionStorage.setItem(ROLE_KEY, role);
    loadViewer();
  });
})();
