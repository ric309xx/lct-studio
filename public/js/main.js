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

    // ... (Skipping unaffected sections for brevity in this tool call context - ensuring start/end lines match)
    // Wait... I used replace_file_content for a large block. 
    // Actually, I need to match the target content exactly.
    // The previous tool call was too broad for `replace_file_content` if I don't paste the WHOLE intermediate code.
    // I will use `multi_replace_file_content` for surgical edits to Main.js instead.


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

    // --- 6. Videos ---
    const setupVideoSection = () => {
        const mainPlayerContainer = document.getElementById('main-video-player');
        const mainTitle = document.getElementById('main-video-title');
        const playlistContainer = document.getElementById('video-playlist');

        if (!mainPlayerContainer || !playlistContainer) return;

        // Flatten videos from window.videoData
        const allVideos = [];
        if (window.videoData && window.videoData.categories) {
            Object.values(window.videoData.categories).forEach(cat => allVideos.push(...cat));
        }

        // Target Fixed Video: "商業空間 空拍紀實"
        // ID: X_-eCxOpJd8
        const fixedVideoUrl = "https://www.youtube.com/embed/X_-eCxOpJd8";
        const fixedVideo = allVideos.find(v => v.url.includes("X_-eCxOpJd8")) || {
            url: fixedVideoUrl,
            title: "商業空間 空拍紀實",
            duration: "01:30"
        };

        // Filter out the fixed video from the pool
        const otherVideos = allVideos.filter(v => !v.url.includes("X_-eCxOpJd8"));

        // Shuffle and pick 2
        otherVideos.sort(() => 0.5 - Math.random());
        const randomVideos = otherVideos.slice(0, 2);

        // Final List: Fixed + 2 Random = 3 Total
        const finalVideos = [fixedVideo, ...randomVideos];

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



    // Close Magazine Modal
    const closeMagazineBtn = document.getElementById('close-magazine-btn');
    if (closeMagazineBtn) {
        closeMagazineBtn.addEventListener('click', () => {
            const magazineModal = document.getElementById('magazine-modal');
            magazineModal.classList.add('hidden');
            magazineModal.classList.remove('flex');
        });
    }

    // --- 8. Event Listeners ---
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

    // Initial Observe for static elements
    setTimeout(observeElements, 500); // Wait for initial render

    // --- 9. Basic Protection (基本保護) ---
    // Disable Right Click
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // Disable common DevTools shortcuts
    document.addEventListener('keydown', (e) => {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
        }
        // Ctrl+Shift+I (Windows) / Cmd+Opt+I (Mac)
        if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
            e.preventDefault();
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
            e.preventDefault();
        }
    });

    // --- 10. Advanced Protection (進階保護) ---

    // 1. Anti-Debugging Loop (防偵錯迴圈)
    // 當開發者工具開啟時，會不斷觸發 debugger 中斷點，干擾操作。
    // 注意：這在開發階段可能會有點煩人，如果您要除錯，請暫時註解掉這一行。
    setInterval(() => {
        // Function constructor debugger trick
        (function () { }.constructor('debugger')());
    }, 2000);

    // 2. Domain/Protocol Check (網域鎖定)
    // 防止網站被部署到未經授權的網域 (例如被複製到 malicious-site.com)
    // 注意：為了不影響您本地開發 (file:// 或 localhost)，這裡預設只會顯示警告。
    // 發布時，您可以將您的真實網域加入 ALLOWED_DOMAINS 列表。
    const checkDomain = () => {
        const allowedDomains = ['localhost', '127.0.0.1', '']; // '' allows file://
        // 若您有正式網域，請加入，例如： 'your-website.com'

        const hostname = window.location.hostname;

        // 如果不在允許列表中 (且不是空的 file protocol)
        if (hostname && !allowedDomains.includes(hostname) && !hostname.endsWith('.github.io')) {
            // 在這裡執行保護動作，例如：
            // alert('這不是官方網站！');
            // document.body.innerHTML = ''; 
            console.warn('Warning: Unauthorized domain access.');
        }
    };
    checkDomain();
});
