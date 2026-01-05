document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Global Variables & DOM Elements ---
    const header = document.getElementById('main-header');
    const photoModal = document.getElementById('photo-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');

    // Lightbox Navigation Elements (Created dynamically or selected if in HTML)
    let currentCategoryPhotos = []; // Stores the current list of photos being viewed
    let currentPhotoIndex = -1;

    // Create Nav Buttons for Modal
    const prevBtn = document.createElement('button');
    prevBtn.className = 'lightbox-nav-btn lightbox-prev';
    prevBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>';

    const nextBtn = document.createElement('button');
    nextBtn.className = 'lightbox-nav-btn lightbox-next';
    nextBtn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>';

    // Append buttons to modal container
    const modalContainer = photoModal.querySelector('div'); // The relative container
    modalContainer.appendChild(prevBtn);
    modalContainer.appendChild(nextBtn);

    // --- 2. Helper Functions ---

    const getBaseLocationName = (filename) => {
        return filename.replace(/[-_(\（].*|\.\w+$/g, '').trim();
    };

    // --- 3. Lightbox Logic ---

    const updateLightboxImage = () => {
        if (currentPhotoIndex < 0 || currentPhotoIndex >= currentCategoryPhotos.length) return;
        const photo = currentCategoryPhotos[currentPhotoIndex];
        const { category, filename } = photo;
        const title = getBaseLocationName(filename);
        const imagePath = `./public/photos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;

        // Fade out slightly
        modalImage.style.opacity = '0.5';

        setTimeout(() => {
            modalImage.src = imagePath;
            modalImage.alt = title;
            modalImage.onload = () => {
                modalImage.style.opacity = '1';
            };
        }, 150);
    };

    const openModal = (category, filename, photoListStr) => {
        modalImage.src = `./public/photos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
        modalImage.alt = getBaseLocationName(filename);
        photoModal.classList.remove('hidden');
        photoModal.classList.add('flex'); // Ensure flex display

        // Find index
        currentPhotoIndex = currentCategoryPhotos.findIndex(p => p.filename === filename && p.category === category);
    };

    const closeLightbox = () => {
        photoModal.classList.add('hidden');
        photoModal.classList.remove('flex');
        modalImage.src = '';
    };

    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPhotoIndex > 0) {
            currentPhotoIndex--;
            updateLightboxImage();
        } else {
            // Loop to end?
            currentPhotoIndex = currentCategoryPhotos.length - 1;
            updateLightboxImage();
        }
    });

    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPhotoIndex < currentCategoryPhotos.length - 1) {
            currentPhotoIndex++;
            updateLightboxImage();
        } else {
            // Loop to start
            currentPhotoIndex = 0;
            updateLightboxImage();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (photoModal.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft') prevBtn.click();
        if (e.key === 'ArrowRight') nextBtn.click();
        if (e.key === 'Escape') closeLightbox();
    });

    // --- 4. Gallery Logic ---

    let globalPhotoData = {}; // Store fetched data

    // Color Distance Calculation (Euclidean)
    const getColorDistance = (color1, color2) => {
        if (!color1 || !color2) return 1000;
        return Math.sqrt(
            Math.pow(color1[0] - color2[0], 2) +
            Math.pow(color1[1] - color2[1], 2) +
            Math.pow(color1[2] - color2[2], 2)
        );
    };

    const renderGallery = (categoryName) => {
        // photoList is now Array of { filename, color }
        const photoList = globalPhotoData[categoryName] || [];
        const galleryContainer = document.getElementById(`gallery-${categoryName}`);

        if (!galleryContainer) return;

        let photosToDisplay = [];

        // "智慧隨機 + 色系搭配" 模式：
        // 規則 1：隨機選 1 張「種子照片」。
        // 規則 2：找出跟種子照片顏色最接近的候選人。
        // 規則 3：確保地點 (前四字) 用於去重。

        if (photoList.length > 0) {
            // 1. Pick Seed
            const seedIndex = Math.floor(Math.random() * photoList.length);
            const seedPhoto = photoList[seedIndex];
            const seedPrefix = seedPhoto.filename.substring(0, 4);

            photosToDisplay.push(seedPhoto);

            // 2. Find Candidates sorted by color distance
            let candidates = photoList.filter(p => p !== seedPhoto).map(p => {
                return {
                    ...p,
                    distance: getColorDistance(seedPhoto.color, p.color),
                    prefix: p.filename.substring(0, 4)
                };
            });

            // Sort by color similarity (lowest distance first)
            candidates.sort((a, b) => a.distance - b.distance);

            // 3. Select 2 more
            let selectedPrefixes = new Set([seedPrefix]);

            for (const candidate of candidates) {
                if (photosToDisplay.length >= 3) break;

                // Unique prefix check
                if (!selectedPrefixes.has(candidate.prefix)) {
                    photosToDisplay.push(candidate);
                    selectedPrefixes.add(candidate.prefix);
                }
            }

            // Fallback: If strict matching resulted in < 3 photos (rare, but possible if all matching colors are same location)
            // Pick random others to fill constraints
            if (photosToDisplay.length < 3) {
                const remaining = photoList.filter(p => !photosToDisplay.includes(p));
                // Shuffle remaining
                remaining.sort(() => 0.5 - Math.random());

                for (const p of remaining) {
                    if (photosToDisplay.length >= 3) break;
                    const prefix = p.filename.substring(0, 4);
                    if (!selectedPrefixes.has(prefix)) {
                        photosToDisplay.push(p);
                        selectedPrefixes.add(prefix);
                    }
                }
            }

            // Final Fallback: If still < 3 (e.g. total locations < 3), just fill
            if (photosToDisplay.length < 3) {
                const remaining = photoList.filter(p => !photosToDisplay.includes(p));
                for (const p of remaining) {
                    if (photosToDisplay.length >= 3) break;
                    photosToDisplay.push(p);
                }
            }

            // Optional: Shuffle the 3 selected photos so the "seed" isn't always first?
            // Or keep them sorted by color? Keeping them sorted might look nice (gradient effect).
            // Let's shuffle position to look more natural.
            photosToDisplay.sort(() => 0.5 - Math.random());
        }

        // Render
        galleryContainer.innerHTML = '';
        if (photosToDisplay.length === 0) {
            galleryContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">此分類暫無照片。</p>`;
        } else {
            photosToDisplay.forEach((photo, index) => {
                const title = getBaseLocationName(photo.filename);
                const imagePath = `./public/photos/${encodeURIComponent(categoryName)}/${encodeURIComponent(photo.filename)}`;
                // Add reveal class for animation
                const delayClass = (index % 3 === 0) ? 'reveal-delay-100' : (index % 3 === 1) ? 'reveal-delay-200' : 'reveal-delay-300';

                const cardHtml = `
                    <div class="relative w-full h-80 rounded-xl overflow-hidden shadow-2xl photo-card transition-transform transform hover:scale-105 cursor-pointer reveal ${delayClass} active" 
                         data-category="${categoryName}" 
                         data-filename="${photo.filename}">
                        <img src="${imagePath}" alt="${title}" class="w-full h-full object-cover">
                        <div class="photo-overlay absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 transition-opacity duration-300">
                            <span class="text-white text-xl font-semibold text-center px-2">${title}</span>
                        </div>
                    </div>`;
                galleryContainer.insertAdjacentHTML('beforeend', cardHtml);
            });
        }

        // Setup click events for this batch
        galleryContainer.querySelectorAll('.photo-card').forEach(card => {
            card.addEventListener('click', () => {
                // Update Global List for Lightbox based on context
                currentCategoryPhotos = photosToDisplay;
                openModal(card.dataset.category, card.dataset.filename);
            });
        });

        // Re-trigger scroll observer for new elements logic is handled by 'active' class immediately for updates to avoid flicker
    };

    const updateGalleries = (allPhotosData) => {
        globalPhotoData = allPhotosData;
        const categories = ["城市光影", "大地映像"];
        categories.forEach(category => {
            renderGallery(category);
        });
    };

    const fetchPhotoData = async () => {
        try {
            const response = await fetch(`public/photos.json?v=${Date.now()}`);
            if (!response.ok) throw new Error(`無法讀取 photos.json`);
            const data = await response.json();
            updateGalleries(data);
            setInterval(() => { updateGalleries(data); }, 60000);
        } catch (error) {
            console.error('載入照片資料時發生錯誤：', error);
        }
    };

    // --- 5. Scroll Animation (IntersectionObserver) ---
    const observeElements = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                    // Optional: Stop observing once shown
                    // observer.unobserve(entry.target); 
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    };

    // --- 6. Videos ---
    const setupRandomVideos = () => {
        const videoContainer = document.getElementById('video-container');
        if (!videoContainer) return;
        const videoSlots = [
            [{ url: "https://www.youtube.com/embed/X_-eCxOpJd8", title: "商業空間 空拍紀實" }],
            [
                { url: "https://www.youtube.com/embed/Kma5I6TBfr0", title: "基隆外木山漁港(片段)" },
                { url: "https://www.youtube.com/embed/B7IaqlqIa5o", title: "基隆望幽谷步道(片段)" },
                { url: "https://www.youtube.com/embed/WH8pKIyZAeA", title: "嘉義竹崎鹿麻產車站" },
                { url: "https://www.youtube.com/embed/fq3i3KnmQqI", title: "台中洲際棒球場" }
            ],
            [
                { url: "https://www.youtube.com/embed/yiUg4NowM1E", title: "台中南屯建案工程紀錄(鉅虹天蒔、鉅虹天麗)" },
                { url: "https://www.youtube.com/embed/38j96eEWfjk", title: "新北林口建案工程紀錄(長虹天聚)" }
            ],
            [
                { url: "https://www.youtube.com/embed/xlddOq_OnmY", title: "高雄車站、舊高雄車站(片段)" },
                { url: "https://www.youtube.com/embed/zQ6AjCtiSYk", title: "桃園中壢太陽能板" }
            ]
        ];
        const getVideoId = (url) => url.split('/').pop().split('?')[0];

        videoContainer.innerHTML = '';
        videoSlots.forEach((pool, index) => {
            if (pool.length === 0) return;
            const randomIndex = Math.floor(Math.random() * pool.length);
            const videoData = pool[randomIndex];
            const videoId = getVideoId(videoData.url);
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            const slotId = `video-slot-${index}`;

            const cardHtml = `
                <div id="${slotId}" class="relative w-full pb-[56.25%] rounded-xl overflow-hidden shadow-2xl bg-gray-900 group cursor-pointer border border-gray-800 reveal" onclick="playVideo('${slotId}', '${videoData.url}')">
                    <img src="${thumbnailUrl}" alt="${videoData.title}" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-transform duration-500 ease-out">
                    <div class="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all duration-300"></div>
                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div class="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/50 group-hover:scale-110 group-hover:bg-red-600 group-hover:border-red-600 transition-all duration-300 shadow-lg">
                            <svg class="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                    </div>
                    <div class="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out">
                        <p class="text-white text-lg font-bold tracking-wide drop-shadow-md">${videoData.title}</p>
                    </div>
                </div>`;
            videoContainer.insertAdjacentHTML('beforeend', cardHtml);
        });
    };

    const setupHeroVideo = () => {
        const heroVideo = document.getElementById('hero-video');
        if (!heroVideo) return;

        const videos = [
            'background/your-hero-video1.mp4',
            'background/your-hero-video2.mp4',
            'background/your-hero-video3.mp4',
            'background/your-hero-video4.mp4'
        ];

        const randomVideo = videos[Math.floor(Math.random() * videos.length)];

        // Find existing source or create one
        let source = heroVideo.querySelector('source');
        if (source) {
            source.src = randomVideo;
        } else {
            source = document.createElement('source');
            source.src = randomVideo;
            source.type = 'video/mp4';
            heroVideo.appendChild(source);
        }

        heroVideo.load();
    };

    window.playVideo = (elementId, videoUrl) => {
        const container = document.getElementById(elementId);
        if (!container) return;
        container.innerHTML = `<iframe class="absolute top-0 left-0 w-full h-full animate-fade-in" src="${videoUrl}?autoplay=1&rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    };

    // --- 7. Event Listeners ---
    mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.toggle('hidden'); });
    mobileMenuLinks.forEach(link => { link.addEventListener('click', () => { mobileMenu.classList.add('hidden'); }); });
    window.addEventListener('scroll', () => { header.classList.toggle('header-scrolled', window.scrollY > 50); });

    // Lightbox Close
    photoModal.addEventListener('click', (e) => {
        if (e.target === photoModal || e.target === closeModalBtn) { closeLightbox(); }
    });
    // Already added ESC listener above for prev/next context

    // Initialize
    fetchPhotoData();
    setupRandomVideos();
    setupHeroVideo();

    // Initial Observe for static elements
    setTimeout(observeElements, 500); // Wait for initial render
});
