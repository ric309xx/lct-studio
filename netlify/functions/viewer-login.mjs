import {createGateway} from '../lib/viewer-gateway.mjs';
export default createGateway();
export const config={path:'/api/viewer-session/login',rateLimit:{windowLimit:10,windowSize:60,aggregateBy:['ip','domain']}};
