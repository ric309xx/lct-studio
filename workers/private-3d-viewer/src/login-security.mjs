// 使用 Cloudflare 提供的計數器，不以單一執行個體記憶體計數。
export async function checkLoginLimit(request, env) {
  if (!env.LOGIN_RATE_LIMITER?.limit) return new Response('登入保護尚未設定', {status:503});
  try {
    // 共用密碼登入前尚無已驗證的使用者識別碼。
    // 僅雜湊邊緣節點提供的 IP，不信任 X-Forwarded-For 或客戶端輸入。
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.headers.get('cf-connecting-ip') || 'unknown'));
    const key = 'login:' + [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
    const {success} = await env.LOGIN_RATE_LIMITER.limit({key});
    return success ? null : new Response('嘗試次數過多，請稍後再試', {status:429, headers:{'Retry-After':'60','Cache-Control':'no-store'}});
  } catch { return new Response('登入保護暫時無法使用', {status:503}); }
}

export async function readLimitedText(request, maximum = 4096) {
  if (Number(request.headers.get('content-length') || 0) > maximum) throw new RangeError('Request too large');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new RangeError('Request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
