// Explicit origins, read-only project-scoped bearer access. No R2 keys in client input.
export const CADASTRAL_ORIGINS = new Set([
  'https://lctstudio.tw', 'https://www.lctstudio.tw',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'http://localhost:5173', 'http://127.0.0.1:5173'
]);
export function validConnectUrl(value, workerOrigin, projectId) {
  if (!value || !value.startsWith('/connect?')) return null;
  const url = new URL(value, workerOrigin);
  return url.origin === workerOrigin && url.pathname === '/connect' &&
    CADASTRAL_ORIGINS.has(url.searchParams.get('origin')) &&
    url.searchParams.get('project') === projectId && /^[a-f0-9-]{36}$/.test(url.searchParams.get('state') ?? '')
    ? url.pathname + url.search : null;
}
export function corsResponse(request, response) {
  const origin = request.headers.get('origin');
  if (!CADASTRAL_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Range');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag, Content-Type');
  headers.append('Vary', 'Origin');
  headers.append('Vary', 'Authorization');
  return new Response(response.body, { status: response.status, headers });
}
const encode = data => btoa(JSON.stringify(data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function sign(payload,secret) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function createCadastralToken(projectId,secret,sessionExpiresAt=Infinity) {
  const expiresAt=Math.min(Math.floor(Date.now()/1000)+3600,sessionExpiresAt);
  const payload=encode({role:'viewer',projectId,aud:'cadastral-tiles',exp:expiresAt,nonce:crypto.randomUUID()});
  return {token:payload+'.'+await sign(payload,secret),expiresAt};
}
export async function readCadastralToken(request,secret) {
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token || !secret)return null;
  const [payload,signature,extra]=token.split('.');
  if(!payload || !signature || extra)return null;
  const expected=await sign(payload,secret);
  if(signature.length!==expected.length)return null;
  let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);
  if(mismatch)return null;
  try {
    const base=payload.replaceAll('-','+').replaceAll('_','/');
    const data=JSON.parse(atob(base.padEnd(Math.ceil(base.length/4)*4,'=')));
    return data.aud==='cadastral-tiles' && data.role==='viewer' && Number.isFinite(data.exp) &&
      data.exp> Date.now()/1000 && data.exp<=Date.now()/1000+3601 ? data : null;
  }catch{return null;}
}
export const CONNECT_HTML='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="robots" content="noindex"><title>連接桃園私人模型</title><p id="connection-status">正在建立私人模型授權，完成後會回到地籍畫面…</p><script src="/cadastral-connect.js" defer></script></html>';
export const CONNECT_JS=`(async()=>{
  const url=new URL(location.href),origin=url.searchParams.get('origin'),state=url.searchParams.get('state'),project=url.searchParams.get('project');
  try{
    const response=await fetch('/api/cadastral-access?project='+encodeURIComponent(project));
    if(!response.ok){
      if([401,403].includes(response.status) && url.searchParams.get('login')!=='1'){
        url.searchParams.set('login','1');location.replace(url);return;
      }
      throw Error('授權失敗，請重新登入');
    }
    const data=await response.json();
    if(!window.opener)throw Error('請由地籍網站的連接按鈕開啟此視窗');
    window.opener.postMessage({type:'lct-r2-access',state,project,...data},origin);
    document.getElementById('connection-status').textContent='已連接，可以關閉此視窗。';
    window.close();
  }catch(error){document.getElementById('connection-status').textContent=error.message;}
})();`;
