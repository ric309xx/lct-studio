import fs from 'node:fs/promises';
import path from 'node:path';
import {ORIGINS,UPSTREAM,PROJECT,catalog,json,readBody,verifyPassword,readSession,writeSession,clearCookie,scopeFor,hasTaoyuan} from './viewer-auth.mjs';
const dataFiles=['taoyuan1006Parcels','taoyuan1010Parcels','taoyuan1013Parcels','taoyuan1013Cl2Parcels','taoyuan1015Parcels','taoyuanDriplineMetrics','caseMapGeometry','caseCaptureDates','shuanglingGround','taoyuan17Ground','taoyuan255Ground'];
const GUKENG_PROJECT='gukeng-20261019';
export function createGateway({env=()=>process.env,fetchUpstream=fetch,loadData=async name=>JSON.parse(await fs.readFile(path.join(process.cwd(),'viewer-source/src',name+'.json'),'utf8'))}={}){
  let meshAccess=null,meshInflight=null;
  async function upstream(action,body,origin,token){
    const r=await fetchUpstream(UPSTREAM+'/api/site-access/'+action,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw Object.assign(Error('登入失敗'),{status:[401,403,429,503].includes(r.status)?r.status:502});
    const now=Date.now()/1000;
    if(data.project!==body.project||!['admin','viewer'].includes(data.role)||typeof data.sessionToken!=='string'||typeof data.token!=='string'||!Number.isFinite(data.sessionExpiresAt)||data.sessionExpiresAt<=now||data.sessionExpiresAt>now+43201||!Number.isFinite(data.expiresAt)||data.expiresAt<=now||data.expiresAt>data.sessionExpiresAt)throw Error('上游回應不正確');
    return data;
  }
  async function bootstrap(session,origin,initial,requestedProject){
    const scope=scopeFor(session);if(!scope)throw Error('專案不存在');
    if(requestedProject===GUKENG_PROJECT&&(session.role!=='admin'||!session.upstreamSessionToken||!scope.projects.some(p=>p.modelSource.privateProjectId===GUKENG_PROJECT)))
      throw Object.assign(Error('專案不允許'),{status:403});
    let access=null;const data={},r2Access={};
    if(hasTaoyuan(session)){
      if(!session.upstreamSessionToken)throw Object.assign(Error('請重新登入'),{status:401});
      const result=initial??await upstream('refresh',{project:PROJECT},origin,session.upstreamSessionToken);
      access={project:PROJECT,role:session.role,token:result.token,expiresAt:Math.min(result.expiresAt,session.exp)};
      r2Access[PROJECT]=access;
      for(const name of dataFiles)data[name+'.json']=await loadData(name);
    }
    const mesh='longdong-pix4d-mesh-20260805';
    if(scope.projects.some(p=>p.modelSource.type==='tileset-url'&&p.modelSource.privateProjectId===mesh)){
      const settings=env(),key=settings.VIEWER_R2_SERVICE_PASSWORD;
      if(typeof key!=='string'||key.length<24)throw Object.assign(Error('私人模型授權尚未設定'),{status:503});
      if(!meshAccess||meshAccess.key!==key||meshAccess.origin!==origin||meshAccess.value.expiresAt<Date.now()/1000+30){
        if(!meshInflight)meshInflight=upstream('login',{project:mesh,role:'viewer',password:key},origin).then(value=>{
          if(value.role!=='viewer')throw Error('私人模型授權身分不符');
          meshAccess={key,origin,value};return meshAccess;
        }).finally(()=>{meshInflight=null;});
        await meshInflight;
      }
      r2Access[mesh]={project:mesh,role:session.role,token:meshAccess.value.token,expiresAt:Math.min(meshAccess.value.expiresAt,session.exp)};
      access??=r2Access[mesh];
    }
    if(requestedProject===GUKENG_PROJECT){
      const result=await upstream('exchange',{project:GUKENG_PROJECT},origin,session.upstreamSessionToken);
      if(result.role!=='admin')throw Object.assign(Error('管理員身分不符'),{status:403});
      r2Access[GUKENG_PROJECT]={project:GUKENG_PROJECT,role:'admin',token:result.token,expiresAt:Math.min(result.expiresAt,session.exp)};
    }
    return {role:session.role,sessionExpiresAt:session.exp,...scope,data,r2:access,r2Access};
  }
  return async request=>{
    const url=new URL(request.url),action=url.pathname.split('/').pop(),settings=env();
    if(request.method!=='POST')return json({error:'Method not allowed'},405,{Allow:'POST'});
    const previewOrigin='https://security-preview-20261118--lct-studio.netlify.app';
    const trusted=ORIGINS.has(url.origin)||(settings.VIEWER_PREVIEW_ORIGIN===previewOrigin&&url.origin===previewOrigin);
    if(!trusted||request.headers.get('origin')!==url.origin)return json({error:'來源不允許'},403);
    // 預覽主機必須個別啟用；上游仍只接受既有官網來源。
    const upstreamOrigin=ORIGINS.has(url.origin)?url.origin:'https://lctstudio.tw';
    if(!['login','refresh','bootstrap','logout'].includes(action))return json({error:'Not found'},404);
    if(typeof settings.VIEWER_SESSION_SECRET!=='string'||settings.VIEWER_SESSION_SECRET.length<32)return json({error:'登入服務尚未設定'},503);
    let input;try{input=await readBody(request);}catch{return json({error:'請求格式不正確或過大'},400);}
    if(action==='logout'){
      if(input?.accessId!=='admin'&&!Object.hasOwn(catalog.entries,input?.accessId??'')&&!Object.hasOwn(catalog.retiredEntries??{},input?.accessId??''))return json({error:'分享入口不存在'},400);
      return json({ok:true},200,{'Set-Cookie':clearCookie(input.accessId)});
    }
    try{
      if(action==='login'){
        const {accessId,password}=input??{};
        if(typeof accessId!=='string'||typeof password!=='string'||password.length<1||password.length>64)return json({error:'登入資料不正確'},400);
        const entry=accessId==='admin'?null:(Object.hasOwn(catalog.entries,accessId)?catalog.entries[accessId]:null);
        if(accessId!=='admin'&&!entry)return json({error:'分享入口不存在'},404);
        const usesUpstream=accessId==='admin'||entry.projectId==='taoyuan-building-overlay';
        let initial=null;
        if(usesUpstream){initial=await upstream('login',{project:PROJECT,role:accessId==='admin'?'admin':'viewer',password},upstreamOrigin);
          if(initial.role!==(accessId==='admin'?'admin':'viewer'))return json({error:'登入身分不符'},403);
        }else{
          const valid=await verifyPassword(accessId,password,settings);
          if(valid===null)return json({error:'此分享入口尚未設定伺服器密碼'},503);
          if(!valid)return json({error:'密碼不正確'},401);
        }
        const issued=writeSession({accessId,role:accessId==='admin'?'admin':'viewer',...(initial?{upstreamSessionToken:initial.sessionToken,upstreamExpiresAt:initial.sessionExpiresAt}:{})},settings);
        return json(await bootstrap(issued.session,upstreamOrigin,initial),200,{'Set-Cookie':issued.cookie});
      }
      const session=readSession(request,settings,undefined,input?.accessId);if(!session)return json({error:'登入已過期，請重新登入'},401);
      // 分享入口還原時不接受其他分頁留下的管理員或不同分享工作階段。
      if(input?.accessId&&input.accessId!==session.accessId)return json({error:'請登入此分享入口'},403);
      return json(await bootstrap(session,upstreamOrigin,undefined,input?.project));
    }catch(error){const status=error.status??502;return json({error:status===429?'嘗試次數過多，請稍後再試':'登入服務暫時無法使用或登入已失效'},status,
      {...(status===429?{'Retry-After':'60'}:{})});}
  };
}
