// 登入憑證只存在 HttpOnly Cookie；短效模型授權與目錄僅保留在記憶體。
(() => {
  const KEY='lct-viewer-ui-v3';
  for(const old of ['lct-site-cadastral-session-v1','lct-site-cadastral-session-v2'])sessionStorage.removeItem(old);
  let current=null,inflight=null,generation=0;
  const now=()=>Date.now()/1000;
  const forget=()=>{generation++;current=null;delete window.LCT_VIEWER_BOOTSTRAP;sessionStorage.removeItem(KEY);};
  const access=()=>current?.r2??{project:'',role:current?.role,token:'',expiresAt:current?.sessionExpiresAt??0};
  const accept=data=>{
    if(!data||!['admin','viewer'].includes(data.role)||!data.access||data.access.role!==data.role||
      !Array.isArray(data.projects)||!data.projects.length||!Array.isArray(data.comparisons)||
      !Number.isFinite(data.sessionExpiresAt)||data.sessionExpiresAt<=now()||data.sessionExpiresAt>now()+43201||
      'sessionToken' in data)throw Error('登入服務回應不正確。');
    current=data;window.LCT_VIEWER_BOOTSTRAP=data;
    Object.assign(window.LCT_VIEWER_ACCESS,data.access);
    sessionStorage.setItem(KEY,JSON.stringify({role:data.role,accessId:data.access.accessId,expiresAt:data.sessionExpiresAt}));
    return access();
  };
  async function request(action,body){
    const ticket=generation;
    let response;try{response=await fetch('/api/viewer-session/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch{throw Error('無法連接登入服務，請稍後再試。');}
    const data=await response.json().catch(()=>({}));
    if(ticket!==generation)throw Error('登入狀態已變更，請重新登入。');
    if(!response.ok){if([401,403].includes(response.status))forget();throw Error(data.error||'登入服務暫時無法使用。');}
    return accept(data);
  }
  window.LCT_SITE_AUTH={
    login:(password,role)=>request('login',{password,accessId:role==='admin'?'admin':window.LCT_VIEWER_ACCESS.accessId}),
    restore:(force=false,project)=>{
      const selected=project?current?.r2Access?.[project]:current?.r2;
      if(!force&&current?.sessionExpiresAt>now()+30&&(!project||selected)&&(!selected||selected.expiresAt>now()+30))return Promise.resolve(selected??access());
      if(inflight)return inflight;
      inflight=request('refresh',{accessId:window.LCT_VIEWER_ACCESS.accessId}).finally(()=>{inflight=null;});return inflight;
    },
    getAccess:project=>{const selected=current?.r2Access?.[project]??current?.r2;return selected?.project===project&&selected.expiresAt>now()+30?selected:null;},
    hasSavedSession:()=>true,
    clear:async()=>{
      const accessId=window.LCT_VIEWER_ACCESS.accessId;
      generation++; // Reject older restore replies while waiting for server-side logout.
      let response;
      try{response=await fetch('/api/viewer-session/logout',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({accessId})});}
      catch{throw Error('登出未完成，請確認網路連線後重試。');}
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok!==true)throw Error('登出未完成，請稍後重試。');
      forget();
    }
  };
})();
