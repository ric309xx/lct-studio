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
        const baseName = filename.replace(/[-_(\（].*|\.\w+$/g, '').trim();
        if (baseName === '南投清境農場雲海A') return '南投清境農場雲海';
        return baseName;
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
    const DEFAULT_MAP_MARKERS = Array.isArray(window.mapMarkerData) ? window.mapMarkerData : [];
    const MAP_JOURNEY_FILENAMES = DEFAULT_MAP_MARKERS.map(marker => marker.filename).filter(Boolean);
    const MAP_JOURNEY_FILENAME_SET = new Set(MAP_JOURNEY_FILENAMES);
    const MAP_GPS_OVERRIDES = {
        // Taichung Intercontinental Baseball Stadium, Beitun District.
        // Source checked from Wikipedia/GeoHack coordinates: 24.19972, 120.68500.
        '台中洲際棒球場.jpg': { lat: 24.19972, lng: 120.685, alt: 110 },
        // Historic Kaohsiung Station / former Kaohsiung Vision Museum.
        // Source checked from Wikipedia coordinates: 22.638083, 120.302306.
        '高雄舊高雄車站(高雄願景館).jpg': { lat: 22.638083, lng: 120.302306, alt: 12 },
        // Public landmark coordinates used because these selected files have no embedded GPS.
        '雲林西螺落日剪影 (2).jpg': { lat: 23.81194, lng: 120.46278, alt: 35 },
        '南投日月潭.jpg': { lat: 23.86542, lng: 120.91594, alt: 748 },
        '台北社子島腳踏車道.jpg': { lat: 25.109, lng: 121.469, alt: 7 },
        '南投清境農場雲海A.png': { lat: 24.044, lng: 121.158, alt: 1750 }
    };
    const MAP_BOUNDS = {
        minLat: 21.9,
        maxLat: 25.35,
        minLng: 120.0,
        maxLng: 122.05
    };
    const MAP_POSITION_OVERRIDES = {
        '雲林北港女兒橋.jpg': { x: 39.89, y: 53.04 },
        '雲林斗六石榴火車站.jpg': { x: 45.62, y: 47.72 },
        '雲林西螺蝴蝶公園.jpg': { x: 40.91, y: 47.5 },
        '雲林西螺落日剪影 (2).jpg': { x: 41.5, y: 50.64 },
        '高雄舊高雄車站(高雄願景館).jpg': { x: 43.35, y: 68.65 },
        '台中洲際棒球場.jpg': { x: 46.02, y: 41.89 },
        '南投清境農場雲海A.png': { x: 54.46, y: 47.27 },
        '花蓮清水斷崖.jpg': { x: 62.11, y: 41.22 },
        '宜蘭冬山河旁景致.jpg': { x: 66.21, y: 30 },
        '南投日月潭.jpg': { x: 50.1, y: 54.2 },
        '台北士林洲美橡皮壩.jpg': { x: 63.15, y: 21.89 },
        '台北社子島腳踏車道.jpg': { x: 61.32, y: 16.56 },
        '新北淡水海尾子海灘 (1).jpg': { x: 55.44, y: 20.14 },
        '新竹寶山小西湖.jpg': { x: 49.94, y: 29.56 },
        '基隆望幽谷.jpg': { x: 66.03, y: 18.8 },
        '宜蘭五結防潮閘門-2.jpg': { x: 66.82, y: 25.08 },
        '花蓮和平火車站旁-2.jpg': { x: 65.25, y: 35.39 },
        '澎湖湖西菓葉觀日樓.jpg': { x: 26.22, y: 50.27 }
    };
    const MAP_POSITION_STORAGE_KEY = 'lct-map-pin-positions-v2';
    const MAP_MARKER_STORAGE_KEY = 'lct-map-markers-v2';

    const getStoredMapPositions = () => {
        try {
            const raw = window.localStorage?.getItem(MAP_POSITION_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('Unable to read saved map pin positions.', error);
            return {};
        }
    };

    const saveStoredMapPositions = (positions) => {
        try {
            window.localStorage?.setItem(MAP_POSITION_STORAGE_KEY, JSON.stringify(positions));
        } catch (error) {
            console.warn('Unable to save map pin positions.', error);
        }
    };

    const getStoredMapMarkers = () => {
        try {
            const raw = window.localStorage?.getItem(MAP_MARKER_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : null;
        } catch (error) {
            console.warn('Unable to read saved map markers.', error);
            return null;
        }
    };

    const saveStoredMapMarkers = (markers) => {
        try {
            window.localStorage?.setItem(MAP_MARKER_STORAGE_KEY, JSON.stringify(markers));
        } catch (error) {
            console.warn('Unable to save map markers.', error);
        }
    };

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
        const mapPanel = mapWrap?.closest('.map-route-panel');
        const pinsWrap = document.getElementById('map-pins');
        const routeSegments = document.getElementById('map-route-segments');
        const previewCard = document.getElementById('map-preview-card');
        const previewImg = document.getElementById('map-preview-img');
        const previewTitle = document.getElementById('map-preview-title');
        const activeCoords = document.getElementById('map-active-coords');
        const editToggle = document.getElementById('map-edit-toggle');
        const addMarker = document.getElementById('map-add-marker');
        const deleteMarker = document.getElementById('map-delete-marker');
        const editCopy = document.getElementById('map-edit-copy');
        const editStatus = document.getElementById('map-edit-status');
        const editor = document.getElementById('map-marker-editor');
        const titleInput = document.getElementById('map-marker-title');
        const imageInput = document.getElementById('map-marker-image');
        const categoryInput = document.getElementById('map-marker-category');
        const filenameInput = document.getElementById('map-marker-filename');
        const latInput = document.getElementById('map-marker-lat');
        const lngInput = document.getElementById('map-marker-lng');

        if (!mapWrap || !pinsWrap || !routeSegments || !previewImg) return;
        if (mapJourneyInitialized) return;

        const params = new URLSearchParams(window.location.search);
        const editToolsEnabled = params.get('editMap') === '1' || window.location.hash === '#edit-map';
        if (editToolsEnabled) {
            mapPanel?.classList.add('is-edit-enabled');
            if (editToggle?.parentElement) editToggle.parentElement.hidden = false;
        } else {
            if (editToggle?.parentElement) editToggle.parentElement.hidden = true;
            editor?.setAttribute('hidden', '');
        }

        const allPhotos = flattenPhotos(globalPhotoData);
        let markers = getStoredMapMarkers() || DEFAULT_MAP_MARKERS.map(marker => ({ ...marker }));
        if (!markers.length) {
            markers = [{ id: `marker-${Date.now()}`, title: '新的空拍標示', position: { x: 50, y: 50 } }];
        }

        mapJourneyInitialized = true;

        let manualPositions = getStoredMapPositions();
        let editMode = false;
        let activeIndex = 0;
        let draggingPin = null;
        let suppressNextClick = false;

        const getMarkerPhoto = (marker) => {
            if (!marker?.filename) return null;
            if (marker.category) {
                return allPhotos.find(item => item.category === marker.category && item.filename === marker.filename) || null;
            }
            return allPhotos.find(item => item.filename === marker.filename) || null;
        };

        const getMarkerTitle = (marker) => marker.title || getBaseLocationName(marker.filename || '') || '新的空拍標示';
        const getMarkerImageSrc = (marker) => {
            if (marker.image) return marker.image;
            const photo = getMarkerPhoto(marker);
            return photo ? getPhotoSrc(photo) : 'public/assets/taiwan-aerial-map.webp';
        };
        const getMarkerGps = (marker) => {
            if (marker?.gps && Number.isFinite(marker.gps.lat) && Number.isFinite(marker.gps.lng)) return marker.gps;
            const photo = getMarkerPhoto(marker);
            return photo?.gps || MAP_GPS_OVERRIDES[marker.filename] || null;
        };
        const getBasePoint = (marker) => {
            if (marker.position && Number.isFinite(marker.position.x) && Number.isFinite(marker.position.y)) return marker.position;
            const override = marker.filename ? MAP_POSITION_OVERRIDES[marker.filename] : null;
            if (override) return override;
            const gps = getMarkerGps(marker);
            if (gps) {
                const lngRatio = Math.max(0, Math.min(1, (gps.lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)));
                const latRatio = Math.max(0, Math.min(1, (MAP_BOUNDS.maxLat - gps.lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)));
                return { x: 34.5 + lngRatio * 43.5, y: 10 + latRatio * 76 };
            }
            return { x: 50, y: 50 };
        };
        const toPoint = (marker) => {
            const saved = manualPositions[marker.id] || manualPositions[marker.filename];
            return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? { x: saved.x, y: saved.y } : getBasePoint(marker);
        };

        let points = markers.map(toPoint);
        const setPinPosition = (pin, point) => {
            pin.style.left = `${point.x}%`;
            pin.style.top = `${point.y}%`;
        };
        const updateEditStatus = (text) => {
            if (editStatus) editStatus.textContent = text;
        };
        const persistMarkers = () => {
            markers = markers.map((marker, index) => ({
                ...marker,
                position: { x: Number(points[index].x.toFixed(2)), y: Number(points[index].y.toFixed(2)) }
            }));
            saveStoredMapMarkers(markers);
        };
        const savePinPosition = (index) => {
            const marker = markers[index];
            if (!marker) return;
            manualPositions[marker.id || marker.filename] = {
                x: Number(points[index].x.toFixed(2)),
                y: Number(points[index].y.toFixed(2))
            };
            saveStoredMapPositions(manualPositions);
            persistMarkers();
        };
        const syncEditor = () => {
            const marker = markers[activeIndex];
            if (!marker) return;
            const gps = getMarkerGps(marker);
            if (titleInput) titleInput.value = getMarkerTitle(marker);
            if (imageInput) imageInput.value = marker.image || '';
            if (categoryInput) categoryInput.value = marker.category || '';
            if (filenameInput) filenameInput.value = marker.filename || '';
            if (latInput) latInput.value = gps?.lat ?? '';
            if (lngInput) lngInput.value = gps?.lng ?? '';
        };
        const setActiveStop = (index) => {
            const marker = markers[index];
            if (!marker) return;
            activeIndex = index;
            previewImg.style.opacity = '0.55';
            setTimeout(() => {
                previewImg.src = getMarkerImageSrc(marker);
                previewImg.alt = getMarkerTitle(marker);
                previewImg.style.opacity = '1';
            }, 80);
            if (previewCard) previewCard.dataset.title = getMarkerTitle(marker);
            if (previewTitle) previewTitle.textContent = getMarkerTitle(marker);
            const gps = getMarkerGps(marker);
            activeCoords.textContent = gps ? `${formatCoord(gps.lat)}, ${formatCoord(gps.lng)}` : `X ${points[index].x.toFixed(1)} / Y ${points[index].y.toFixed(1)}`;
            pinsWrap.querySelectorAll('.map-pin').forEach((pin, pinIndex) => {
                pin.classList.toggle('is-active', pinIndex === index);
            });
            syncEditor();
        };
        const renderPins = () => {
            pinsWrap.innerHTML = '';
            routeSegments.innerHTML = '';
            markers.forEach((marker, index) => {
                const photo = getMarkerPhoto(marker);
                const pin = document.createElement('button');
                pin.type = 'button';
                pin.className = 'map-pin';
                setPinPosition(pin, points[index]);
                pin.style.setProperty('--pin-color', getColorCss(photo?.color, 1));
                pin.dataset.title = getMarkerTitle(marker);
                pin.setAttribute('aria-label', `標示 ${getMarkerTitle(marker)}`);
                pin.addEventListener('pointerdown', (event) => {
                    if (!editMode) return;
                    event.preventDefault();
                    draggingPin = { pin, index, pointerId: event.pointerId };
                    pin.setPointerCapture?.(event.pointerId);
                    window.addEventListener('pointermove', handlePinPointerMove);
                    window.addEventListener('pointerup', handlePinPointerUp, { once: true });
                });
                pin.addEventListener('click', () => {
                    if (suppressNextClick) {
                        suppressNextClick = false;
                        return;
                    }
                    setActiveStop(index);
                });
                pinsWrap.appendChild(pin);
            });
            setActiveStop(Math.min(activeIndex, markers.length - 1));
        };
        const handlePinPointerMove = (event) => {
            if (!draggingPin) return;
            const rect = mapWrap.getBoundingClientRect();
            const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
            const index = draggingPin.index;
            points[index] = { x, y };
            setPinPosition(draggingPin.pin, points[index]);
            updateEditStatus(`${String(index + 1).padStart(2, '0')} / X ${x.toFixed(1)} Y ${y.toFixed(1)}`);
            suppressNextClick = true;
        };
        const handlePinPointerUp = () => {
            if (!draggingPin) return;
            savePinPosition(draggingPin.index);
            draggingPin.pin.releasePointerCapture?.(draggingPin.pointerId);
            draggingPin = null;
            updateEditStatus('位置已更新，複製設定後可貼回資料檔');
            window.removeEventListener('pointermove', handlePinPointerMove);
            window.removeEventListener('pointerup', handlePinPointerUp);
        };

        editToggle?.addEventListener('click', () => {
            if (!editToolsEnabled) return;
            editMode = !editMode;
            mapPanel?.classList.toggle('is-editing', editMode);
            editor?.toggleAttribute('hidden', !editMode);
            editor?.classList.toggle('is-visible', editMode);
            editToggle.textContent = editMode ? '完成' : '編輯';
            updateEditStatus(editMode ? '拖曳標示、點新增、或直接修改欄位' : '編輯已關閉');
        });
        addMarker?.addEventListener('click', () => {
            if (!editToolsEnabled) return;
            const marker = { id: `marker-${Date.now()}`, title: '新的空拍標示', position: { x: 50, y: 50 } };
            markers.push(marker);
            points.push(marker.position);
            activeIndex = markers.length - 1;
            persistMarkers();
            renderPins();
            updateEditStatus('已新增標示，可拖曳或編輯欄位');
        });
        deleteMarker?.addEventListener('click', () => {
            if (!editToolsEnabled) return;
            if (!markers.length) return;
            markers.splice(activeIndex, 1);
            points.splice(activeIndex, 1);
            if (!markers.length) {
                const marker = { id: `marker-${Date.now()}`, title: '新的空拍標示', position: { x: 50, y: 50 } };
                markers.push(marker);
                points.push(marker.position);
            }
            activeIndex = Math.max(0, activeIndex - 1);
            persistMarkers();
            renderPins();
            updateEditStatus('已刪除目前標示');
        });
        mapWrap.addEventListener('click', (event) => {
            if (!editToolsEnabled || !editMode || event.target.closest('.map-pin')) return;
            const rect = mapWrap.getBoundingClientRect();
            const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
            const marker = { id: `marker-${Date.now()}`, title: '新的空拍標示', position: { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) } };
            markers.push(marker);
            points.push(marker.position);
            activeIndex = markers.length - 1;
            persistMarkers();
            renderPins();
            updateEditStatus('已在點選位置新增標示');
        });
        [titleInput, imageInput, categoryInput, filenameInput, latInput, lngInput].forEach(input => {
            input?.addEventListener('input', () => {
                if (!editToolsEnabled) return;
                const marker = markers[activeIndex];
                if (!marker) return;
                marker.title = titleInput?.value.trim() || '新的空拍標示';
                marker.image = imageInput?.value.trim() || undefined;
                marker.category = categoryInput?.value.trim() || undefined;
                marker.filename = filenameInput?.value.trim() || undefined;
                const lat = Number(latInput?.value);
                const lng = Number(lngInput?.value);
                marker.gps = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
                persistMarkers();
                renderPins();
            });
        });
        editCopy?.addEventListener('click', async () => {
            if (!editToolsEnabled) return;
            persistMarkers();
            const text = `window.mapMarkerData = ${JSON.stringify(markers, null, 4)};`;
            try {
                await navigator.clipboard.writeText(text);
                updateEditStatus('已複製設定，可貼回 public/js/map_markers.js');
            } catch (error) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
                updateEditStatus('已複製設定，可貼回 public/js/map_markers.js');
            }
        });

        renderPins();
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

    const setupCompareSliders = () => {
        document.querySelectorAll('[data-compare]').forEach((compare) => {
            const stage = compare.querySelector('.compare-stage');
            const range = compare.querySelector('.compare-range');
            const editor = compare.querySelector('[data-compare-editor]');
            const targetButtons = [...compare.querySelectorAll('[data-compare-target]')];
            const controls = [...compare.querySelectorAll('[data-compare-control]')];
            const copyButton = compare.querySelector('[data-compare-copy]');
            const status = compare.querySelector('[data-compare-status]');
            if (!stage || !range) return;

            const editEnabled = new URLSearchParams(window.location.search).get('editCompare') === '1' || window.location.hash === '#edit-compare';
            const storageKey = 'lct-compare-settings-v1';
            const defaultSettings = {
                day: {
                    x: Number(compare.dataset.dayX || 50),
                    y: Number(compare.dataset.dayY || 50),
                    zoom: Number(compare.dataset.dayZoom || 100)
                },
                night: {
                    x: Number(compare.dataset.nightX || 50),
                    y: Number(compare.dataset.nightY || 50),
                    zoom: Number(compare.dataset.nightZoom || 100)
                }
            };
            let selectedTarget = 'day';
            let settings = defaultSettings;

            try {
                const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
                if (saved?.day && saved?.night) settings = saved;
            } catch (error) {
                settings = defaultSettings;
            }

            const setPosition = (value) => {
                const numericValue = Math.max(0, Math.min(100, Number(value) || 0));
                compare.style.setProperty('--compare-position', `${numericValue}%`);
                range.value = String(numericValue);
            };

            const applyImageSettings = () => {
                const dayShiftX = (50 - settings.day.x) * 0.45;
                const dayShiftY = (50 - settings.day.y) * 0.35;
                const nightShiftX = (50 - settings.night.x) * 0.45;
                const nightShiftY = (50 - settings.night.y) * 0.35;
                compare.style.setProperty('--compare-day-x', `${settings.day.x}%`);
                compare.style.setProperty('--compare-day-y', `${settings.day.y}%`);
                compare.style.setProperty('--compare-day-zoom', String(settings.day.zoom / 100));
                compare.style.setProperty('--compare-day-shift-x', `${dayShiftX}%`);
                compare.style.setProperty('--compare-day-shift-y', `${dayShiftY}%`);
                compare.style.setProperty('--compare-night-x', `${settings.night.x}%`);
                compare.style.setProperty('--compare-night-y', `${settings.night.y}%`);
                compare.style.setProperty('--compare-night-zoom', String(settings.night.zoom / 100));
                compare.style.setProperty('--compare-night-shift-x', `${nightShiftX}%`);
                compare.style.setProperty('--compare-night-shift-y', `${nightShiftY}%`);
            };

            const syncControls = () => {
                controls.forEach((control) => {
                    control.value = String(settings[selectedTarget][control.dataset.compareControl]);
                });
                targetButtons.forEach((button) => {
                    button.classList.toggle('is-active', button.dataset.compareTarget === selectedTarget);
                });
            };

            const saveSettings = () => {
                localStorage.setItem(storageKey, JSON.stringify(settings));
            };

            const setFromPointer = (event) => {
                const rect = stage.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
                setPosition((x / rect.width) * 100);
            };

            applyImageSettings();
            setPosition(range.value);
            range.addEventListener('input', () => setPosition(range.value));
            stage.addEventListener('pointerdown', (event) => {
                setFromPointer(event);
                stage.setPointerCapture?.(event.pointerId);
            });
            stage.addEventListener('pointermove', (event) => {
                if (event.buttons !== 1) return;
                setFromPointer(event);
            });

            if (editEnabled && editor) {
                editor.hidden = false;
                syncControls();
            }

            targetButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    selectedTarget = button.dataset.compareTarget || 'day';
                    syncControls();
                });
            });

            controls.forEach((control) => {
                control.addEventListener('input', () => {
                    const key = control.dataset.compareControl;
                    settings[selectedTarget][key] = Number(control.value);
                    applyImageSettings();
                    saveSettings();
                    if (status) status.textContent = '已套用，可複製設定';
                });
            });

            copyButton?.addEventListener('click', async () => {
                const text = `data-day-x="${settings.day.x}" data-day-y="${settings.day.y}" data-day-zoom="${settings.day.zoom}" data-night-x="${settings.night.x}" data-night-y="${settings.night.y}" data-night-zoom="${settings.night.zoom}"`;
                try {
                    await navigator.clipboard.writeText(text);
                    if (status) status.textContent = '已複製設定，可貼給 Codex 回填';
                } catch (error) {
                    if (status) status.textContent = text;
                }
            });
        });
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

        const getVideoId = (url) => {
            if (!url) return '';
            const parts = url.split('/');
            return parts[parts.length - 1].split('?')[0];
        };

        const getThumbnailUrl = (url, quality = 'maxresdefault') => {
            const videoId = getVideoId(url);
            return videoId ? `https://img.youtube.com/vi/${videoId}/${quality}.jpg` : '';
        };

        const normalizeEmbedUrl = (url, autoplay = false) => {
            if (!url) return '';
            const joiner = url.includes('?') ? '&' : '?';
            const params = autoplay ? 'autoplay=1&rel=0' : 'rel=0';
            return `${url}${joiner}${params}`;
        };

        const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char]);

        const renderFeaturePreview = (video) => {
            const thumbnailUrl = getThumbnailUrl(video.url);
            const safeTitle = escapeHTML(video.title);
            const displayYear = video.year || (video.title?.includes('林口') ? '2026' : '2025');
            mainPlayerContainer.innerHTML = `
                <img src="${thumbnailUrl}" alt="${safeTitle}" class="motion-feature-image">
                <div class="motion-feature-shade"></div>
                <div class="motion-feature-copy">
                    <span class="motion-badge">空拍作品</span>
                    <h3>${safeTitle}</h3>
                </div>
                <button class="motion-play-main" type="button" aria-label="播放 ${safeTitle}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>
                </button>
                <div class="motion-feature-meta">
                    ${video.duration ? `<span>${escapeHTML(video.duration)}</span>` : ''}
                    <span>4K</span>
                    <span>${escapeHTML(displayYear)}</span>
                </div>
            `;

            const playButton = mainPlayerContainer.querySelector('.motion-play-main');
            playButton.addEventListener('click', () => playVideo(video, true));
        };

        const playVideo = (video, autoplay = false) => {
            mainPlayerContainer.innerHTML = `
                <iframe class="motion-feature-frame animate-fade-in" src="${normalizeEmbedUrl(video.url, autoplay)}" title="${escapeHTML(video.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            `;
        };

        playlistContainer.innerHTML = '';

        if (finalVideos.length === 0) return;

        const [featuredVideo, ...otherVideos] = finalVideos;
        renderFeaturePreview(featuredVideo);

        const playlistVideos = [
            featuredVideo,
            ...otherVideos.filter(video => video.title !== '林口空拍 (日+夜)')
        ].slice(0, 4);

        playlistVideos.forEach(video => {
            const thumbnailUrl = getThumbnailUrl(video.url, 'mqdefault');
            const safeTitle = escapeHTML(video.title);
            const card = document.createElement('div');
            card.className = 'motion-thumb';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.setAttribute('aria-label', `播放 ${video.title}`);
            card.innerHTML = `
                <div class="motion-thumb-media">
                    <img src="${thumbnailUrl}" alt="${safeTitle}">
                    <span class="motion-thumb-play" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                    </span>
                    ${video.duration ? `<span class="motion-duration">${escapeHTML(video.duration)}</span>` : ''}
                </div>
                <p>${safeTitle}</p>
             `;

            const selectVideo = () => {
                renderFeaturePreview(video);
                window.scrollTo({
                    top: mainPlayerContainer.getBoundingClientRect().top + window.scrollY - 100,
                    behavior: 'smooth'
                });
            };

            card.addEventListener('click', selectVideo);
            card.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectVideo();
                }
            });

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
    const IMMERSIVE_GALLERY_FILENAMES = [
        '高雄車站(高雄綠之丘).jpg',
        '新北新店裕隆城.jpg',
        '基隆外木山漁港-2.jpg',
        '南投日月潭.jpg',
        '桃園大園橫山書法藝術公園.jpg',
        '宜蘭五結日落 (1)A.png',
        '高雄中都橋.jpg',
        '雲林西螺落日剪影 (2).jpg',
        '花蓮和平火車站旁.jpg',
        '台中漢神洲際百貨.jpg',
        '高雄輕軌.jpg',
        '台北士林雙溪濕地公園.jpg',
        '新北淡水輕軌 (1).jpg'
    ];

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
        extraGeometries: [],
        animationId: null,
        mode: 'scatter',
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

    const selectImmersivePhotos = (count = IMMERSIVE_GALLERY_FILENAMES.length) => {
        const pool = flattenPhotos(globalPhotoData)
            .filter(photo => !MAP_JOURNEY_FILENAME_SET.has(photo.filename));
        const selected = IMMERSIVE_GALLERY_FILENAMES
            .map(filename => pool.find(photo => photo.filename === filename))
            .filter(Boolean);

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

    const setCardTarget = (card, target) => {
        card.userData.targetPosition.copy(target.position);
        card.userData.targetRotation.copy(target.rotation);
        card.userData.targetScale = target.scale;
    };

    const layoutImmersiveCards = () => {
        immersiveState.mode = 'scatter';
        immersiveState.focused = null;
        immersiveState.caption.textContent = 'GLASS WALL / 玻璃照片牆漂浮展示';

        immersiveState.cards.forEach(card => {
            setCardTarget(card, card.userData.layout);
        });
    };

    const focusImmersiveCard = (card) => {
        if (immersiveState.focused === card) {
            layoutImmersiveCards();
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
                const base = item.userData.layout;
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
        immersiveState.extraGeometries.forEach(geometry => geometry.dispose());
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
            extraGeometries: [],
            focused: null,
            mode: 'scatter',
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

        const elapsed = performance.now() * 0.001;
        immersiveState.cards.forEach(card => {
            const drift = card.userData.drift || { phase: 0, ampX: 0, ampY: 0, ampZ: 0, rot: 0 };
            const floatingTarget = card.userData.targetPosition.clone();
            if (!prefersReducedMotion) {
                floatingTarget.x += Math.sin(elapsed * 0.55 + drift.phase) * drift.ampX;
                floatingTarget.y += Math.cos(elapsed * 0.7 + drift.phase * 0.8) * drift.ampY;
                floatingTarget.z += Math.sin(elapsed * 0.48 + drift.phase * 1.2) * drift.ampZ;
            }

            card.position.lerp(floatingTarget, lerp);
            const floatRotZ = prefersReducedMotion ? 0 : Math.sin(elapsed * 0.42 + drift.phase) * drift.rot;
            card.rotation.x += (card.userData.targetRotation.x - card.rotation.x) * lerp;
            card.rotation.y += (card.userData.targetRotation.y - card.rotation.y) * lerp;
            card.rotation.z += (card.userData.targetRotation.z + floatRotZ - card.rotation.z) * lerp;
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
        const glassGeometry = new THREERef.BoxGeometry(1.92, 1.38, 0.045);
        const glassEdgeGeometry = new THREERef.EdgesGeometry(glassGeometry);
        const glassFaceGeometry = new THREERef.PlaneGeometry(1.86, 1.32);
        const glowGeometry = new THREERef.PlaneGeometry(1.96, 1.42);
        const sheenGeometry = new THREERef.PlaneGeometry(1.68, 0.16);
        const hudTopGeometry = new THREERef.PlaneGeometry(0.42, 0.012);
        const hudSideGeometry = new THREERef.PlaneGeometry(0.012, 0.28);
        const floorLineGeometry = new THREERef.PlaneGeometry(8.8, 0.012);
        const lightBeamGeometry = new THREERef.PlaneGeometry(0.04, 6.8);
        immersiveState.extraGeometries.push(
            glassGeometry,
            glassEdgeGeometry,
            glassFaceGeometry,
            glowGeometry,
            sheenGeometry,
            hudTopGeometry,
            hudSideGeometry,
            floorLineGeometry,
            lightBeamGeometry
        );
        const wallLayouts = [
            { x: 0, y: 0.12, z: 1.75, scale: 1.72, rotY: 0, rotZ: 0 },
            { x: -2.75, y: 1.55, z: 0.15, scale: 1.02, rotY: 0.18, rotZ: -0.022 },
            { x: 2.95, y: 1.48, z: -0.08, scale: 1.08, rotY: -0.18, rotZ: 0.025 },
            { x: -3.8, y: -0.16, z: -0.52, scale: 0.9, rotY: 0.27, rotZ: 0.016 },
            { x: 3.95, y: -0.14, z: -0.64, scale: 0.94, rotY: -0.27, rotZ: -0.016 },
            { x: -2.2, y: -1.68, z: 0.12, scale: 1.03, rotY: 0.16, rotZ: 0.032 },
            { x: 2.28, y: -1.72, z: -0.02, scale: 1.04, rotY: -0.16, rotZ: -0.026 },
            { x: 0.36, y: 2.24, z: -1.02, scale: 0.78, rotY: -0.04, rotZ: 0.014 },
            { x: -4.55, y: 0.98, z: -1.28, scale: 0.72, rotY: 0.38, rotZ: -0.04 },
            { x: 4.6, y: 0.95, z: -1.42, scale: 0.74, rotY: -0.38, rotZ: 0.04 },
            { x: -4.5, y: -1.38, z: -1.16, scale: 0.74, rotY: 0.36, rotZ: 0.044 },
            { x: 4.5, y: -1.34, z: -1.28, scale: 0.76, rotY: -0.36, rotZ: -0.04 },
            { x: 0.1, y: -2.45, z: -0.86, scale: 0.72, rotY: 0, rotZ: 0 }
        ];

        photos.forEach((photo, index) => {
            const layout = wallLayouts[index % wallLayouts.length];
            const glassWall = {
                position: new THREERef.Vector3(
                    layout.x + (index >= wallLayouts.length ? Math.sin(index) * 0.28 : 0),
                    layout.y + (index >= wallLayouts.length ? Math.cos(index) * 0.18 : 0),
                    layout.z - Math.floor(index / wallLayouts.length) * 0.65
                ),
                rotation: new THREERef.Euler(
                    Math.sin(index * 0.6) * 0.045,
                    layout.rotY,
                    layout.rotZ
                ),
                scale: layout.scale
            };

            const card = new THREERef.Group();
            card.userData.photo = photo;
            card.userData.layout = glassWall;
            card.userData.targetPosition = glassWall.position.clone();
            card.userData.targetRotation = glassWall.rotation.clone();
            card.userData.targetScale = glassWall.scale;
            card.userData.drift = {
                phase: index * 0.83,
                ampX: 0.035 + (index % 4) * 0.01,
                ampY: 0.07 + (index % 5) * 0.012,
                ampZ: 0.045 + (index % 3) * 0.012,
                rot: 0.009 + (index % 4) * 0.004
            };
            card.position.copy(glassWall.position);
            card.rotation.copy(glassWall.rotation);

            const glassBackMaterial = new THREERef.MeshBasicMaterial({
                color: 0x76e9ff,
                transparent: true,
                opacity: index === 0 ? 0.12 : 0.075,
                blending: THREERef.AdditiveBlending,
                depthWrite: false
            });
            const glassBack = new THREERef.Mesh(glassGeometry, glassBackMaterial);
            glassBack.position.z = -0.055;
            card.add(glassBack);

            const glowMaterial = new THREERef.MeshBasicMaterial({
                color: 0x46d9ff,
                transparent: true,
                opacity: index === 0 ? 0.34 : 0.22,
                blending: THREERef.AdditiveBlending,
                depthWrite: false,
                side: THREERef.DoubleSide
            });
            const glow = new THREERef.Mesh(glowGeometry, glowMaterial);
            glow.position.z = -0.085;
            glow.scale.set(1.18, 1.22, 1);
            card.add(glow);

            const frameMaterial = new THREERef.LineBasicMaterial({
                color: 0x82eaff,
                transparent: true,
                opacity: index === 0 ? 0.56 : 0.34,
                blending: THREERef.AdditiveBlending,
                depthWrite: false
            });
            const frame = new THREERef.LineSegments(glassEdgeGeometry, frameMaterial);
            frame.position.z = 0.004;
            card.add(frame);

            const glassMaterial = new THREERef.MeshBasicMaterial({
                color: 0xcaf7ff,
                transparent: true,
                opacity: index === 0 ? 0.13 : 0.09,
                depthWrite: false,
                side: THREERef.DoubleSide
            });
            const glass = new THREERef.Mesh(glassFaceGeometry, glassMaterial);
            glass.position.z = 0.022;
            glass.scale.set(1.02, 1.04, 1);
            card.add(glass);

            const texture = textureLoader.load(getPhotoSrc(photo));
            texture.colorSpace = THREERef.SRGBColorSpace;
            immersiveState.textures.push(texture);
            const photoMaterial = new THREERef.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: index === 0 ? 0.98 : 0.9,
                side: THREERef.DoubleSide
            });
            const plane = new THREERef.Mesh(immersiveState.photoGeometry, photoMaterial);
            plane.position.z = 0.035;
            plane.userData.card = card;
            card.add(plane);

            const sheenMaterial = new THREERef.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: index === 0 ? 0.22 : 0.14,
                blending: THREERef.AdditiveBlending,
                depthWrite: false,
                side: THREERef.DoubleSide
            });
            const sheen = new THREERef.Mesh(sheenGeometry, sheenMaterial);
            sheen.position.set(-0.18, 0.32, 0.052);
            sheen.rotation.z = -0.22;
            card.add(sheen);

            const hudMaterial = new THREERef.MeshBasicMaterial({
                color: index === 0 ? 0xfff0bf : 0x46d9ff,
                transparent: true,
                opacity: index === 0 ? 0.68 : 0.42,
                blending: THREERef.AdditiveBlending,
                depthWrite: false
            });
            const hudTop = new THREERef.Mesh(hudTopGeometry, hudMaterial);
            hudTop.position.set(-0.56, 0.57, 0.018);
            const hudSide = new THREERef.Mesh(hudSideGeometry, hudMaterial);
            hudSide.position.set(0.8, -0.46, 0.018);
            card.add(hudTop);
            card.add(hudSide);

            immersiveState.group.add(card);
            immersiveState.cards.push(card);
        });

        const floorMaterial = new THREERef.MeshBasicMaterial({
            color: 0x46d9ff,
            transparent: true,
            opacity: 0.16,
            blending: THREERef.AdditiveBlending,
            depthWrite: false,
            side: THREERef.DoubleSide
        });
        for (let i = 0; i < 8; i++) {
            const floorLine = new THREERef.Mesh(floorLineGeometry, floorMaterial);
            floorLine.position.set(0, -3.25, -2.4 + i * 0.48);
            floorLine.rotation.x = -1.18;
            floorLine.rotation.z = i % 2 ? 0.08 : -0.08;
            immersiveState.group.add(floorLine);
        }

        const beamMaterial = new THREERef.MeshBasicMaterial({
            color: 0x46d9ff,
            transparent: true,
            opacity: 0.07,
            blending: THREERef.AdditiveBlending,
            depthWrite: false,
            side: THREERef.DoubleSide
        });
        [-4.2, -1.5, 2.15, 4.65].forEach((x, index) => {
            const beam = new THREERef.Mesh(lightBeamGeometry, beamMaterial);
            beam.position.set(x, 0.15, -1.8 - index * 0.22);
            beam.rotation.z = index % 2 ? -0.24 : 0.2;
            immersiveState.group.add(beam);
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

        const photos = selectImmersivePhotos();
        immersiveState.modal = modal;
        immersiveState.stage = stage;
        immersiveState.caption = caption;
        caption.textContent = 'GLASS WALL / 玻璃照片牆漂浮展示';

        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        const initialized = initImmersiveGallery(photos);
        immersiveState.initialized = initialized;
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
    setupCompareSliders();
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
