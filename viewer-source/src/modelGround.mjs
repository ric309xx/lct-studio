// Never turn missing model heights into an invented ground plane.
export class ModelGroundError extends Error {
  constructor(code, statusCode) {
    super('Model ground preparation unavailable');
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function sampleModelGround(sample, {timeoutMs = 45000, signal} = {}) {
  if (signal?.aborted) throw new ModelGroundError('cancelled');
  let timer, abort;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ModelGroundError('timeout')), timeoutMs);
      abort = () => reject(new ModelGroundError('cancelled'));
      signal?.addEventListener('abort', abort, {once: true});
    });
    const points = await Promise.race([Promise.resolve().then(sample), deadline]);
    if (!Array.isArray(points) || !points.some(point => Number.isFinite(point?.height))) {
      throw new ModelGroundError('no-height');
    }
    return points;
  } catch (error) {
    if (error instanceof ModelGroundError) throw error;
    const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode : undefined;
    // Do not retain upstream URLs, request headers, or credential-bearing errors.
    throw new ModelGroundError('request', statusCode);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}

export function modelGroundFailure(error) {
  const code = error instanceof ModelGroundError ? error.code : 'preparation';
  const statusCode = error instanceof ModelGroundError ? error.statusCode : undefined;
  const message = code === 'no-height'
    ? '地籍界線上沒有可用的模型高度，暫時無法建立地面套繪；仍可使用原始顯示。'
    : code === 'timeout'
      ? '模型地面高度取樣逾時；仍可使用原始顯示，或稍後重試。'
      : [401, 403].includes(statusCode)
        ? '模型高度取樣授權已失效，請登出後重新登入。'
        : statusCode === 413
          ? '模型高度取樣資源超過目前平台限制；請先使用原始顯示。'
          : '模型地面套繪無法完成；仍可使用原始顯示，或稍後重試。';
  return {code, statusCode, message};
}
