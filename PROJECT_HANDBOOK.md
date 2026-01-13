# LCT Studio 專案開發手冊 (Project Handbook)

這份文件記錄了 **LCT Studio** 空拍作品集網站的開發架構、工作流程、維護方式以及經驗復盤。
目的在於讓未來的你（或協助你的 AI）能快速進入狀況，了解這個專案「是怎麼運作的」。

---

## 1. 專案架構與核心概念 (Architecture)

### 核心設計
本網站是一個 **靜態網站 (Static Site)**，但結合了 **Python 自動化指令碼** 來生成內容數據。這是一個「半自動化」的架構，既保有靜態網站的快速與低成本，又擁有動態網站管理的便利性。

*   **前端 (Frontend)**:
    *   **HTML5**: 語意化標籤結構。
    *   **Tailwind CSS (CDN)**: 使用 `cdn.tailwindcss.com` 直接在瀏覽器解析樣式。
        *   *優點*: 開發快速，不需複雜的 Node.js 編譯環境。
        *   *缺點*: 依賴網路，初次載入可能會有短暫樣式閃爍 (雖已優化)。
    *   **JavaScript (Vanilla JS)**: 原生 JS 撰寫，無依賴大型框架 (如 React/Vue)。負責燈箱 (Lightbox)、相簿渲染邏輯、影片隨機播放等互動。
    *   **Google Analytics 4**: 已埋設追蹤代碼。

*   **資料層 (Data Layer)**:
    *   **JSON 驅動**: 相簿內容不是寫死在 HTML，而是讀取 `public/photos.json`。
    *   **自動生成**: 這個 JSON 是由 Python 程式掃描資料夾自動產生的。

*   **後端/工具 (Backend Tools)**:
    *   本專案**沒有**伺服器端後端 (Serverless)。
    *   所有資料處理都在**本地端 (Local)** 完成，由 Python 腳本負責：
        1.  圖片壓縮與縮放 (Resize)。
        2.  浮水印壓制 (Watermarking)。
        3.  EXIF GPS 資訊提取 (用於未來的地圖功能)。
        4.  色彩空間轉換 (AdobeRGB -> sRGB，解決照片變螢光色的問題)。
        5.  自動 Git 上傳 (Git Automation)。

---

## 2. 目錄結構說明

```text
/ (專案根目錄)
├── index.html              # 網站首頁 (主要入口)
├── photos/                 # [原始檔區] 你拍攝的原圖放這裡 (不會上傳到網頁，只供生成用)
│   ├── 城市光影/            # 分類資料夾 1
│   └── 大地映像/            # 分類資料夾 2
├── public/                 # [發布區] 程式生成的網站資源 (會被上傳)
│   ├── photos/             # 處理過、加浮水印的照片
│   ├── photos.json         # 照片資料庫 index
│   ├── js/                 # 前端程式碼 (main.js)
│   └── css/                # 自定義樣式 (style.css)
├── background/             # 背景影片與相關素材
├── generate_photo_list.py  # [核心腳本] 照片處理與各類自動化生成
├── git_auto.py             # [小工具] 一鍵上傳 GitHub
├── optimize_videos.py      # [小工具] 影片壓縮工具
└── .git/                   # Git 版本控制資料夾
```

---

## 3. 日常維護流程 (SOP)

這是你最常需要查閱的部分，當你要更新網站時，請依照此流程：

### 情境 A：新增/更新照片
1.  **整理照片**: 將修好的高畫質原圖，依分類放入 `photos/城市光影` 或 `photos/大地映像` 資料夾中。
2.  **執行處理程式**:
    *   在 VS Code 中開啟 `generate_photo_list.py`。
    *   點擊執行 (Run Python File)。
    *   *程式行為*: 它會自動清空舊的 `public/photos`，重新製作所有照片，並更新 `public/photos.json`。
3.  **預覽 (可選)**: 在本地打開 `index.html` 確認顯示正常。
4.  **上傳發布**:
    *   執行 `git_auto.py`。
    *   輸入備註 (例如: "新增高雄空拍照片")。
    *   等待程式跑完 (git add -> commit -> push)。
5.  **線上確認**: 等待約 1-2 分鐘，GitHub Pages 更新後，重新整理網頁確認。

### 情境 B：修改網站文字或影片
1.  **修改 HTML/JS**:
    *   文字內容直接編輯 `index.html`。
    *   影片連結目前位於 `public/js/main.js` 中的 `setupRandomVideos` 函式陣列裡。
2.  **上傳發布**: 同樣執行 `git_auto.py` 即可。

### 情境 C：影片檔案過大
1.  將原始影片放入資料夾。
2.  執行 `optimize_videos.py` (需確保有安裝 ffmpeg 相關依賴，若無則跳過)。
3.  將產出的 `.webm` 或 `.mp4` 放到 `background/` 資料夾取代舊檔。

---

## 4. 復盤：做對了什麼？做錯了什麼？(Experience)

### ✅ 做對的地方 (Good Practice)
1.  **流程自動化**:
    *   初期原本可能需要手動縮圖、手動改 HTML 插入 `<img>` 標籤，這非常耗時。
    *   後來寫了 Python 腳本一次解決「縮圖+浮水印+資料庫建立」，這讓維護網站變得極度輕鬆。
2.  **色彩管理 (Color Management)**:
    *   **問題**: 剛開始上傳照片時，發現網頁上的顏色變得異常鮮豔刺眼（螢光感）。
    *   **原因**: 相機拍攝時使用了 AdobeRGB 廣色域，但瀏覽器通常預設為 sRGB。
    *   **解法**: 在 `generate_photo_list.py` 加入了 `ImageCms` 轉換功能，強制轉為 sRGB，解決了色偏問題。
3.  **Git 簡易化**:
    *   對於不熟悉指令的操作者，`git_auto.py` 是一個很好的橋樑，避免了 `git add .`, `git commit` 等繁瑣指令的記憶。

### ⚠️ 曾遇到的問題與修正 (Lessons Learned)
1.  **檔案鎖定 (Permission Denied)**:
    *   **狀況**: 在 Windows 執行腳本時，偶爾會報錯 `[WinError 5] 存取被拒`，無法刪除舊資料夾。
    *   **原因**: 某個程式（可能是檔案總管或 VS Code 預覽）正佔用著該圖片。
    *   **解法**: 腳本中加入了 `remove_readonly` 和重試機制 (Retry logic)，讓程式更強健。
2.  **快取問題 (Caching)**:
    *   **狀況**: 更新了照片，但在瀏覽器上卻看不到變化。
    *   **原因**: 瀏覽器或 CDN 快取了舊的 `photos.json`。
    *   **解法**: 在 `main.js` 的 fetch url 後面加上了 `?v=${Date.now()}`，強制每次讀取最新版本。

### 🔧 未來可以優化的方向 (Roadmap)
1.  **移除 Tailwind CDN**: 
    *   目前的寫法主要為了開發方便。若未來流量變大，建議改用 Tailwind CLI 編譯出一個靜態的 `style.css`，可以提升載入速度並減少瀏覽器負擔。
2.  **影片配置檔外移**:
    *   目前影片清單寫死在 `main.js` 裡。未來應該像照片一樣，建立一個 `videos.json`，讓管理影片也能透過改文字檔完成，不用動到程式碼。
3.  **網域設定檔 (CNAME)**:
    *   GitHub Pages 若綁定網域，標準做法是在專案根目錄放一個名為 `CNAME` 的檔案（內容為你的網域名稱）。
    *   **注意**: 若你發現網域偶爾失效，可能是因為這個檔案遺失。建議在根目錄建立此檔案並提交。

---

## 5. 環境設定備忘 (Environment Setup)

若你換了新電腦，需要安裝以下軟體才能運作此專案：

1.  **Python**: 下載最新版 Python。
2.  **Visual Studio Code**: 推薦的編輯器。
3.  **Git**: 用於版本控制。
4.  **Python 套件**:
    開啟終端機，執行以下指令安裝依賴庫：
    ```bash
    pip install Pillow
    ```
    *(若 `optimize_videos.py` 需要用到 ffmpeg，則需另外安裝)*

---

*最後更新日期: 2026-01-11*
