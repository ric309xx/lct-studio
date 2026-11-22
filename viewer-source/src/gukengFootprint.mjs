// Simplification is for the background mask only. Never use it for quantities,
// model geometry, surveyed boundaries or coordinate export.
export function simplifyGukengFootprint(input,tolerance=.1){
  if(!Array.isArray(input)||!Number.isFinite(tolerance)||tolerance<0)throw Error('Invalid footprint');
  const points=[];
  for(const p of input){
    if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite))throw Error('Invalid footprint point');
    const previous=points.at(-1);if(!previous||Math.hypot(p[0]-previous[0],p[1]-previous[1])>1e-6)points.push([...p]);
  }
  if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<1e-6)points.pop();
  if(points.length<3)throw Error('Empty footprint');
  const distance=(p,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  };
  let opposite=1;
  for(let i=2;i<points.length;i++)if(Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1])>Math.hypot(points[opposite][0]-points[0][0],points[opposite][1]-points[0][1]))opposite=i;
  const simplify=path=>{
    const keep=new Set([0,path.length-1]),stack=[[0,path.length-1]];
    while(stack.length){const [start,end]=stack.pop();let far=-1,max=tolerance;
      for(let i=start+1;i<end;i++){const d=distance(path[i],path[start],path[end]);if(d>max){max=d;far=i;}}
      if(far!==-1){keep.add(far);stack.push([start,far],[far,end]);}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>path[i]);
  };
  const result=[...simplify(points.slice(0,opposite+1)).slice(0,-1),...simplify([...points.slice(opposite),points[0]]).slice(0,-1)];
  const area=Math.abs(result.reduce((sum,p,i)=>{const q=result[(i+1)%result.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
  if(result.length<3||result.length>2048||area<.25)throw Error('Degenerate footprint');
  return result;
}
