import {createHmac,timingSafeEqual,randomUUID,createHash,pbkdf2 as pbkdf2Callback} from 'node:crypto';
import {promisify} from 'node:util';
import catalog from '../private/catalog.json' with {type:'json'};
const pbkdf2=promisify(pbkdf2Callback);
export {catalog};
export const COOKIE='__Host-lct-viewer-v3';
export const TTL=43200;
export const PROJECT='taoyuan-20261006';
export const ORIGINS=new Set(['https://lctstudio.tw','https://www.lctstudio.tw']);
export const UPSTREAM='https://lct-private-3d-viewer.private-3d-viewer.workers.dev';
export const SECURITY_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Strict-Transport-Security':'max-age=31536000','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
export const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{...SECURITY_HEADERS,...extra}});
export const clearCookie=accessId=>`${COOKIE}-${accessId}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
const equal=(a,b)=>{
  if(typeof a!=='string'||typeof b!=='string')return false;
  const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);
};
const secret=env=>typeof env.VIEWER_SESSION_SECRET==='string'&&env.VIEWER_SESSION_SECRET.length>=32?env.VIEWER_SESSION_SECRET:null;
const signature=(body,key)=>createHmac('sha256',key).update(body).digest('base64url');
function credentialRevision(accessId,env){
  let verifier=null;
  if(accessId!=='admin'&&accessId!=='H4mT8qP2vK6x'){
    try{const entries=JSON.parse(env.VIEWER_ACCESS_CREDENTIALS??'null');verifier=Object.hasOwn(entries??{},accessId)?entries[accessId]:null;}catch{return null;}
  }
  return createHash('sha256').update(JSON.stringify({epoch:env.VIEWER_AUTH_EPOCH??'1',verifier})).digest('base64url');
}
export function writeSession(data,env,now=Math.floor(Date.now()/1000)) {
  const key=secret(env);if(!key)throw Error('工作階段服務尚未設定');
  const session={...data,aud:'lct-viewer-v3',credentialRevision:credentialRevision(data.accessId,env),iat:now,exp:Math.min(now+TTL,data.upstreamExpiresAt??Infinity),nonce:randomUUID()};
  const body=Buffer.from(JSON.stringify(session)).toString('base64url');const token=body+'.'+signature(body,key);
  return {session,cookie:`${COOKIE}-${session.accessId}=${token}; Path=/; Max-Age=${Math.max(0,session.exp-now)}; HttpOnly; Secure; SameSite=Strict`};
}
function decodeSession(token,name,env,now){
  const key=secret(env);if(!key)return null;
  if(!token||token.length>3800)return null;
  const [body,sig,extra]=token.split('.');if(!body||!sig||extra||!equal(signature(body,key),sig))return null;
  try{const session=JSON.parse(Buffer.from(body,'base64url'));
    if(session.aud!=='lct-viewer-v3'||!['admin','viewer'].includes(session.role)||!Number.isInteger(session.iat)||!Number.isInteger(session.exp)||session.iat>now+5||session.exp<=now||session.exp>session.iat+TTL||typeof session.nonce!=='string')return null;
    if(session.role==='admin'?session.accessId!=='admin':!Object.hasOwn(catalog.entries,session.accessId))return null;
    if(name!==COOKIE+'-'+session.accessId)return null;
    if(!session.credentialRevision||!equal(session.credentialRevision,credentialRevision(session.accessId,env)))return null;
    return session;
  }catch{return null;}
}
export function readSessions(request,env,now=Math.floor(Date.now()/1000)){
  const sessions=[];
  for(const item of (request.headers.get('cookie')??'').split(';')){
    const equal=item.indexOf('=');if(equal<0)continue;
    const name=item.slice(0,equal).trim();if(!name.startsWith(COOKIE+'-'))continue;
    const session=decodeSession(item.slice(equal+1).trim(),name,env,now);if(session)sessions.push(session);
  }
  return sessions;
}
export function readSession(request,env,now=Math.floor(Date.now()/1000),accessId){
  return readSessions(request,env,now).find(session=>!accessId||session.accessId===accessId)??null;
}
export function scopeFor(session){
  if(session.role==='admin')return {projects:catalog.projects,comparisons:catalog.comparisons,access:{role:'admin',accessId:'admin'}};
  const entry=catalog.entries[session.accessId];if(!entry)return null;
  const comparison=catalog.comparisons.find(x=>x.id===entry.comparisonId);
  const ids=new Set(entry.projectIds??[entry.projectId]);
  if(comparison){ids.add(comparison.leftProjectId);ids.add(comparison.rightProjectId);for(const option of comparison.projectOptions??[])ids.add(option.projectId);}
  return {projects:catalog.projects.filter(x=>ids.has(x.id)),comparisons:comparison?[comparison]:[],access:{...entry,role:'viewer'}};
}
export function hasTaoyuan(session){return scopeFor(session)?.projects.some(x=>x.id==='taoyuan-building-overlay')??false;}
export function allowedAsset(session,id){return [1,2].includes(id)||scopeFor(session)?.projects.some(p=>p.modelSource.type==='cesium-ion'&&p.modelSource.assetId===id);}
export async function verifyPassword(accessId,password,env){
  let credentials;try{credentials=JSON.parse(env.VIEWER_ACCESS_CREDENTIALS??'null');}catch{return null;}
  const v=Object.hasOwn(credentials??{},accessId)?credentials[accessId]:null;if(!v)return null;
  const legacy=v.algorithm==='pbkdf2-sha256-of-sha256';
  if((legacy&&env.VIEWER_ALLOW_LEGACY_PASSWORDS!=='true')||(!legacy&&v.algorithm!=='pbkdf2-sha256')||!Number.isInteger(v.iterations)||v.iterations<(legacy?210000:600000)||v.iterations>1000000||!/^[a-f0-9]{32}$/.test(v.salt)||!/^[a-f0-9]{64}$/.test(v.hash))return null;
  const input=legacy?createHash('sha256').update(password).digest('hex'):password;
  const derived=(await pbkdf2(input,v.salt,v.iterations,32,'sha256')).toString('hex');return equal(derived,v.hash);
}
export async function readBody(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('格式不正確');
  const reader=request.body?.getReader();if(!reader)throw Error('缺少內容');
  const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw Error('內容過大');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks));
}
