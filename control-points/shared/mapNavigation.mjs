import {defaults as defaultInteractions} from 'ol/interaction/defaults.js';

// List selection is an explicit request to locate a point. Finish it in one
// frame so it cannot compete with the next drag / wheel / pinch gesture.
export function focusPointImmediately(view,coordinate) {
  view.cancelAnimations();
  view.setCenter(coordinate);
  view.setZoom(Math.max(view.getZoom()??17,17));
}

// The map remains keyboard-focusable, but drag / wheel must also work while
// a point-list or detail button owns focus. Otherwise the first drag is lost.
export function mapInteractions() {
  return defaultInteractions({onFocusOnly:false});
}
