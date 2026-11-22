// Display-only difference field. It never edits source geometry or survey H.
export function terrainDisplayDelta(samples,east,north,full=35,limit=110){
  if(!Number.isFinite(east)||!Number.isFinite(north))return 0;
  const nearest=[];
  for(const p of samples){const d=Math.hypot(p.east-east,p.north-north);
    if(!Number.isFinite(d)||!Number.isFinite(p.delta)||Math.abs(p.delta)>100||d>=limit)continue;
    let index=0;while(index<nearest.length&&nearest[index].d<=d)index++;
    if(index<4){nearest.splice(index,0,{d,delta:p.delta});if(nearest.length>4)nearest.pop();}
  }
  if(!nearest.length)return 0;if(nearest[0].d<1e-6)return nearest[0].delta;
  let value=0,weight=0;for(const p of nearest){const w=1/Math.max(.01,p.d*p.d);value+=p.delta*w;weight+=w;}
  const t=Math.max(0,Math.min(1,(nearest[0].d-full)/(limit-full))),fade=1-t*t*(3-2*t);
  return value/weight*fade;
}
