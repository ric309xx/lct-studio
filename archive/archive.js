(() => {
  "use strict";

  const PHOTO_BASE = "../public/photos/大地映像/";
  const MAX_PHOTOS_PER_SITE = 4;
  const photoSeries = (place, count = MAX_PHOTOS_PER_SITE) => Array.from(
    { length: Math.min(count, MAX_PHOTOS_PER_SITE) },
    (_, index) => `${PHOTO_BASE}${place} (${index + 1}).jpg`
  );
  const selectedPhotos = (place, indexes) => indexes
    .slice(0, MAX_PHOTOS_PER_SITE)
    .map((index) => `${PHOTO_BASE}${place} (${index}).jpg`);

  // 後續增加主題影片時，只需在對應地點的 films 陣列增加一筆。
  const sites = [
    {
      id: "nanya",
      name: "南雅奇岩",
      location: "新北市瑞芳區 · 東北角海岸",
      description: "東北角海岸長期風化、侵蝕所形成的奇特岩層，以三維實景模型保存岩體輪廓與細緻紋理。",
      interactivePath: "../3d-viewer/?project=ruifang-nanya-rock-20260810",
      meta: [
        ["地景類型", "海蝕岩岸"],
        ["地景特色", "風化岩層與海蝕紋理"],
        ["保存內容", "三維地景與空拍影像"],
        ["適合瀏覽", "岩層輪廓與海岸環境"]
      ],
      films: [{
        id: "nanya-flight",
        title: "南雅奇岩模型飛行模擬",
        youtubeId: "brbGz9LnubI",
        poster: `${PHOTO_BASE}新北市瑞芳區南雅奇岩 (4).jpg`
      }],
      photos: selectedPhotos("新北市瑞芳區南雅奇岩", [1, 3, 4, 5])
    },
    {
      id: "longdong",
      name: "龍洞岩場",
      location: "新北市貢寮區 · 龍洞灣",
      description: "以設定好的模型飛行路徑導覽岩壁及海岸空間，並以空拍照片保存現場的地貌細節。",
      interactivePath: "../3d-viewer/?project=gongliao-longdong-general-20260805",
      meta: [
        ["地景類型", "岩岸與海蝕崖壁"],
        ["地景特色", "海灣、岩壁與步道空間"],
        ["保存內容", "三維地景與空拍影像"],
        ["適合瀏覽", "岩場尺度與海岸關係"]
      ],
      films: [{
        id: "longdong-flight",
        title: "龍洞岩場模型飛行模擬",
        youtubeId: "SMmMzqosKYk",
        poster: `${PHOTO_BASE}新北市貢寮區龍洞岩場 (5).jpg`
      }],
      photos: selectedPhotos("新北市貢寮區龍洞岩場", [1, 2, 4, 5])
    },
    {
      id: "shuinandong",
      name: "水湳洞選煉廠遺址",
      location: "新北市瑞芳區 · 金瓜石水湳洞",
      description: "以空拍影像記錄山坡上的選礦冶煉設施遺構與聚落地景，保存礦業文化資產及其空間脈絡。",
      interactivePath: "../3d-viewer/?project=ruifang-shuinandong-smelter-20260811",
      meta: [
        ["地景類型", "礦業文化資產"],
        ["地景特色", "山坡選礦遺構與聚落紋理"],
        ["保存內容", "建築遺構、地形與空拍影像"],
        ["適合瀏覽", "遺址配置與山海空間關係"]
      ],
      films: [{
        id: "shuinandong-flight",
        title: "水湳洞選煉廠遺址模型飛行模擬",
        youtubeId: "M9wosL4C-68",
        poster: `${PHOTO_BASE}新北市瑞芳區水湳洞選煉廠遺址 (1).jpg`
      }],
      photos: photoSeries("新北市瑞芳區水湳洞選煉廠遺址", 2)
    }
  ];

  const ids = [
    "site-tabs", "site-title", "site-index", "site-location", "site-description",
    "site-meta", "archive-video", "archive-youtube", "archive-video-poster", "film-title", "film-list",
    "play-archive-video", "open-interactive-model", "photo-story", "photo-title",
    "photo-count", "photo-grid", "photo-modal", "photo-full", "photo-caption"
  ];
  const dom = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  let activeSite = null;
  let lastPhotoTrigger = null;

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function getInitialSite() {
    const id = new URLSearchParams(location.search).get("site");
    return sites.find((site) => site.id === id) || sites[0];
  }

  function renderTabs() {
    const tabs = sites.map((site, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.site = site.id;
      button.setAttribute("aria-selected", String(site === activeSite));
      button.textContent = `${String(index + 1).padStart(2, "0")}  ${site.name}`;
      button.addEventListener("click", () => selectSite(site));
      return button;
    });
    dom["site-tabs"].replaceChildren(...tabs);
  }

  function renderMeta(site) {
    const rows = site.meta.map(([key, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = key;
      detail.textContent = value;
      row.append(term, detail);
      return row;
    });
    dom["site-meta"].replaceChildren(...rows);
  }

  function setFilm(site, film) {
    const video = dom["archive-video"];
    const youtube = dom["archive-youtube"];
    video.pause();
    video.removeAttribute("src");
    video.load();
    youtube.removeAttribute("src");
    youtube.hidden = true;
    youtube.closest(".model-stage-shell")?.classList.remove("is-playing");
    dom["archive-video-poster"].src = film.poster;
    dom["archive-video-poster"].alt = `${site.name}模型飛行模擬封面`;
    setText(dom["film-title"], film.title);
    dom["film-list"].querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.film === film.id));
    });
    dom["play-archive-video"].hidden = false;
    dom["archive-video-poster"].hidden = false;

    const play = () => {
      youtube.src = `https://www.youtube-nocookie.com/embed/${film.youtubeId}?autoplay=1&rel=0&modestbranding=1`;
      youtube.hidden = false;
      youtube.closest(".model-stage-shell")?.classList.add("is-playing");
      dom["play-archive-video"].hidden = true;
      dom["archive-video-poster"].hidden = true;
    };
    dom["play-archive-video"].onclick = play;
    dom["archive-video-poster"].onclick = play;
  }

  function renderFilms(site) {
    dom["film-list"].hidden = site.films.length < 2;
    const buttons = site.films.map((film, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.film = film.id;
      button.textContent = `${String(index + 1).padStart(2, "0")}  ${film.title}`;
      button.setAttribute("aria-pressed", String(index === 0));
      button.addEventListener("click", () => setFilm(site, film));
      return button;
    });
    dom["film-list"].replaceChildren(...buttons);
  }

  function renderPhotos(site) {
    setText(dom["photo-title"], `${site.name}影像紀錄`);
    setText(dom["photo-count"], `${String(site.photos.length).padStart(2, "0")} FRAMES`);
    dom["photo-story"].hidden = site.photos.length === 0;
    const cards = site.photos.map((src, index) => {
      const button = document.createElement("button");
      const image = document.createElement("img");
      button.type = "button";
      image.src = src;
      image.alt = `${site.name}空拍紀錄 ${index + 1}`;
      image.loading = index < 2 ? "eager" : "lazy";
      image.decoding = "async";
      button.append(image);
      button.addEventListener("click", () => openPhoto(src, image.alt, button));
      return button;
    });
    dom["photo-grid"].replaceChildren(...cards);
  }

  function selectSite(site) {
    activeSite = site;
    setText(dom["site-title"], site.name);
    setText(dom["site-location"], site.location);
    setText(dom["site-description"], site.description);
    setText(
      dom["site-index"],
      `${String(sites.indexOf(site) + 1).padStart(2, "0")} / ${String(sites.length).padStart(2, "0")}`
    );
    const modelLink = dom["open-interactive-model"];
    if (site.interactivePath) {
      modelLink.href = site.interactivePath;
      modelLink.removeAttribute("aria-disabled");
      modelLink.classList.remove("is-disabled");
      modelLink.querySelector("small").textContent = "INTERACTIVE 3D";
      modelLink.querySelector("span:first-child").lastChild.textContent = "進入三維模型平台";
      modelLink.setAttribute("aria-label", `進入${site.name}三維模型平台，需要輸入密碼`);
    } else {
      modelLink.removeAttribute("href");
      modelLink.setAttribute("aria-disabled", "true");
      modelLink.classList.add("is-disabled");
      modelLink.querySelector("small").textContent = "3D MODEL / COMING SOON";
      modelLink.querySelector("span:first-child").lastChild.textContent = "三維模型待串接";
      modelLink.setAttribute("aria-label", `${site.name}三維模型待串接`);
    }
    history.replaceState(null, "", `${location.pathname}?site=${site.id}`);
    renderTabs();
    renderMeta(site);
    renderFilms(site);
    setFilm(site, site.films[0]);
    renderPhotos(site);
  }

  function openPhoto(src, caption, trigger) {
    lastPhotoTrigger = trigger;
    dom["photo-full"].src = src;
    dom["photo-full"].alt = caption;
    setText(dom["photo-caption"], caption);
    dom["photo-modal"].hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("photo-close").focus();
  }

  function closePhoto() {
    dom["photo-modal"].hidden = true;
    dom["photo-full"].removeAttribute("src");
    document.body.style.overflow = "";
    lastPhotoTrigger?.focus();
  }

  dom["archive-video"].addEventListener("play", () => {
    dom["archive-video"].closest(".model-stage-shell")?.classList.add("is-playing");
    dom["play-archive-video"].hidden = true;
    dom["archive-video-poster"].hidden = true;
  });
  dom["archive-video"].addEventListener("pause", () => {
    dom["archive-video"].closest(".model-stage-shell")?.classList.remove("is-playing");
  });
  dom["archive-video"].addEventListener("ended", () => {
    dom["play-archive-video"].hidden = false;
  });
  document.getElementById("photo-close").addEventListener("click", closePhoto);
  dom["photo-modal"].addEventListener("click", (event) => {
    if (event.target === dom["photo-modal"]) closePhoto();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom["photo-modal"].hidden) closePhoto();
  });

  selectSite(getInitialSite());
})();
