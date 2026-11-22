import {readCadastralToken, corsResponse, CADASTRAL_ORIGINS} from './cadastral-access.mjs';
import {GUKENG_ASSETS} from './gukeng-assets.mjs';

export const GUKENG_PROJECT = 'gukeng-20261019';
const PREFIX = 'survey-results/gukeng-20261019/20261021-v7/';

// This route deliberately does not accept the legacy private-viewer Cookie.
// Only a website admin may exchange its existing session for this read scope.
export async function gukengAsset(request, env, encodedPath) {
  const reply = (body, status, headers = {}) => corsResponse(request, new Response(body, {
    status, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers}
  }));
  if (request.method === 'OPTIONS') return CADASTRAL_ORIGINS.has(request.headers.get('origin'))
    ? reply(null, 204) : reply('Origin not allowed', 403);
  if (!['GET','HEAD'].includes(request.method)) return reply('Method not allowed',405,{Allow:'GET, HEAD, OPTIONS'});
  const access = await readCadastralToken(request, env.SESSION_SECRET);
  if (!access) return reply('Unauthorized', 401);
  if (access.projectId !== GUKENG_PROJECT) return reply('Forbidden',403);
  let relative;
  try { relative = decodeURIComponent(encodedPath); } catch { return reply('Invalid path',400); }
  if (!relative || /[\\\x00-\x1f%?#]/.test(relative) || relative.split('/').some(x=>!x||x==='.'||x==='..'))
    return reply('Invalid path',400);
  const asset = Object.hasOwn(GUKENG_ASSETS,relative) ? GUKENG_ASSETS[relative] : null;
  if (!asset) return reply('Not found',404);
  const key = PREFIX + asset.key;
  const object = request.method === 'HEAD' ? await env.MODELS.head(key) : await env.MODELS.get(key,{range:request.headers});
  if (!object) return reply('Not found',404);
  const range = request.method === 'GET' && request.headers.has('range') ? object.range : null;
  const headers = {'Content-Type':asset.type,'Accept-Ranges':'bytes','ETag':object.httpEtag,
    'Content-Length':String(range?.length ?? object.size)};
  if (range) headers['Content-Range'] = `bytes ${range.offset}-${range.offset+range.length-1}/${object.size}`;
  return reply(request.method === 'HEAD' ? null : object.body,range ? 206 : 200,headers);
}
