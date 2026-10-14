/** 不假裝成功：只有瀏覽器實際完成鎖定才回報 locked。 */
export function createScreenLock({orientation,document}){
  let ownedFullscreen=false;
  return {
    async lock(){
      if(typeof orientation?.lock!=='function')return {locked:false,message:'此瀏覽器未提供螢幕方向鎖定。iPhone Safari 請使用控制中心的「直向鎖定」；本站無法代替系統開啟。'};
      try{await orientation.lock('portrait-primary');return {locked:true,message:'已固定直向，手機轉向時畫面保持直向。'};}
      catch{
        if(!document.fullscreenElement&&typeof document.documentElement.requestFullscreen==='function'){
          try{await document.documentElement.requestFullscreen();ownedFullscreen=true;await orientation.lock('portrait-primary');return {locked:true,message:'已於全螢幕固定直向。'};}catch{}
        }
        if(ownedFullscreen){try{await document.exitFullscreen();}catch{}ownedFullscreen=false;}
        return {locked:false,message:'瀏覽器不允許本站鎖定螢幕方向。iPhone 請開啟控制中心的「直向鎖定」。'};
      }
    },
    async unlock(){try{orientation?.unlock?.();}catch{}if(ownedFullscreen){try{await document.exitFullscreen();}catch{}ownedFullscreen=false;}}
  };
}
