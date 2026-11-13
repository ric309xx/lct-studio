/* Shared by the entry gate and viewer. Passwords are never persisted. */
(() => {
  const ORIGIN = 'https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
  const PROJECT = 'taoyuan-20261006';
  const LONGDONG = 'longdong-pix4d-mesh-20260805';
  const KEY = 'lct-site-cadastral-session-v1';
  const allowed = new Set([PROJECT, LONGDONG]);
  const keyFor = project => project === PROJECT ? KEY : `${KEY}:${project}`;
  const current = new Map(), inflight = new Map();
  const now = () => Date.now() / 1000;
  const clear = (project = PROJECT) => { current.delete(project); sessionStorage.removeItem(keyFor(project)); };
  const saved = (project = PROJECT) => {
    try {
      const data = JSON.parse(sessionStorage.getItem(keyFor(project)) || 'null');
      return data && allowed.has(project) && data.project === project && ['admin','viewer'].includes(data.role) &&
        typeof data.sessionToken === 'string' && Number.isFinite(data.sessionExpiresAt) &&
        data.sessionExpiresAt > now() && data.sessionExpiresAt <= now()+43201 ? data : null;
    } catch { return null; }
  };
  const accept = (data,project) => {
    if (!data || !allowed.has(project) || data.project !== project || !['admin','viewer'].includes(data.role) ||
      typeof data.token !== 'string' || typeof data.sessionToken !== 'string' ||
      !Number.isFinite(data.expiresAt) || !Number.isFinite(data.sessionExpiresAt) ||
      data.expiresAt <= now() || data.expiresAt > now()+3601 ||
      data.sessionExpiresAt < data.expiresAt || data.sessionExpiresAt > now()+43201) throw Error('登入服務回應不正確。');
    current.set(project,data);
    sessionStorage.setItem(keyFor(project), JSON.stringify({project,role:data.role,sessionToken:data.sessionToken,sessionExpiresAt:data.sessionExpiresAt}));
    return data;
  };
  async function request(path,body,sessionToken) {
    let response;
    try {
      response = await fetch(ORIGIN+path,{method:'POST',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',...(sessionToken?{Authorization:'Bearer '+sessionToken}:{})},body:JSON.stringify(body)});
    } catch { throw Error('無法連接網站登入服務，請確認網路後再試。'); }
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      if ([401,403].includes(response.status)) clear(body.project);
      throw Error(data.error || '登入服務暫時無法使用。');
    }
    return accept(data,body.project);
  }
  async function restore(force = false, project = PROJECT) {
    if (!allowed.has(project)) throw Error('專案不允許。');
    if (!force && current.get(project)?.expiresAt > now()+30) return current.get(project);
    if (inflight.has(project)) return inflight.get(project);
    const session = saved(project);
    if (!session) { clear(project); throw Error('網站登入已過期，請重新登入網站。'); }
    const pending=request('/api/site-access/refresh',{project},session.sessionToken).finally(()=>{inflight.delete(project);});
    inflight.set(project,pending);
    return pending;
  }
  window.LCT_SITE_AUTH = {
    login: (password,role,project=PROJECT) => {
      if (!allowed.has(project)) throw Error('專案不允許。');
      return request('/api/site-access/login',{project,password,role});
    },
    restore, clear,
    getAccess: project => current.get(project)?.expiresAt > now()+30 ? current.get(project) : null,
    hasSavedSession: (role,project=PROJECT) => { const session=saved(project);return !!session && (!role || session.role===role); }
  };
})();
