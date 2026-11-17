import {createGateway} from '../lib/viewer-gateway.mjs';
export default createGateway();
export const config={path:['/api/viewer-session/refresh','/api/viewer-session/bootstrap','/api/viewer-session/logout']};
