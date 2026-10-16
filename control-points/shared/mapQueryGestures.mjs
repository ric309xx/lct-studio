// Touch/pen long presses share the desktop context query; taps and drags stay normal.
export function installMapQueryGestures(target,{query,isDisabled=()=>false,delay=600,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now}){
  let timer=null,start=null,lastQuery=-Infinity;
  function cancel(){if(timer!==null)clearTimer(timer);timer=null;start=null;}
  function down(event){
    if(!['touch','pen'].includes(event.pointerType))return;
    cancel();
    if(!event.isPrimary||event.button!==0||isDisabled())return;
    start={id:event.pointerId,x:event.clientX,y:event.clientY};
    timer=setTimer(()=>{timer=null;start=null;if(isDisabled())return;lastQuery=now();query(event);},delay);
  }
  function move(event){if(start&&event.pointerId===start.id&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)cancel();}
  const handlers={pointerdown:down,pointermove:move,pointerup:cancel,pointercancel:cancel,pointerleave:cancel};
  for(const [name,handler] of Object.entries(handlers))target.addEventListener(name,handler,{passive:true});
  return {suppressClick:()=>now()-lastQuery<800,dispose(){cancel();for(const [name,handler] of Object.entries(handlers))target.removeEventListener(name,handler);}};
}
