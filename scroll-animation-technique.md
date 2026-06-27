# Scroll Narrative Animation Technique

這份文件整理目前「網站往下滾，畫面固定並播放動畫」的實作方式，方便搬到其他專案使用。

## 效果目標

使用者向下滾動時，某一段畫面會暫時固定在視窗中。滾動不會立刻跳到下一段內容，而是驅動一段動畫：

- 背景大字橫向滑動
- 月亮沿軌道移動
- 潮汐線左右拉開
- 多段文字依序淡入淡出
- 動畫跑完後，頁面才繼續往下進入下一個 section

這類效果常見於精品形象頁、產品發表頁、Apple-style landing page、GSAP ScrollTrigger landing page。

## 使用技術

### GSAP

GSAP 是 JavaScript 動畫函式庫，用來控制元素的移動、透明度、縮放、旋轉等。

這裡主要使用：

- `gsap.timeline()`：把多個動畫串成一條時間軸
- `gsap.to()`：把元素動畫到某個狀態
- `gsap.set()`：設定元素初始狀態
- `gsap.utils.toArray()`：批次選取元素

### ScrollTrigger

ScrollTrigger 是 GSAP 的滾動動畫外掛。這段效果最重要的是：

- `trigger`：指定哪個 section 觸發動畫
- `start` / `end`：設定動畫開始和結束位置
- `scrub`：讓滾動進度綁定動畫進度
- `pin`：把某個畫面固定在 viewport
- `anticipatePin`：讓 pin 的切換更穩

### Lenis

Lenis 是 smooth scroll 套件，用來讓滾輪滾動更細緻。

它不是動畫本體，但會讓 ScrollTrigger 的 scrub 動畫比較順。

### CSS Sticky / Pin Layout

視覺上要先做一個很高的外層 section，例如 `320vh`，再讓內層畫面固定在螢幕中。

GSAP 的 `pin` 會接管固定行為，但 CSS 結構仍然要先規劃好：

- 外層：提供足夠滾動距離
- 內層：實際顯示在螢幕上的動畫舞台

## CDN 引入

放在 HTML 結尾：

```html
<script src="https://unpkg.com/lenis@1.3.23/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"></script>
<script src="script.js"></script>
```

如果使用 Lenis 官方 CSS：

```html
<link rel="stylesheet" href="https://unpkg.com/lenis@1.3.23/dist/lenis.css">
```

## HTML 結構

核心結構如下：

```html
<section class="scroll-story" aria-label="滾動敘事動畫">
  <div class="story-pin">
    <div class="story-orbit" aria-hidden="true">
      <span class="story-moon"></span>
    </div>

    <div class="story-tide" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>

    <p class="story-label">Scroll Narrative</p>

    <div class="story-rail" aria-hidden="true">
      <span>MOONLIT</span>
      <span>MAINE COON</span>
      <span>SILVER COAST</span>
    </div>

    <div class="story-copy">
      <article class="story-panel is-active">
        <span>01</span>
        <h2>月光先落下。</h2>
        <p>畫面固定，訪客往下捲時，光線與文字開始位移。</p>
      </article>

      <article class="story-panel">
        <span>02</span>
        <h2>海風往前推。</h2>
        <p>潮線拉開，空間變深，品牌變成一段被捲動啟動的經驗。</p>
      </article>

      <article class="story-panel">
        <span>03</span>
        <h2>內容慢慢浮現。</h2>
        <p>最後收束到品牌主題，接著進入後面的正式內容。</p>
      </article>
    </div>
  </div>
</section>
```

## CSS 重點

### 外層提供滾動距離

```css
.scroll-story {
  position: relative;
  min-height: 320vh;
  background: #071014;
}
```

`320vh` 代表這段動畫有大約三個螢幕高度的滾動距離。  
數字越大，動畫越慢；數字越小，動畫越快。

### 內層作為固定舞台

```css
.story-pin {
  position: sticky;
  top: 0;
  min-height: 100vh;
  overflow: hidden;
  display: grid;
  align-items: center;
  padding: 6rem;
}
```

即使 GSAP 會用 `pin` 控制固定效果，這裡仍建議保留 `sticky`，在 JS 尚未載入時也有基本視覺結構。

### 背景大字

```css
.story-rail {
  position: absolute;
  z-index: 1;
  left: 0;
  top: 53%;
  display: flex;
  gap: 6rem;
  white-space: nowrap;
  color: rgba(237, 242, 244, 0.045);
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(4.4rem, 15vw, 15rem);
  line-height: 1;
  transform: translateY(-50%);
}
```

重點是：

- 字要非常大
- 透明度很低
- 橫向排列
- 後續用 GSAP 控制 `xPercent`

### 月亮和軌道

```css
.story-orbit {
  position: absolute;
  inset: 13vh auto auto 12vw;
  width: min(42vw, 34rem);
  aspect-ratio: 1;
  border: 1px solid rgba(244, 240, 220, 0.16);
  border-radius: 50%;
}

.story-moon {
  position: absolute;
  top: -1.3rem;
  left: 48%;
  width: clamp(3.2rem, 7vw, 7rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 32%, #fffef0, #ece4c5 48%, #9aa6a9 100%);
  box-shadow:
    0 0 2.2rem rgba(244, 240, 220, 0.44),
    0 0 6rem rgba(135, 167, 184, 0.24);
}
```

月亮是純 CSS 圓形漸層，不需要圖片。

### 文字面板

```css
.story-copy {
  position: relative;
  z-index: 2;
  width: min(44rem, 100%);
  margin-left: auto;
}

.story-panel {
  position: absolute;
  inset: 0 0 auto auto;
  width: 100%;
  padding-left: 2rem;
  border-left: 1px solid rgba(244, 240, 220, 0.32);
  opacity: 0;
  transform: translateY(2rem);
  pointer-events: none;
}

.story-panel:first-child {
  position: relative;
  opacity: 1;
  transform: none;
}
```

第一段文字保留在正常文件流中，讓容器有高度；後面幾段用 absolute 疊在同一個位置，再由 GSAP 控制進退場。

## JavaScript 核心

### 初始化 GSAP 和 ScrollTrigger

```js
const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
gsap.registerPlugin(ScrollTrigger);
```

### 初始化 Lenis 並同步 ScrollTrigger

```js
const lenis = new window.Lenis({
  lerp: 0.075,
  wheelMultiplier: 0.9,
  anchors: true,
});

lenis.on("scroll", ScrollTrigger.update);

gsap.ticker.add(function (time) {
  lenis.raf(time * 1000);
});

gsap.ticker.lagSmoothing(0);
```

這段讓 Lenis 的 smooth scroll 和 GSAP ScrollTrigger 同步。

### 建立 pinned scroll timeline

```js
const storyPanels = gsap.utils.toArray(".story-panel");

gsap.set(storyPanels.slice(1), { y: 56, opacity: 0 });
gsap.set(".story-moon", { transformOrigin: "50% 20rem" });

const storyTimeline = gsap.timeline({
  defaults: { ease: "none" },
  scrollTrigger: {
    trigger: ".scroll-story",
    start: "top top",
    end: "bottom bottom",
    scrub: 0.8,
    pin: ".story-pin",
    anticipatePin: 1,
  },
});
```

重點：

- `trigger: ".scroll-story"`：外層 section 負責觸發
- `pin: ".story-pin"`：內層舞台固定在畫面中
- `scrub: 0.8`：滾動和動畫連動，並帶一點順滑延遲
- `end: "bottom bottom"`：動畫長度取決於 `.scroll-story` 的高度

### 加入各元素動畫

```js
storyTimeline
  .to(".story-rail", { xPercent: -38, duration: 1 }, 0)
  .to(".story-moon", { x: "38vw", y: "18vh", rotation: 68, duration: 1 }, 0)
  .to(".story-orbit", { rotation: 18, scale: 1.08, duration: 1 }, 0)
  .to(".story-tide span:nth-child(1)", { x: "46vw", duration: 1 }, 0)
  .to(".story-tide span:nth-child(2)", { x: "-24vw", duration: 1 }, 0)
  .to(".story-tide span:nth-child(3)", { x: "30vw", duration: 1 }, 0)
  .to(storyPanels[0], { y: -60, opacity: 0, duration: 0.22 }, 0.2)
  .to(storyPanels[1], { y: 0, opacity: 1, duration: 0.22 }, 0.3)
  .to(storyPanels[1], { y: -60, opacity: 0, duration: 0.22 }, 0.58)
  .to(storyPanels[2], { y: 0, opacity: 1, duration: 0.22 }, 0.68);
```

最後一個參數，例如 `0`、`0.2`、`0.3`，是動畫在 timeline 的起始時間。  
這可以讓多個元素同時動，也可以安排文字分段進場。

## 可調參數

### 動畫速度

調整外層高度：

```css
.scroll-story {
  min-height: 320vh;
}
```

- `240vh`：比較快
- `320vh`：目前速度
- `420vh`：更慢、更沉浸

### 滾動和動畫的黏性

調整 `scrub`：

```js
scrub: 0.8
```

- `true`：完全貼合滾動，反應直接
- `0.4`：輕微平滑
- `0.8`：目前設定，比較高級、柔和
- `1.5`：更慵懶，但可能感覺延遲

### 背景大字移動距離

```js
.to(".story-rail", { xPercent: -38, duration: 1 }, 0)
```

數字越負，背景字往左滑越多。

### 月亮移動距離

```js
.to(".story-moon", { x: "38vw", y: "18vh", rotation: 68, duration: 1 }, 0)
```

- `x`：水平移動
- `y`：垂直移動
- `rotation`：旋轉角度

### 文字切換時間

```js
.to(storyPanels[0], { y: -60, opacity: 0, duration: 0.22 }, 0.2)
.to(storyPanels[1], { y: 0, opacity: 1, duration: 0.22 }, 0.3)
```

最後的 `0.2`、`0.3` 控制文字在整段動畫中的出現時間。

## 整合步驟

1. 在 HTML 加入 `.scroll-story` 結構。
2. 引入 GSAP、ScrollTrigger、Lenis。
3. 加入 `.scroll-story`、`.story-pin`、`.story-panel` 等 CSS。
4. 在 JS 初始化 Lenis。
5. `gsap.registerPlugin(ScrollTrigger)`。
6. 建立 `gsap.timeline()`。
7. 在 timeline 裡安排背景、月亮、潮線、文字動畫。
8. 手機版用 media query 調整字級和月亮位置。
9. 加上 `prefers-reduced-motion`，讓使用者偏好減少動畫時可以降級。

## 注意事項

- 這種效果建議用 `transform` 和 `opacity` 做動畫，效能比改 `top`、`left`、`width` 好。
- `pin` 的元素不要太多層複雜 layout，否則手機上容易卡。
- 如果有影片背景，影片不要再跟 `currentTime` 綁滾動，否則很容易卡。
- Lenis 和 ScrollTrigger 要同步，否則動畫位置可能不準。
- CDN 版本適合快速原型；正式專案可以改成 npm 安裝並打包。

## 目前專案對應檔案

- HTML 結構：`index.html`
- CSS 視覺：`styles.css`
- GSAP / Lenis 動畫：`script.js`

關鍵位置：

- `.scroll-story`：滾動敘事外層
- `.story-pin`：固定舞台
- `.story-rail`：背景大字
- `.story-moon`：月亮
- `.story-tide`：潮線
- `.story-panel`：分段文字
- `storyTimeline`：整段動畫時間軸
