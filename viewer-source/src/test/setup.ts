import "@testing-library/jest-dom/vitest";
import catalog from './viewer-catalog.json';
import type {ViewerBootstrap} from '../bootstrap';
window.LCT_VIEWER_BOOTSTRAP={role:'admin',sessionExpiresAt:Date.now()/1000+3600,access:{accessId:'admin',role:'admin'},projects:catalog.projects,comparisons:catalog.comparisons,data:{},r2:null} as ViewerBootstrap;
