// Website login: existing server passwords, read-only fixed cadastral project.
// Never accept a published frontend password hash as a credential.
import {CADASTRAL_ORIGINS, createCadastralToken} from './cadastral-access.mjs';
export const SITE_PROJECT = 'taoyuan-20261006';
const TTL = 12 * 60 * 60;
const audience = 'lct-site-cadastral-session';
const encode = value => btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function sign(value,secret) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function equal(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;
}
async function readSession(token,secret) {
  if(typeof token!=='string'||token.length>2048)return null;
  const [p,s,extra]=token.split('.');
  if(!p||!s||extra||!equal(s,await sign(p,secret)))return null;
  try {
    const base=p.replaceAll('-','+').replaceAll('_','/');
    const data=JSON.parse(atob(base.padEnd(Math.ceil(base.length/4)*4,'=')));
    const now=Math.floor(Date.now()/1000);
    return data.aud===audience&&data.role==='viewer'&&data.projectId===SITE_PROJECT&&
      ['admin','viewer'].includes(data.uiRole)&&Number.isFinite(data.exp)&&data.exp>now&&
      data.exp<=now+TTL&&Number.isFinite(data.iat)&&data.exp-data.iat===TTL ? data : null;
  }catch{return null;}
}
function response(request,data,status=200) {
  const origin=request.headers.get('origin');
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Vary':'Origin, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'};
  if(CADASTRAL_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
  return status===204?new Response(null,{status,headers}):Response.json(data,{status,headers});
}
export async function siteAccess(request,env,path) {
  if(!CADASTRAL_ORIGINS.has(request.headers.get('origin')))return response(request,{error:'來源不允許'},403);
  if(request.method==='OPTIONS')return response(request,null,204);
  if(request.method!=='POST')return response(request,{error:'Method not allowed'},405);
  if(!env.ADMIN_PASSWORD_HASH||!env.PROJECT_PASSWORD_HASH||!env.SESSION_SECRET)return response(request,{error:'登入服務尚未設定'},503);
  if(Number(request.headers.get('content-length')||0)>4096)return response(request,{error:'Request too large'},413);
  const raw=await request.text();if(raw.length>4096)return response(request,{error:'Request too large'},413);
  let input;try{input=JSON.parse(raw);}catch{return response(request,{error:'Invalid request'},400);}
  if(input?.project!==SITE_PROJECT)return response(request,{error:'專案不允許'},403);
  let session,sessionToken;
  if(path==='/api/site-access/login') {
    if(typeof input.password!=='string'||input.password.length<1||input.password.length>64||!['admin','viewer'].includes(input.role))return response(request,{error:'登入資料不正確'},400);
    const hash=await digest(input.password);
    const admin=equal(hash,env.ADMIN_PASSWORD_HASH),viewer=equal(hash,env.PROJECT_PASSWORD_HASH);
    if(!admin&&(input.role==='admin'||!viewer)) {
      await new Promise(resolve=>setTimeout(resolve,350));
      return response(request,{error:'密碼不正確，請使用私人模型的管理員／觀看密碼。'},401);
    }
    const now=Math.floor(Date.now()/1000);
    session={role:'viewer',uiRole:input.role,projectId:SITE_PROJECT,aud:audience,iat:now,exp:now+TTL,nonce:crypto.randomUUID()};
    const payload=encode(session);sessionToken=payload+'.'+await sign(payload,env.SESSION_SECRET);
  } else if(path==='/api/site-access/refresh') {
    sessionToken=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    session=await readSession(sessionToken,env.SESSION_SECRET);
    if(!session)return response(request,{error:'網站登入已過期，請重新登入。'},401);
  } else return response(request,{error:'Not found'},404);
  const access=await createCadastralToken(SITE_PROJECT,env.SESSION_SECRET,session.exp);
  return response(request,{project:SITE_PROJECT,role:session.uiRole,sessionToken,sessionExpiresAt:session.exp,...access});
}
