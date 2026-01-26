# Archived Feature: 3D Floating Gallery (v15)

**Archived Date:** 2026-01-19
**Description:** A GSAP-powered immersive 3D gallery with double-sided cards, orbit controls, and scatter/grid modes.
**Dependencies:** GSAP 3.12.5 (`https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js`)

## 1. Index.html Structure
Add this before the script tags:

```html
<!-- 3D Immersive Modal -->
<div id="immersive-modal" class="fixed inset-0 bg-[#050505] hidden z-[200] perspective-[1000px] overflow-hidden">
    <!-- Close Button -->
    <button id="close-3d-btn"
        class="absolute top-6 right-6 text-white/50 hover:text-[#facc15] transition-colors z-[210] group">
        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
    </button>

    <!-- 3D Stage -->
    <div id="gallery-stage"
        class="absolute inset-0 w-full h-full preserve-3d transition-transform duration-100 ease-out will-change-transform">
        <!-- Cards injected via JS -->
    </div>

    <!-- Controls (Optional) -->
    <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-4 z-[210]">
        <button id="mode-scatter"
            class="text-xs text-[#facc15] border border-[#facc15]/30 px-4 py-1 rounded-full bg-black/50 hover:bg-[#facc15]/20 transition-all">SCATTER</button>
        <button id="mode-grid"
            class="text-xs text-white/50 border border-white/10 px-4 py-1 rounded-full bg-black/50 hover:bg-white/10 transition-all">GRID</button>
    </div>
</div>

<!-- GSAP for 3D Physics -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
```

Add this Trigger Button in the Hero Section:
```html
<button onclick="openImmersiveView()"
    class="mt-6 md:mt-0 md:ml-4 bg-[#facc15]/90 text-black font-bold py-3 px-8 rounded-full text-lg shadow-[0_0_15px_rgba(250,204,21,0.5)] hover:bg-[#facc15] hover:shadow-[0_0_25px_rgba(250,204,21,0.8)] transition-all duration-300 backdrop-blur-sm border border-yellow-300/30">
    ENTER 3D VIEW
</button>
```

## 2. Main.js Implementation

```javascript
/* =========================================
   3D Immersive View Logic (v15 True 3D & Modes)
   ========================================= */
let is3DActive = false;
let galleryCards = [];
let currentMode = 'scatter'; // 'scatter' | 'grid'
let stageTimeline = null; // For stage animations

// Helper: Random
const random = (min, max) => Math.random() * (max - min) + min;

// Helper: Inject 3D CSS
const init3DStyles = () => {
    if (document.getElementById('immersive-css')) return;
    const style = document.createElement('style');
    style.id = 'immersive-css';
    style.innerHTML = `
        /* True 3D Structure */
        .card-wrapper-3d {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 12rem; /* 48 */
            height: 16rem; /* 64 */
            transform-style: preserve-3d;
            cursor: pointer;
            will-change: transform;
        }
        @media (min-width: 768px) {
            .card-wrapper-3d { width: 16rem; height: 20rem; } /* 64 / 80 */
        }
        
        .card-face {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            backface-visibility: hidden; /* Hide back when facing away */
            border-radius: 0.5rem;
            overflow: hidden;
        }
        
        .card-face.front {
            z-index: 2;
            background: #111;
        }
        
        .card-face.back {
            transform: rotateY(180deg);
            z-index: 1;
            background: #111;
            /* Mirror the image on the back so it looks correct when rotated */
            /* transform: rotateY(180deg) scaleX(-1); -> Actually just rotateY(180) is enough for "back of card" feel */
        }

        /* Floating Animation (Keyframes) - Subtle vertical drift */
        @keyframes float-anim-v15 {
            0%, 100% { transform: translateY(0px) rotateZ(0deg); }
            33% { transform: translateY(-15px) rotateZ(1deg); }
            66% { transform: translateY(10px) rotateZ(-1deg); }
        }
        .floating-card-body {
            animation: float-anim-v15 6s ease-in-out infinite;
        }
    `;
    document.head.appendChild(style);
};

window.openImmersiveView = () => {
    const modal = document.getElementById('immersive-modal');
    const stage = document.getElementById('gallery-stage');
    if (!modal || !stage || !window.gsap) return;

    init3DStyles();

    // Check DOM elements for buttons
    const btnScatter = document.getElementById('mode-scatter');
    const btnGrid = document.getElementById('mode-grid');

    // Reset State
    stage.innerHTML = '';
    is3DActive = true;
    currentMode = 'scatter';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Lock scroll

    // Reset Stage Transform
    gsap.set(stage, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, scale: 1 });

    // --- 1. Photo Selection (Same Logic) ---
    const pool = [];
    if (window.globalPhotoData) {
        Object.keys(window.globalPhotoData).forEach(category => {
            const photos = window.globalPhotoData[category].map(p => ({ ...p, category }));
            pool.push(...photos);
        });
    }
    
    let selectedPhotos = [];
    const seenPrefixes = new Set();
    const distinctPool = [];

    pool.sort(() => 0.5 - Math.random());

    for (const photo of pool) {
        const prefix = photo.filename.substring(0, 4);
        if (!seenPrefixes.has(prefix)) {
            seenPrefixes.add(prefix);
            distinctPool.push(photo);
        }
        if (distinctPool.length >= 12) break;
    }

    if (distinctPool.length < 12) {
        const remaining = pool.filter(p => !distinctPool.includes(p));
        distinctPool.push(...remaining.slice(0, 12 - distinctPool.length));
    }

    selectedPhotos = distinctPool.slice(0, 12);

    // --- 2. Generate Cards (True 3D) ---
    selectedPhotos.forEach((photo, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper-3d group';
        // We use a wrapper for 3D positioning, and inner faces for content
        
        // Random Scatter Config
        const scatterX = random(-40, 40) * (window.innerWidth / 100);
        const scatterY = random(-35, 35) * (window.innerHeight / 100);
        const scatterZ = random(-800, 200);
        const scatterRotX = random(-15, 15);
        const scatterRotY = random(-25, 25); // More rotation for 3D feel
        const scatterRotZ = random(-10, 10);

        // Store Data
        wrapper.dataset.index = index;
        wrapper.dataset.scatterX = scatterX;
        wrapper.dataset.scatterY = scatterY;
        wrapper.dataset.scatterZ = scatterZ;
        wrapper.dataset.scatterRotX = scatterRotX;
        wrapper.dataset.scatterRotY = scatterRotY;
        wrapper.dataset.scatterRotZ = scatterRotZ;

        const src = `./public/photos/${encodeURIComponent(photo.category)}/${encodeURIComponent(photo.filename)}`;

        // Inner HTML: Front + Back
        // Note: We use an inner 'body' for floating animation to separate it from Layout transforms
        wrapper.innerHTML = `
            <div class="w-full h-full relative preserve-3d floating-card-body" style="animation-duration: ${random(4, 8)}s; animation-delay: -${random(0, 5)}s;">
                <!-- FRONT -->
                <div class="card-face front border border-white/10 shadow-2xl transition-all duration-300 group-hover:border-[#facc15]/50 group-hover:shadow-[0_0_30px_rgba(250,204,21,0.4)]">
                    <img src="${src}" class="w-full h-full object-cover" loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                        <p class="text-[#facc15] font-mono text-sm tracking-widest border-b border-[#facc15] pb-1">${photo.filename.split('.')[0]}</p>
                    </div>
                </div>
                <!-- BACK (Mirrored Image + Dark Overlay) -->
                <div class="card-face back border border-white/5 bg-gray-900">
                     <img src="${src}" class="w-full h-full object-cover opacity-30 transform scale-x-[-1]" loading="lazy">
                     <div class="absolute inset-0 flex items-center justify-center">
                        <p class="text-white/20 font-bold tracking-[0.2em] transform scale-x-[-1]">LCT STUDIO</p>
                     </div>
                </div>
            </div>
        `;

        // Interaction
        wrapper.onclick = (e) => {
            e.stopPropagation();
            focusCard(wrapper);
        };

        stage.appendChild(wrapper);
        galleryCards.push(wrapper);
    });

    // Apply Initial Layout (Scatter)
    layoutScatter(0); // 0 duration for instant setup

    // --- 3. Stage Controls (Drag & Zoom) ---
    initStageControls(stage);

    // --- 4. Button Events ---
    if (btnScatter) {
        btnScatter.onclick = (e) => {
            e.stopPropagation();
            if (currentMode === 'scatter') return;
            layoutScatter(1.2);
            highlightBtn(btnScatter, btnGrid);
        };
    }
    if (btnGrid) {
        btnGrid.onclick = (e) => {
            e.stopPropagation();
            if (currentMode === 'grid') return;
            layoutGrid(1.2);
            highlightBtn(btnGrid, btnScatter);
        };
    }
    // Init Button State
    highlightBtn(btnScatter, btnGrid);
};

// --- Layout: Scatter ---
const layoutScatter = (duration = 1) => {
    currentMode = 'scatter';
    galleryCards.forEach(card => {
        gsap.to(card, {
            x: card.dataset.scatterX,
            y: card.dataset.scatterY,
            z: card.dataset.scatterZ,
            rotationX: card.dataset.scatterRotX,
            rotationY: card.dataset.scatterRotY,
            rotationZ: card.dataset.scatterRotZ,
            scale: 1,
            duration: duration,
            ease: "power3.inOut"
        });
    });
};

// --- Layout: Grid ---
const layoutGrid = (duration = 1) => {
    currentMode = 'grid';
    // Grid Config: 4 cols x 3 rows
    const cols = 4;
    const spacingX = window.innerWidth < 768 ? 220 : 300; // px spacing
    const spacingY = window.innerWidth < 768 ? 300 : 380;
    
    // Calculate total grid size to center it
    const totalW = (cols - 1) * spacingX;
    const rows = Math.ceil(galleryCards.length / cols);
    const totalH = (rows - 1) * spacingY;

    const startX = -totalW / 2;
    const startY = -totalH / 2;

    galleryCards.forEach((card, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        const targetX = startX + col * spacingX;
        const targetY = startY + row * spacingY;

        gsap.to(card, {
            x: targetX,
            y: targetY,
            z: 0, // Flat on plane
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            scale: 1,
            duration: duration,
            ease: "power3.inOut",
            stagger: {
                amount: 0.3,
                grid: [rows, cols],
                from: "center"
            }
        });
    });
};

// --- Helper: Button Highlight ---
const highlightBtn = (active, inactive) => {
    if (active) {
        active.className = active.className.replace('text-white/50 border-white/10 bg-black/50', 'text-[#facc15] border-[#facc15]/30 bg-black/80');
        if (active.classList.contains('text-white/50')) active.classList.remove('text-white/50');
        active.classList.add('text-[#facc15]');
    }
    if (inactive) {
        inactive.className = inactive.className.replace('text-[#facc15] border-[#facc15]/30 bg-black/80', 'text-white/50 border-white/10 bg-black/50');
        inactive.classList.remove('text-[#facc15]');
        inactive.classList.add('text-white/50');
    }
};

// --- Stage Controls (Orbit) ---
// We use a clean approach: Move 'stage' transform based on drag
let stageRotX = 0;
let stageRotY = 0;
let stageZ = 0;

const initStageControls = (stage) => {
    let isDragging = false;
    let startX, startY;
    
    const onDown = (e) => {
        if (e.target.closest('button')) return; // Ignore buttons
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        document.body.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Update rotation target
        stageRotY += dx * 0.3; // Drag X rotates around Y axis
        stageRotX -= dy * 0.3; // Drag Y rotates around X axis

        gsap.to(stage, {
            rotationY: stageRotY,
            rotationX: stageRotX,
            duration: 0.5,
            ease: "power1.out",
            overwrite: "auto"
        });

        startX = e.clientX;
        startY = e.clientY;
    };

    const onUp = () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    };

    const onWheel = (e) => {
        // Zoom
        stageZ -= e.deltaY * 0.5;
        // Clamp Zoom? Maybe not strict, lets users fly through
        gsap.to(stage, {
            z: stageZ,
            duration: 0.5,
            ease: "power1.out",
            overwrite: "auto"
        });
    };

    // Events
    stage.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('wheel', onWheel);

    // Store cleanup for Close
    window.cleanupStageControls = () => {
        stage.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('wheel', onWheel);
    };
};

// --- Focus Logic (Updated for 3D) ---
let activeCard = null;

const focusCard = (card) => {
    if (!window.gsap) return;
    if (activeCard === card) {
        // Unfocus -> Return to current Layout
        if (currentMode === 'scatter') layoutScatter(0.8);
        else layoutGrid(0.8);
        activeCard = null;
        return;
    }
    
    activeCard = card;
    
    // Counter-rotate against the stage so the card faces screen flat
    // To make it face camera perfectly regardless of stage rotation:
    // rotationX = -stageRotX, rotationY = -stageRotY
    
    gsap.to(card, {
        x: -stageRotY * 2, // Slight parallax compensation (fake) - actually simpler to just center 0,0
        y: 0,
        z: 500 - stageZ, // Compensate stage Z so it is always close
        rotationX: -stageRotX, // Face camera
        rotationY: -stageRotY, // Face camera
        rotationZ: 0,
        scale: 1.5,
        duration: 1,
        ease: "elastic.out(1, 0.75)",
        zIndex: 9999
    });
};

// --- Close logic update ---
const close3DView = () => {
    const modal = document.getElementById('immersive-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    is3DActive = false;
    
    if (window.cleanupStageControls) window.cleanupStageControls();
    
    // Cleanup GSAP
    if (window.gsap) {
        galleryCards.forEach(c => gsap.killTweensOf(c));
        gsap.killTweensOf(document.getElementById('gallery-stage'));
    }
    galleryCards = [];
    stageRotX = 0; stageRotY = 0; stageZ = 0; // Reset
};

document.getElementById('close-3d-btn')?.addEventListener('click', close3DView);
// Handle Escape Key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && is3DActive) {
        if (activeCard) {
            // Unfocus active card
            if (currentMode === 'scatter') layoutScatter(0.8);
            else layoutGrid(0.8);
            activeCard = null;
        } else {
            close3DView();
        }
    }
});
```
