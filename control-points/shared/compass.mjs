/** 只使用真正的北向讀值；一般相對 alpha 不能當成羅盤。 */
export function compassHeading(event) {
  if(Number.isFinite(event.webkitCompassHeading)&&(event.webkitCompassAccuracy==null||event.webkitCompassAccuracy>=0))return (event.webkitCompassHeading%360+360)%360;
  if(event.absolute===true&&Number.isFinite(event.alpha))return (360-event.alpha)%360;
  return null;
}

/** @param {{scope:any,onHeading:(heading:number|null)=>void,onState:(state:string)=>void}} options */
export function createCompass({scope,onHeading,onState}) {
  let generation=0,timer=null,listening=false;
  const listener=event=>{const heading=compassHeading(event);if(heading==null)return;if(timer!==null){scope.clearTimeout(timer);timer=null;}onHeading(heading);onState('ready');};
  function cleanup(){if(timer!==null)scope.clearTimeout(timer);timer=null;if(listening){scope.removeEventListener('deviceorientation',listener);scope.removeEventListener('deviceorientationabsolute',listener);}listening=false;onHeading(null);}
  return {
    async enable(){
      const current=++generation;cleanup();
      const orientation=scope.DeviceOrientationEvent;
      if(!scope.isSecureContext||!orientation){onState('unsupported');return;}
      onState('waiting');
      try {
        // 直接由按鈕呼叫，保持 iOS 所需的使用者操作；true 請求北向感測。
        const permission=orientation.requestPermission?await orientation.requestPermission(true):'granted';
        if(current!==generation)return;
        if(permission!=='granted'){onState('denied');return;}
        scope.addEventListener('deviceorientation',listener);scope.addEventListener('deviceorientationabsolute',listener);listening=true;
        timer=scope.setTimeout(()=>{timer=null;onState('unavailable');},6000);
      }catch{if(current===generation)onState('denied');}
    },
    stop(){generation++;cleanup();onState('idle');}
  };
}
