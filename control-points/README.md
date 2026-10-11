# 控制點地圖

外出使用：https://lct-control-points.private-3d-viewer.workers.dev/ ，亦可從 LCT 網站頁尾的「控制點」進入，使用設定的存取密碼登入。
本機開發可開啟 http://127.0.0.1:8789 。雙擊 `啟動控制點系統.cmd` 可重新啟動；看到 Ready 後重新整理瀏覽器，終端機須保持開啟。

## 已完成

- 國土測繪中心電子地圖／正射影像底圖、點位聚合、點號／原點號／點名／所在地搜尋、分類與點況篩選、收藏。
- 顯示原始坐標系統、N/E、高程類型與基準；WGS84 經緯度另行換算，不用手機定位覆蓋測量成果。
- Excel/CSV/TXT 匯入、工作表選擇、欄位對應、坐標系統選擇與預覽驗證；相同來源雜湊避免重複匯入。
- 新增點位、編輯名稱／說明／備註、現場巡查、照片／PDF、分類、原檔下載、附件 ZIP、點之記列印／另存 PDF。
- 雲端版將原始照片與預覽圖分存於私人 R2；本機版使用 R2 模擬儲存。失敗資料留在裝置待傳清單，重新連線並開啟網站後續傳。
- 出發前在「資料集」下載離線包；可選包含全部照片。離線查點、查看已下載照片、保存巡查與照片；底圖不提供離線下載。
- CSV／GeoJSON 匯出、完整 ZIP 備份、操作歷程、資源回收筒與還原。
- 地籍 GeoJSON 套繪（EPSG:4326，最多 5 MB）；官方地籍服務串接尚未實作。
- 手機版面、加入主畫面 PWA、定位距離、Google 地圖步行導航、裝置支援時的羅盤指示。相機 AR 尚未實作。

## 首批資料

| 資料集 | 匯入點數 | 坐標 | 高程 |
|---|---:|---|---|
| 中壢八德坐標成果表 | 479 | TWD97 / TM2 121 分帶，EPSG:3826 | 橢球高；詳細基準待確認 |
| 109 一等水準點清冊 | 2,530 | TWD97 / TM2 121 分帶，EPSG:3826 | 高程；垂直基準待確認 |

共 3,009 點。以計算點號為主鍵，原點號保留供查詢；同原點號的不同控制點分開保存。
中壢八德「座標」工作表的 471 筆經緯度作換算交叉核對，最大差異約 0.000143 公尺；另 8 點由 N/E 換算。
水準點「工作表1」36 筆是公告成果子集，不重複匯入。
原始 Excel 完整保存，原檔與全部坐標／高程已逐筆核對。

## 本機資料保存

- `.wrangler/state/`：實際使用的本機 D1 資料庫與 R2 原始檔／附件。請勿清除。
- `.dev.vars`：鹽值與密碼雜湊；不要上傳或公開。
- `.local/imports/`：首批來源與匯入中間檔。
- `.local/backups/`：完整備份 ZIP。備份包含來源、點位、巡查、照片、歷程、回收筒資料與地籍套繪，不含登入憑證。
- `.local/recovery-*/`：備份還原驗證的獨立資料庫與物件儲存，與正式資料分離。
- `.local/browser-qa/`：獨立瀏覽器測試資料，不屬於正式匯入。

以上路徑及 `node_modules`、`dist` 已排除 Git。首批 3,009 點與兩份原始 Excel 已分別匯入本機及雲端；後續本機與雲端新增的資料各自保存，沒有自動互相同步。外出作業請使用雲端版；雲端點位存於 D1、來源與附件存於私人 R2。Google Drive 尚未串接。
目前是手動備份；沒有排程備份或自動清理回收筒。請在重要修改後下載完整備份，另存於可靠位置。
瀏覽器離線包會包含私人資料，僅應下載到可信任裝置；登出不會清除離線包或待傳資料，清除請使用「資料集」頁面。
瀏覽器可能回收離線快取，出發前請確認已下載；尚有待傳資料時不要清除網站資料。

## 開發與驗證

需要 Node.js 22+。相依套件已安裝，本機密碼及資料庫已初始化。

```powershell
cd D:\OneDrive\Antigravity\01_LCT\control-points
npm.cmd run build
npm.cmd run dev
```

在另一個終端機執行下列指令。驗證、匯入與備份會向本機服務登入；環境變數只提供本次程序使用，不寫入來源碼。

```powershell
$secure = Read-Host '輸入本機密碼' -AsSecureString
$env:LCT_INITIAL_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
npm.cmd run verify
npm.cmd run backup
Remove-Item Env:LCT_INITIAL_PASSWORD
npm.cmd run check-backup
npm.cmd test
```

`check-backup` 讀取最新 ZIP（亦可 `npm.cmd run check-backup -- 完整ZIP路徑`），還原到全新 `.local/recovery-*`，核對每筆欄位及每個物件 SHA-256，絕不覆蓋現有資料。
要讓還原資料取代使用中資料庫，應先關閉服務、保留原資料目錄，再調整儲存綁定；本版沒有一鍵覆寫還原。
`prepare_inputs.py` 用 openpyxl 讀取兩份使用者指定來源；`npm.cmd run seed` 匯入已準備的首批資料，重複來源會略過。
重新安裝時先 `npm.cmd ci`、建置，再提供上述密碼環境變數執行 `npm.cmd run setup`。現有環境不用重設。

## 雲端設定

網站首頁頁尾的小型「控制點」連結指向獨立系統：
https://lct-control-points.private-3d-viewer.workers.dev/

正式環境設定在 `wrangler.production.jsonc`，使用獨立的 `lct-control-points` D1 與私人 R2 儲存桶。
`wrangler.jsonc` 繼續作本機開發使用，兩份設定的資料互相獨立。
Worker 程式必須另外部署；單純推送 Git 只會更新網站原始碼與首頁入口。

```powershell
npm.cmd run build
npx.cmd wrangler deploy --config wrangler.production.jsonc
# 首次部署後上傳本機已設定的密碼雜湊與鹽值（不包含明文密碼）
node scripts/publish-secrets.mjs
```

首次初始化遠端空資料庫：
`npx.cmd wrangler d1 execute lct-control-points --remote --file schema.sql --config wrangler.production.jsonc`。
首批資料準備完成後，可提供密碼環境變數並把 `LCT_BASE_URL` 設為雲端入口，執行 `seed`、`verify`。
原始 Excel、點位資料、照片、密碼雜湊與憑證均不提交 Git。
登入資料、點表、附件、原始檔下載及備份均在伺服器驗證 session，登入前 API 回覆 401。

Google Drive OAuth 與相機 AR 尚未實作。
手機實體相機、定位與羅盤需要支援的瀏覽器及安全 HTTPS 來源，仍需 iPhone 實機驗證。
本機 `127.0.0.1` 只能在這台電腦存取，外出使用上方的 HTTPS 雲端入口。
AR 找點可在定位距離與方位的基礎上繼續製作，手機定位精度須在畫面明示，不能當作測量放樣成果。
