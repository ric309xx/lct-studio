export class ModelGroundError extends Error {
  code: string;
  statusCode?: number;
  constructor(code: string, statusCode?: number);
}
export function sampleModelGround<T extends {height?: number} | undefined>(sample: () => Promise<T[]>, options?: {timeoutMs?: number; signal?: AbortSignal}): Promise<T[]>;
export function modelGroundFailure(error: unknown): {code: string; statusCode?: number; message: string; errorType?: string; api?: string};
