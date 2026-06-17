document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Global Variables & DOM Elements ---
    const header = document.getElementById('main-header');
    const photoModal = document.getElementById('photo-modal');
    const modalImage = document.getElementById('modal-image');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    const cssLengthToPx = (value, fallback = 0) => {
        const rawValue = `${value || ''}`.trim();
        const amount = parseFloat(rawValue);

        if (!Number.isFinite(amount)) return fallback;
        if (rawValue.endsWith('vw')) return window.innerWidth * amount / 100;
        if (rawValue.endsWith('vh')) return window.innerHeight * amount / 100;
        if (rawValue.endsWith('rem')) {
            const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            return amount * rootSize;
        }
        if (rawValue.endsWith('%')) return window.innerWidth * amount / 100;
        return amount;
    };

    // --- 3. Lightbox Logic ---



    const updateLightboxImage = () => {
        if (currentPhotoIndex < 0 || currentPhotoIndex >= currentCategoryPhotos.length) return;
        const photo = currentCategoryPhotos[currentPhotoIndex];
        const { category, filename } = photo;
        const title = getBaseLocationName(filename);
        const imagePath = `./public/photos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
        const captionEl = document.getElementById('modal-caption');

        // Fade out slightly
        modalImage.style.opacity = '0.5';
        if (captionEl) captionEl.style.opacity = '0';

        setTimeout(() => {
            modalImage.src = imagePath;
            modalImage.alt = title;
            if (captionEl) {
                captionEl.textContent = title;
                captionEl.style.opacity = '1';
            }
            modalImage.onload = () => {
                modalImage.style.opacity = '1';
            };
        }, 150);
    };

    const openModal = (category, filename) => {
        const title = getBaseLocationName(filename);
        modalImage.src = `./public/photos/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
        modalImage.alt = title;

        const captionEl = document.getElementById('modal-caption');
        if (captionEl) {
            captionEl.textContent = title;
            // Delay showing caption slightly for effect
            setTimeout(() => captionEl.style.opacity = '1', 200);
        }

        photoModal.classList.remove('hidden');
        photoModal.classList.add('flex'); // Ensure flex display

        // Find index
        currentPhotoIndex = currentCategoryPhotos.findIndex(p => p.filename === filename && p.category === category);
    };

    const closeLightbox = () => {
        photoModal.classList.add('hidden');
        photoModal.classList.remove('flex');
        modalImage.src = '';
        const captionEl = document.getElementById('modal-caption');
        if (captionEl) captionEl.style.opacity = '0';
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
    const MAP_JOURNEY_FILENAMES = [
        '新北淡水海尾子海灘 (1).jpg',
        '基隆望幽谷.jpg',
        '台北士林洲美橡皮壩.jpg',
        '桃園觀音工業區廠房.jpg',
        '新竹寶山小西湖.jpg',
        '宜蘭五結防潮閘門-2.jpg',
        '宜蘭冬山河旁景致.jpg',
        '花蓮清水斷崖.jpg',
        '花蓮和平火車站旁-2.jpg',
        '雲林西螺蝴蝶公園.jpg',
        '雲林斗六石榴火車站.jpg',
        '雲林北港女兒橋.jpg',
        '澎湖湖西菓葉觀日樓.jpg'
    ];
    const MAP_JOURNEY_FILENAME_SET = new Set(MAP_JOURNEY_FILENAMES);

    const flattenPhotos = (data = globalPhotoData) => {
        return Object.keys(data || {}).flatMap(category => {
            const photos = data[category] || [];
            return photos.map(photo => ({ ...photo, category }));
        });
    };

    const getPhotoSrc = (photo) => {
        return `./public/photos/${encodeURIComponent(photo.category)}/${encodeURIComponent(photo.filename)}`;
    };

    const getColorCss = (color, alpha = 1) => {
        const safeColor = Array.isArray(color) ? color : [200, 161, 90];
        return `rgba(${safeColor[0]}, ${safeColor[1]}, ${safeColor[2]}, ${alpha})`;
    };

    const formatCoord = (value) => {
        return Number.isFinite(value) ? value.toFixed(5) : '--';
    };

    // Color Distance Calculation (Euclidean)
    const getColorDistance = (color1, color2) => {
        if (!color1 || !color2) return 1000;
        return Math.sqrt(
            Math.pow(color1[0] - color2[0], 2) +
            Math.pow(color1[1] - color2[1], 2) +
            Math.pow(color1[2] - color2[2], 2)
        );
    };

    // --- Helper: Color Similarity ---
    const areColorsSimilar = (c1, c2, threshold = 100) => {
        if (!c1 || !c2 || c1.length < 3 || c2.length < 3) return false;
        // Euclidean distance in RGB space
        const dist = Math.sqrt(
            Math.pow(c1[0] - c2[0], 2) +
            Math.pow(c1[1] - c2[1], 2) +
            Math.pow(c1[2] - c2[2], 2)
        );
        return dist < threshold;
    };

    // --- Helper: Select Diverse Photos (Prefix + Color) ---
    const selectDiversePhotos = (pool, count) => {
        let candidates = [...pool]; // Copy
        candidates.sort(() => 0.5 - Math.random()); // Shuffle

        const selected = [];

        // Pass 1: Strict (Unique Prefix + Diverse Color)
        for (let i = 0; i < candidates.length && selected.length < count; i++) {
            const p = candidates[i];
            const prefix = p.filename.substring(0, 4);

            const isLocationConflict = selected.some(s => s.filename.substring(0, 4) === prefix);
            const isColorConflict = selected.some(s => areColorsSimilar(s.color, p.color, 120)); // Threshold 120

            if (!isLocationConflict && !isColorConflict) {
                selected.push(p);
            }
        }

        // Pass 2: Relax Color (Unique Prefix only)
        if (selected.length < count) {
            const usedFilenames = new Set(selected.map(s => s.filename));
            for (let i = 0; i < candidates.length && selected.length < count; i++) {
                const p = candidates[i];
                if (usedFilenames.has(p.filename)) continue;

                const prefix = p.filename.substring(0, 4);
                const isLocationConflict = selected.some(s => s.filename.substring(0, 4) === prefix);

                if (!isLocationConflict) {
                    selected.push(p);
                    usedFilenames.add(p.filename);
                }
            }
        }

        // Pass 3: Fill if needed (Any unique file)
        if (selected.length < count) {
            const usedFilenames = new Set(selected.map(s => s.filename));
            for (let i = 0; i < candidates.length && selected.length < count; i++) {
                const p = candidates[i];
                if (!usedFilenames.has(p.filename)) {
                    selected.push(p);
                    usedFilenames.add(p.filename);
                }
            }
        }

        return selected;
    };

    let mapJourneyInitialized = false;

    const setupMapJourney = () => {
        const mapWrap = document.getElementById('map-canvas-wrap');
        const pinsWrap = document.getElementById('map-pins');
        const strip = document.getElementById('journey-strip');
        const routeLine = document.getElementById('map-route-line');
        const routeProgress = document.getElementById('map-route-progress');
        const previewImg = document.getElementById('map-preview-img');
        const previewTitle = document.getElementById('map-preview-title');
        const previewCategory = document.getElementById('map-preview-category');
        const previewLat = document.getElementById('map-preview-lat');
        const previewLng = document.getElementById('map-preview-lng');
        const previewAlt = document.getElementById('map-preview-alt');
        const activeCoords = document.getElementById('map-active-coords');
        const stopCount = document.getElementById('map-stop-count');

        if (!mapWrap || !pinsWrap || !strip || !routeLine || !routeProgress || !previewImg) return;

        const allPhotos = flattenPhotos(globalPhotoData);
        const journeyPhotos = MAP_JOURNEY_FILENAMES
            .map(filename => allPhotos.find(photo => photo.filename === filename && photo.gps))
            .filter(Boolean);

        if (!journeyPhotos.length) return;

        mapJourneyInitialized = true;
        stopCount.textContent = `${journeyPhotos.length} STOPS`;

        const lats = journeyPhotos.map(photo => photo.gps.lat);
        const lngs = journeyPhotos.map(photo => photo.gps.lng);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const lngRange = maxLng - minLng || 1;
        const latRange = maxLat - minLat || 1;

        const toPoint = (photo) => {
            const x = 13 + ((photo.gps.lng - minLng) / lngRange) * 74;
            const y = 10 + ((maxLat - photo.gps.lat) / latRange) * 120;
            return { x, y };
        };

        const points = journeyPhotos.map(toPoint);
        const routeD = points.map((point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        }).join(' ');

        routeLine.setAttribute('d', routeD);
        routeProgress.setAttribute('d', routeD);
        pinsWrap.innerHTML = '';
        strip.innerHTML = '';

        const setActiveStop = (index) => {
            const photo = journeyPhotos[index];
            if (!photo) return;

            previewImg.style.opacity = '0.55';
            setTimeout(() => {
                previewImg.src = getPhotoSrc(photo);
                previewImg.alt = getBaseLocationName(photo.filename);
                previewImg.style.opacity = '1';
            }, 80);

            previewTitle.textContent = getBaseLocationName(photo.filename);
            previewCategory.textContent = `${photo.category} / STOP ${String(index + 1).padStart(2, '0')}`;
            previewLat.textContent = formatCoord(photo.gps.lat);
            previewLng.textContent = formatCoord(photo.gps.lng);
            previewAlt.textContent = Number.isFinite(photo.gps.alt) ? `${Math.round(photo.gps.alt)} m` : '--';
            activeCoords.textContent = `${formatCoord(photo.gps.lat)}, ${formatCoord(photo.gps.lng)}`;

            const progressLength = routeProgress.getTotalLength ? routeProgress.getTotalLength() : 0;
            if (progressLength) {
                const ratio = journeyPhotos.length > 1 ? index / (journeyPhotos.length - 1) : 1;
                routeProgress.style.strokeDasharray = progressLength;
                routeProgress.style.strokeDashoffset = progressLength * (1 - ratio);
            }

            pinsWrap.querySelectorAll('.map-pin').forEach((pin, pinIndex) => {
                pin.classList.toggle('is-active', pinIndex === index);
            });
            strip.querySelectorAll('.journey-thumb').forEach((thumb, thumbIndex) => {
                thumb.classList.toggle('is-active', thumbIndex === index);
            });
        };

        journeyPhotos.forEach((photo, index) => {
            const point = points[index];
            const pin = document.createElement('button');
            pin.type = 'button';
            pin.className = 'map-pin';
            pin.style.left = `${point.x}%`;
            pin.style.top = `${(point.y / 140) * 100}%`;
            pin.style.setProperty('--pin-color', getColorCss(photo.color, 1));
            pin.setAttribute('aria-label', `查看 ${getBaseLocationName(photo.filename)}`);
            pin.addEventListener('click', () => setActiveStop(index));
            pinsWrap.appendChild(pin);

            const thumb = document.createElement('button');
            thumb.type = 'button';
            thumb.className = 'journey-thumb';
            thumb.innerHTML = `
                <img src="${getPhotoSrc(photo)}" alt="${getBaseLocationName(photo.filename)}" loading="lazy">
                <span>${String(index + 1).padStart(2, '0')}</span>
            `;
            thumb.addEventListener('click', () => setActiveStop(index));
            strip.appendChild(thumb);
        });

        setActiveStop(0);
    };

    const renderGallery = (categoryName) => {
        const galleryContainer = document.getElementById(`gallery-${categoryName}`);
        if (!galleryContainer) return;

        let photoList = window.globalPhotoData ? window.globalPhotoData[categoryName] : [];
        if (!photoList || photoList.length === 0) {
            galleryContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">載入中...</p>`;
            return;
        }

        // Select 6 Diverse Photos
        const photosToDisplay = selectDiversePhotos(photoList, 6);

        // Render
        galleryContainer.innerHTML = '';
        if (photosToDisplay.length === 0) {
            galleryContainer.innerHTML = `<p class="text-center text-gray-400 col-span-full">此分類暫無照片。</p>`;
        } else {
            photosToDisplay.forEach((photo, index) => {
                const title = getBaseLocationName(photo.filename);
                const imagePath = `./public/photos/${encodeURIComponent(categoryName)}/${encodeURIComponent(photo.filename)}`;
                const cardHtml = `
                    <div class="relative w-full h-80 rounded-xl overflow-hidden shadow-2xl photo-card transition-transform transform hover:scale-105 cursor-pointer" 
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

        // Setup click events
        galleryContainer.querySelectorAll('.photo-card').forEach(card => {
            card.addEventListener('click', () => {
                currentCategoryPhotos = photosToDisplay.map(p => ({ ...p, category: categoryName }));
                openModal(card.dataset.category, card.dataset.filename);
            });
        });
    };

    const updateGalleries = (allPhotosData) => {
        globalPhotoData = allPhotosData;
        const categories = ["城市光影", "大地映像"];
        categories.forEach(category => {
            renderGallery(category);
        });
        setupMapJourney();

    };

    const fetchPhotoData = async () => {
        if (window.globalPhotoData) {
            console.log('Using pre-loaded photo data from data_photos.js');
            updateGalleries(window.globalPhotoData);
            return;
        }

        try {
            console.warn('window.globalPhotoData not found, attempting to fetch photos.json...');
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

    const refreshScrollCinematics = () => {
        if (window.ScrollTrigger && !prefersReducedMotion) {
            window.ScrollTrigger.refresh();
        }
    };

    const setupScrollCinematics = () => {
        if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
            document.documentElement.classList.add('reduced-motion');
            return;
        }

        if (window.MotionPathPlugin) {
            gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
        } else {
            gsap.registerPlugin(ScrollTrigger);
        }

        const hero = document.getElementById('hero');
        const heroVideo = document.getElementById('hero-video');
        const heroContent = document.querySelector('.hero-content');
        const heroOverlay = document.querySelector('.hero-overlay');

        if (hero && heroVideo && heroContent) {
            gsap.set(heroContent, { opacity: 1, yPercent: 0 });
            gsap.timeline({
                scrollTrigger: {
                    trigger: hero,
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 0.8,
                    onLeaveBack: () => {
                        gsap.set(heroContent, { opacity: 1, yPercent: 0 });
                    }
                }
            })
                .to(heroVideo, { scale: 1.16, yPercent: 7, filter: 'saturate(0.78) contrast(1.18)', ease: 'none' }, 0)
                .to(heroContent, { yPercent: 32, opacity: 0, ease: 'none' }, 0)
                .to(heroOverlay, { opacity: 1, ease: 'none' }, 0);
        }

        const story = document.querySelector('.scroll-story');
        const storyPin = document.querySelector('.story-pin');
        const storyPanels = gsap.utils.toArray('.story-panel');

        if (story && storyPin && storyPanels.length > 1) {
            const storyRail = document.querySelector('.story-rail');
            gsap.set(storyPanels.slice(1), { y: 56, opacity: 0 });
            gsap.set('.story-sun', { transformOrigin: '50% 50%' });
            const phaseLabels = gsap.utils.toArray('.story-flight-meta span');
            const storyPhotos = gsap.utils.toArray('.story-photo-panel');
            gsap.set(phaseLabels, {
                opacity: 0.34,
                color: 'rgba(237, 242, 244, 0.72)',
                backgroundColor: 'rgba(7, 10, 15, 0.22)',
                borderColor: 'rgba(229, 231, 235, 0.12)'
            });
            gsap.set(storyPhotos, { opacity: 0, scale: 1.025 });

            const storyTimeline = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    trigger: story,
                    start: 'top top',
                    end: 'bottom bottom',
                    scrub: 0.8,
                    pin: storyPin,
                    anticipatePin: 1,
                    invalidateOnRefresh: true
                }
            });

            storyTimeline
                .to(storyRail, {
                    x: () => {
                        const sunsetWord = storyRail?.lastElementChild;
                        if (!storyRail || !sunsetWord) return 0;
                        const railStyle = getComputedStyle(storyRail);
                        const endX = cssLengthToPx(railStyle.getPropertyValue('--story-rail-end-x'), window.innerWidth * 0.06);
                        return endX - sunsetWord.offsetLeft;
                    },
                    duration: 0.82
                }, 0)
                .to('.story-route-progress', { strokeDashoffset: 0, duration: 0.82 }, 0)
                .to('.story-sun', window.MotionPathPlugin ? {
                    motionPath: {
                        path: '.story-route-progress',
                        align: '.story-route-progress',
                        alignOrigin: [0.5, 0.5],
                        start: 0,
                        end: 1
                    },
                    duration: 0.82
                } : { x: '38vw', y: '0vh', duration: 0.82 }, 0)
                .to('.story-sun', { scale: 1.16, duration: 0.42, ease: 'sine.inOut' }, 0.18)
                .to('.story-sun', { scale: 0.98, duration: 0.4, ease: 'sine.inOut' }, 0.6)
                .to('.story-orbit', { scale: 1.04, duration: 0.82 }, 0)
                .to('.story-photo-sunrise', { opacity: 0.62, scale: 1, duration: 0.16, ease: 'power2.out' }, 0)
                .to('.story-photo-sunrise', { opacity: 0, scale: 1.015, duration: 0.14, ease: 'power2.in' }, 0.2)
                .to(phaseLabels[0], { opacity: 1, color: '#fff0bf', backgroundColor: 'rgba(241, 188, 94, 0.18)', borderColor: 'rgba(241, 188, 94, 0.48)', duration: 0.1 }, 0)
                .to(phaseLabels[0], { opacity: 0.34, color: 'rgba(237, 242, 244, 0.72)', backgroundColor: 'rgba(7, 10, 15, 0.22)', borderColor: 'rgba(229, 231, 235, 0.12)', duration: 0.1 }, 0.2)
                .to('.story-photo-morning', { opacity: 0.62, scale: 1, duration: 0.16, ease: 'power2.out' }, 0.23)
                .to('.story-photo-morning', { opacity: 0, scale: 1.015, duration: 0.14, ease: 'power2.in' }, 0.43)
                .to(phaseLabels[1], { opacity: 1, color: '#fff0bf', backgroundColor: 'rgba(241, 188, 94, 0.18)', borderColor: 'rgba(241, 188, 94, 0.48)', duration: 0.1 }, 0.23)
                .to(phaseLabels[1], { opacity: 0.34, color: 'rgba(237, 242, 244, 0.72)', backgroundColor: 'rgba(7, 10, 15, 0.22)', borderColor: 'rgba(229, 231, 235, 0.12)', duration: 0.1 }, 0.43)
                .to('.story-photo-golden', { opacity: 0.62, scale: 1, duration: 0.16, ease: 'power2.out' }, 0.46)
                .to('.story-photo-golden', { opacity: 0, scale: 1.015, duration: 0.14, ease: 'power2.in' }, 0.7)
                .to(phaseLabels[2], { opacity: 1, color: '#fff0bf', backgroundColor: 'rgba(241, 188, 94, 0.18)', borderColor: 'rgba(241, 188, 94, 0.48)', duration: 0.1 }, 0.46)
                .to(phaseLabels[2], { opacity: 0.34, color: 'rgba(237, 242, 244, 0.72)', backgroundColor: 'rgba(7, 10, 15, 0.22)', borderColor: 'rgba(229, 231, 235, 0.12)', duration: 0.1 }, 0.7)
                .to(phaseLabels[3], { opacity: 1, color: '#fff0bf', backgroundColor: 'rgba(241, 188, 94, 0.18)', borderColor: 'rgba(241, 188, 94, 0.48)', duration: 0.1 }, 0.74)
                .to('.story-photo-sunset', { opacity: 0.72, scale: 1, duration: 0.18, ease: 'power2.out' }, 0.72)
                .to(storyPanels[0], { y: -58, opacity: 0, duration: 0.18 }, 0.16)
                .to(storyPanels[1], { y: 0, opacity: 1, duration: 0.18 }, 0.24)
                .to(storyPanels[1], { y: -58, opacity: 0, duration: 0.18 }, 0.42)
                .to(storyPanels[2], { y: 0, opacity: 1, duration: 0.18 }, 0.5)
                .to(storyPanels[2], { y: -58, opacity: 0, duration: 0.18 }, 0.68)
                .to(storyPanels[3], { y: 0, opacity: 1, duration: 0.18 }, 0.76)
                .to({}, { duration: 0.18 }, 0.82);
        }

        gsap.utils.toArray('.section-intro:not(.video-intro)').forEach((section) => {
            gsap.from(section, {
                y: 48,
                opacity: 0,
                duration: 1.1,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: section,
                    start: 'top 78%',
                    once: true
                }
            });
        });

        gsap.utils.toArray('.service-card').forEach((card, index) => {
            gsap.from(card, {
                y: 48,
                opacity: 0,
                duration: 0.9,
                delay: index * 0.08,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: card,
                    start: 'top 84%',
                    once: true
                }
            });
        });

        const videoPlayer = document.getElementById('main-video-player');
        if (videoPlayer) {
            gsap.from(videoPlayer, {
                scale: 0.94,
                opacity: 0.35,
                duration: 1,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: videoPlayer,
                    start: 'top 82%',
                    once: true
                }
            });
        }
    };

    // --- 6. Videos ---
    const setupVideoSection = () => {
        const mainPlayerContainer = document.getElementById('main-video-player');
        const mainTitle = document.getElementById('main-video-title');
        const playlistContainer = document.getElementById('video-playlist');

        if (!mainPlayerContainer || !playlistContainer) return;

        const finalVideos = [];

        if (window.videoData && window.videoData.categories) {
            // 1. 預設放入所有 showcase 類別的影片
            if (window.videoData.categories.showcase) {
                finalVideos.push(...window.videoData.categories.showcase);
            }

            // 2. 其他類別個別隨機挑選一部影片
            Object.keys(window.videoData.categories).forEach(catName => {
                if (catName !== 'showcase') {
                    const catVideos = window.videoData.categories[catName];
                    if (catVideos && catVideos.length > 0) {
                        const randomVideo = catVideos[Math.floor(Math.random() * catVideos.length)];
                        finalVideos.push(randomVideo);
                    }
                }
            });
        }

        // Helper to extract ID
        const getVideoId = (url) => {
            if (!url) return '';
            const parts = url.split('/');
            return parts[parts.length - 1].split('?')[0];
        };

        // Function to play video in main player
        window.playVideoManual = (url, title) => {
            if (!mainPlayerContainer) return;
            mainPlayerContainer.innerHTML = `<iframe class="absolute top-0 left-0 w-full h-full animate-fade-in" src="${url}?autoplay=1&rel=0" title="${title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
            if (mainTitle) mainTitle.textContent = title;
        };

        // Initial Setup (Display First Video in Main Player)
        if (finalVideos.length > 0) {
            const firstVideo = finalVideos[0];
            const videoId = getVideoId(firstVideo.url);

            // Render thumbnail with play button for first video
            mainPlayerContainer.innerHTML = `
                <img src="https://img.youtube.com/vi/${videoId}/maxresdefault.jpg" class="absolute inset-0 w-full h-full object-cover">
                <div class="absolute inset-0 flex items-center justify-center group cursor-pointer" onclick="window.playVideoManual('${firstVideo.url}', '${firstVideo.title}')">
                    <div class="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/50 group-hover:scale-110 group-hover:bg-red-600 transition-all duration-300 shadow-lg">
                        <svg class="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;
            if (mainTitle) mainTitle.textContent = firstVideo.title;
        }

        // Render Playlist (All 3 videos)
        playlistContainer.innerHTML = '';
        finalVideos.forEach(video => {
            const videoId = getVideoId(video.url);
            const card = document.createElement('div');
            card.className = "relative w-full pb-[56.25%] rounded-xl overflow-hidden shadow-lg bg-gray-900 group cursor-pointer border border-gray-800 transition-transform transform hover:scale-105";
            card.innerHTML = `
                <img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="${video.title}" class="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-all"></div>
                <div class="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/90 to-transparent">
                    <p class="text-white text-sm font-medium truncate">${video.title}</p>
                </div>
                <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <svg class="w-12 h-12 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
             `;
            card.onclick = () => {
                window.playVideoManual(video.url, video.title);
                window.scrollTo({
                    top: mainPlayerContainer.getBoundingClientRect().top + window.scrollY - 100, // Offset for header
                    behavior: 'smooth'
                });
            };
            playlistContainer.appendChild(card);
        });
    };

    const setupHeroVideo = () => {
        const heroVideo = document.getElementById('hero-video');
        if (!heroVideo) return;

        // Currently only video 4 exists in the folder
        const baseFilename = `your-hero-video4`;

        // Set Poster (First frame or image)
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

        // Load and attempt play
        heroVideo.load();
        const playPromise = heroVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Auto-play was prevented by the browser", error);
            });
        }
    };

    // --- 7. Magazine Mode (Online Art Album/Gallery) ---
    window.openMagazine = () => {
        const magazineModal = document.getElementById('magazine-modal');
        const magazineWrapper = document.getElementById('magazine-wrapper');

        if (!magazineModal || !magazineWrapper) return;

        // Detect Mobile (Threshold 768px matches Tailwind 'md')
        const isMobile = window.innerWidth < 768;

        // 1. Flatten all photos
        let photoPool = [];
        if (window.globalPhotoData) {
            Object.keys(window.globalPhotoData).forEach(category => {
                const photos = window.globalPhotoData[category].map(p => ({ ...p, category }));
                photoPool = photoPool.concat(photos);
            });
        }

        // 2. Random shuffle
        photoPool.sort(() => 0.5 - Math.random());

        // 3. Generate Slides
        magazineWrapper.innerHTML = '';

        // Helper for Image HTML (Shared)
        const getImg = (p, className = "") => {
            const title = p.filename.replace(/[-_(\（].*|\.\w+$/g, '').trim();
            const src = `./public/photos/${encodeURIComponent(p.category)}/${encodeURIComponent(p.filename)}`;
            return `
                <div class="relative group w-full h-full overflow-hidden rounded-lg shadow-md transition-transform duration-500 hover:-translate-y-1 hover:shadow-xl bg-gray-50 min-h-0">
                    <img src="${src}" alt="${title}" loading="lazy" class="w-full h-full ${className}">
                    <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                         <p class="text-white text-xs md:text-sm font-medium tracking-widest text-shadow truncate">${title}</p>
                    </div>
                </div>`;
        };

        // --- Cover Slide Generator ---
        const generateCoverSlide = (pool) => {
            const earthPhotos = pool.filter(p => p.category === "大地映像");
            const coverPhoto = earthPhotos.length > 0
                ? earthPhotos[Math.floor(Math.random() * earthPhotos.length)]
                : pool[Math.floor(Math.random() * pool.length)];

            if (!coverPhoto) return;

            const src = `./public/photos/${encodeURIComponent(coverPhoto.category)}/${encodeURIComponent(coverPhoto.filename)}`;
            const year = new Date().getFullYear();
            const slide = document.createElement('div');

            // Container Config based on Device
            // Desktop: A3 Landscape (420/297)
            // Mobile: A4 Portrait (297/420)
            const aspectRatio = isMobile ? '297/420' : '420/297';
            // Mobile Cover: More padding for vertical look? Or keep it clean.
            // Let's use a vertical flex layout for mobile.

            slide.className = 'swiper-slide flex items-center justify-center p-1 md:p-8 box-border';

            let coverInnerHtml = '';

            if (isMobile) {
                // --- Mobile Portrait Cover ---
                coverInnerHtml = `
                <div class="relative bg-white shadow-2xl mx-auto flex flex-col overflow-hidden" 
                     style="aspect-ratio: ${aspectRatio}; height: auto; width: auto; max-width: 95vw; max-height: 75vh;">
                   
                   <!-- Border/Frame -->
                   <div class="absolute inset-4 border border-black/80 pointer-events-none z-20"></div>

                   <!-- Top: Year & Title -->
                   <div class="p-6 z-10 text-center">
                        <h2 class="text-3xl font-light tracking-wide text-black font-serif mb-2">${year}</h2>
                        <h1 class="text-5xl font-bold tracking-tighter leading-none text-black font-sans">PORT-<br>FOLIO</h1>
                   </div>

                   <!-- Middle: Photo -->
                   <div class="flex-1 relative mx-6 mb-6 overflow-hidden grayscale contrast-125 min-h-0">
                        <img src="${src}" class="w-full h-full object-cover object-center" alt="Cover Photo">
                   </div>

                   <!-- Bottom: Studio Name -->
                   <div class="mb-8 text-center z-10">
                        <p class="text-sm font-bold tracking-[0.3em] uppercase text-gray-800">LCT STUDIO</p>
                   </div>
                </div>`;
            } else {
                // --- Desktop Landscape Cover (Original) ---
                coverInnerHtml = `
                <div class="relative bg-white shadow-2xl mx-auto flex flex-col overflow-hidden" 
                     style="aspect-ratio: ${aspectRatio}; height: auto; width: auto; max-width: 95vw; max-height: 70vh;">
                   
                   <div class="absolute inset-4 sm:inset-8 border border-black/80 pointer-events-none z-20"></div>

                   <div class="p-8 z-10">
                        <div class="flex justify-between items-start">
                            <div>
                                <h1 class="text-7xl font-bold tracking-tighter leading-none text-black font-sans">PORT-<br>FOLIO</h1>
                            </div>
                            <div class="text-right">
                                <h2 class="text-5xl font-light tracking-wide text-black font-serif">${year}</h2>
                            </div>
                        </div>
                   </div>

                   <div class="flex-1 relative mt-4 mx-12 mb-24 overflow-hidden grayscale contrast-125 min-h-0">
                        <img src="${src}" class="w-full h-full object-cover object-center" alt="Cover Photo">
                   </div>

                   <div class="absolute bottom-12 left-0 w-full text-center z-10">
                        <p class="text-sm font-bold tracking-[0.3em] uppercase text-gray-800">LCT STUDIO</p>
                   </div>
                   <div class="absolute top-1/2 left-4 transform -translate-y-1/2 -rotate-90 origin-left">
                        <p class="text-xs font-medium tracking-widest text-gray-500">AERIAL PHOTOGRAPHY COLLECTION</p>
                   </div>
                </div>`;
            }

            slide.innerHTML = coverInnerHtml;
            magazineWrapper.appendChild(slide);
        };

        generateCoverSlide(photoPool);

        // --- Content Slides Generator ---
        while (photoPool.length > 0) {
            let targetCount = 1;
            let finalLayout = 1;

            if (isMobile) {
                // --- Mobile: Always 2 photos, Vertical Split ---
                targetCount = 2;
                finalLayout = 'mobile-vertical';
            } else {
                // --- Desktop: Random 1-5 ---
                const layoutType = Math.floor(Math.random() * 5) + 1;
                if (layoutType === 2) targetCount = 2;
                if (layoutType === 3 || layoutType === 5) targetCount = 3;
                if (layoutType === 4) targetCount = 4;
                finalLayout = layoutType;
            }

            // Select photos
            const batch = [];
            if (photoPool.length > 0) batch.push(photoPool.shift());

            let i = 0;
            while (batch.length < targetCount && i < photoPool.length) {
                const p = photoPool[i];
                const prefix = p.filename.substring(0, 4);
                const isLocationConflict = batch.some(b => b.filename.substring(0, 4) === prefix);
                const isColorConflict = batch.some(b => areColorsSimilar(b.color, p.color, 100));

                if (!isLocationConflict && !isColorConflict) {
                    batch.push(p);
                    photoPool.splice(i, 1);
                } else {
                    i++;
                }
            }
            // Relaxed fill
            if (batch.length < targetCount) {
                let j = 0;
                while (batch.length < targetCount && j < photoPool.length) {
                    const p = photoPool[j];
                    const prefix = p.filename.substring(0, 4);
                    const isLocationConflict = batch.some(b => b.filename.substring(0, 4) === prefix);
                    if (!isLocationConflict) {
                        batch.push(p);
                        photoPool.splice(j, 1);
                    } else {
                        j++;
                    }
                }
            }

            // Adjust layout if batch is smaller than target (end of pool)
            if (!isMobile) {
                const count = batch.length;
                if (count === 1) finalLayout = 1;
                else if (count === 2) finalLayout = 2;
                else if (count === 3 && (finalLayout !== 3 && finalLayout !== 5)) finalLayout = 3;
                else if (count === 4) finalLayout = 4;
            }

            const slide = document.createElement('div');
            // Unified Padding for Consistency
            slide.className = 'swiper-slide flex items-center justify-center p-1 md:p-8 box-border';

            const aspectRatio = isMobile ? '297/420' : '420/297';
            // Mobile can go a bit taller, say 75vh, desktop safely 70vh
            const maxHeight = isMobile ? '75vh' : '70vh';

            const containerHtmlStart = `
                <div class="relative bg-white shadow-2xl p-4 md:p-10 mx-auto flex items-center justify-center overflow-hidden"
            style="aspect-ratio: ${aspectRatio}; height: auto; width: auto; max-width: 95vw; max-height: ${maxHeight};">
                <div class="w-full h-full flex items-center justify-center">
                    `;
            const containerHtmlEnd = `
                </div>
                </div>`;

            let innerHtml = '';

            if (isMobile) {
                // Mobile Vertical Layout (2 Photos Stacked)
                // If only 1 photo remains at end of pool, show full.
                if (batch.length === 1) {
                    innerHtml = `<div class="w-full h-full min-h-0">${getImg(batch[0], "object-cover")}</div>`;
                } else {
                    // Flex Col Center with Explicit Height Control (43% per photo)
                    // Total photo height = 86%. Remaining 14% is whitespace.
                    // justify-center keeps them in the middle.
                    innerHtml = `
                        <div class="flex flex-col justify-center items-center gap-4 w-full h-full min-h-0">
                            <div class="w-full h-[43%] min-h-0 relative shadow-sm">${getImg(batch[0], "object-cover")}</div>
                            <div class="w-full h-[43%] min-h-0 relative shadow-sm">${getImg(batch[1], "object-cover")}</div>
                        </div>
                     `;
                }
            } else {
                // Desktop Layouts
                if (finalLayout === 1) {
                    innerHtml = `<div class="w-full h-full min-h-0">${getImg(batch[0], "object-cover shadow-sm")}</div>`;
                } else if (finalLayout === 2) {
                    innerHtml = `
                        <div class="grid grid-cols-2 gap-4 w-full h-full min-h-0">
                            ${getImg(batch[0], "object-cover")}
                            ${getImg(batch[1], "object-cover")}
                        </div>`;
                } else if (finalLayout === 3) {
                    innerHtml = `
                        <div class="grid grid-cols-2 gap-4 w-full h-full min-h-0">
                            <div class="h-full min-h-0">${getImg(batch[0], "object-cover")}</div>
                            <div class="flex flex-col gap-4 h-full min-h-0">
                                <div class="flex-1 min-h-0">${getImg(batch[1], "object-cover")}</div>
                                <div class="flex-1 min-h-0">${getImg(batch[2], "object-cover")}</div>
                            </div>
                        </div>`;
                } else if (finalLayout === 4) {
                    innerHtml = `
                        <div class="grid grid-cols-2 grid-rows-2 gap-4 w-full h-full min-h-0">
                            ${batch.map(p => getImg(p, "object-cover")).join('')}
                        </div>`;
                } else if (finalLayout === 5) {
                    innerHtml = `
                        <div class="grid grid-cols-2 gap-4 w-full h-full min-h-0">
                            <div class="flex flex-col gap-4 h-full order-2 md:order-1 min-h-0">
                                <div class="flex-1 min-h-0">${getImg(batch[1], "object-cover")}</div>
                                <div class="flex-1 min-h-0">${getImg(batch[2], "object-cover")}</div>
                            </div>
                            <div class="h-full order-1 md:order-2 min-h-0">${getImg(batch[0], "object-cover")}</div>
                        </div>`;
                }
            }

            slide.innerHTML = containerHtmlStart + innerHtml + containerHtmlEnd;
            magazineWrapper.appendChild(slide);
        }

        // Theme: Switch Modal to Light Mode
        magazineModal.classList.remove('bg-black/95');
        magazineModal.classList.add('bg-[#F9F9F9]');

        // Change Close Button Color
        const closeBtn = document.getElementById('close-magazine-btn');
        if (closeBtn) {
            closeBtn.classList.remove('text-gray-400', 'hover:text-white');
            closeBtn.classList.add('text-gray-600', 'hover:text-black');
        }

        // Show Modal
        magazineModal.classList.remove('hidden');
        magazineModal.classList.add('flex');

        if (window.gsap && !prefersReducedMotion) {
            gsap.fromTo(magazineModal,
                { opacity: 0 },
                { opacity: 1, duration: 0.35, ease: 'power2.out' }
            );
            gsap.fromTo('.magazine-container',
                { y: 28, scale: 0.96 },
                { y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }
            );
        }

        // Initialize Swiper
        if (window.magazineSwiper) {
            window.magazineSwiper.destroy(true, true);
        }

        window.magazineSwiper = new Swiper('.magazine-container', {
            slidesPerView: 1,
            spaceBetween: 40,
            keyboard: { enabled: true },
            observer: true,
            observeParents: true,
            resizeObserver: true,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            effect: 'fade',
            fadeEffect: { crossFade: true },
            speed: 600,
        });
    };

    // --- 8. Aerial Immersive 3D Gallery ---
    const immersiveState = {
        initialized: false,
        modal: null,
        stage: null,
        caption: null,
        scene: null,
        camera: null,
        renderer: null,
        group: null,
        raycaster: null,
        pointer: null,
        cards: [],
        textures: [],
        frameGeometry: null,
        photoGeometry: null,
        animationId: null,
        mode: 'wall',
        focused: null,
        isDragging: false,
        dragMoved: false,
        lastX: 0,
        lastY: 0,
        targetRotX: 0,
        targetRotY: 0,
        currentRotX: 0,
        currentRotY: 0,
        targetCameraZ: 8.8
    };

    const selectImmersivePhotos = (count = 18) => {
        const seeds = [
            '台中漢神洲際百貨.jpg',
            '新北林口藝樹家 (4).jpg',
            '基隆外木山漁港.jpg',
            '桃園玉山公園.jpg'
        ];
        const pool = flattenPhotos(globalPhotoData)
            .filter(photo => !MAP_JOURNEY_FILENAME_SET.has(photo.filename));
        const selected = [];

        seeds.forEach(filename => {
            const seed = pool.find(photo => photo.filename === filename);
            if (seed && !selected.some(photo => photo.filename === seed.filename)) {
                selected.push(seed);
            }
        });

        const scorePhoto = (photo) => {
            const prefix = photo.filename.substring(0, 4);
            if (selected.some(item => item.filename === photo.filename)) return -Infinity;
            if (selected.some(item => item.filename.substring(0, 4) === prefix)) return -900;

            const lightness = photo.color ? (Math.max(...photo.color) + Math.min(...photo.color)) / 2 : 80;
            const colorDistance = selected.length
                ? Math.min(...selected.map(item => getColorDistance(item.color, photo.color)))
                : 160;
            const categoryCount = selected.filter(item => item.category === photo.category).length;
            const categoryBalance = categoryCount > selected.length / 2 ? -30 : 12;
            const darkPenalty = lightness < 8 ? -70 : 0;
            const gpsBonus = photo.gps ? 8 : 0;

            return colorDistance + categoryBalance + darkPenalty + gpsBonus;
        };

        while (selected.length < count && selected.length < pool.length) {
            let bestPhoto = null;
            let bestScore = -Infinity;

            pool.forEach(photo => {
                const score = scorePhoto(photo);
                if (score > bestScore) {
                    bestScore = score;
                    bestPhoto = photo;
                }
            });

            if (!bestPhoto) break;
            selected.push(bestPhoto);
        }

        return selected.slice(0, count);
    };

    const setImmersiveModeButtons = (mode) => {
        document.querySelectorAll('[data-gallery-mode]').forEach(button => {
            button.classList.toggle('is-active', button.dataset.galleryMode === mode);
        });
    };

    const setCardTarget = (card, target) => {
        card.userData.targetPosition.copy(target.position);
        card.userData.targetRotation.copy(target.rotation);
        card.userData.targetScale = target.scale;
    };

    const layoutImmersiveCards = (mode) => {
        immersiveState.mode = mode;
        immersiveState.focused = null;
        immersiveState.caption.textContent = mode === 'scatter'
            ? 'SCATTER MODE / 拖曳視角探索照片'
            : 'CURATED WALL / 點選照片聚焦成果';
        setImmersiveModeButtons(mode);

        immersiveState.cards.forEach(card => {
            setCardTarget(card, card.userData.layouts[mode]);
        });
    };

    const focusImmersiveCard = (card) => {
        if (immersiveState.focused === card) {
            layoutImmersiveCards(immersiveState.mode);
            return;
        }

        immersiveState.focused = card;
        immersiveState.caption.textContent = `${getBaseLocationName(card.userData.photo.filename)} / ${card.userData.photo.category}`;

        immersiveState.cards.forEach(item => {
            if (item === card) {
                setCardTarget(item, {
                    position: new THREE.Vector3(0, 0, 2.1),
                    rotation: new THREE.Euler(0, 0, 0),
                    scale: 1.55
                });
            } else {
                const base = item.userData.layouts[immersiveState.mode];
                setCardTarget(item, {
                    position: new THREE.Vector3(base.position.x * 1.18, base.position.y * 0.92, base.position.z - 1.6),
                    rotation: base.rotation,
                    scale: 0.72
                });
            }
        });
    };

    const buildImmersiveFallback = (photos) => {
        const fallback = document.getElementById('immersive-3d-fallback');
        if (!fallback) return;

        fallback.innerHTML = photos.map(photo => `
            <figure>
                <img src="${getPhotoSrc(photo)}" alt="${getBaseLocationName(photo.filename)}" loading="lazy">
                <figcaption>${getBaseLocationName(photo.filename)}</figcaption>
            </figure>
        `).join('');
        fallback.classList.remove('hidden');
    };

    const disposeImmersiveGallery = () => {
        if (immersiveState.animationId) {
            cancelAnimationFrame(immersiveState.animationId);
            immersiveState.animationId = null;
        }

        window.removeEventListener('resize', resizeImmersiveGallery);
        immersiveState.stage?.removeEventListener('pointerdown', handleImmersivePointerDown);
        window.removeEventListener('pointermove', handleImmersivePointerMove);
        window.removeEventListener('pointerup', handleImmersivePointerUp);
        immersiveState.stage?.removeEventListener('wheel', handleImmersiveWheel);

        immersiveState.textures.forEach(texture => texture.dispose());
        immersiveState.cards.forEach(card => {
            card.traverse(child => {
                if (child.material) child.material.dispose();
            });
        });
        immersiveState.frameGeometry?.dispose();
        immersiveState.photoGeometry?.dispose();
        immersiveState.renderer?.dispose();
        immersiveState.renderer?.domElement?.remove();

        Object.assign(immersiveState, {
            initialized: false,
            scene: null,
            camera: null,
            renderer: null,
            group: null,
            raycaster: null,
            pointer: null,
            cards: [],
            textures: [],
            frameGeometry: null,
            photoGeometry: null,
            focused: null,
            mode: 'wall',
            targetRotX: 0,
            targetRotY: 0,
            currentRotX: 0,
            currentRotY: 0,
            targetCameraZ: 8.8
        });
    };

    const resizeImmersiveGallery = () => {
        if (!immersiveState.camera || !immersiveState.renderer || !immersiveState.stage) return;
        const width = immersiveState.stage.clientWidth || window.innerWidth;
        const height = immersiveState.stage.clientHeight || window.innerHeight;
        immersiveState.camera.aspect = width / height;
        immersiveState.camera.updateProjectionMatrix();
        immersiveState.renderer.setSize(width, height);
    };

    const handleImmersivePointerDown = (event) => {
        immersiveState.isDragging = true;
        immersiveState.dragMoved = false;
        immersiveState.lastX = event.clientX;
        immersiveState.lastY = event.clientY;
        immersiveState.stage?.setPointerCapture?.(event.pointerId);
    };

    const handleImmersivePointerMove = (event) => {
        if (!immersiveState.isDragging) return;
        const dx = event.clientX - immersiveState.lastX;
        const dy = event.clientY - immersiveState.lastY;
        if (Math.abs(dx) + Math.abs(dy) > 4) immersiveState.dragMoved = true;

        immersiveState.targetRotY += dx * 0.004;
        immersiveState.targetRotX += dy * 0.0025;
        immersiveState.targetRotX = Math.max(-0.24, Math.min(0.24, immersiveState.targetRotX));
        immersiveState.lastX = event.clientX;
        immersiveState.lastY = event.clientY;
    };

    const handleImmersivePointerUp = (event) => {
        if (!immersiveState.isDragging) return;
        immersiveState.isDragging = false;
        immersiveState.stage?.releasePointerCapture?.(event.pointerId);

        if (immersiveState.dragMoved || !immersiveState.raycaster || !immersiveState.pointer) return;

        const rect = immersiveState.renderer.domElement.getBoundingClientRect();
        immersiveState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        immersiveState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        immersiveState.raycaster.setFromCamera(immersiveState.pointer, immersiveState.camera);
        const intersections = immersiveState.raycaster.intersectObjects(immersiveState.cards, true);
        const hit = intersections.find(item => item.object.userData.card)?.object.userData.card;
        if (hit) focusImmersiveCard(hit);
    };

    const handleImmersiveWheel = (event) => {
        event.preventDefault();
        immersiveState.targetCameraZ += event.deltaY * 0.003;
        immersiveState.targetCameraZ = Math.max(5.5, Math.min(12, immersiveState.targetCameraZ));
    };

    const animateImmersiveGallery = () => {
        immersiveState.animationId = requestAnimationFrame(animateImmersiveGallery);
        const lerp = prefersReducedMotion ? 0.42 : 0.08;

        immersiveState.currentRotX += (immersiveState.targetRotX - immersiveState.currentRotX) * lerp;
        immersiveState.currentRotY += (immersiveState.targetRotY - immersiveState.currentRotY) * lerp;
        if (immersiveState.group) {
            immersiveState.group.rotation.x = immersiveState.currentRotX;
            immersiveState.group.rotation.y = immersiveState.currentRotY;
        }

        if (immersiveState.camera) {
            immersiveState.camera.position.z += (immersiveState.targetCameraZ - immersiveState.camera.position.z) * lerp;
        }

        immersiveState.cards.forEach(card => {
            card.position.lerp(card.userData.targetPosition, lerp);
            card.rotation.x += (card.userData.targetRotation.x - card.rotation.x) * lerp;
            card.rotation.y += (card.userData.targetRotation.y - card.rotation.y) * lerp;
            card.rotation.z += (card.userData.targetRotation.z - card.rotation.z) * lerp;
            card.scale.lerp(new THREE.Vector3(card.userData.targetScale, card.userData.targetScale, card.userData.targetScale), lerp);
        });

        immersiveState.renderer.render(immersiveState.scene, immersiveState.camera);
    };

    const initImmersiveGallery = (photos) => {
        if (!window.THREE) {
            buildImmersiveFallback(photos);
            return false;
        }

        const THREERef = window.THREE;
        immersiveState.scene = new THREERef.Scene();
        immersiveState.camera = new THREERef.PerspectiveCamera(45, 1, 0.1, 100);
        immersiveState.camera.position.set(0, 0.25, immersiveState.targetCameraZ);
        try {
            immersiveState.renderer = new THREERef.WebGLRenderer({ antialias: true, alpha: true });
        } catch (error) {
            console.warn('WebGL renderer unavailable, using static immersive fallback.', error);
            buildImmersiveFallback(photos);
            return false;
        }
        immersiveState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        immersiveState.stage.appendChild(immersiveState.renderer.domElement);
        immersiveState.group = new THREERef.Group();
        immersiveState.scene.add(immersiveState.group);
        immersiveState.raycaster = new THREERef.Raycaster();
        immersiveState.pointer = new THREERef.Vector2();
        immersiveState.frameGeometry = new THREERef.PlaneGeometry(1.72, 1.2);
        immersiveState.photoGeometry = new THREERef.PlaneGeometry(1.58, 1.06);

        const textureLoader = new THREERef.TextureLoader();
        const cols = 6;
        const rows = Math.ceil(photos.length / cols);

        photos.forEach((photo, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const normalizedCol = col - (cols - 1) / 2;
            const normalizedRow = (rows - 1) / 2 - row;
            const angle = normalizedCol * 0.18;
            const wall = {
                position: new THREERef.Vector3(Math.sin(angle) * 6.8, normalizedRow * 1.45, -Math.cos(angle) * 1.2),
                rotation: new THREERef.Euler(0, -angle * 0.72, 0),
                scale: 1
            };
            const scatter = {
                position: new THREERef.Vector3(
                    (Math.sin(index * 1.7) * 4.3) + normalizedCol * 0.25,
                    (Math.cos(index * 1.13) * 2.25) + normalizedRow * 0.18,
                    -1.6 - (index % 5) * 0.55
                ),
                rotation: new THREERef.Euler(
                    (Math.sin(index) * 0.22),
                    (Math.cos(index * 0.8) * 0.42),
                    (Math.sin(index * 0.6) * 0.12)
                ),
                scale: 0.92
            };

            const card = new THREERef.Group();
            card.userData.photo = photo;
            card.userData.layouts = { wall, scatter };
            card.userData.targetPosition = wall.position.clone();
            card.userData.targetRotation = wall.rotation.clone();
            card.userData.targetScale = wall.scale;
            card.position.copy(wall.position);
            card.rotation.copy(wall.rotation);

            const frameMaterial = new THREERef.MeshBasicMaterial({
                color: new THREERef.Color(getColorCss(photo.color, 1)),
                transparent: true,
                opacity: 0.32,
                side: THREERef.DoubleSide
            });
            const frame = new THREERef.Mesh(immersiveState.frameGeometry, frameMaterial);
            frame.position.z = -0.012;
            card.add(frame);

            const texture = textureLoader.load(getPhotoSrc(photo));
            texture.colorSpace = THREERef.SRGBColorSpace;
            immersiveState.textures.push(texture);
            const photoMaterial = new THREERef.MeshBasicMaterial({
                map: texture,
                side: THREERef.DoubleSide
            });
            const plane = new THREERef.Mesh(immersiveState.photoGeometry, photoMaterial);
            plane.userData.card = card;
            card.add(plane);

            immersiveState.group.add(card);
            immersiveState.cards.push(card);
        });

        const ambient = new THREERef.AmbientLight(0xffffff, 1.2);
        immersiveState.scene.add(ambient);

        resizeImmersiveGallery();
        window.addEventListener('resize', resizeImmersiveGallery);
        immersiveState.stage.addEventListener('pointerdown', handleImmersivePointerDown);
        window.addEventListener('pointermove', handleImmersivePointerMove);
        window.addEventListener('pointerup', handleImmersivePointerUp);
        immersiveState.stage.addEventListener('wheel', handleImmersiveWheel, { passive: false });
        animateImmersiveGallery();
        return true;
    };

    const openImmersiveGallery = () => {
        const modal = document.getElementById('immersive-3d-modal');
        const stage = document.getElementById('immersive-3d-stage');
        const caption = document.getElementById('immersive-3d-caption');
        const fallback = document.getElementById('immersive-3d-fallback');
        if (!modal || !stage || !caption) return;

        disposeImmersiveGallery();
        fallback?.classList.add('hidden');
        if (fallback) fallback.innerHTML = '';

        const photos = selectImmersivePhotos(18);
        immersiveState.modal = modal;
        immersiveState.stage = stage;
        immersiveState.caption = caption;
        caption.textContent = 'CURATED WALL / 點選照片聚焦成果';

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const initialized = initImmersiveGallery(photos);
        immersiveState.initialized = initialized;
        setImmersiveModeButtons('wall');
    };

    const closeImmersiveGallery = () => {
        const modal = document.getElementById('immersive-3d-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
        disposeImmersiveGallery();
    };


    const setupRailTuningPanel = () => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('railTune')) return;

        const rail = document.querySelector('.story-rail');
        if (!rail) return;

        const controls = [
            { label: 'Start X', key: '--story-rail-start-x', unit: 'vw', min: -20, max: 30, step: 0.5, value: 4 },
            { label: 'Base Gap', key: '--story-rail-base-gap', unit: 'rem', min: 0, max: 12, step: 0.1, value: 4.6 },
            { label: 'Sunrise Gap', key: '--story-rail-gap-sunrise', unit: 'vw', min: 0, max: 40, step: 0.5, value: 17 },
            { label: 'Morning Gap', key: '--story-rail-gap-morning', unit: 'vw', min: 0, max: 35, step: 0.5, value: 12 },
            { label: 'Golden Gap', key: '--story-rail-gap-golden', unit: 'vw', min: 0, max: 30, step: 0.5, value: 6 },
            { label: 'End X', key: '--story-rail-end-x', unit: 'vw', min: -20, max: 35, step: 0.5, value: 6 }
        ];

        const panel = document.createElement('aside');
        panel.className = 'rail-tune-panel';
        panel.innerHTML = '<strong>Story Rail Tune</strong><div class="rail-tune-controls"></div><textarea readonly></textarea><button type="button">Copy Params</button>';

        const controlsWrap = panel.querySelector('.rail-tune-controls');
        const output = panel.querySelector('textarea');
        const copyBtn = panel.querySelector('button');

        const updateOutput = () => {
            output.value = controls
                .map(({ label, key }) => `${label}: ${rail.style.getPropertyValue(key).trim() || getComputedStyle(rail).getPropertyValue(key).trim()}`)
                .join('\n');
        };

        const refreshMotion = () => {
            refreshScrollCinematics();
            updateOutput();
        };

        controls.forEach((control) => {
            const row = document.createElement('label');
            const paramKey = control.key.replace('--story-rail-', '');
            const current = params.get(paramKey) || control.value;
            rail.style.setProperty(control.key, `${current}${control.unit}`);
            row.innerHTML = `<span>${control.label}</span><input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${current}"><em>${current}${control.unit}</em>`;

            const input = row.querySelector('input');
            const valueText = row.querySelector('em');

            input.addEventListener('input', () => {
                const nextValue = `${input.value}${control.unit}`;
                valueText.textContent = nextValue;
                rail.style.setProperty(control.key, nextValue);
                refreshMotion();
            });

            controlsWrap.appendChild(row);
        });

        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(output.value);
                copyBtn.textContent = 'Copied';
                setTimeout(() => { copyBtn.textContent = 'Copy Params'; }, 1200);
            } catch {
                output.select();
            }
        });

        document.body.appendChild(panel);
        refreshMotion();
    };



    // Close Magazine Modal
    const closeMagazineBtn = document.getElementById('close-magazine-btn');
    if (closeMagazineBtn) {
        closeMagazineBtn.addEventListener('click', () => {
            const magazineModal = document.getElementById('magazine-modal');
            magazineModal.classList.add('hidden');
            magazineModal.classList.remove('flex');
        });
    }

    const open3DGalleryBtn = document.getElementById('open-3d-gallery-btn');
    const close3DGalleryBtn = document.getElementById('close-3d-gallery-btn');
    if (open3DGalleryBtn) {
        open3DGalleryBtn.addEventListener('click', openImmersiveGallery);
    }
    if (close3DGalleryBtn) {
        close3DGalleryBtn.addEventListener('click', closeImmersiveGallery);
    }
    document.querySelectorAll('[data-gallery-mode]').forEach(button => {
        button.addEventListener('click', () => {
            if (!immersiveState.cards.length) return;
            layoutImmersiveCards(button.dataset.galleryMode);
        });
    });
    document.addEventListener('keydown', (event) => {
        const modal = document.getElementById('immersive-3d-modal');
        if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeImmersiveGallery();
        }
    });

    // --- 9. Event Listeners ---
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
    setupVideoSection();
    setupHeroVideo();
    setupScrollCinematics();
    setupRailTuningPanel();

    // Initial Observe for static elements
    setTimeout(observeElements, 500); // Wait for initial render

    // --- 10. Lightweight domain hint ---
    // Keep development and SEO friendly: no right-click blocking or anti-debug loops.
    const checkDomain = () => {
        const allowedDomains = ['localhost', '127.0.0.1', '', 'lctstudio.tw', 'www.lctstudio.tw'];

        const hostname = window.location.hostname;

        if (hostname && !allowedDomains.includes(hostname) && !hostname.endsWith('.github.io')) {
            console.warn('This deployment is not on the configured LCT Studio domains.');
        }
    };
    checkDomain();
});
