import {distance} from '../shared/coordinates.mjs';
import {stepInstruction} from '../shared/finding.mjs';
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=117&&p[0]<=125&&p[1]>=20&&p[1]<=28;
export function parseWalkingRoute(data,origin,target) {
  const r=data?.routes?.[0],coords=r?.geometry?.coordinates;
  if(data?.code!=='Ok'||!r)throw problem('附近沒有可規劃的步行路線，請改用直線方向找點。',422);
  if(r.geometry?.type!=='LineString'||!Array.isArray(coords)||coords.length<2||coords.length>50000||!coords.every(valid)||!Number.isFinite(r.distance)||r.distance<0||!Number.isFinite(r.duration)||r.duration<0)throw problem('路線服務回覆異常，仍可使用直線找點。',503);
  const originGap=distance(origin,coords[0]),targetGap=distance(target,coords.at(-1));
  if(originGap>350||targetGap>350)throw problem('起終點離可步行路網太遠，請改用直線方向找點。',422);
  const steps=(r.legs||[]).flatMap(leg=>leg.steps||[]).slice(0,500).map(s=>({instruction:stepInstruction(s),distance:Number.isFinite(s.distance)?s.distance:0}));
  return {coordinates:coords,distance:r.distance,duration:r.duration,originGap,targetGap,steps,origin,target,attribution:'© OpenStreetMap contributors · FOSSGIS / OSRM'};
}
export function createWalkingRoute({fetcher=fetch,time=Date.now}={}) {
  let lastRequest=-Infinity;
  return async function(origin,target,endpoint='https://routing.openstreetmap.de/routed-foot/route/v1/foot/') {
    if(!valid(origin)||!valid(target))throw problem('請先取得台灣周邊有效定位，再規劃路線。');
    if(distance(origin,target)>50000)throw problem('請先移到目標 50 公里內再規劃步行路線。');
    if(time()-lastRequest<1200)throw problem('路線規劃過於頻繁，請稍候再試。',429);
    lastRequest=time();
    const url=new URL(`${endpoint}${origin.join(',')};${target.join(',')}`);
    url.searchParams.set('overview','full');url.searchParams.set('geometries','geojson');url.searchParams.set('steps','true');url.searchParams.set('radiuses','300;300');
    let response,data;
    try{response=await fetcher(url,{headers:{'User-Agent':'LCTControlPoints/0.1 (+https://lctstudio.tw)','Accept':'application/json'},signal:AbortSignal.timeout(15000)});data=await response.json();}catch{throw problem('步行路線暫時無法連線，仍可使用直線找點。',503);}
    if(!response.ok&&data?.code!=='NoRoute'&&data?.code!=='NoSegment')throw problem('步行路線服務忙碌，請稍後再試。',503);
    return parseWalkingRoute(data,origin,target);
  };
}
