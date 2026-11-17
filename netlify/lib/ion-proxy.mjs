import {readSessions,allowedAsset,json,SECURITY_HEADERS} from './viewer-auth.mjs';
import {readBoundedText} from './bounded-response.mjs';
const MAX_INDEX_BYTES=5*1024*1024;
const MAX_STREAM_BYTES=20*1024*1024;
const allowedHost=host=>host==='assets.cesium.com'||host==='assets.ion.cesium.com'||/^[a-z0-9-]+\.assets\.ion\.cesium\.com$/.test(host);
function trustedUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.port||url.username||url.password||!allowedHost(url.hostname))throw Error('不允許的資產來源');return url;}
export function createIonProxy({env=()=>process.env,fetchUpstream=fetch}={}){
  const endpoints=new Map();
  async function endpoint(id,settings,force=false){
    const cached=endpoints.get(id);
    if(!force&&cached&&cached.until>Date.now()&&cached.key===settings.CESIUM_ION_ACCESS_TOKEN)return cached.data;
    if(!settings.CESIUM_ION_ACCESS_TOKEN)throw Object.assign(Error('尚未設定資產服務'),{status:503});
    const response=await fetchUpstream('https://api.cesium.com/v1/assets/'+id+'/endpoint',{
      headers:{Authorization:'Bearer '+settings.CESIUM_ION_ACCESS_TOKEN,Referer:'https://lctstudio.tw/'},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Object.assign(Error('資產服務暫時無法使用'),{status:502});
    const data=JSON.parse(await readBoundedText(response,256*1024));
    if(data.externalType){if(id!==2)throw Error('不允許的外部私人資產');}
    else {trustedUrl(data.url);if(typeof data.accessToken!=='string')throw Error('資產回應不正確');}
    if(endpoints.size>64)endpoints.clear();endpoints.set(id,{data,until:Date.now()+60000,key:settings.CESIUM_ION_ACCESS_TOKEN});return data;
  }
  function proxyUrl(value,base,root,id,origin){
    if(typeof value!=='string'||value.startsWith('data:'))return value;
    const target=new URL(value,base);
    if(target.origin!==root.origin||!target.pathname.startsWith(root.pathname))throw Error('資產子路徑超出授權範圍');
    if(target.username||target.password)throw Error('資產 URL 不得包含憑證');
    const result=new URL('/api/viewer-assets/'+id+'/'+target.pathname.slice(root.pathname.length),origin);
    for(const [key,val] of target.searchParams)if(['v','extensions'].includes(key))result.searchParams.append(key,val);
    return result.href.replaceAll('%7B','{').replaceAll('%7D','}');
  }
  function rewrite(value,base,root,id,origin){
    if(Array.isArray(value))return value.map(x=>rewrite(x,base,root,id,origin));
    if(!value||typeof value!=='object')return value;
    const out={};for(const [key,item] of Object.entries(value)){
      if(['uri','url','schemaUri','parentUrl'].includes(key)&&typeof item==='string')out[key]=proxyUrl(item,base,root,id,origin);
      else if(key==='tiles'&&Array.isArray(item))out[key]=item.map(value=>typeof value==='string'?proxyUrl(value,base,root,id,origin):rewrite(value,base,root,id,origin));
      else out[key]=rewrite(item,base,root,id,origin);
    }
    return out;
  }
  return async request=>{
    const url=new URL(request.url),settings=env();
    if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed'},405);
    const sessions=readSessions(request,settings);if(!sessions.length)return json({error:'請先登入'},401);
    const api=url.pathname.match(/^\/api\/viewer-ion\/v1\/assets\/(\d+)\/endpoint$/);
    const tile=url.pathname.match(/^\/api\/viewer-assets\/(\d+)\/(.+)$/);
    if(!api&&!tile)return json({error:'Not found'},404);
    const id=Number((api??tile)[1]);if(!Number.isSafeInteger(id)||!sessions.some(session=>allowedAsset(session,id)))return json({error:'此專案無權讀取資產'},403);
    try{
      let data=await endpoint(id,settings);
      // 公開底圖供應商的設定只提供給已登入使用者，不含本站 ion 主權杖。
      if(api&&data.externalType)return json(data);
      if(data.externalType)return json({error:'Not found'},404);
      const initial=trustedUrl(data.url),root=new URL('.',initial);
      if(api){
        const local=new URL('/api/viewer-assets/'+id+'/'+initial.pathname.slice(root.pathname.length),url.origin);
        if(initial.searchParams.has('v'))local.searchParams.set('v',initial.searchParams.get('v'));
        return json({type:data.type,url:local.href,accessToken:'cookie-session',attributions:data.attributions??[]});
      }
      let relative;try{relative=decodeURIComponent(tile[2]);}catch{return json({error:'Invalid path'},400);}
      if(/[\\\x00?#]/.test(relative)||relative.split('/').some(x=>x==='..'||x==='.')||relative.startsWith('/')||relative.includes('://'))return json({error:'Invalid path'},400);
      const target=new URL(relative,root);
      if(target.origin!==root.origin||!target.pathname.startsWith(root.pathname))return json({error:'Invalid path'},400);
      for(const [key,value]of initial.searchParams)if(key!=='access_token')target.searchParams.set(key,value);
      // 只轉送 Cesium 需要的查詢參數，不接受客戶端提供權杖或目標網址。
      for(const [key,value]of url.searchParams)if(['v','extensions'].includes(key))target.searchParams.set(key,value);
      const makeRequest=token=>fetchUpstream(target,{method:request.method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Referer:'https://lctstudio.tw/',...(request.headers.has('range')?{Range:request.headers.get('range')}:{})}});
      let response=await makeRequest(data.accessToken);
      if(response.status===401){data=await endpoint(id,settings,true);response=await makeRequest(data.accessToken);}
      if(![200,206,304,416].includes(response.status))return json({error:'資產讀取失敗'},response.status===404?404:502);
      const headers=new Headers(SECURITY_HEADERS);
      for(const key of ['content-type','content-range','accept-ranges','etag'])if(response.headers.has(key))headers.set(key,response.headers.get(key));
      if(request.method==='HEAD'||[304,416].includes(response.status))return new Response(null,{status:response.status,headers});
      if(Number(response.headers.get('content-length'))>MAX_STREAM_BYTES){await response.body?.cancel();return json({error:'模型單檔超過目前代理平台限制，請聯絡管理員'},413);}
      if(/\.(json|gltf)$/i.test(target.pathname)){
        const raw=await readBoundedText(response,MAX_INDEX_BYTES);
        const body=JSON.stringify(rewrite(JSON.parse(raw),target,root,id,url.origin));
        if(Buffer.byteLength(body)>MAX_INDEX_BYTES)throw Error('轉送索引過大');
        headers.set('Content-Type','application/json; charset=utf-8');
        return new Response(body,{status:response.status,headers});
      }
      if(/\.xml$/i.test(target.pathname)){
        const raw=await readBoundedText(response,MAX_INDEX_BYTES);
        const body=raw.replace(/(?:href|url)=(['"])(.*?)\1/g,(match,quote,value)=>match.replace(quote+value+quote,quote+proxyUrl(value,target,root,id,url.origin)+quote));
        if(Buffer.byteLength(body)>MAX_INDEX_BYTES)throw Error('轉送索引過大');
        return new Response(body,{status:response.status,headers});
      }
      return new Response(response.body,{status:response.status,headers});
    }catch(error){return json({error:'模型服務暫時無法使用'},error.status??502);}
  };
}
