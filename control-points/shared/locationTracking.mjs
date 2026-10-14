// Following is explicit and lasts until paused. GPS still updates the marker
// and distances while browsing a point, without taking the map back.
/** @param {{onPosition: (position: {lon:number,lat:number,accuracy:number,timestamp:number})=>void, onLocate: (position: {lon:number,lat:number,accuracy:number,timestamp:number}, initial:boolean, follow:boolean)=>void, onError: (error: GeolocationPositionError)=>void, onState?: (state:'idle'|'locating'|'following')=>void}} callbacks */
export function createLocationTracking({onPosition,onLocate,onError,onState=()=>{}}) {
  let watch=null,geo=null,latest=null,mode='idle',initial=false,generation=0;
  return {
    /** @param {Geolocation} geolocation @param {'single'|'follow'} requestedMode @param {boolean} fresh */
    request(geolocation,requestedMode='single',fresh=false) {
      if(fresh){generation++;if(watch!==null)geo.clearWatch(watch);watch=null;latest=null;}
      mode=requestedMode;initial=true;
      onState(latest?(mode==='follow'?'following':'idle'):'locating');
      if(latest){initial=false;onLocate({...latest},true,mode==='follow');if(mode==='single')mode='idle';}
      if(watch!==null)return false;
      geo=geolocation;const current=++generation;
      watch=geo.watchPosition(fix=>{
        if(current!==generation)return;
        latest={lon:fix.coords.longitude,lat:fix.coords.latitude,accuracy:fix.coords.accuracy,timestamp:fix.timestamp};
        onPosition(latest);
        if(mode!=='idle'){const first=initial,follow=mode==='follow';initial=false;if(!follow)mode='idle';onState(follow?'following':'idle');onLocate({...latest},first,follow);}
      },error=>{
        if(current!==generation)return;
        if(watch!==null)geo.clearWatch(watch);
        watch=null;latest=null;mode='idle';initial=false;generation++;onState('idle');onError(error);
      },{enableHighAccuracy:true,maximumAge:fresh?0:10000,timeout:20000});
      return true;
    },
    cancelFocus(){mode='idle';initial=false;onState('idle');},
    stop(){generation++;mode='idle';initial=false;latest=null;if(watch!==null)geo.clearWatch(watch);watch=null;onState('idle');}
  };
}
