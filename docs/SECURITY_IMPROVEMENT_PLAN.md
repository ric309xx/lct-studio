# LCT 官網資安改善與接續紀錄

更新：2026-11-17（臺北時間）。第二批本機修改已完成，**尚未上線**。
本文件取代第一批紀錄的待辦狀態；正式官網目前不能視為已套用修正。

## 最新接續：已取得並合併正式版原始碼

使用者已完成 git fetch，origin/main 與 d484d25 提交可正常讀取。之後出現的目錄刪除失敗是 Git 自動清理提示；可 Ctrl+C 停止後續清理，無須手動刪除 .git。

- 已將新版 Gaussian、Pix4D 網格比較、量測工具、控制點與高程相關程式合併進目前修改；兩處真正的文字衝突已處理。正式站的最新套繪修正亦保留。
- 最新合併版本已通過 TypeScript 全部檢查。未重新執行本機 esbuild 或 Vitest；新前端功能仍需雲端完整建置與回歸驗收。
- 後端已支援比較入口的龍洞網格專屬短效授權，且不附帶桃園控制點資料。新增 VIEWER_R2_SERVICE_PASSWORD 為伺服器端與 Worker 溝通的憑證，不傳入瀏覽器；待套用的新設定已同步更新。
- 原始工作目錄及其他尚未提交的控制點修改均保留，沒有 reset、stash 或覆寫 .git。
- 本執行環境另因 Git 的 sh.exe IPC 權限限制，無法自動建立本機 clone。已改為準備可由使用者既有 PowerShell 執行的預覽分支腳本。

### 下一步：建立雲端預覽分支

在 PowerShell 回到提示字元後，於專案目錄執行 scripts/security/Publish-SecurityPreview.ps1。腳本會從 d484d25 建立獨立 worktree，只複製 preview-files.json 指定的 124 個程式／測試／設定檔案，建立 security-preview-20261118 分支並推送該分支；不推送 main、不複製秘密、不啟動本機 esbuild。

腳本已通過 PowerShell 語法解析；尚未執行、尚未推送。若指定 worktree 已存在會停止，不會刪除或覆寫。Netlify 新增 cloud_build.mjs，只在雲端還原現有 lockfile 的依賴、執行測試並重建。預覽可驗證尚未核准的整合；正式 production 仍受 integrationVerified=false 阻擋，不能誤發。

接著由助理在 Netlify 觸發／觀察該分支建置，再處理新版 token 與憑證的人工套用。現有預編譯 Viewer 尚屬上一批，不得直接跳過雲端重建上線。

---

## 前次接續紀錄（版本同步部分已由上方更新取代）

- 已由使用者登入 Netlify，核對到正確的 lct-studio 專案。目前平台沒有設定後端環境變數；本次沒有修改正式設定或發布。
- 正式站及 GitHub main 均為 d484d25fd09720387228e4ed5783fae02791ce3c（11 月 15 日，龍洞 Gaussian），本機 HEAD 為較舊的 4f6d673。本機缺少 LongdongGaussian.tsx，且目錄未包含 11 月 13 日新增的 Pix4D mesh。先前的本機重建成功不代表已涵蓋最新正式功能。
- 已加上 check_source_base.mjs 與正式版基準檔；Netlify 建置將拒絕尚未整合最新版的程式。不能直接推送 main 或發布目前舊基底的產物。
- 執行環境的 git ls-remote 因無法解析 github.com 失敗；瀏覽器可以讀取公開 GitHub 提交，但單檔下載流程逾時，未下載成功。不能宣稱已同步或合併最新版。
- 已完成新修正：密碼驗證器輪換立即撤銷該入口舊 Cookie，全域 VIEWER_AUTH_EPOCH 變更撤銷所有 Cookie；新密碼改直接使用 PBKDF2-HMAC-SHA256 600,000 次，舊相容模式預設關閉。
- 模型代理新增地形 URL 樣板／parentUrl 改寫、編碼查詢字串檢查、上游索引串流大小上限及已知超過平台 20 MB 限制時的明確拒絕。大模型仍須真實串流驗收。
- 今日安全／後端／發布檢查測試 58 項通過。先前 127 項前端測試是舊本機版本的證據，整合正式新功能後必須重新驗收，不能拿來保證 Gaussian 相容性。
- 已產生獨立的新憑證批次（尚未套用）：15 個分享驗證器、19 組新密碼、Netlify 設定及 Worker secrets。未輸出秘密、未上傳、未提交 Git。
- 新憑證批次的設定檢查目前僅缺少新的 CESIUM_ION_ACCESS_TOKEN。占位值及曾公開的舊 token 都不能通過正式設定檢查。
- 仍未重啟 esbuild、未調整防毒。

### 最先需要完成的接續步驟

請在使用者自己的終端機於專案目錄執行 git fetch origin main。這只下載遠端提交，不會覆寫目前尚未提交的修改。取得最新遠端物件後，由助理以獨立版本整合資安變更、保留 Gaussian／Pix4D 功能，再安排雲端建置與預覽驗收。

之後取得新的 ion 最小權限 token，完成憑證匯入與舊秘密撤銷。透過瀏覽器輸入／變更正式密碼或其他認證憑證時，須由使用者接手操作。不要把密碼或 token 貼到聊天中。

核對依據：Netlify 專案部署紀錄與 GitHub 提交頁（實際讀取），版本差異判斷信心 99%；本機修正與測試判斷信心 95%。

---

## 上一批已完成的本機修改

| 項目 | 修改結果 |
| --- | --- |
| 17 個入口（管理員及 16 個分享頁） | 全部改由後端驗證。公開 HTML 只保留 accessId 與角色提示，不再含 passwordHash，門禁程式不再計算前端密碼雜湊。 |
| 管理員登入 | 繼續使用既有 Worker 的伺服器登入驗證，移除前端明文密碼與提權分支。 |
| 分享登入 | 15 個舊觀看密碼以隨機 salt + PBKDF2 驗證器相容遷移；觀看者無法靠提交 role=admin 提權。桃園繼續使用既有後端登入。 |
| 工作階段 | 每個入口各用一顆 HttpOnly、Secure、SameSite=Strict 的 __Host- Cookie；最長 12 小時，刷新不延長期限。不同專案可分頁同時登入，登出只清指定入口。 |
| 專案目錄與對比頁 | 目錄移到 netlify/private/catalog.json，由登入後的 bootstrap 只回傳該入口可讀專案；對比頁包含其獲准的比較選項。保留原分享網址。 |
| ion 權杖 | 本站 ion 主權杖不再打包到 Viewer。伺服器先驗證 Cookie 與 assetId 權限，再取得 endpoint 並轉送模型子資源；私人模型的真實 endpoint token 也不回傳給瀏覽器。 |
| 世界底圖 | 透過相同授權入口取得 Cesium 底圖設定；公開底圖供應商可能仍有其本身的 scoped 設定，不能與本站私人模型主權杖混為一談。 |
| 地籍與圖片 | 桃園及三峽套繪檔改成授權後提供，桃園覆核圖片亦受保護；桃園 JSON 資料不再直接編入前端 bundle，改由有桃園權限的登入回應提供。 |
| 發布產物 | 白名單打包，使用新版資產 manifest 排除舊 bundle、未使用的舊 chunks、原始碼、工作檔與衝突副本。嚴格資安稽核成為 Netlify 建置步驟。 |
| 基礎防護 | 安全標頭、noindex、登入限流、Origin 檢查、串流大小限制、Formspree honeypot、robots／sitemap 與控制點轉址。 |

既有 Viewer 中仍有部分功能判斷用的專案 ID、顯示文字與舊固定地籍參數；目前沒有宣稱所有空間資訊都已從程式碼消失。完整私人目錄、主要桃園 JSON 及可下載套繪均已移到授權流程。若要求連顯示用固定參數都不得公開，還需做後續資料拆分與獨立保密驗收。

## 驗證結果

- TypeScript 完整檢查通過；Vite 正式版 Viewer 完整重建成功。
- 34 個前端測試檔、127 項測試通過。
- 安全、登入、Cookie、資料隔離與 Worker 回歸測試共 51 項通過。
- 合計 178 項測試通過，涵蓋跨專案拒絕、目錄隔離、比較範圍、分頁並行登入、登出、未登入套繪、路徑跳脫、子 tileset URL 改寫與 Range 回應。
- 已直接核對新版 bundle 不含原本站 ion 主權杖實際值，也不含前端 VITE 權杖設定。
- 公開產物嚴格稽核通過：未發現該稽核涵蓋的 P0／P1；尚列出首頁 Tailwind Play CDN 的 P2。此稽核不是完整滲透測試或安全保證。
- 尚未完成正式平台登入、完整模型串流、帳號設定、線上標頭及流量成本驗收。

## 防毒提示與建置環境

沒有下載安裝新套件。為解決現有 OneDrive 套件連結不完整，將已存在套件複製到隔離建置環境；缺少的一個 Cesium shader 從同版本已安裝的 CesiumUnminified 原樣還原。

完整 Viewer 建置成功後，另一次 Netlify Function 打包檢查啟動 esbuild.exe，寫入輸出時遭 PC-cillin 勒索防護阻擋，該次 Function 打包檢查未完成。已停止再次執行 esbuild，不修改防毒規則、不加入排除、不繞過防護；函式原始碼的 Node 測試已通過。後續需在確認允許的建置環境完成平台打包驗收。

## 下次接續：正式上線前必做

1. 在 Netlify 的伺服器執行環境設定 VIEWER_SESSION_SECRET、VIEWER_ACCESS_CREDENTIALS、CESIUM_ION_ACCESS_TOKEN，不能加 VITE_ 前綴或放進公開檔案。已準備的本機遷移檔被 Git 忽略，含秘密，不可提交或直接公開。
2. 遷移檔為相容測試，仍沿用舊觀看密碼與曾公開的 ion 主權杖。**上線前必須輪換所有曾公開的觀看／管理員密碼與 ion token，撤銷舊 token**；單純搬到後端不會使舊秘密失效。必要時輪換兩側工作階段密鑰，使舊登入失效。
3. 先部署 Worker 及 LOGIN_RATE_LIMITER binding，再部署 Netlify Functions、伺服器環境設定與靜態產物；禁止只上傳靜態 HTML。Netlify 登入函式使用每 IP／網域 10 次／60 秒的 native rate-limit 設定，須在 deploy log 確認規則被採用。
4. 核對私有附件：catalog、桃園 JSON 與 overlays 必須隨 Functions 打包，卻不能出現在靜態發布目錄。設定缺失應回 503，不能退回前端密碼驗證。
5. 用管理員、一般分享、桃園與比較入口各做一次正式驗收；包含重新整理、切地號、兩個專案分頁登入、登出、過期、未登入直接下載與跨專案 assetId。預覽網域尚未列入允許來源，預覽登入會被拒絕。
6. ion 模型現在經 Netlify Function 轉送，須以真實模型驗證速度、尺寸／執行時間限制、子資源格式與平台流量成本；R2 桃園模型仍沿用既有短效、專案限定授權。若大模型流量不適合 Netlify，應把相同授權與轉送邏輯移到 Cloudflare Worker，再驗收，不能重新公開主權杖。
7. 檢查 R2 沒有另一個公開入口、ion 資產與 token 最小權限、平台 MFA、Formspree 垃圾過濾與備份還原。舊部署或快取可能仍有舊檔案，需配合撤銷憑證處理。

## 尚待較低優先改善

- Tailwind Play CDN 改為產生靜態 CSS，第三方資源固定版本並補 SRI。
- 首頁 CSP 仍有 unsafe-eval；Viewer CSP 為 Report-Only，需經實際瀏覽器／Cesium 驗證後收緊。
- HSTS 暫不加入 includeSubDomains／preload，待盤點所有子網域 HTTPS。
- 設定監控與稽核、密碼輪換、備份還原演練及套件維護流程。

## 接續檢查指令

下列 Node 測試與靜態稽核不會啟動 esbuild：

~~~powershell
node --test scripts/security/*.test.mjs workers/private-3d-viewer/test/*.test.mjs
node scripts/security/build_and_audit.mjs
~~~

暫停再次執行 prepare_local_runtime／build_viewer／Vitest 的建置工具鏈，待確認建置環境後再使用；它們可能啟動 esbuild。前端測試已於防毒提示前完成。

## 來源與信心水準

| 來源 | 範圍 | 信心水準 |
| --- | --- | --- |
| 專案原始碼、正式版產物與 178 項本機測試 | 本機修改及已驗證行為，不代表正式站已部署 | 95% |
| PC-cillin 截圖與 esbuild 寫入失敗紀錄 | 這次封鎖提示與本次執行的關聯 | 99% |
| [Netlify Functions](https://docs.netlify.com/build/functions/configuration/)／[Rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/) | 私有附件、路由與限流規則 | 98% |
| [Cesium ion tokens](https://cesium.com/learn/ion/cesium-ion-access-tokens/) | 主權杖、資產限制與最小權限 | 98% |
| [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | Cookie 與工作階段設計 | 98% |

百分比是對資料與判斷的信心，不是網站資安評分。
