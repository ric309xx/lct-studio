# LCT Private 3D Viewer Worker

以 Cloudflare Worker 同源提供登入頁、CesiumJS Viewer 與私人 R2 Tile 代理。

目前入口：<https://lct-private-3d-viewer.private-3d-viewer.workers.dev>

## 權限

- 專案觀看密碼：`PROJECT_PASSWORD_HASH` Worker secret。
- 管理員密碼：`ADMIN_PASSWORD_HASH` Worker secret。
- 工作階段：`SESSION_SECRET` 簽署 HttpOnly、Secure、SameSite=Strict Cookie，12 小時失效。
- R2 Bucket 保持私人，不需要開啟 `r2.dev`。

## 部署

```powershell
wrangler deploy
wrangler secret put PROJECT_PASSWORD_HASH
wrangler secret put ADMIN_PASSWORD_HASH
wrangler secret put SESSION_SECRET
wrangler deploy
```

目前由 `src/projects.mjs` 的伺服器端 allowlist 提供南雅奇岩與龍騰；網址只接受固定專案 ID，不接受任意 Bucket key。舊 `/tiles/` 路由繼續指向南雅以維持相容性。

完整上傳流程、架構、Cesium ion 差異、限制、擴充功能與 Git 部署原則請見 [MODEL_OPERATIONS.md](./MODEL_OPERATIONS.md)。

## LOD 品質

- Viewer 固定「極致」：桌機 `maximumScreenSpaceError = 1`、手機為 `2`。
- 關閉 `dynamicScreenSpaceError`、`foveatedScreenSpaceError` 與 `skipLevelOfDetail`，避免遠景或畫面邊緣被刻意降階。
- 極致模式的下載量、GPU 記憶體與手機耗電較高；大型模型後續仍應保留裝置降階策略。

## 2026-08-25 驗證

- 未登入讀取 `/tiles/tileset.json`：`401`。
- `1234`：只顯示「專案觀看」。
- `1111`：顯示「管理員模式」。
- 經 Worker 取得的頂層 `tileset.json` 與本機 SHA-256 相符。
- CesiumJS 1.143 需要動態建立 WebGL shader 與編譯 WebAssembly，因此 Viewer 的 CSP `script-src` 明確允許 `unsafe-eval`；允許來源仍限本站與 `cesium.com`。

`1234`／`1111` 是四位數簡易門禁，適合展示 PoC，不適合機密工程資料。正式公開前應增加 Rate Limiting／Turnstile，並改用較長密碼或一次性分享連結。
