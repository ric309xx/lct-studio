import type { ModelSource } from "./types/model";

export type AppConfig = {
  accessToken: string;
  modelSource: ModelSource;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function parseConfig(env: ImportMetaEnv): AppConfig {
  const accessToken = env.VITE_CESIUM_ION_ACCESS_TOKEN?.trim() ?? "";
  if (!accessToken) {
    throw new ConfigurationError(
      "尚未設定 Cesium ion Access Token。請複製 .env.example 為 .env 並填入 token。"
    );
  }

  const rawAssetId = env.VITE_CESIUM_ION_ASSET_ID?.trim() || "5094702";
  const assetId = Number(rawAssetId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    throw new ConfigurationError(
      "Cesium ion Asset ID 無效，請確認 VITE_CESIUM_ION_ASSET_ID。"
    );
  }

  return {
    accessToken,
    modelSource: { type: "cesium-ion", assetId }
  };
}
