import {defaults as defaultInteractions} from 'ol/interaction/defaults.js';

// List selection is an explicit request to locate a point. Finish it in one
// frame so it cannot compete with the next drag / wheel / pinch gesture.
export function focusPointImmediately(view,coordinate,minZoom=17) {
  view.cancelAnimations();
  view.setCenter(coordinate);
  view.setZoom(Math.max(view.getZoom()??minZoom,minZoom));
}

// Only the first fix sets a useful scale. Later fixes and off-center zooms
// preserve the user's scale, and never interrupt an ongoing pinch gesture.
export function followLocationImmediately(view,coordinate,initial=false) {
  if(view.getInteracting())return;
  if(initial){focusPointImmediately(view,coordinate,16);return;}
  const center=view.getCenter();
  if(!center||Math.abs(center[0]-coordinate[0])>0.001||Math.abs(center[1]-coordinate[1])>0.001){
    view.cancelAnimations();view.setCenter(coordinate);
  }
}

export function pausesLocationFollow(event) {
  return event.type==='pointerdrag'&&(event.activePointers?.length??1)===1;
}

// The map remains keyboard-focusable, but drag / wheel must also work while
// a point-list or detail button owns focus. Otherwise the first drag is lost.
export function mapInteractions() {
  return defaultInteractions({onFocusOnly:false});
}
