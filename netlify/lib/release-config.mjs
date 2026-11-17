import {catalog} from './viewer-auth.mjs';
// 僅回傳缺少的設定名稱或入口 ID，不回傳秘密實際值。
export function checkReleaseConfig(env){
  const issues=[];
  if(typeof env.VIEWER_SESSION_SECRET!=='string'||env.VIEWER_SESSION_SECRET.length<32)issues.push('VIEWER_SESSION_SECRET');
  if(typeof env.VIEWER_AUTH_EPOCH!=='string'||env.VIEWER_AUTH_EPOCH.length<16)issues.push('VIEWER_AUTH_EPOCH');
  if(typeof env.VIEWER_R2_SERVICE_PASSWORD!=='string'||env.VIEWER_R2_SERVICE_PASSWORD.length<24)issues.push('VIEWER_R2_SERVICE_PASSWORD');
  if(typeof env.CESIUM_ION_ACCESS_TOKEN!=='string'||env.CESIUM_ION_ACCESS_TOKEN.length<20||/REPLACE_|PLACEHOLDER|CHANGE_ME/i.test(env.CESIUM_ION_ACCESS_TOKEN))issues.push('CESIUM_ION_ACCESS_TOKEN');
  if(env.VIEWER_ALLOW_LEGACY_PASSWORDS==='true')issues.push('VIEWER_ALLOW_LEGACY_PASSWORDS');
  let verifiers;try{verifiers=JSON.parse(env.VIEWER_ACCESS_CREDENTIALS??'null');}catch{}
  if(!verifiers||Array.isArray(verifiers)||typeof verifiers!=='object')issues.push('VIEWER_ACCESS_CREDENTIALS');
  else for(const entry of Object.values(catalog.entries)){
    if(entry.projectId==='taoyuan-building-overlay')continue;
    const v=Object.hasOwn(verifiers,entry.accessId)?verifiers[entry.accessId]:null;
    if(!v||v.algorithm!=='pbkdf2-sha256'||!Number.isInteger(v.iterations)||v.iterations<600000||v.iterations>1000000||!/^[a-f0-9]{32}$/.test(v.salt)||!/^[a-f0-9]{64}$/.test(v.hash))issues.push('VIEWER_ACCESS_CREDENTIALS:'+entry.accessId);
  }
  return {ready:issues.length===0,issues};
}
