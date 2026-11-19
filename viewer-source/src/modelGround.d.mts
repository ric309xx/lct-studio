export class ModelGroundError extends Error {
  code: string;
  statusCode?: number;
  constructor(code: string, statusCode?: number);
}
export function sampleModelGround<T extends {height?: number} | undefined>(sample: () => Promise<T[]>, options?: {timeoutMs?: number; signal?: AbortSignal}): Promise<T[]>;
export function modelGroundFailure(error: unknown): {code: string; statusCode?: number; message: string; errorType?: string; api?: string};
export function selectModelGroundProfiles(projectId: string, parcel?: {key?: string; groupKey?: string}, road17?: {parcelKey?: string}, road255?: {groupKey?: string}): {road: boolean; road17: boolean; road255: boolean; road174: boolean};
