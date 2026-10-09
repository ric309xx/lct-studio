/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_ACCESS_TOKEN?: string;
  readonly VITE_CESIUM_ION_ASSET_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
