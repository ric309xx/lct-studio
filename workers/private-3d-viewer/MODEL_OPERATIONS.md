# 自架 3D 模型上傳、顯示與維護流程

最後更新：2026-08-25

## 一、目前架構與顯示原理

目前「南雅奇岩模型」不是存放在 Git，也不是由 Cesium ion 代管，而是採以下流程：

1. DJI Terra 輸出的 B3DMS／3D Tiles 保留原始資料夾層級，包括頂層 `tileset.json`、各區塊子 `tileset.json` 與 `.b3dm` 模型檔。
2. 上傳腳本將整個資料夾逐檔放入私人 R2 Bucket：`lct-3d-models/20260810/terra_b3dms/`。
3. 使用者先進入 Cloudflare Worker 登入頁。Worker 將輸入密碼雜湊後與 Cloudflare Secrets 中的雜湊比較，不把密碼或金鑰寫在 Git。
4. 登入成功後，Worker 發出由 `SESSION_SECRET` 簽章的 HttpOnly Cookie。`1234` 是專案觀看角色，`1111` 是管理員角色。
5. CesiumJS 從同一個 Worker 網址請求 `/tiles/tileset.json`，接著依視角與螢幕誤差自動請求所需的子 tileset 與 `.b3dm`。
6. Worker 驗證 Cookie、限制固定的 R2 路徑，再將 R2 物件以串流方式回傳；Bucket 本身不公開。
7. HTTP Range 已支援，因此瀏覽器可請求檔案片段。Viewer 固定使用極致 LOD：桌機 `maximumScreenSpaceError = 1`、手機 `2`。

R2 的工作是「保存並傳送已切好的檔案」，不會替原始 OBJ、OSGB、LAS 或照片自動建立 LOD。模型必須先由 DJI Terra 或其他工具輸出／轉換成可供網頁串流的 3D Tiles。

### B3DMS 與 OBJ 怎麼選

- **正式線上展示優先使用 B3DMS／3D Tiles**：已有空間分塊與多層 LOD，CesiumJS 只載入目前視角需要的區塊，適合大型地景、手機及網路傳輸。
- **OBJ 適合留作原始交換／品質基準檔**：它通常是一整個網格加材質與貼圖，沒有適合網頁大場景的 LOD 與分塊。CesiumJS 不應直接串流大型 OBJ；上線前仍要轉成 GLB 或 3D Tiles。
- **兩種都可以保存，但用途不同**：OBJ 留在本機、冷儲存或交付區作母檔；R2 的 Viewer 發布區放經驗證的 3D Tiles。沒有必要讓瀏覽器同時載入 OBJ 與 B3DMS。
- **極致 LOD 不代表一定等於 OBJ**：目前極致模式會更早要求 B3DMS 的最高層級，所以近景觀感可非常接近 OBJ；如果 Terra 匯出時已簡化網格、縮小／壓縮貼圖或最高 LOD 本身較低，Viewer 參數無法還原被移除的細節。
- **容量通常較小，但需實測**：B3DMS 可能因 LOD、分塊與壓縮降低傳輸量；也可能因多層重複資料增加總檔案數。應比較「完整資料夾容量、最高 LOD 網格／貼圖、首屏下載量、相同視角畫質」，不能只比較單一檔案。

目前南雅奇岩的 `terra_b3dms.zip` 約 339.62 MiB；解壓後正式上傳內容約 0.423 GiB、1,590 個物件。未在目前來源資料夾找到對應 OBJ，因此尚未做同一模型的 OBJ/B3DMS 定量容量與畫質對照。

## 二、後續新增模型的標準流程

### A. 輸出前檢查

1. 在 DJI Terra／RealityCapture／其他建模工具完成模型與貼圖。
2. 確認模型已正確地理定位，記錄來源座標系統、垂直基準、控制點與建模日期。
3. 輸出 3D Tiles／B3DMS，確認資料夾根目錄有 `tileset.json`。
4. 先在本機 Viewer 檢查：模型位置、貼圖、LOD、遠近切換、缺檔與瀏覽器效能。

### B. 規劃 R2 路徑

每個專案使用不可混用的固定前綴，例如：

```text
models/nanya/2026-08-10/
models/longdong/2026-08-05/
models/shuinandong/2026-08-25/
```

不要覆蓋仍在線上的舊版本。若需要更新，先上傳到新日期或版本路徑，驗證完成後再切換 Worker allowlist，才能快速回復上一版。

### C. 上傳

使用現有腳本並指定來源與前綴：

```powershell
.\scripts\upload_r2_private.ps1 `
  -Source "D:\模型資料\專案名稱\terra_b3dms" `
  -Prefix "models/project-name/2026-08-25"
```

腳本會：

- 驗證來源目錄與頂層 `tileset.json`。
- 保留相對路徑與檔名。
- 依副檔名寫入 Content-Type。
- 預設三路並行、失敗最多重試三次。
- 重跑時覆寫同名物件，不會把 Bucket 改成公開。

### D. 上線前驗證

1. 抽查頂層及子 `tileset.json` 的 SHA-256 是否與本機一致。
2. 抽查 `.b3dm` 能否回傳 `206 Partial Content`。
3. 使用全新瀏覽器工作階段驗證：未登入為 401、專案密碼只看指定專案、管理員密碼才進管理模式。
4. 測試桌機、手機、遠景、近景與極致 LOD 的記憶體／載入時間。
5. 確認後再把新前綴加入 Worker 的伺服器端專案 allowlist；不要接受前端傳入任意 R2 key。

### E. 多專案擴充

目前 Worker 的 `MODEL_PREFIX` 只允許一個模型。新增第二個正式專案時，應改成伺服器端資料表，例如：

```js
const PROJECTS = {
  nanya: { prefix: "models/nanya/2026-08-10/", role: "project" },
  longdong: { prefix: "models/longdong/2026-08-05/", role: "project" }
};
```

路由以受控的專案 ID 查表，不能直接把網址參數串成 R2 路徑。不同客戶若需要不同密碼，建議改成每案獨立授權、一次性分享連結或 Cloudflare Access，而不是共用四位數密碼。

## 三、與 Cesium ion 的差別

| 項目 | 自架 CesiumJS + 私人 R2 + Worker | Cesium ion |
| --- | --- | --- |
| 模型處理 | 必須先自行產生 3D Tiles | ion 可代為轉換／切片部分格式 |
| 儲存 | R2，容量依實際用量計費，Bucket 可保持私人 | 使用 ion 帳號的資產容量與方案額度 |
| 顯示引擎 | CesiumJS，功能由本站程式自行開發 | 同樣可用 CesiumJS，但資產存取由 ion 管理 |
| 權限 | Worker、Cookie、Cloudflare Secrets 自行設計 | ion token、asset 權限及平台機制 |
| LOD | 取決於輸出 tileset 與 Viewer 參數 | ion 轉換流程通常會協助產生串流結構 |
| 底圖／地形 | 需自行選擇來源與授權 | 可直接使用 ion 提供的相關資產／服務 |
| 維護 | 上傳、版本、權限、監控與回復均由本站維護 | 平台代管較多維運工作 |
| 成本重點 | R2 儲存、讀取操作、Worker 請求 | ion 方案、儲存與串流額度 |
| 平台依賴 | 較低，資料可搬到其他 S3/CDN | 較依賴 ion 資產與 token 流程 |

自架並不是「完全無限制」，而是從 ion 的固定容量限制，改成由 R2／Worker 用量、瀏覽器效能及自己的維護能力決定。

## 四、目前限制與成本注意事項

以下為 2026-08-25 查閱 Cloudflare 官方文件的狀態，正式估價前應再次確認：

- R2 每個 Bucket 的總儲存量與物件數沒有固定上限；單一物件最大約 5 TiB，單次上傳約 5 GiB，超過需 multipart upload。
- R2 Standard 每月免費層目前包含 10 GB-month 儲存、100 萬次 Class A、1,000 萬次 Class B；超出後依儲存量與操作次數計費，網際網路 egress 目前免費。
- Workers Free 目前為每日 100,000 次請求、每次 10 ms CPU。Cesium 會對多個 tileset／b3dm 發出請求，流量增加時 Worker 請求數可能比訪客數高很多。
- Worker 現在為了私人驗證使用 `Cache-Control: private`，不讓共享 CDN 快取繞過授權；安全性較直接，但熱門模型會產生更多 R2 讀取操作。
- 實際畫質上限仍由原始照片、貼圖解析度、網格密度與 tileset LOD 結構決定；把 SSE 調低不能創造原始資料沒有的細節。
- 極致 LOD 會提高下載量、GPU 記憶體、手機耗電與載入時間。大型專案仍應保留裝置降階策略或品質設定。
- `1234`／`1111` 只是展示用簡易門禁，不適合機密工程或地籍資料。正式客戶案應增加 Rate Limiting、Turnstile、Cloudflare Access、較長密碼或限時簽章連結。
- CesiumJS 1.143 需要動態建立 shader／編譯 WebAssembly，因此 Viewer CSP 明確允許 `unsafe-eval`；其餘腳本來源仍限本站與 `cesium.com`。未來可評估自管 Cesium 靜態檔與更細緻的 CSP。
- Bucket 私人不等於內容無法被已授權使用者取得；任何能在瀏覽器顯示的模型，已登入者仍可能透過開發者工具保存傳輸中的檔案。若資料高度機密，需另外採合約、浮水印、權限期限及稽核。

官方參考：

- <https://developers.cloudflare.com/r2/platform/limits/>
- <https://developers.cloudflare.com/r2/pricing/>
- <https://developers.cloudflare.com/workers/platform/limits/>

## 五、可增加的 CesiumJS 功能

自架後仍可實作原本 Cesium ion Viewer 做過的功能，ion 不是這些互動功能的必要條件；差別是資料來源、轉換、授權與程式都要自行管理。

### 建議優先做

1. **距離量測**：以場景深度拾取三維座標，顯示逐段與總距離；需標示斜距、水平距離或地表距離的定義。
2. **面積量測**：由使用者選點建立多邊形，計算三維表面近似值或投影平面面積；需明確標示計算方法。
3. **地籍圖套疊**：讀取 GeoJSON、WMS／WMTS、向量磚或預先轉換圖層，控制透明度、線色、地號標籤與圖層開關。
4. **TWD97 座標顯示／查詢**：Cesium 內部以 WGS84／ECEF 運作，TWD97 TM2 資料應在匯入／顯示時用經驗證的 EPSG 與轉換參數處理；不可只改欄位名稱。
5. **回到指定視角**：每案保存 longitude、latitude、height、heading、pitch、roll，避免每次重新找模型。
6. **專案清單與權限**：三案以上改用伺服器端 allowlist，每個專案可配置模型路徑、封面、介紹、相機與可用工具。

### 後續功能

- 地籍圖／正射影像／歷史圖層透明度滑桿。
- 模型與模型、模型與正射影像的左右分割比較，保持同一相機視角。
- 點位、線段、範圍、缺失位置與巡檢註記。
- 高程、坡度、剖面線與斷面圖。
- 裁切平面、挖填方或體積估算。
- 飛行路徑播放、導覽書籤與自動巡覽。
- 模型時間序列及不同建模日期切換。
- 點擊建物／區域顯示屬性、照片、影片與文件。
- 量測／標註結果匯出 GeoJSON、CSV 或報告。
- 操作紀錄、登入稽核與專案到期時間。

## 六、地籍與量測精度原則

- CesiumJS 能顯示與計算，不會自動改善模型或地籍資料的測量精度。
- 精度受航拍 GSD、像控點／檢核點、GNSS／RTK、相機校正、模型重建、TWD97/WGS84 轉換、垂直基準及地籍圖來源共同影響。
- 建議保留獨立檢核點，將模型可辨識點轉成 TWD97 後與實測座標計算 Easting、Northing、Height 誤差及 RMSE。
- 地籍套疊應以已知控制點檢查平移、旋轉、尺度及局部變形，不可只靠目視對齊。
- 未經合格測量程序驗證的成果應標示為展示／規劃參考，不作為界址鑑定或法律測量成果。

## 七、Git 與官網部署原則

可以把 Worker 程式上傳 Git，但 Git 不是模型主機：

- **可提交**：`workers/private-3d-viewer/`、`scripts/upload_r2_private.ps1`、維護文件、無密碼的 `wrangler.jsonc`。
- **不可提交**：R2 API token、Worker Secrets、`.dev.vars`、Cookie 金鑰、Cloudflare 登入資料、私人模型檔。
- **不建議提交**：整包 `.b3dm`／貼圖；檔案量與容量不適合 Git/GitHub Pages，也會讓版本庫快速膨脹。
- GitHub Pages 只能提供靜態官網，不能取代目前的 Worker 登入與私人 R2 代理。
- 官網最簡單的整合方式是連到 Worker；正式版建議把 Worker 綁到例如 `3d.lctstudio.tw`，使用者不必看到 `workers.dev`。
- 目前 `X-Frame-Options: DENY`，所以不能直接 iframe 嵌入官網。若未來確定要嵌入，應只允許自己的官網網域，不能全面開放 frame。

程式上 Git 後，仍需由 Cloudflare 部署 Worker、綁定 R2 Bucket 並設定 Secrets，才能實際運行。Git 可再串接 Cloudflare Workers Builds／GitHub Actions 自動部署，但 Secrets 必須放在 Cloudflare 或 GitHub Actions Secrets，不能寫入版本庫。
