# 龍騰正式發布與新版相容驗收 — 2026-11-24

狀態：已完成正式部署與瀏覽器驗收。正式 Worker 版本 `999771fb-86bf-4cdd-9432-74826a279eef`，100% 流量。前一版為 `ca56e573-53a8-438f-bf10-26ede26c3041`。

## 觀看入口

- [龍騰專屬入口](https://lct-private-3d-viewer.private-3d-viewer.workers.dev/?project=longteng-20260906)：使用既有觀看密碼登入。
- 沿用使用者先前校準的名稱「龍騰斷橋模型」。管理員可在「選擇專案」切換龍騰與南雅；一般觀看角色限本案，沒有管理功能或跨案選單。
- 保留 CesiumJS 1.143、原品質、量測、日照、標的與權限。龍騰依 tileset ECEF bounding sphere 定位，沿用 heading 90°、pitch -34.379°、rangeFactor 1.05 的相對構圖，沒有猜測經緯度。

## 模型驗證與上傳結果

來源 `E:\3D\obj\20260906龍騰\terra_b3dms`；既有私有 bucket `lct-3d-models`；不可變 prefix `projects/longteng/20260906-v1/terra_b3dms/`。

- 本次重驗 2,068 檔、632,124,111 bytes、102 JSON、2,067 相對引用，B3DM 標頭與長度通過，無缺檔或報告中的未引用檔。
- 本機每檔 SHA-256 與歷史發布清單一致。
- R2 List 逐項比對 2,068 個物件的 key、size、MD5 全部一致；9 個根／子 tileset／深層 tile 的 GET SHA-256 與 Content-Type 通過。
- 另外經已登入 Worker 完整讀取全部 2,068 個物件，每檔 SHA-256、大小與 Content-Type 均通過，0 失敗。
- 遠端已有完整相同內容，本次 **0 個模型物件重傳或覆寫**。保留不可變版本，沒有新增公開入口。
- managed r2.dev 為 disabled，沒有自訂公開 R2 網域。南雅清單 1,590 個物件在遠端核對前後 key／size／ETag 一致。

## 本次發布修正

新版 Worker 已含龍騰與其他專案，但真實瀏覽器表單登入出現 `Origin not allowed`。原因為 `Referrer-Policy: no-referrer` 使表單 POST 的 Origin 成為 null，與原有嚴格 Origin 檢查衝突。[瀏覽器行為說明](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header)

只將 `index.js` 的全域 Referrer-Policy 改為 `same-origin`。同源登入／登出表單保留 Origin；跨站不傳 Referer。伺服器仍拒絕缺少、null 與外站 Origin，沒有放寬登入限制。

發布流程使用 **即時下載的正式 ca56e573 八個模組**建立獨立候選，避免把根目錄較舊且 dirty 的整包 Worker 部署出去。42 項候選測試、Node 語法、Wrangler 4.142.0 `deploy --dry-run` 均通過後正式部署。重新下載上線程式確認只有 index.js 改變，另外 7 個模組 SHA-256 完全一致；相容日期、旗標、R2 綁定、限流、觀測設定、secret 綁定清單等設定均一致（發布註記除外）。未輪換任何 secrets。

## 正式驗收

- 未登入：南雅／龍騰 tileset 與龍騰 landmarks 均 401；Viewer 導回對應登入頁。
- 管理員登入：兩案 Viewer、tileset 均 200；舊 `/tiles/tileset.json` 保留；未知專案 404。
- 根檔與四區深層 tile：GET 200、SHA-256 相符；HEAD 200 且無 body；Range `bytes=0-31` 為 206 且內容相符。現行 HEAD 省略 Content-Length，不把可選標頭省略視為模型缺失。
- 真實瀏覽器：管理員表單登入、龍騰實景、回到模型、切換南雅實景、登出、一般觀看角色再登入龍騰皆成功；兩案 console warning/error 查詢為空。
- 觀看角色沒有管理按鈕或專案選單；最後保留龍騰觀看畫面。未逐一重新視覺驗收其他五個專案，其模組／allowlist 完全保留。

## 檔案與證據

本次根目錄來源修改僅 `workers/private-3d-viewer/src/index.js` 的 Referrer-Policy 一行；新增 `test/form-origin.test.mjs`；更新兩份操作／發布紀錄並新增本報告。保留所有原有未提交修改，未 commit、push、變更 Netlify 正式網站或修復 Git。

新證據集中於 `D:\OneDrive\Antigravity\01_LCT\.codex-tmp\longteng-20261124\`：

- `local-manifest.json`、`remote-verified.json`、`full-tree-verified.json`：完整本機、R2 清單及 Worker 全檔驗證。
- `live-verified.json`：正式部署後 14 組 HTTP 檢查。
- `live-worker/`、`candidate/`、`post-release/live-worker/`：正式部署前備份、實際發布候選、正式部署後重新下載。
- `settings-before.json` 與 `post-release/settings-before.json`：設定核對（不含 secret 值）。
- `candidate-tests.txt`、`wrangler-dryrun.log`、`wrangler-deploy.log`：42 項測試、dry-run 與正式部署結果。
- `longteng-live.jpg`、`nanya-live.jpg`、`longteng-viewer-live.jpg`：管理員兩案與一般觀看者畫面。

後續更新須先重新取得當時正式版本並核對。不要直接整包部署根目錄的舊工作樹；本次已部署版本的精確來源在上述 candidate 與 post-release 資料夾。

本次發布無未完成阻塞；Git 提交／推送及 Netlify 網站重新發布不在本次變更中。

## 後續 Git 同步

2026-11-24 使用者追加要求上傳 Git。從最新 origin/main（cbdd698）建立隔離工作樹，只提交上述一行來源修正、兩項回歸測試及三份文件；原根工作樹其餘修改與私有模型、憑證、驗證暫存檔不納入。這次 Git 同步不會重新部署 Cloudflare Worker。
