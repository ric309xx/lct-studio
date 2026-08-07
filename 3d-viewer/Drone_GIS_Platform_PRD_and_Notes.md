# Drone GIS Platform 筆記與產品需求文件（PRD）

版本：v0.1  
用途：交付 Codex 或其他開發工具，依優先順序逐步建立可展示 DJI Terra 3D 模型、對外分享，並逐步擴充 GIS 功能的網站。  
開發原則：**每個階段完成並驗收後，再進入下一階段；不要一次實作全部功能。**

---

# 15. 其他專案套繪地籍圖所需資料與流程（2026-08-05）

## 必要資料

- 三維現況模型：OBJ、3D Tiles 或可上傳 Cesium ion 的模型壓縮檔，需包含材質貼圖與正確地理定位。
- 裸地地形 DTM：GeoTIFF，需確認平面座標系統、高程基準、解析度及 NoData 值。若只有包含建築物與樹木的 DSM，地籍線可能爬上屋頂與樹冠，不建議直接使用。
- 地籍向量：優先使用 SHP、GeoPackage 或 GeoJSON；DXF 亦可，但必須提供原始座標系統、地段、地號及屬性欄位說明。
- 座標資訊：例如 TWD97 / TM2 分帶、EPSG 代碼與垂直基準。三維模型、DTM、地籍資料必須使用可互相轉換的座標基準。

## 建議前處理

1. 檢查地籍線拓樸、重複線、破圖及座標偏移。
2. 將地籍線加密節點，再由 DTM 逐點取樣地面高程。
3. 在線條高程增加約 0.2 至 0.5 公尺，降低與地面重疊閃爍。
4. 將成果轉為 WGS84 三維 GeoJSON，保留地段、地號、面積等屬性。
5. 以少量樣區先檢查位置，再製作完整成果。

## Viewer 顯示規則

- 預設只顯示未被模型遮擋的線，維持正確空間關係。
- 使用者可開啟「穿透遮擋物」，被遮擋線以淡杏橘色實線顯示。
- 測試資料目前為每 5 公尺主要等高線，正式地籍資料完成後應替換，不應將等高線視為地籍成果。
- 正式地籍圖建議增加地號標籤、選取地號醒目顯示、資訊面板及顯示比例尺控制。

## 三維標的資料格式

每個標的至少需要：專案 ID、標的 ID、名稱、分類、說明、經度、緯度、高程及建議觀看距離。後續可加入照片、文件連結、工程狀態及預設鏡頭方向。標的點選後由 Viewer 執行相機移動並顯示資訊卡。

---

# 1. 已驗證的 DJI Terra → Cesium 工作流程筆記

## 1.1 目前最穩定的對外分享流程

```text
DJI Terra
→ 輸出 OBJ
→ 將完整 terra_obj 資料夾壓縮為 ZIP
→ 上傳 Cesium ion
→ 選擇 3D Capture / Reality Model / Photogrammetry
→ Cesium ion 轉成 3D Tiles
→ 建立 Cesium Story
→ 分享網址給外部人員
```

目前實測結果：

- Terra 分塊 OBJ 可被 Cesium ion 正常辨識。
- 完整模型可正常轉成 3D Tiles。
- 模型經緯度位置大致正確。
- 高度通常不需要大幅調整，但仍須逐案檢查。
- Cesium Story 可作為最簡單的外部分享方式。
- OBJ 經 Cesium ion 轉換後，展示畫質目前比 Terra 直接輸出的 B3DM 更好。

## 1.2 Terra OBJ 資料結構

```text
terra_obj/
├─ BlockRBA/
├─ BlockRBX/
├─ BlockRYA/
├─ BlockRYX/
└─ metadata.xml
```

每個 Block 資料夾通常包含：

```text
*.obj
*.mtl
貼圖檔案（JPG、PNG 等）
```

### OBJ 上傳注意事項

必須：

- 壓縮整個 `terra_obj` 資料夾。
- 保留所有 Block。
- 保留 OBJ、MTL、貼圖及原始資料夾結構。
- 保留 `metadata.xml`。
- 使用英文、數字或底線命名 ZIP，降低特殊字元造成問題的可能性。

不要：

- 只上傳單一 Block。
- 只上傳 `.obj`。
- 將各 Block 的檔案抽出後混在同一層。
- 任意更改貼圖相對路徑。
- 上傳 Terra 的全部快取、照片及空三中間檔。

### Cesium ion 上傳設定

```text
Data Type: 3D Capture / Reality Model / Photogrammetry
Make available for download: 預設關閉
KTX2 compression: 開啟
Geometric Compression: Draco
```

## 1.3 Terra B3DM 資料結構

```text
terra_b3dms/
├─ tileset.json
├─ BlockRBA/
├─ BlockRBX/
├─ BlockRYA/
└─ BlockRYX/
```

每個 Block 內含多個：

```text
*.b3dm
*.json
```

### B3DM 使用注意事項

必須從最外層讀取：

```text
terra_b3dms/tileset.json
```

不要直接讀取任一單獨 Block，否則只會顯示部分模型。

### 目前實測結果

- 最外層 `tileset.json` 可完整顯示四個 Block。
- 經緯度及模型範圍可正常顯示。
- 畫質明顯比 OBJ 經 Cesium ion 轉換後粗糙。
- 模型建築與樹木呈現較低多邊形效果。
- 目前推測與 Terra 的 LOD、Mesh 簡化或 Cesium 載入參數有關。
- B3DM 適合繼續測試自架平台，但暫時不作為正式客戶展示的主要格式。

## 1.4 B3DM 模型粗糙的可能原因

依可能性排序：

1. Terra 輸出的 B3DM 已經進行較強的 LOD 或幾何簡化。
2. Cesium Viewer 的 `maximumScreenSpaceError` 設定較高，沒有提早載入最高細節。
3. Terra 的 B3DM 使用較低解析度貼圖或不同貼圖切片策略。
4. Terra 重建時的模型品質設定不足。
5. 瀏覽器 GPU 記憶體、網路或模型載入尚未完成，暫時顯示低 LOD。
6. Tileset 中最高 LOD 缺少、路徑錯誤或部分子 Tile 載入失敗。

後續測試時應記錄：

- Terra 重建品質設定。
- OBJ 與 B3DM 總容量。
- `tileset.json` 中的 `geometricError`。
- CesiumJS 的 `maximumScreenSpaceError`。
- 高細節 Tile 是否有 404 或 CORS 錯誤。
- 貼圖解析度與格式。
- 模型近距離停留 10～30 秒後是否變清楚。

## 1.5 目前建議的格式策略

### 客戶快速展示

```text
Terra OBJ → Cesium ion → Cesium Story
```

### 自有平台第一版

同時支援：

- Cesium ion Asset ID
- 自架 `tileset.json`

不要把平台綁死在單一來源。

### 正式系統後續方向

```text
Terra B3DM / 3D Tiles
→ S3、MinIO 或其他物件儲存
→ CDN
→ CesiumJS
```

待確認 B3DM 畫質及 LOD 問題後，再決定是否作為正式主要格式。

---

# 2. Drone GIS Platform 產品目標

建立一套以 CesiumJS 為核心的無人機 3D GIS 平台，最初可展示 DJI Terra 產出的 3D 模型並分享給外部人員，後續逐步加入 GIS、量測、標記、專案管理、報告與 AI 分析功能。

第一版只達成：

> 管理員可建立專案、加入一個 3D 模型、產生外部分享連結，訪客能在瀏覽器正常觀看模型。

---

# 3. 使用者角色

## 3.1 第一階段角色

### Admin

- 建立、修改及刪除專案。
- 新增模型。
- 設定初始視角。
- 建立及停用分享連結。
- 查看基本模型資訊。

### Public Viewer

- 透過分享網址觀看指定專案。
- 旋轉、縮放、平移及回到初始視角。
- 切換全螢幕。
- 不可修改專案。
- 不可看到管理介面。
- 不可取得 Cesium ion Access Token。
- 預設不可下載原始模型。

## 3.2 後續角色

之後再增加：Engineer、Client、Super Admin。第一版不要先做多租戶及複雜權限。

---

# 4. 技術架構建議

## 4.1 第一階段建議技術

```text
Frontend: React + TypeScript + Vite + CesiumJS + Tailwind CSS
State: Zustand
Backend: FastAPI
Database: PostgreSQL
Storage: Cesium ion Asset ID 或外部 tileset.json URL
Deployment: Docker Compose + Nginx + HTTPS
```

加入 GIS 功能前再啟用 PostGIS；模型自架階段再加入 MinIO、AWS S3 或 Cloudflare R2。

## 4.2 模型來源抽象化

```typescript
type ModelSourceType = "cesium-ion" | "tileset-url";

interface ModelSource {
  type: ModelSourceType;
  assetId?: number;
  tilesetUrl?: string;
}
```

未來再擴充 S3、MinIO、Local Server、Google Photorealistic 3D Tiles。

---

# 5. 開發優先順序

# P0：專案骨架與單一模型 Viewer

## 目標

先確認網站能穩定載入一個 3D 模型。

## 必須完成

- React + TypeScript + Vite 專案。
- CesiumJS 正常初始化。
- 可載入 Cesium ion Asset ID 或公開 `tileset.json` URL。
- 自動飛到模型。
- 基本相機操作。
- 回到初始視角。
- 全螢幕。
- 顯示載入中、成功及失敗狀態。
- 桌面及平板可正常使用。
- Cesium Token 從環境變數取得，不寫死在 Git 中。

## 暫時不要做

登入、專案列表、資料庫、GIS、量測、標記、AI、大型檔案上傳。

## P0 驗收條件

- 指定 Asset ID 可正常載入林口模型。
- 指定 `tileset.json` URL 可正常載入 Terra B3DM。
- 載入失敗時有明確錯誤訊息。
- Token 不會出現在原始碼倉庫。
- 重新整理頁面後仍可載入模型。

# P1：專案管理與外部分享 MVP

## 目標

建立一個案件並分享給外部客戶觀看。

## 必須完成

### 管理端

- Admin 登入。
- 專案列表。
- 建立、修改、刪除專案。
- 欄位：名稱、客戶、拍攝日期、地點、說明、模型來源、Asset ID 或 tileset URL、初始視角、封面、分享狀態。
- 在 Viewer 中儲存目前相機視角。

### 分享端

- 建立不可預測的分享代碼。
- 分享網址：`/share/{shareToken}`。
- 外部訪客不需登入。
- 分享頁只顯示指定專案。
- 可停用或重新產生連結。
- 預設不提供模型下載。

## P1 驗收條件

- Admin 可建立專案並加入模型。
- 無痕瀏覽器可打開分享網址。
- 訪客無法進入後台。
- 停用分享後舊網址立即失效。
- 初始視角正確。

# P2：Viewer 實用功能

- 圖層面板。
- 模型顯示／隱藏。
- 模型透明度。
- 底圖切換。
- 地形開關。
- 經度、緯度、高度顯示。
- 模型載入進度。
- 手機及平板基本操作。
- 分享目前相機視角。
- URL 保存視角參數。
- 專案資訊面板。
- 公司 Logo、品牌色、聯絡資訊。
- 保留資料來源及版權標示。

# P3：基本 GIS 圖層

- GeoJSON。
- KML/KMZ。
- WMS。
- WMTS。
- 圖層順序及透明度。
- 圖例。
- 點、線、面樣式。
- 專案座標系統欄位。
- 前端統一以 WGS84 顯示，保留原始成果座標資訊。

台灣需考慮：TWD97 TM2 Zone 121/119、e-GNSS[2025]、橢球高、TWVD2001、國土測繪中心圖層及地籍授權。

# P4：量測與註記

量測：距離、折線、面積、高差、空間座標取點。  
註記：點位、標題、說明、照片、建立者、時間、編輯、刪除、GeoJSON 匯出。

量測結果必須標示模型來源、座標系統、高程基準及是否為近似值，不可直接宣稱具法定測量效力。

# P5：物件儲存與模型上傳

- MinIO 或 S3 相容儲存。
- 上傳已完成的 3D Tiles ZIP。
- 解壓縮並檢查最外層 `tileset.json`。
- 保留相對路徑。
- CORS 與 MIME Type。
- 上傳狀態、容量限制、失敗清理。
- 刪除專案時處理模型檔案。
- 可選 CDN。

第一版只接收已切好的 3D Tiles ZIP，不在伺服器做 OBJ → 3D Tiles。

# P6：進階工程 GIS

完成 P0～P5 且有實際需求後再做：地形剖面、坡度、坡向、體積、DOM、DSM、DEM、點雲、GCP、原始照片位置、不同日期模型、Before/After、分割畫面、時間軸及報告。

# P7：AI 與產業模組

核心平台穩定後才開發：太陽能板辨識與編號、熱異常、邊坡裂縫與變化、工地機具與進度分析。所有 AI 結果必須保留人工校正流程。

---

# 6. 資料模型初稿

## Project

```text
id, name, client_name, location_name, description, capture_date,
coordinate_system, vertical_datum, cover_image_url, default_camera,
status, created_at, updated_at
```

## Model

```text
id, project_id, name, source_type, cesium_asset_id, tileset_url,
model_format, coordinate_system, vertical_datum, height_offset,
heading, pitch, roll, scale, is_visible, created_at
```

## ShareLink

```text
id, project_id, token_hash, is_enabled, expires_at,
created_at, last_accessed_at
```

## Layer

```text
id, project_id, name, layer_type, source_url, style_json,
opacity, is_visible, sort_order
```

## Annotation

```text
id, project_id, geometry, title, description, attachment_url,
created_by, created_at, updated_at
```

---

# 7. 安全與權限規範

- 不可將 Cesium ion 主要帳號 Token 寫在前端。
- 建立網站專用 Token，只開 `assets:read`。
- 限制可存取 Asset 及 Allowed URLs。
- 分享 Token 必須隨機且不可猜測，資料庫只存雜湊。
- 外部分享頁預設禁止下載。
- 敏感模型支援到期日及立即停用。
- 正式環境必須使用 HTTPS。
- 管理 API 必須驗證身份。
- 解壓 ZIP 時防止路徑穿越攻擊。
- 記錄建立、修改、分享及刪除操作。

---

# 8. 效能規範

- 使用 3D Tiles 按需串流，不在前端載入 OBJ。
- Viewer 初始化與 UI 不互相阻塞。
- 顯示模型載入進度。
- 可設定 `maximumScreenSpaceError`、`dynamicScreenSpaceError`、`skipLevelOfDetail`。
- 提供「標準」「高畫質」「流暢」三種品質預設。
- 行動裝置預設流暢模式。
- 大型模型支援 CDN。

---

# 9. B3DM 畫質測試任務

1. 讀取最外層 `tileset.json`。
2. 測試 `maximumScreenSpaceError`：32、16、8、4、2。
3. 開關 `dynamicScreenSpaceError`。
4. 近距離停留，觀察是否換入高 LOD。
5. 用 Network 確認高階 B3DM 是否成功回傳。
6. 檢查 404、CORS、MIME Type。
7. 比較 OBJ → Cesium ion 與 B3DM → 自架。
8. 記錄載入時間、記憶體、FPS、流量、近距離畫質及行動裝置表現。

---

# 10. Codex 執行規則

Codex 每次只處理一個階段：

```text
1. 閱讀本 PRD。
2. 只實作目前指定的 Priority。
3. 不預先實作下一階段功能。
4. 先提出檔案結構及實作計畫。
5. 完成程式。
6. 撰寫 README。
7. 提供本機啟動方式。
8. 撰寫最少必要測試。
9. 列出已完成、未完成及已知問題。
10. 等待人工驗收後才進下一階段。
```

程式規範：全程 TypeScript、避免 `any`、元件單一職責、API 採 OpenAPI、使用 ESLint/Prettier、設定集中 `.env`、提供 `.env.example`、使用 Docker、錯誤訊息可理解、保留 Cesium Attribution、密鑰不進 Git、重要決策寫入 `docs/decisions/`。

---

# 11. 建議實作順序

```text
P0 單一模型 Viewer
↓
P1 專案管理與外部分享
↓
P2 Viewer 實用功能
↓
P3 基本 GIS 圖層
↓
P4 量測與註記
↓
P5 自架模型儲存
↓
P6 進階工程 GIS
↓
P7 AI 與產業模組
```

近期只執行：`P0 → P1 → P2`。P0 驗收完成前，不開始資料庫、GIS 或 AI。

---

# 12. 第一個交給 Codex 的任務

```text
請閱讀 Drone GIS Platform PRD，現在只執行 P0，不要實作 P1 以後的功能。

目標：
建立 React + TypeScript + Vite + CesiumJS 的單一模型 Viewer。

必要功能：
1. 從 .env 讀取 Cesium ion Access Token。
2. 可在設定檔切換 Cesium ion Asset ID 與公開 tileset.json URL。
3. 模型載入後自動 flyTo。
4. 提供回到模型、全螢幕按鈕。
5. 提供載入中、成功及錯誤狀態。
6. 桌面及平板可操作。
7. 保留 Cesium Attribution。
8. 提供 README、.env.example、Dockerfile。
9. 加入最基本測試。
10. 不要建立登入、資料庫、專案列表、GIS、量測或上傳功能。

請先提出：
- 專案檔案結構
- 實作步驟
- 風險與假設

確認結構後再開始寫程式。
```

---

# 13. 目前結論

最可靠的商業交付方式：

```text
Terra OBJ → Cesium ion → Cesium Story
```

最適合的平台開發方式：

```text
先完成支援 Cesium ion Asset ID 與 tileset.json 的 Viewer
→ 再做專案管理與分享
→ 再做 GIS
```

不要一開始就做完整無人機 GIS 平台。先確保模型可穩定觀看、可分享、可管理，再逐步加入專業功能。

---

# 14. 2026-07-31 專案分享架構

目前採用「隱藏專案網址＋個別密碼」：

- 官網不列出客戶專案。
- 每個專案使用獨立隨機路徑，網址不包含密碼。
- 客戶入口只顯示單一專案，驗證後也不能切換到其他專案。
- 管理員入口保留完整專案切換與分享功能。
- 分享按鈕依目前專案複製對應的隱藏網址。
- 專案頁設定 `noindex`，降低被搜尋引擎收錄的機率。

此方案適合目前的靜態展示站，但密碼驗證與 Cesium token 仍存在瀏覽器端。若專案屬於機密資料，下一階段必須改為伺服器端授權、短效工作階段與可撤銷的分享紀錄。

## 2026-08-06｜三峽太陽能板2地籍圖測試

- 原始檔：`F198803880000.DXF`
- 原始坐標：TWD97 二度 TM 121 分帶（EPSG:3826）
- 網頁坐標：WGS84 經緯度（EPSG:4326 / GeoJSON）
- Cesium ion 測試資產：`5114945`（GEOJSON，狀態 COMPLETE）
- 地段：新北市／樹林地政事務所／十三添一段／段代碼 1988／地號 388
- 顯示方式：以半透明紅色分類面覆蓋三維模型，搭配橘黃色邊界；可由左側開關顯示或隱藏，並可開啟地段資訊卡。
- 實務建議：小型地籍向量優先由網站載入 GeoJSON，速度快且不占用額外 3D Tiles 處理；ion 資產保留作雲端備援與後續大量資料測試。
- 已移除先前每 5 公尺等高線測試圖層；三峽太陽能板2目前只保留正式地籍範圍測試。
# 2026-08-07 日照模擬與龍洞岩場2

- 「新北市三峽區太陽能板2」加入日照模擬：日期、06:00–18:00 台灣時間滑桿、08/12/16 時快捷鍵及一天播放功能。
- 日照模擬預設關閉；開啟時啟用模型、地形光照與柔和陰影，定位為視覺判讀用途，不代表工程級日照時數或發電量分析。
- 新增「新北市貢寮區龍洞岩場2」，Cesium ion Asset ID `5117313`，專案 ID `gongliao-longdong-rock-2`。
- 專案分享入口為 `/3d-viewer/p/G7rN4xP2mQ8v/`，密碼為 `0730`（設定檔僅保存 SHA-256 雜湊）。
- 「新北市貢寮區龍洞岩場2」固定起始視角：經度 `121.92214411`、緯度 `25.10834929`、高度 `198.45m`、heading `354.942°`、pitch `-38.005°`、roll `0°`。
- 正上方（俯視）與正北控制從底部主要功能列獨立出來，改為右下角的小型 GIS 方向工具，避免與分享、回到模型、重新載入及全螢幕等主要操作混在一起。
- 本次只完成本機修改，尚未上傳 Git。
