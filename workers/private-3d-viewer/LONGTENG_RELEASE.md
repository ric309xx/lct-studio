# 龍騰發布紀錄

更新時間：2026-09-09 11:54（Asia/Taipei）。狀態：**龍騰已上傳、正式部署並完成線上驗收**。

## 入口與操作

- 正式入口（目前仍為原有服務）：https://lct-private-3d-viewer.private-3d-viewer.workers.dev
- 龍騰深連結：https://lct-private-3d-viewer.private-3d-viewer.workers.dev/viewer?project=longteng-20260906
- Viewer 右上角「專案」可選南雅奇岩模型或龍騰。沿用現有觀看／管理員角色與 Worker secrets。
- 原 `/tiles/...` 保留南雅相容性；新增 `/projects/{allowlisted-id}/tiles/...`。ID 由伺服器查表，不接受任意 R2 prefix。

## 已完成證據

- 來源：`E:\3D\obj\20260906龍騰\terra_b3dms`。
- 完整本機檢查：2,068 個檔案、632,124,111 bytes、102 份 JSON、2,067 個相對 URI；沒有缺檔、越界 URI 或未引用檔案；B3DM magic 與 byteLength 通過。
- 每物件 SHA-256／MD5 清單保存在 `D:\OneDrive\Antigravity\01_LCT\.codex-tmp\longteng-release\local-manifest.json`。
- 根 ECEF box 中心：`[-2974723.5, 4995315, 2614622.25]`。龍騰使用 Cesium 已轉換的 `boundingSphere` 與 `viewer.flyTo()`；沒有猜測經緯度。可在 `src/projects.mjs` 的 `camera` 設定經控制點驗證的相機校正；南雅維持原相機。
- Node 語法與 7 組測試通過：未登入保護、深連結、兩案與舊路由、未知 ID／路徑逃逸、GET／HEAD／Range、標的隔離、角色與產生的前端腳本語法。
- 本機 Chrome 實際顯示完整龍騰模型，狀態「模型已完成載入」，按下「回到模型」正常；console warning/error 查詢為空。這是 loopback 本機來源的證據，不能替代 R2 上線驗證。
- 正式既有 Worker：`/health` 回應 200，未登入 `/tiles/tileset.json` 回應 401。
- Wrangler 4.130.0 可執行；`whoami` 回報未登入。官方 OAuth 登入開啟 Cloudflare 帳號登入頁，等待授權後逾時。未讀取或更改 Worker secrets。
- Git status/diff 可在有檔案存取權限的執行環境讀取；工作樹有大量既有變更。沒有執行 Git 修復、提交或推送。另偵測到同時進行的返回典藏連結變更，已保留。

## 本次修改

- `src/projects.mjs`：固定兩案 allowlist、不可變龍騰 prefix、各案 camera/date/landmarks key。
- `src/index.js`：專案選擇、深連結登入、受保護路由、自動相機、沿用 Cesium 1.143 與極致 LOD／量測／底圖。
- `src/landmarks.mjs`：各專案標的隔離，南雅仍使用原 `settings/nanya/landmarks-v1.json`。
- `test/projects.test.mjs`：7 組多專案回歸測試。
- `scripts/validate_3d_tiles.mjs`：完整相對 URI、B3DM 與 checksum 驗證工具。
- 本文件與 `MODEL_OPERATIONS.md`：現況、證據與續跑順序。

## 登入後續跑

目前唯一權限阻塞是 Cloudflare 帳號登入。使用者可先在 Chrome 登入 Cloudflare，再重新執行 Wrangler OAuth。不要把密碼或 token 貼入對話。

已定位 CLI：

```powershell
$wranglerCli = 'C:\Users\User\AppData\Local\npm-cache\_npx\c943b712072b77c4\node_modules\wrangler\bin\wrangler.js'
node $wranglerCli login
node $wranglerCli whoami
node scripts/validate_3d_tiles.mjs 'E:\3D\obj\20260906龍騰\terra_b3dms' .codex-tmp/longteng-release/local-manifest.json
node --test workers/private-3d-viewer/test/projects.test.mjs
```

1. 登入後確認帳戶與既有 bucket/Worker，取得目前 Worker 版本作為 rollback 參考，確認 `r2.dev` 未啟用。
2. 列舉目標 prefix 遠端物件。若存在同名不同 checksum 的資料，停止並釐清，不覆蓋不可變版本。
3. 使用既有 `scripts/upload_r2_private.ps1`，指定下列參數。既有腳本會覆寫同名物件，因此前一步必要；預設三路並行／三次重試。不設定公開存取。

```powershell
./scripts/upload_r2_private.ps1 `
  -Source 'E:\3D\obj\20260906龍騰\terra_b3dms' `
  -Bucket 'lct-3d-models' `
  -Prefix 'projects/longteng/20260906-v1/terra_b3dms' `
  -NodePath 'C:\Program Files\nodejs\node.exe' `
  -WranglerPath $wranglerCli -ThrottleLimit 3 -MaxAttempts 3
```

4. 完整遠端列舉與本機 manifest 比對數量／大小／checksum；驗證 JSON/B3DM Content-Type，抽查根／子 tileset 與四區深層 B3DM 的 GET、HEAD、Range。
5. **完整模型遠端驗證完成後**才執行 Worker dry-run 及正式部署：

```powershell
node $wranglerCli deploy --config workers/private-3d-viewer/wrangler.jsonc --dry-run
node $wranglerCli deploy --config workers/private-3d-viewer/wrangler.jsonc
```

6. 正式驗收：未登入保護、兩案登入載入、專案切換、flyTo、代表性深層 tile、console/network、南雅原標的與視角。模型檔案與 secrets 不進 Git。

## 2026-09-09 正式發布結果

- 使用者明確同意後關閉 bucket 的公開 `r2.dev` 入口；沒有自訂 R2 公開網域。模型只由登入 Worker 傳送。
- 龍騰 2,068 個物件、632,124,111 bytes 全部上傳到不可變 prefix。遠端物件逐項大小與 MD5 相符；根與四區共 9 個代表檔以 GET/SHA-256 複核相符，JSON 與 B3DM Content-Type 正確。
- 南雅發布前後均為 1,590 個物件，key、size、ETag 清單完全一致。Cloudflare bucket 統計摘要在發布後仍顯示舊值，物件 List API 已確認新舊兩案皆存在，屬統計彙總延遲。
- Worker dry-run 通過後正式部署。最終版本：`000f9483-b83d-41eb-9676-6916a26c4e2e`。
- 部署期間發現完整 GET 被誤標為 206，已修成只有實際 `Range` 請求才回 206；完整 GET 與 HEAD 回 200。
- 正式 HTTP 驗收：未登入舊／新 tile 與 landmarks 均為 401；兩案 Viewer 與 tileset 為 200；四區深層 B3DM GET SHA-256、HEAD 與 `bytes=0-31` Range 206 全部通過；未知專案為 404。
- 正式 Chrome 驗收：龍騰與南雅都顯示「模型已完成載入」，專案切換、各自相機、回到模型與標的面板正常；修正版部署後 console warning/error 為空。
- 驗證紀錄：`.codex-tmp/longteng-release/remote-verified.json`、`live-verified.json`、`local-manifest.json`、`upload-results.json`。

## 尚未完成

沒有發布阻塞。龍騰相機目前依 tileset ECEF bounding sphere 自動定位；若日後需要指定構圖，可在控制點驗證後設定專案 camera。Git 工作樹含大量既有變更，本次沒有提交或推送。

## 2026-09-09 登入後檢查

Wrangler OAuth 已完成；既有 Worker 版本為 `901ac290-60f6-4723-9fdd-615bb278a9be`。遠端南雅為 1,590 個物件，龍騰 prefix 尚無物件，無自訂公開網域。

發現 bucket 的 managed r2.dev 目前已公開。自動核准審查拒絕停用命令，因可能影響直接使用公開連結的訪客；已向使用者請求明確同意關閉 r2.dev、保留有登入保護的 Worker。尚未取得這項確認前不會上傳私人龍騰模型。目前仍無上傳及正式部署。

## 2026-09-09 名稱、預設視角與典藏第 4 專案

- 執行時間：2026-09-09 13:06:53–13:54:46（Asia/Taipei），約 47 分 53 秒。
- Codex 點數：開始 2500.000000，完成推送後 2288.434712，本次差額 211.565288 點。
- Viewer 專案名稱改為「龍騰斷橋模型」。
- 依參考畫面校準相對鏡頭：heading 90°、pitch -34.379°、range factor 1.05；保留「回到模型」重設行為。
- Worker 測試 7/7 通過，正式部署版本 `428329f4-7dc0-4a87-b166-a3af8143a085`；HTTP 私密路由、兩專案、深層 B3DM、GET/HEAD/Range 均通過，Chrome 實際載入名稱與視角成功。
- 數位地景典藏新增第 4 項「龍騰斷橋模型」，接到私人 Viewer 與 YouTube `lG7icG_jwsU`。
- 從 `E:\3D\obj\20260906龍騰\PHOTO` 選取 4 張照片並縮放為 2000 px 網頁版本；第 1 張作為封面。
- 典藏提交：`70947dd01d078fd1abe28905399e3135fbdfb960`，已在使用者明確同意後推送至 GitHub `origin/main`，並確認遠端 SHA 相同。
- 正式站 `https://lctstudio.tw/archive/?site=longteng` 已實際顯示第 4 個頁籤、實景封面、4 張照片、YouTube 播放入口與私人 Cesium Viewer 連結。
