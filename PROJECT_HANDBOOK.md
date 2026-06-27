# LCT Studio 專案開發手冊 (Project Handbook)

這份文件記錄了 **LCT Studio** 空拍作品集網站的開發架構、工作流程、維護方式以及經驗復盤。
目的在於讓未來的你（或協助你的 AI）能快速進入狀況，了解這個專案「是怎麼運作的」，以及我們「經歷了哪些改變」。

---

## 1. 專案架構與核心概念 (Architecture)

### 核心設計
本網站是一個 **靜態網站 (Static Site)**，結合 **Python 自動化** 與 **JavaScript 數據驅動** 的混合架構。

*   **前端 (Frontend)**:
    *   **HTML5 / Tailwind CSS**: 使用 CDN 版 Tailwind 快速開發。
    *   **Vanilla JS**: 原生 JavaScript 負責所有互動邏輯。
    *   **Google Analytics 4**: 已埋設追蹤代碼。

*   **資料層 (Data Layer)**:
    *   ~~**JSON 驅動 (Deprecated)**: 相簿內容不是寫死在 HTML，而是讀取 `public/photos.json`。~~
    *   **JS Data Objects (Current)**: 資料不再讀取 `json` 檔 (避免 CORS 問題)，而是讀取 `public/js/` 下的 `.js` 檔案，這些檔案會將數據掛載到全域變數 (`window.xxx`)。
        *   `data_photos.js` -> `window.globalPhotoData` (照片數據 + 色彩資訊 + GPS)
        *   `data_videos.js` -> `window.videoData` (影片清單)
        *   `map_markers.js` -> `window.mapMarkerData` (空拍地圖標示，正式站預設隱藏編輯工具)

*   **自動化工具 (Automation)**:
    *   `generate_photo_list.py`: 核心腳本。負責掃描照片、壓縮縮圖、壓制浮水印、分析主色調、提取 GPS，並生成 `data_photos.js`。
    *   **Update 2026/01**: 加入了檔名清洗 (Sanitization) 與去重邏輯，解決中文檔名空格與大小寫問題。

---

## 2. 目錄結構說明

```text
/ (專案根目錄)
├── index.html              # 網站首頁
├── photos/                 # [原始檔區] 放入高畫質原圖 (不會上傳)
│   ├── 城市光影/            # 分類 1
│   └── 大地映像/            # 分類 2
├── public/                 # [發布區] 網站資源
│   ├── photos/             # 經 Python 處理過、含浮水印的照片
│   ├── js/
│   │   ├── main.js         # 主要邏輯 (畫冊、畫廊、影片)
│   │   ├── data_photos.js  # [自動生成] 照片數據
│   │   ├── data_videos.js  # [手動維護] 影片數據 (~~舊版寫死在 main.js~~)
│   │   └── map_markers.js  # [手動維護] 空拍地圖標示資料
│   ├── assets/
│   │   ├── compare/        # 日夜/前後對比圖片
│   │   └── services/       # 服務項目卡片圖片
│   └── css/                # style.css
├── background/             # 背景影片 (Hero Video)
├── generate_photo_list.py  # [核心] 照片處理與數據生成腳本
├── git_auto.py             # [工具] 一鍵 Git 上傳
└── PROJECT_HANDBOOK.md     # 本手冊
```

---

## 3. 功能邏輯詳解 (Feature Logic)

### A. 線上畫冊模式 (Magazine Mode)
這是一個模擬實體畫冊閱讀體驗的功能，位於作品集區塊底部。
*   **排版**: 隨機從 **5種版型** 中選擇 (Single, Dual, Master Left/Right, Grid)。
*   **容器比例**: 強制固定為 **A3 橫式比例 (420:297)**，確保閱讀體驗一致。
*   **效能優化**: 
    *   圖片採用 `loading="lazy"`。
    *   JPEG 畫質壓縮至 70% 增加載入速度。
*   **篩選邏輯**:
    *   **同地互斥**: 同一頁面上，絕對不會出現兩張來自同依地點 (檔名前4字相同) 的照片。
    *   **色彩多樣**: 系統會計算 RGB 距離，盡量避免同頁面出現色調太接近的照片。

### B. 「關於我」區塊 (About Me)
*   **風格**: 高科技極簡主義 (High-Tech Minimalist)。
*   **特色**: 螢光青色 (`#00F0FF`) 點綴，搭配右上角的拍立得照片堆疊裝飾。
*   **引用**: 左上角保留經典 SVG 引號圖示。

### C. 精選影片 (Videos)
*   **選片邏輯**:
    1.  **固定第一部**: 永遠顯示「商業空間 空拍紀實」。
    2.  **隨機補位**: 從 `data_videos.js` 中隨機挑選另外 2 部不重複的影片。

---

## 4. 日常維護流程 (SOP)

這是你最常需要查閱的部分，當你要更新網站時，請依照此流程：

### 情境 A：新增/更新照片
1.  **整理照片**: 將修好的高畫質原圖，依分類放入 `photos/城市光影` 或 `photos/大地映像` 資料夾中。
2.  **執行處理程式**:
    *   在 VS Code 中開啟 `generate_photo_list.py` 並執行。
    *   程式自動清空舊的 `public/photos`，重新製作，並更新 `public/js/data_photos.js` (~~舊版更新 public/photos.json~~)。
3.  **上傳發布**:
    *   執行 `git_auto.py`。
    *   等待程式跑完 (git add -> commit -> push)。
    *   **注意**: 重新生成照片後，因為所有檔案內容更動，第一次上傳會較久。

### 情境 B：修改影片
1.  **修改檔案**: 直接編輯 `public/js/data_videos.js` 物件內容。
2.  **上傳發布**: 執行 `git_auto.py`。

---

## 5. 復盤：做對了什麼？做錯了什麼？(Experience)

### ✅ 做對的地方 (Good Practice)
1.  **流程自動化**: 寫了 Python 腳本一次解決「縮圖+浮水印+資料庫建立」，維護輕鬆。
2.  **色彩管理 (Color Management)**: 在腳本中加入 `ImageCms` 強制轉 sRGB，解決 AdobeRGB 照片變螢光色的問題。
3.  **數據載入優化**: 改用 `data_photos.js` 全域變數載入，解決本地預覽 CORS 問題。
4.  **檔案名稱清洗 (Sanitization)**: (New 2026/01)
    *   **問題**: 中文檔名含有空白或大小寫不一致，導致 GitHub Pages 讀取不到 (404)。
    *   **解法**: 修改 Python 腳本，自動去空白、轉小寫，並對重複檔名自動編號 (-2, -3)，徹底解決破圖問題。

### ⚠️ 曾遇到的問題與修正 (Lessons Learned)
1.  **檔案鎖定 (Permission Denied)**:
    *   **解法**: 加入 `remove_readonly` 和重試機制。
2.  **內容一致性**:
    *   **教訓**: 漸進式修改，確認 DOM 存在再綁定事件。

### 🔧 未來可以優化的方向 (Roadmap)
1.  **移除 Tailwind CDN**: 改用 Tailwind CLI 編譯靜態 CSS。
2.  **完全自動化**: 讓 Python 也自動掃描生成影片清單 `data_videos.js`。

---

## 6. 更新日誌存檔 (Update Log)

**注意：** 自 2026-01-26 起，詳細的專案變更日誌已移至 [PROJECT_LOG.md](PROJECT_LOG.md) 統一維護。本區塊僅保留歷史存檔。

### 歷史日誌 (Archive)

> [!NOTE]
> 完整的歷史更新記錄已移至 [PROJECT_LOG.md](PROJECT_LOG.md)。

---

## 7. 2026-06-09 補充：首頁電影感滾動改版

### A. 目前首頁視覺方向
本次改版保留原本靜態網站架構，並把首頁調整成更接近「空拍影像品牌官網」的呈現：

*   **Hero 開場**: 保留背景影片，加入暗角、膠片顆粒、滾動提示與 GSAP 滾動推鏡效果。
*   **Hero 文案**:
    *   主標題：`以空中視角，看見地景的壯闊與細節之美`
    *   副標：`從城市紋理、自然地貌到工程現場，記錄每一個值得被看見的瞬間。`
*   **作品照片區**: `城市光影`、`大地映像` 照片維持固定網格位置，不做滾動進場或視差位移，只保留 hover 放大與點圖燈箱。
*   **精選影片區**: 標題固定顯示，不套用 reveal/GSAP 進場動畫，避免滑動後透明度卡住。
*   **服務案例區**: 新增 `服務案例` 導覽與區塊，作為未來建案、工程紀錄、廠房與太陽能網站提案的展示入口。

### B. 新增前端依賴
本次新增 CDN 依賴：

*   `gsap.min.js`
*   `ScrollTrigger.min.js`

主要程式位於 `public/js/main.js` 的 `setupScrollCinematics()`，負責：

*   Hero 背景影片滾動推鏡。
*   Hero 文字隨滾動淡出，並在回到頂部時強制恢復顯示。
*   服務卡與部分區塊進場動畫。
*   偵測 `prefers-reduced-motion`，使用者偏好減少動畫時自動退回簡化效果。

### C. SEO 與上線行為
已移除 `_headers` 中的 `X-Robots-Tag: noindex`，並刪除空的 `_headers` 檔案。  
目的：讓已上線的作品集網站更適合被搜尋引擎收錄。

### D. 維護注意事項
1.  照片更新流程不變，仍使用 `generate_photo_list.py` 產生 `public/js/data_photos.js`。
2.  作品照片區不要重新加上 `data-cinematic-card` 或 `data-parallax-img`，避免照片位置再次被滾動動畫影響。
3.  若之後要更換 Hero 影片，優先放入 `background/your-hero-video4.mp4`、`.webm` 與 `.jpg` poster，維持 `setupHeroVideo()` 目前命名契約。
4.  若未來替太陽能客戶製作網站，可沿用「服務案例」敘事與 GSAP Hero 推鏡架構，但建議使用客戶實景或高品質 AI 氣氛短片作為背景。

---

## 8. 2026-06-11 Sun Path / Aerial Light 滾動敘事段落

### A. 段落定位
本次新增並穩定「Sun Path / Aerial Light」段落，作為 LCT Studio 空拍作品集的滾動敘事示範。此段落放在 Hero 之後、精選照片之前，用一天光線變化包裝空拍服務價值，讓網站可以展示：

* 空拍影像不只是展示照片，而是能以時間、光線、場域關係說故事。
* 未來太陽能、工程紀錄、建案與廠房巡檢網站，也能沿用這種「滾動分鏡 + 場域照片」的互動方式。
* 效果走克制電影感，不走過度炫技路線。

### B. 技術結構
* `index.html`
  * 新增 `#scroll-story`。
  * 使用四個 `.story-photo-panel` 對應 `SUNRISE`、`MORNING LIGHT`、`GOLDEN HOUR`、`SUNSET`。
  * 四張故事照片集中放在 `public/assets/story-*.png|jpg`，不走自動照片清單流程。
* `public/css/style.css`
  * 新增 `.scroll-story`、`.story-pin`、`.story-orbit`、`.story-sun`、`.story-photo-stage`、`.story-panel` 等樣式。
  * 作品、影片、服務、關於、聯絡段落改為共用連續深色背景，避免段落交界出現明顯色塊。
  * 日落照片使用較淡 overlay 與較高顯示透明度，避免畫面過暗。
* `public/js/main.js`
  * `setupScrollCinematics()` 加入 ScrollTrigger + MotionPathPlugin。
  * 太陽沿 SVG path 移動，文字與照片依四階段切換。
  * 最後 `SUNSET` 階段保留一段停留時間，避免日落剛出現就立刻跳到下一段。
  * 背景大字 `.story-rail` 已校正到最後對齊 `SUNSET`。

### C. 目前故事照片
* `public/assets/story-sunrise-qingjing.webp`
* `public/assets/story-morning-qingjing-cloudsea.webp`
* `public/assets/story-golden-xiluo-silhouette.webp`
* `public/assets/story-sunset-yilan-wujie.webp`

若未來替換照片，建議直接輸出網站用寬版裁切圖，優先使用 16:9 或 21:9，並預留文字區域，會比只靠 `object-position` 更穩。

### D. 注意事項
1. 照片自動更新流程仍維持原契約：`photos/` 原圖 -> `generate_photo_list.py` -> `public/photos/` + `public/js/data_photos.js`。
2. Sun Path 四張故事圖是首頁敘事素材，不屬於自動照片清單，需手動放在 `public/assets/`。
3. 每次修改 CSS/JS 後需更新 `index.html` 的 `style.css?v=` 與 `main.js?v=`，避免正式站吃到舊快取。
4. 若後續覺得段落過長，優先調整 `.scroll-story` 的 `min-height` 與 JS timeline 留白，不要用大 padding 製造空白。

---

## 9. 2026-06-12 Sun Path / Aerial Light 可調參數與維護備註

### A. 背景大字調整參數
`Sun Path / Aerial Light` 段落的背景大字使用 `.story-rail`，目前參數集中在 `public/css/style.css`：

```css
--story-rail-start-x: 2.5vw;
--story-rail-base-gap: 2.5rem;
--story-rail-gap-sunrise: 40vw;
--story-rail-gap-morning: 12vw;
--story-rail-gap-golden: 6vw;
--story-rail-end-x: -1vw;
```

參數用途：
- `--story-rail-start-x`: `SUNRISE` 一開始的位置，數值越大越往右。
- `--story-rail-base-gap`: 每個背景英文之間的基本間距。
- `--story-rail-gap-sunrise`: `SUNRISE` 到 `MORNING LIGHT` 的額外間距。
- `--story-rail-gap-morning`: `MORNING LIGHT` 到 `GOLDEN HOUR` 的額外間距。
- `--story-rail-gap-golden`: `GOLDEN HOUR` 到 `SUNSET` 的額外間距。
- `--story-rail-end-x`: 最後 `SUNSET` 停留的位置，數值越大越往右。

### B. 畫面調整模式
若需要在網站畫面上直接調整背景大字間距，可在網址加上：

```text
?railTune=1
```

範例：

```text
http://127.0.0.1:4173/?railTune=1#scroll-story
```

調整面板只會在網址含有 `railTune=1` 時出現，正常網站不會顯示。調整完成後可按 `Copy Params` 複製目前參數，再寫回 `public/css/style.css`。

### C. 本次前端命名與內容
- 導覽列「服務案例」已改為「影像服務」。
- 作品分類新增橘黃色英文小標：
  - 城市光影：`City Lights`
  - 大地映像：`Earthscapes`
  - 關於我：`About LCT`
  - 聯絡我：`Contact`
- `Sun Path / Aerial Light` 背景字應完整維持：
  - `SUNRISE`
  - `MORNING LIGHT`
  - `GOLDEN HOUR`
  - `SUNSET`

### D. 上線注意事項
- 修改 `public/css/style.css` 或 `public/js/main.js` 後，需同步更新 `index.html` 內的 cache query，例如 `style.css?v=53`、`main.js?v=53`。
- 正式推送前至少執行：

```powershell
node --check public/js/main.js
```

---

## 10. 2026-06-27 首頁版型與互動功能維護備註

### A. 精選影片
1. 主視覺影片預設顯示 `public/js/data_videos.js` 的第一部精選影片。
2. 下方縮圖列最多顯示 4 部影片；若影片超過 4 部，保留主影片並排除「林口空拍 (日+夜)」作為被替換項。
3. 影片年份由 `data_videos.js` 的 `year` 欄位控制，例如 `2025` / `2026`。

### B. 前後影像對比
1. 日照圖：`public/assets/compare/linkou-day.jpg`
2. 夜照圖：`public/assets/compare/linkou-night.jpg`
3. 正式頁面只顯示可拖曳的日夜對比滑桿。
4. 使用 `?editCompare=1` 或 `#edit-compare` 開啟調整工具，可分別調整日照/夜照的縮放、左右、上下。
5. 目前固定參數：
   - `data-day-x="33" data-day-y="53" data-day-zoom="109"`
   - `data-night-x="31" data-night-y="48" data-night-zoom="112"`

### C. 空拍地圖標示
1. 資料檔：`public/js/map_markers.js`
2. 正式站預設隱藏「編輯 / 新增 / 刪除 / 複製設定」工具。
3. 使用 `?editMap=1` 或 `#edit-map` 開啟簡易編輯工具。
4. 若是作品集既有照片，可填 `category` + `filename`，系統會從 `data_photos.js` 找圖與 GPS。
5. 若是額外圖片，可填 `image` 路徑，例如 `public/assets/...`。
6. 調整完成後按「複製設定」，將輸出的 `window.mapMarkerData = [...]` 貼回 `public/js/map_markers.js`。

### D. 服務項目
1. 卡片圖片位置：`public/assets/services/`
2. 目前四項：建築形象空拍、工程進度紀錄、活動影像紀錄、景點旅遊宣傳。
3. 替換圖片時保持檔名不變，直接覆蓋 `building.jpg`、`construction.jpg`、`event.jpg`、`tourism.jpg`。

### E. Cache 版本
1. 目前首頁使用 `style.css?v=68` 與 `main.js?v=64`。
2. 每次修改 CSS/JS 後需同步更新 `index.html` 內的 cache query，避免正式站吃到舊快取。

### F. 效能與圖片尺寸規則
1. 首頁大圖優先使用 WebP；照片型圖片若需 JPEG，建議使用 progressive JPEG。
2. 首頁區塊展示圖不建議超過 1920px 寬，除非是下載用或真的需要 4K 檢視。
3. 日夜/前後對比圖片目前固定為 1920x1080 等級，避免兩張圖合計超過數 MB。
4. 下方區塊圖片需保留 `loading="lazy"` 與 `decoding="async"`。
5. 若替換 `public/assets/compare/` 或 `public/assets/services/` 圖片，替換後先檢查檔案大小，首頁單張圖建議控制在 500KB 以內。
