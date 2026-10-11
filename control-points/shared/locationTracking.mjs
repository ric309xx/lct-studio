// GPS fixes keep the location marker and distance current. Only an explicit
// locate request may move the map, and that request is consumed by one fix.
/** @param {{onPosition: (position: {lon:number,lat:number,accuracy:number,timestamp:number})=>void, onLocate: (position: {lon:number,lat:number,accuracy:number,timestamp:number})=>void, onError: (error: GeolocationPositionError)=>void}} callbacks */
export function createLocationTracking({onPosition,onLocate,onError}) {
  let watch=null,geo=null,latest=null,pending=false,generation=0;
  return {
    /** @param {Geolocation} geolocation */
    request(geolocation) {
      pending=true;
      if(latest){pending=false;onLocate({...latest});}
      if(watch!==null)return false;
      geo=geolocation;const current=++generation;
      watch=geo.watchPosition(fix=>{
        if(current!==generation)return;
        latest={lon:fix.coords.longitude,lat:fix.coords.latitude,accuracy:fix.coords.accuracy,timestamp:fix.timestamp};
        onPosition(latest);
        if(pending){pending=false;onLocate({...latest});}
      },error=>{
        if(current!==generation)return;
        if(watch!==null)geo.clearWatch(watch);
        watch=null;latest=null;pending=false;generation++;onError(error);
      },{enableHighAccuracy:true,maximumAge:10000,timeout:20000});
      return true;
    },
    cancelFocus(){pending=false;},
    stop(){generation++;pending=false;latest=null;if(watch!==null)geo.clearWatch(watch);watch=null;}
  };
}
