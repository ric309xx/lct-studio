# CesiumJS + Cloudflare R2 測試入口

此測試入口獨立放在 `3d-r2-test/`，不連到首頁，也不會影響現有 `3d-viewer/`。

## 本機先測

1. 啟動 3D Tiles 本機 server：

```powershell
python scripts/serve_3d_tiles.py --root "D:\Work\3D\20260810_\terra_b3dms" --port 8789
```

2. 另開網站 server，進入：

```text
http://localhost:5173/3d-r2-test/
```

預設會讀：

```text
http://127.0.0.1:8789/tileset.json
```

## R2 上傳

Cloudflare 登入完成後執行：

```powershell
.\scripts\upload_r2_3d_tiles.ps1 -Bucket "lct-3d-models" -Source "D:\Work\3D\20260810_\terra_b3dms" -Prefix "20260810/terra_b3dms"
```

腳本會套用 CORS 並執行 `wrangler r2 bucket dev-url enable` 開啟第一階段測試用公開網址。完成後取得公開 host，將 `3d-r2-test/config.js` 的 `tilesetUrl` 改成：

```text
https://<public-host>/20260810/terra_b3dms/tileset.json
```

### 私人 Bucket 上傳（建議）

若模型不應直接公開，先使用：

```powershell
.\scripts\upload_r2_private.ps1 -Bucket "lct-3d-models" -Source "D:\Work\3D\20260810_\terra_b3dms" -Prefix "20260810/terra_b3dms"
```

此腳本只上傳資料，不會開啟 `r2.dev` 或變更公開權限；預設三路並行，Cloudflare 暫時性錯誤會自動重試三次。

私人 Bucket 不能直接由一般瀏覽器讀取。正式分享應使用 Cloudflare Worker 驗證密碼／權限後代理 Tile，或產生短效簽章網址。僅使用「很難猜的公開網址」不是完整權限控管，網址遭轉傳後任何取得者都能讀取。

## 注意

- 必須上傳整個 `terra_b3dms` 資料夾，不能只上傳 `tileset.json`。
- R2 CORS 設定在 `scripts/r2-cors.json`。
- 第一版是公開讀取測試。若客戶模型要不公開，下一版改為 Cloudflare Worker + private R2。
- 若 `wrangler r2 bucket create` 顯示 `Please enable R2 through the Cloudflare Dashboard`，請先到 Cloudflare Dashboard 啟用 R2，再重跑上傳腳本。
