# 專案執行日誌 (Project Execution Log)

此文件用於記錄專案的每一次執行、變更與迭代。
請 Agent 在每次任務結束時，將重要變更記錄於此。

## 格式範例
```markdown
### [YYYY-MM-DD] 任務名稱
- **變更類型**: (功能新增 / 修復 / 優化 / 文件)
- **詳細內容**:
  - 項目 1
  - 項目 2
- **下一步**: (選填)
```

---

## [2026-01-26] Agent Skills 設定與畫廊修復
- **變更類型**: 修復 & 文件
- **詳細內容**:
  - **修復畫廊跳頁問題**: 修正 `public/js/main.js` 中重複綁定 Event Listener 導致點擊下一張時 index 跳號的問題。
  - **建立 Agent Skills**: 建立 `.cursorrules` 檔案，定義專案開發準則：
    1.  **語言**: 強制使用繁體中文。
    2.  **日誌**: 強制維護 `PROJECT_LOG.md`。
    3.  **手冊**: 強制維護 `PROJECT_HANDBOOK.md` (流程與復盤)。
    4.  **權限**: (User Added) 禁止擅自安裝套件；核心文件修改需先提案。
- **下一步**: 確保後續開發遵循此規範。

## [2026-01-19] 功能歸檔 (Feature Archiving)
- **變更類型**: 優化
- **詳細內容**:
  - **3D 懸浮藝廊歸檔**: 將 v15 版本的 3D 藝廊功能相關程式碼從 `index.html` 與 `main.js` 移除，並備份至 `ARCHIVE_3D_GALLERY.md`。

## [2026-01-15] 響應式畫冊與安全性 (Responsive & Security)
- **變更類型**: 功能新增 & 優化
- **詳細內容**:
  - **響應式畫冊**: 實作 `isMobile` 偵測。手機版改為 A4 直式排版 (Vertical Stack)，電腦版維持 A3 橫式。
  - **白邊控制**: 手機版強制圖片高度 43% 以確保留白。
  - **手機體驗**: 修復螢幕旋轉時的輪播錯位 (Swiper Observer)。
  - **安全性**: 加入防右鍵、防 F12、以及 Domain Locking。

## [2026-01-14] 畫冊介面微調 (UI Fixes)
- **變更類型**: 修復
- **詳細內容**:
  - **封面響應式**: 修復平板模式下 "PORT-FOLIO" 標題溢出問題。
  - **排版微調**: 縮減封面內距。

## [2026-01-13] 視覺重製與線上畫冊 (Visual Overhaul)
- **變更類型**: 視覺重構 & 功能新增
- **詳細內容**:
  - **關於我重製**: 轉型為「高科技極簡主義」，使用螢光青色 (`#00F0FF`) 與淺灰藍色 (`#BEBEBE`)。排版改為雙欄 + 拍立得裝飾。
  - **線上畫冊模式**: 更名並轉型為「極簡藝廊風格 (Light Gallery)」，背景改為米白色 (`#F9F9F9`)，圖片加入圓角與懸浮陰影。
  - **系統優化**:
    - **浮水印**: 透明度調降至 30%。
    - **檔名清洗**: Python 腳本加入自動去空白與轉小寫功能，解決 404 問題。
    - **效能**: 畫冊圖片加入 Lazy Loading，JPEG 壓縮至 70%。
  - **Late Night Update**: 新增單頁式雜誌封面 (A4/A3)，優化燈箱導覽邏輯。

## [2026-06-09] 首頁電影感滾動體驗升級
- **變更類型**: 視覺優化 / 功能新增 / SEO / 上線
- **詳細內容**:
  - **Hero 改版**:
    - 加入 GSAP + ScrollTrigger，讓背景影片在滾動時產生慢速推鏡與淡出效果。
    - 新增暗角、膠片顆粒、滾動提示線，提升首頁電影感。
    - 主標題更新為「以空中視角，看見地景的壯闊與細節之美」，並手動斷行為第一行較長、第二行較短。
    - 副標更新為「從城市紋理、自然地貌到工程現場，記錄每一個值得被看見的瞬間。」
    - 修正 Hero 文字往下滑再回頂部後不顯示的問題：移除 Hero 的 `.reveal`，並在 `ScrollTrigger.onLeaveBack` 強制恢復 opacity 與 yPercent。
  - **作品照片區**:
    - `城市光影`、`大地映像` 維持固定網格位置，不再套用照片卡滾動進場、錯位或視差動畫。
    - 保留原本 hover 放大與燈箱瀏覽功能。
  - **精選影片區**:
    - 補強「精選影片」標題區，改為固定顯示，不套用 `reveal` 或 section-intro 的 GSAP 動畫，避免滑動後標題消失。
  - **服務案例區**:
    - 新增導覽項目「服務案例」。
    - 新增空拍攝影、工程紀錄、建案視覺、太陽能場域四個商業應用卡片，作為未來接案與太陽能網站設計的展示基礎。
  - **SEO 與維護性**:
    - 刪除 `_headers`，移除 `X-Robots-Tag: noindex`，讓正式網站可被搜尋引擎收錄。
    - 移除右鍵鎖定與 anti-debugger 迴圈，改成輕量網域提示，避免影響維護、除錯與使用體驗。
  - **上線紀錄**:
    - Commit: `311d6f9 升級首頁電影感滾動體驗`
    - Push: `origin/main`
- **驗證**:
  - `node --check public/js/main.js`
  - `node --check public/js/data_photos.js`
  - `node --check public/js/data_videos.js`
  - 自訂檢查：Hero 文案、服務段落、GSAP CDN、手機選單、noindex 移除、照片區固定顯示條件皆通過。
- **下一步**:
  - 線上站更新後，實際檢查 `https://lctstudio.tw/` 的 Hero、作品照片、影片標題、服務案例與手機版排版。
  - 若要使用 AI 影片，優先作為太陽能/廠房/能源場域的氣氛型 Hero 短片；LCT 本站仍建議以真實空拍素材為主。
---

## [2026-06-11] Sun Path / Aerial Light 滾動敘事段落與首頁視覺收斂
- **變更類型**: 互動設計 / 首頁視覺 / 作品集展示 / 筆記更新
- **主要變更**:
  - 新增 `#scroll-story` 日光敘事段落，使用 `SUNRISE`、`MORNING LIGHT`、`GOLDEN HOUR`、`SUNSET` 四階段建立空拍分鏡。
  - 使用 GSAP ScrollTrigger + MotionPathPlugin，讓太陽沿弧線移動，並同步切換階段標籤、文字與背景照片。
  - 新增四張首頁敘事素材：
    - `public/assets/story-sunrise-qingjing.png`
    - `public/assets/story-morning-qingjing-cloudsea.png`
    - `public/assets/story-golden-xiluo-silhouette.jpg`
    - `public/assets/story-sunset-yilan-wujie.png`
  - 將作品、影片、服務、關於、聯絡區改成共用連續深色背景，移除造成段落分界明顯的色塊與上下遮罩。
  - 調整 `#about` 與 `#services` 的段落間距，移除關於我上方過大的空白。
  - 調整日落照片亮度：降低日落階段 overlay，並提高日落照片顯示透明度。
  - 修正日出故事圖路徑，從不存在的 `story-sunrise-qingjing-a.png` 改為 `story-sunrise-qingjing.png`。
  - 更新黃金時刻與日落階段文案：
    - 黃金時刻：`透過黃金時刻的柔和光線，讓建築、工程與場域細節，在影像中被完整呈現。`
    - 日落：`當光線逐漸收斂，場域的輪廓與情緒，也被整理成更有記憶點的影像。`
  - 校正背景大字 `.story-rail` 的位移，讓最後階段對齊 `SUNSET`。
  - 版本快取更新至 `style.css?v=41` 與 `main.js?v=41`。
- **驗證**:
  - `node --check public/js/main.js`
  - 確認 `public/assets/story-sunrise-qingjing.png`、`public/assets/story-sunset-yilan-wujie.png` 存在。
- **備註**:
  - Sun Path 四張故事圖屬於首頁敘事素材，不會由 `generate_photo_list.py` 自動產生。
  - 未來若替換敘事圖，建議先裁成網站用寬版圖，減少依賴 `object-position`。

---

## [2026-06-12] Sun Path 微調工具、導覽與段落小標更新
- **更新類型**: 視覺微調 / 文案更新 / 前端工具 / GitHub 上線
- **主要調整**:
  - 導覽列與手機選單的「服務案例」改為「影像服務」，讓該段更符合目前內容定位。
  - `Sun Path / Aerial Light` 四階段文案更新：
    - 01 日出｜喚醒地景的第一道光
    - 02 晨光｜視角攀升，層次隨之展開
    - 03 黃金時刻｜捕捉光影的最佳純度
    - 04 日落｜餘暉凝結，成就雋永影像
  - 背景大字改為完整 `SUNRISE / MORNING LIGHT / GOLDEN HOUR / SUNSET`。
  - 背景大字間距與頭尾對齊改為 CSS 可調參數：
    - `--story-rail-start-x: 2.5vw`
    - `--story-rail-base-gap: 2.5rem`
    - `--story-rail-gap-sunrise: 40vw`
    - `--story-rail-gap-morning: 12vw`
    - `--story-rail-gap-golden: 6vw`
    - `--story-rail-end-x: -1vw`
  - 新增 `?railTune=1` 調整面板，可在網站畫面上用滑桿即時調整背景大字的位置與間距，調整結果可直接複製回 CSS。
  - 桌機版太陽尺寸縮小，並重新設計高光、內陰影與外圈光暈，使太陽更精緻且不過度搶畫面。
  - 手機版太陽縮小，四個階段標籤移到下方，降低與主標題互相遮擋的情況。
  - 補上橘黃色英文小標：
    - 城市光影：`City Lights`
    - 大地映像：`Earthscapes`
    - 關於我：`About LCT`
    - 聯絡我：`Contact`
  - 更新前端 cache 版本至 `v=53`。
- **驗證**:
  - `node --check public/js/main.js`
- **備註**:
  - `?railTune=1` 僅供調整使用，正常網址不會顯示調整面板。
  - 工作區仍有既有未處理檔案狀態：`public/assets/logo-2.png` 刪除狀態、`public/assets/logo (1).png`、`public/assets/logo (2).png`、`scroll-animation-technique.md` 未追蹤；本次不上傳這些檔案。
