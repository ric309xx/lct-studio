/* Shared by the entry gate and viewer. Passwords are never persisted. */
(() => {
  const ORIGIN = 'https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
  const PROJECT = 'taoyuan-20261006';
  const KEY = 'lct-site-cadastral-session-v1';
  let current = null, inflight = null;
  const now = () => Date.now() / 1000;
  const clear = () => { current = null; sessionStorage.removeItem(KEY); };
  const saved = () => {
    try {
      const data = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return data && data.project === PROJECT && ['admin','viewer'].includes(data.role) &&
        typeof data.sessionToken === 'string' && Number.isFinite(data.sessionExpiresAt) &&
        data.sessionExpiresAt > now() && data.sessionExpiresAt <= now()+43201 ? data : null;
    } catch { return null; }
  };
  const accept = data => {
    if (!data || data.project !== PROJECT || !['admin','viewer'].includes(data.role) ||
      typeof data.token !== 'string' || typeof data.sessionToken !== 'string' ||
      !Number.isFinite(data.expiresAt) || !Number.isFinite(data.sessionExpiresAt) ||
      data.expiresAt <= now() || data.expiresAt > now()+3601 ||
      data.sessionExpiresAt < data.expiresAt || data.sessionExpiresAt > now()+43201) throw Error('登入服務回應不正確。');
    current = data;
    sessionStorage.setItem(KEY, JSON.stringify({project:PROJECT,role:data.role,sessionToken:data.sessionToken,sessionExpiresAt:data.sessionExpiresAt}));
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
      if ([401,403].includes(response.status)) clear();
      throw Error(data.error || '登入服務暫時無法使用。');
    }
    return accept(data);
  }
  async function restore(force = false) {
    if (!force && current?.expiresAt > now()+30) return current;
    if (inflight) return inflight;
    const session = saved();
    if (!session) { clear(); throw Error('網站登入已過期，請重新登入網站。'); }
    inflight=request('/api/site-access/refresh',{project:PROJECT},session.sessionToken).finally(()=>{inflight=null;});
    return inflight;
  }
  window.LCT_SITE_AUTH = {
    login: (password,role) => request('/api/site-access/login',{project:PROJECT,password,role}),
    restore, clear,
    getAccess: project => project === PROJECT && current?.expiresAt > now()+30 ? current : null,
    hasSavedSession: role => { const session=saved();return !!session && (!role || session.role===role); }
  };
})();
