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

    // --- 9. Photo Gallery Initialization (Local Data) ---

    // Helper to render grid
    const renderPhotoCategory = (categoryName, photos) => {
        const targetId = `gallery-${categoryName}`;
        const container = document.getElementById(targetId);

        if (!container) {
            console.warn(`Container not found: ${targetId}`);
            return;
        }

        container.innerHTML = '';
        let sourcePhotos = [...(photos || [])];
        let displayPhotos = [];
        let usedPrefixes = new Set();

        // Helper: Check validation
        const getPrefix = (name) => name.substring(0, 4);
        const isUnique = (p) => !usedPrefixes.has(getPrefix(p.filename));
        const addPhoto = (p) => {
            displayPhotos.push(p);
            usedPrefixes.add(getPrefix(p.filename));
        };

        // Shuffle helper (simple Fisher-Yates)
        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        if (categoryName === '城市光影') {
            // Logic: Random + Unique First 4 chars
            sourcePhotos = shuffle(sourcePhotos);
            for (let p of sourcePhotos) {
                if (displayPhotos.length >= 6) break;
                if (isUnique(p)) {
                    addPhoto(p);
                }
            }
        } else {
            // Logic: Earth - Color Balance + Unique First 4 chars
            // 1. Bin photos
            const bins = { warm: [], cool: [], green: [], neutral: [] };
            sourcePhotos.forEach(p => {
                const [r, g, b] = p.color || [128, 128, 128];
                // Simple loose heuristics
                if (r > g + 10 && r > b + 10) bins.warm.push(p);
                else if (g > r + 10 && g > b + 10) bins.green.push(p);
                else if (b > r + 10 && b > g + 10) bins.cool.push(p);
                else bins.neutral.push(p);
            });

            // Shuffle each bin
            Object.keys(bins).forEach(k => shuffle(bins[k]));

            // Round Robin selection
            const keys = ['warm', 'green', 'cool', 'neutral'];
            let safety = 0;
            // Iterate until we have 6 or run out of options
            while (displayPhotos.length < 6 && safety < 50) {
                let addedSomething = false;
                for (let k of keys) {
                    if (displayPhotos.length >= 6) break;
                    // Find first valid in this bin
                    const bin = bins[k];
                    for (let i = 0; i < bin.length; i++) {
                        if (isUnique(bin[i])) {
                            addPhoto(bin.splice(i, 1)[0]); // use and remove
                            addedSomething = true;
                            break; // move to next bin group
                        }
                    }
                }
                if (!addedSomething && displayPhotos.length < 6) {
                    // If we couldn't add from ANY bin (e.g. all remaining have duplicate prefixes)
                    // Try to force fill from remaining regardless of bin, just checking uniqueness
                    let remaining = [];
                    Object.values(bins).forEach(b => remaining.push(...b));
                    remaining = shuffle(remaining);
                    for (let p of remaining) {
                        if (displayPhotos.length >= 6) break;
                        if (isUnique(p)) addPhoto(p);
                    }
                    // If still stuck, break to avoid infinite loop
                    break;
                }
                safety++;
            }
        }

        displayPhotos.forEach((photo, index) => {
            const photoPath = `./public/photos/${categoryName}/${photo.filename}`;
            const card = document.createElement('div');

            // Add reveal delay classes
            const delayClass = (index % 3 === 0) ? 'reveal-delay-100' : (index % 3 === 1) ? 'reveal-delay-200' : 'reveal-delay-300';

            card.className = `photo-card relative group overflow-hidden rounded-xl shadow-lg cursor-pointer h-64 reveal ${delayClass}`;

            // Click Handler
            card.onclick = () => {
                if (typeof openModal === 'function') {
                    openModal(categoryName, photo.filename);
                }
            };

            card.innerHTML = `
                <img src="${photoPath}" loading="lazy" alt="${photo.filename}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="photo-overlay absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                    <h4 class="text-white font-bold text-2xl tracking-wider drop-shadow-md">${getBaseLocationName(photo.filename)}</h4>
                </div>
             `;
            container.appendChild(card);
        });
    };

    const setupPhotoGallery = () => {
        const data = window.globalPhotoData;
        if (!data) return;
        renderPhotoCategory('城市光影', data['城市光影']);
        renderPhotoCategory('大地映像', data['大地映像']);
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

    // --- 6. Videos (Dynamic Selection from JS Data) ---
    const setupVideoGallery = () => {
        const mainPlayer = document.getElementById('main-video-player');
        const mainTitle = document.getElementById('main-video-title');
        const playlistContainer = document.getElementById('video-playlist');

        if (!mainPlayer || !playlistContainer) return;

        const data = window.videoData || { categories: {} };
        let allVideos = [];

        // Flatten and tag
        Object.keys(data.categories).forEach(cat => {
            data.categories[cat].forEach(v => allVideos.push({ ...v, cat }));
        });

        if (allVideos.length === 0) return;

        let selectedVideos = [];

        // 1. Default Video: "商業空間 空拍紀實"
        const defaultIndex = allVideos.findIndex(v => v.title.includes('商業空間'));
        if (defaultIndex !== -1) {
            selectedVideos.push(allVideos[defaultIndex]);
        }

        // 2. Pick 2 from remaining categories (scenery, construction, other)
        const otherCats = ['scenery', 'construction', 'other'];
        // Shuffle categories
        for (let i = otherCats.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [otherCats[i], otherCats[j]] = [otherCats[j], otherCats[i]];
        }

        // Take first 2 categories
        otherCats.slice(0, 2).forEach(cat => {
            const candidates = data.categories[cat] || [];
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                selectedVideos.push(pick);
            }
        });

        // 3. Fallback: If we still need more (e.g. cat was empty), just pick random from allVideos
        // Filter out existing
        while (selectedVideos.length < 3) {
            const remaining = allVideos.filter(v => !selectedVideos.includes(v));
            if (remaining.length === 0) break;
            selectedVideos.push(remaining[Math.floor(Math.random() * remaining.length)]);
        }

        let activeIndex = 0;

        const loadVideo = (index) => {
            const video = selectedVideos[index];
            activeIndex = index;

            // Update Main Player
            mainPlayer.innerHTML = `<iframe class="absolute top-0 left-0 w-full h-full" src="${video.url}?autoplay=1&rel=0" title="${video.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
            mainTitle.textContent = video.title;

            document.getElementById('videos').scrollIntoView({ behavior: 'smooth' });
            renderPlaylist();
        };

        const renderPlaylist = () => {
            playlistContainer.innerHTML = '';
            // Only show 6 items max if somehow more
            selectedVideos.slice(0, 6).forEach((video, index) => {
                const videoId = video.url.split('/').pop().split('?')[0];
                const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                const isActive = index === activeIndex;

                const itemHtml = `
                    <div class="group relative bg-gray-800 rounded-xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ${isActive ? 'ring-2 ring-blue-500' : ''}" onclick="window.playGalleryVideo(${index})">
                        <div class="relative w-full pb-[56.25%] overflow-hidden">
                            <img src="${thumbnailUrl}" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-90 group-hover:opacity-100">
                            <div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <div class="w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:bg-red-600 transition-colors">
                                        <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                            </div>
                            <div class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs text-white">${video.duration}</div>
                        </div>
                        <div class="p-4">
                            <h5 class="text-white font-semibold text-sm line-clamp-2 min-h-[2.5rem] leading-snug group-hover:text-blue-400 transition-colors">${video.title}</h5>
                        </div>
                    </div>
                `;
                playlistContainer.insertAdjacentHTML('beforeend', itemHtml);
            });
        };

        window.playGalleryVideo = (index) => { loadVideo(index); };

        // Initial Load
        const initialVideo = selectedVideos[0];
        mainPlayer.innerHTML = `<iframe class="absolute top-0 left-0 w-full h-full" src="${initialVideo.url}?rel=0" title="${initialVideo.title}" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
        mainTitle.textContent = initialVideo.title;
        renderPlaylist();
    };

    const setupHeroVideo = () => {
        const heroVideo = document.getElementById('hero-video');
        if (!heroVideo) return;

        // Strictly use your-hero-video4
        const baseFilename = `your-hero-video4`;

        // Set Poster (First frame)
        heroVideo.poster = `background/${baseFilename}.jpg`;

        // Clear existing content (fallback text/sources)
        heroVideo.innerHTML = '';

        // 1. Add WebM Source (Preferred)
        const sourceWebM = document.createElement('source');
        sourceWebM.src = `background/${baseFilename}.webm`;
        sourceWebM.type = 'video/webm';
        heroVideo.appendChild(sourceWebM);

        // 2. Add MP4 Source (Fallback)
        const sourceMp4 = document.createElement('source');
        sourceMp4.src = `background/${baseFilename}.mp4`;
        sourceMp4.type = 'video/mp4';
        heroVideo.appendChild(sourceMp4);

        // Fallback text
        heroVideo.appendChild(document.createTextNode('您的瀏覽器不支援此影片格式。'));

        heroVideo.load();
    };

    window.playVideo = (elementId, videoUrl) => {
        const container = document.getElementById(elementId);
        if (!container) return;
        container.innerHTML = `<iframe class="absolute top-0 left-0 w-full h-full animate-fade-in" src="${videoUrl}?autoplay=1&rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    };

    // --- 7. Magazine Slider Logic (Swiper) ---
    let swiperInstance = null;

    // Helper: Shuffle Array
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };

    // Helper: Select Template based on photo count
    const getTemplate = (count) => {
        const templates = {
            1: ['layout-full', 'layout-center'],
            2: ['layout-split', 'layout-big-left', 'layout-big-right'],
            3: ['layout-mosaic-1', 'layout-strip'], // Add mosaic-2 if CSS exists
            4: ['layout-quad']
        };
        const options = templates[count];
        return options[Math.floor(Math.random() * options.length)];
    };

    window.openMagazine = () => {
        const modal = document.getElementById('magazine-modal');
        const wrapper = document.getElementById('magazine-wrapper');

        const data = window.globalPhotoData || {};
        const cityPhotos = data['城市光影'] || [];
        const earthPhotos = data['大地映像'] || [];
        let allPhotos = [...cityPhotos, ...earthPhotos];

        if (allPhotos.length === 0) { alert('No photos'); return; }

        // Fisher-Yates Shuffle
        allPhotos = shuffleArray(allPhotos);

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        wrapper.innerHTML = '';

        // Chunking with Unique Radius & Color Diversity
        let photoPool = [...allPhotos];

        while (photoPool.length > 0) {
            // Target Size: 1, 3, 4 (No 2)
            const r = Math.random();
            let targetSize = 1;
            if (r > 0.2) targetSize = 3;
            if (r > 0.6) targetSize = 4;

            if (photoPool.length < 3) targetSize = 1;
            else if (photoPool.length === 3) targetSize = 3;

            let slidePhotos = [];
            let slidePrefixes = new Set();
            let slideColors = [];

            // Attempt to fill slide from pool
            // Iterate pool and pick suitable candidates
            let i = 0;
            while (i < photoPool.length && slidePhotos.length < targetSize) {
                const p = photoPool[i];
                const prefix = p.filename.substring(0, 4);
                const color = p.color || [128, 128, 128];

                // 1. Prefix Check
                if (slidePrefixes.has(prefix)) {
                    i++;
                    continue;
                }

                // 2. Color Diversity Check
                let colorConflict = false;
                for (let c of slideColors) {
                    if (getColorDistance(c, color) < 50) { // Threshold 50
                        colorConflict = true;
                        break;
                    }
                }
                if (colorConflict && slidePhotos.length > 0) {
                    i++;
                    continue;
                }

                // Accepted
                slidePhotos.push(p);
                slidePrefixes.add(prefix);
                slideColors.push(color);

                // Remove from pool
                photoPool.splice(i, 1);
                // Reset i because we removed an item, so next item is at same index
                // But we want to preserve randomness? 
                // Actually, if we just pick the *first valid* in the shuffled pool, it preserves randomness of the pool.
                // So we don't increment i.
            }

            // If we have a slide (even if smaller than target), render it
            if (slidePhotos.length > 0) {
                const finalSize = slidePhotos.length;
                let templateClass = 'layout-full';
                if (finalSize === 4) templateClass = 'layout-quad';
                else if (finalSize === 3) templateClass = Math.random() > 0.5 ? 'layout-mosaic-1' : 'layout-mosaic-2';
                else if (finalSize === 2) templateClass = 'layout-split';

                let imagesHtml = '';
                slidePhotos.forEach(photo => {
                    const cat = cityPhotos.some(cp => cp.filename === photo.filename) ? '城市光影' : '大地映像';
                    const path = `./public/photos/${encodeURIComponent(cat)}/${encodeURIComponent(photo.filename)}`;
                    const title = getBaseLocationName(photo.filename);

                    imagesHtml += `
                        <div class="mag-img">
                            <img src="${path}" loading="lazy" alt="${title}">
                            <div class="mag-caption">
                                <div class="font-bold text-lg">${title}</div>
                                <div class="text-xs opacity-75 uppercase tracking-wider">${cat} | LCT Studio</div>
                            </div>
                        </div>
                    `;
                });

                const slideHtml = `
                    <div class="swiper-slide magazine-slide ${templateClass}">
                        <div class="mag-content">
                            ${imagesHtml}
                        </div>
                    </div>
                `;
                wrapper.insertAdjacentHTML('beforeend', slideHtml);
            } else {
                // If we iterated entire pool and couldn't find ANY fitting photo
                // This shouldn't happen unless pool is empty (handled by while loop)
                // or strict constraints. If strict constraints prevent any pick, force pick one?
                if (photoPool.length > 0) {
                    // Force pick first one to break deadlock
                    const p = photoPool.shift();
                    const cat = cityPhotos.some(cp => cp.filename === p.filename) ? '城市光影' : '大地映像';
                    const title = getBaseLocationName(p.filename);
                    const slideHtml = `
                        <div class="swiper-slide magazine-slide layout-full">
                            <div class="mag-content">
                                <div class="mag-img"><img src="./public/photos/${encodeURIComponent(cat)}/${encodeURIComponent(p.filename)}" alt="${title}"><div class="mag-caption"><div class="font-bold text-lg">${title}</div></div></div>
                            </div>
                        </div>`;
                    wrapper.insertAdjacentHTML('beforeend', slideHtml);
                }
            }
        }

        if (swiperInstance) {
            swiperInstance.destroy(true, true);
            swiperInstance = null;
        }

        swiperInstance = new Swiper('.magazine-container', {
            spaceBetween: 50, // Increased space
            effect: 'fade',
            fadeEffect: { crossFade: true },
            grabCursor: true,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            keyboard: { enabled: true },
        });
    };

    const closeMagazine = () => {
        const modal = document.getElementById('magazine-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');

        if (swiperInstance) {
            swiperInstance.destroy(true, true);
            swiperInstance = null;
        }
        document.getElementById('magazine-wrapper').innerHTML = ''; // Clean DOM
    };

    document.getElementById('close-magazine-btn').addEventListener('click', closeMagazine);
    document.getElementById('magazine-modal').addEventListener('click', (e) => {
        // Close if clicking outside the swiper container (on the black)
        if (e.target.id === 'magazine-modal') closeMagazine();
    });


    // --- 8. Event Listeners ---
    mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.toggle('hidden'); });
    mobileMenuLinks.forEach(link => { link.addEventListener('click', () => { mobileMenu.classList.add('hidden'); }); });
    window.addEventListener('scroll', () => { header.classList.toggle('header-scrolled', window.scrollY > 50); });

    // Lightbox Close
    photoModal.addEventListener('click', (e) => {
        if (e.target === photoModal || e.target === closeModalBtn) { closeLightbox(); }
    });
    // Already added ESC listener above for prev/next context

    // Flipbook Background Close
    // Flipbook Background Close (Legacy removed)


    // Initialize
    // fetchPhotoData(); // Deprecated
    setupPhotoGallery();
    setupVideoGallery();
    setupHeroVideo();

    // Initial Observe for static elements
    setTimeout(observeElements, 500); // Wait for initial render
});
