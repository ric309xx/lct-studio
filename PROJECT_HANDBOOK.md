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
│   │   └── data_videos.js  # [手動維護] 影片數據 (~~舊版寫死在 main.js~~)
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

### 2026-01-13 更新摘要
*   **視覺風格 (Visual Style)**：
    *   「關於我」轉型為「高科技極簡主義」，文字配色優化 (`#BEBEBE`)，加入拍立得裝飾。
    *   「線上畫冊模式」更換為極簡藝廊風格，背景改為 Off-White，加入懸浮互動陰影。
*   **介面調整 (UI Refinement)**：
    *   縮小「關於我」整體區塊約 20% 以平衡視覺比重。
    *   畫冊模式按鈕上方加入 "IMMERSIVE VIEW" 裝飾字樣。
*   **系統優化 (Optimization)**：
    *   **修復破圖**：Python 腳本加入檔名清洗功能 (Sanitization)。
    *   **提升速度**：畫冊圖片加入 `loading="lazy"`，並將 JPEG 品質降至 70%。
    *   **浮水印**：透明度調降至 30%，減少干擾。

---
*最後更新日期: 2026-01-13*
