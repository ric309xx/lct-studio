import { ConfigurationError } from "./config";

export function toViewerError(error: unknown): string {
  if (error instanceof ConfigurationError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) {
    return "無法讀取模型。請確認 token 具備 assets:read 權限，且允許此 Asset 與目前網址。";
  }

  return `模型載入失敗：${message || "未知錯誤"}。請檢查網路連線與 Asset ID。`;
}
