/**
 * 🐾 VN-Tracking 3D Virtual Pet Engine - Chibi Kawaii / Pop Mart Vinyl Edition
 * Dual Viewport: Outside Roaming Pet & Inside My Pet Menu
 * High-End Pop Mart Figurine Aesthetics:
 * - Proportional Chibi Cute Head & Squishy Pear Body
 * - Big Glossy Anime Eyes with Dual Starlight Reflections & Natural Blinking
 * - Chubby Baby Cheeks with Radiant Peach Blush & ':3' Snout
 * - Ultra-Premium Vinyl / Clearcoat Material (Zero Muddy Shadows, Studio Rim Glow)
 * - Bell Choker, Paws with Toe Pads, Curled/Fluffy Tail
 * - Smooth Physics-Based Squash & Stretch, Ear Wiggle, Head Tilts, DJ Neon Headphones
 */

window.Pet3DEngine = (function () {
    let petData = null;
    let currentSpecies = 'shiba';
    let is3DActive = true;
    let animationFrameId = null;
    let clock = null;

    // Synchronized Animation States
    let isDancing = false;
    let isEating = false;
    let isJumping = false;
    let jumpTime = 0;
    let eatProgress = 0;
    let blinkTimer = 0;
    let isBlinking = false;
    let blinkProgress = 0;
    let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Viewports: 1. Roaming (Outside bottom-right) & 2. Panel (Inside My Pet menu)
    let roaming = null;
    let panel = null;

    // Pop Mart Style Species Palette
    const SPECIES_CONFIG = {
        shiba: {
            bodyColor: 0xe0872c,      // Honey amber caramel
            bellyColor: 0xfff8ee,     // Soft cream milk
            noseColor: 0x271e1b,      // Shiny button nose
            earInner: 0xfcb7af,       // Pastel blush pink
            tailCurled: true,
            hasWings: false,
            hasHorns: false,
            collarColor: 0xef4444,    // Ruby red bandana
            foodColor: 0xffedd5,
            sound: 'Gâu gâu! 🐾',
            name_vi: 'Chó Shiba',
            emoji: '🐕'
        },
        neko: {
            bodyColor: 0xffffff,      // Pearl white mochi
            bellyColor: 0xfff5f7,     // Sakura milk
            earInner: 0xf472b6,       // Bubblegum pink
            noseColor: 0xf43f5e,      // Rose pink
            tailCurled: false,
            hasWings: false,
            hasHorns: false,
            collarColor: 0x8b5cf6,    // Lavender ribbon
            foodColor: 0x38bdf8,
            sound: 'Nya~ Meow! 🐾',
            name_vi: 'Mèo Neko',
            emoji: '🐈'
        },
        bunny: {
            bodyColor: 0xffffff,      // Snow marshmallow
            bellyColor: 0xfff1f2,
            earInner: 0xfb7185,       // Strawberry milk
            noseColor: 0xf43f5e,
            tailCurled: false,
            longEars: true,
            hasWings: false,
            hasHorns: false,
            collarColor: 0x10b981,    // Mint green ribbon
            foodColor: 0xf97316,
            sound: 'Pyon pyon~ 🥕',
            name_vi: 'Thỏ Bunny',
            emoji: '🐰'
        },
        fox: {
            bodyColor: 0xf97316,      // Vivid autumn orange
            bellyColor: 0xffffff,
            earInner: 0x334155,       // Charcoal tip
            noseColor: 0x0f172a,
            tailCurled: false,
            bushyTail: true,
            hasWings: false,
            hasHorns: false,
            collarColor: 0xec4899,
            foodColor: 0xa855f7,
            sound: 'Kon kon~ 🍂',
            name_vi: 'Cáo Kitsune',
            emoji: '🦊'
        },
        panda: {
            bodyColor: 0xffffff,      // Pure rice mochi
            bellyColor: 0xffffff,
            earInner: 0x18181b,       // Soft charcoal velvet
            noseColor: 0x18181b,
            eyePatch: true,
            tailCurled: false,
            hasWings: false,
            hasHorns: false,
            collarColor: 0x22c55e,    // Bamboo green ribbon
            foodColor: 0x22c55e,
            sound: 'Panda roll~ 🎋',
            name_vi: 'Gấu Trúc',
            emoji: '🐼'
        },
        dragon: {
            bodyColor: 0x38bdf8,      // Pastel sky cyan
            bellyColor: 0xfef08a,     // Warm custard yellow
            earInner: 0x7dd3fc,
            noseColor: 0x0284c7,
            tailCurled: false,
            hasWings: true,
            hasHorns: true,
            collarColor: 0x6366f1,    // Royal indigo ribbon
            foodColor: 0xf43f5e,
            sound: 'Grrr~ Phì phì! 💫',
            name_vi: 'Rồng Con',
            emoji: '🐲'
        }
    };

    function init(data) {
        petData = data || {};
        currentSpecies = petData.type && SPECIES_CONFIG[petData.type] ? petData.type : 'shiba';

        createDOM();
        initThree();
        setupListeners();
        buildPets(currentSpecies);
        checkErgonomicsTimer();

        if (window.radioState && window.radioState.is_playing && window.isListening) {
            setDancing(true);
        }
    }

    function createDOM() {
        document.querySelectorAll('img[src*="/static/img/pet/"], img[src*="2.gif"], img[src*="1.gif"]').forEach(img => img.remove());

        // 1. OUTSIDE ROAMING CONTAINER
        let roamingEl = document.getElementById('roaming-pet-container');
        if (!roamingEl) {
            roamingEl = document.createElement('div');
            roamingEl.id = 'roaming-pet-container';
            roamingEl.className = 'roaming-pet-3d-wrapper';
            document.body.appendChild(roamingEl);
        }
        roamingEl.innerHTML = `
            <div class="pet-3d-canvas-box">
                <canvas id="roaming-pet-canvas" width="160" height="170"></canvas>
            </div>
            <div id="pet-speech-bubble" class="pet-speech-bubble">
                <div id="pet-speech-tag" class="pet-speech-tag"></div>
                <div id="pet-speech-text" class="pet-speech-text"></div>
                <div id="pet-speech-actions" class="pet-speech-actions"></div>
            </div>
            <div class="pet-interaction-ring" title="Xoa đầu / Trò chuyện"></div>
        `;
        roamingEl.style.display = 'block';

        // 2. INSIDE PANEL CONTAINER
        let panelDisplay = document.getElementById('pet-display');
        if (panelDisplay) {
            const oldSprite = document.getElementById('pet-sprite-large');
            if (oldSprite) oldSprite.remove();

            let panelCanvasBox = document.getElementById('panel-pet-canvas-box');
            if (!panelCanvasBox) {
                panelCanvasBox = document.createElement('div');
                panelCanvasBox.id = 'panel-pet-canvas-box';
                panelCanvasBox.className = 'panel-pet-canvas-box';
                panelCanvasBox.innerHTML = `<canvas id="panel-pet-canvas" width="150" height="150"></canvas>`;
                panelDisplay.insertBefore(panelCanvasBox, panelDisplay.firstChild);
            }
        }
    }

    // High-End Pop Mart Vinyl / Figurine Material
    function createVinylMaterial(colorHex, roughness = 0.22, clearcoat = 0.85) {
        return new THREE.MeshPhysicalMaterial({
            color: colorHex,
            roughness: roughness,
            metalness: 0.04,
            clearcoat: clearcoat,
            clearcoatRoughness: 0.1,
            reflectivity: 0.8
        });
    }

    function createViewport(canvasId, width, height, cameraPos, cameraLookAt) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
        camera.lookAt(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z);

        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // POP MART STUDIO LIGHTING SETUP (Soft Pastel Glow, Zero Harsh Shadows)
        // 1. Soft Hemisphere Ambient: Sky pastel peach + Ground twilight indigo
        const hemiLight = new THREE.HemisphereLight(0xfff5ea, 0x312e81, 1.35);
        scene.add(hemiLight);

        // 2. Key Light (Crisp Warm Studio Light for vinyl glints)
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
        keyLight.position.set(3, 4, 3.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.bias = -0.001;
        scene.add(keyLight);

        // 3. Fill Light (Soft lavender-cyan fill for friendly shadows)
        const fillLight = new THREE.DirectionalLight(0xe0e7ff, 0.7);
        fillLight.position.set(-3, 1, 2);
        scene.add(fillLight);

        // 4. Rim Backlight (Ethereal studio edge glow like Pop Mart official 3D showcases)
        const rimLight = new THREE.DirectionalLight(0xc084fc, 1.25);
        rimLight.position.set(-2, 3, -3);
        scene.add(rimLight);

        const particleGroup = new THREE.Group();
        scene.add(particleGroup);

        return {
            canvas,
            scene,
            camera,
            renderer,
            particleGroup,
            particles: [],
            petGroup: null,
            headMesh: null,
            bodyMesh: null,
            tailMesh: null,
            leftEar: null,
            rightEar: null,
            leftEye: null,
            rightEye: null,
            leftWing: null,
            rightWing: null,
            headphonesMesh: null,
            foodMesh: null,
            bellMesh: null,
            width,
            height
        };
    }

    function initThree() {
        if (typeof THREE === 'undefined') {
            console.warn('[Pet3D] Three.js not found, fallback to 2D.');
            fallbackTo2D();
            return;
        }

        try {
            clock = new THREE.Clock();
            roaming = createViewport('roaming-pet-canvas', 160, 170, { x: 0, y: 0.95, z: 3.9 }, { x: 0, y: 0.52, z: 0 });
            panel = createViewport('panel-pet-canvas', 150, 150, { x: 0, y: 0.9, z: 3.85 }, { x: 0, y: 0.55, z: 0 });

            if (!animationFrameId) {
                animate();
            }
        } catch (err) {
            console.error('[Pet3D] WebGL init error:', err);
            fallbackTo2D();
        }
    }

    // ==========================================
    // 🎨 CHIBI KAWAII / POP MART MODEL GENERATOR
    // ==========================================
    function buildPetModel(species) {
        const cfg = SPECIES_CONFIG[species] || SPECIES_CONFIG['shiba'];
        const petGroup = new THREE.Group();
        petGroup.position.set(0, -0.05, 0);

        const bodyMat = createVinylMaterial(cfg.bodyColor, 0.2, 0.85);
        const bellyMat = createVinylMaterial(cfg.bellyColor, 0.18, 0.9);
        const noseMat = createVinylMaterial(cfg.noseColor, 0.08, 1.0); // Shiny button nose
        const earInnerMat = createVinylMaterial(cfg.earInner, 0.3, 0.5);
        const collarMat = createVinylMaterial(cfg.collarColor, 0.25, 0.8);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.15 });

        // 1. CHIBI BODY (Pear shape, squishy and chubby)
        const bodyGeo = new THREE.SphereGeometry(0.5, 32, 32);
        bodyGeo.scale(1.0, 0.92, 1.08);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.set(0, 0.42, 0);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        petGroup.add(bodyMesh);

        // Chubby Belly Patch
        const bellyGeo = new THREE.SphereGeometry(0.44, 24, 24);
        bellyGeo.scale(0.88, 0.84, 0.72);
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.position.set(0, 0.38, 0.26);
        petGroup.add(belly);

        // Cute Collar Choker with Golden Bell
        const collarGeo = new THREE.TorusGeometry(0.38, 0.045, 12, 28);
        const collar = new THREE.Mesh(collarGeo, collarMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(0, 0.72, 0.06);
        petGroup.add(collar);

        const bellGeo = new THREE.SphereGeometry(0.075, 16, 16);
        const bellMesh = new THREE.Mesh(bellGeo, goldMat);
        bellMesh.position.set(0, 0.68, 0.44);
        bellMesh.castShadow = true;
        petGroup.add(bellMesh);

        // 2. CHIBI HEAD (Big, round, with squishy baby cheeks)
        const headMesh = new THREE.Group();
        headMesh.position.set(0, 0.96, 0.12);

        // Head Base (slightly wider than tall for maximum cuteness)
        const headGeo = new THREE.SphereGeometry(0.56, 32, 32);
        headGeo.scale(1.12, 0.96, 1.05);
        const headMain = new THREE.Mesh(headGeo, bodyMat);
        headMain.castShadow = true;
        headMesh.add(headMain);

        // Squishy Chubby Cheeks (Mochi effect)
        [-0.28, 0.28].forEach((x) => {
            const cheekGeo = new THREE.SphereGeometry(0.26, 20, 20);
            cheekGeo.scale(1.05, 0.85, 0.85);
            const cheek = new THREE.Mesh(cheekGeo, bellyMat);
            cheek.position.set(x, -0.09, 0.24);
            headMesh.add(cheek);
        });

        // Cute Snout ':3' muzzle
        const snoutGeo = new THREE.SphereGeometry(0.19, 20, 20);
        snoutGeo.scale(1.0, 0.72, 0.8);
        const snout = new THREE.Mesh(snoutGeo, bellyMat);
        snout.position.set(0, -0.06, 0.42);
        headMesh.add(snout);

        // Tiny Shiny Button Nose
        const noseGeo = new THREE.SphereGeometry(0.052, 14, 14);
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0.01, 0.54);
        headMesh.add(nose);

        // 3. GLOSSY ANIME EYES (Expressive, dark obsidian with dual starlight reflections)
        const eyeMat = new THREE.MeshPhysicalMaterial({
            color: 0x111827,
            roughness: 0.02,
            clearcoat: 1.0,
            clearcoatRoughness: 0.02
        });
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        let leftEye = null;
        let rightEye = null;

        [-0.22, 0.22].forEach((x, idx) => {
            const eyeGroup = new THREE.Group();
            eyeGroup.position.set(x, 0.06, 0.45);

            // Panda eye patch
            if (cfg.eyePatch) {
                const patchGeo = new THREE.SphereGeometry(0.15, 16, 16);
                patchGeo.scale(1.0, 1.25, 0.35);
                const patch = new THREE.Mesh(patchGeo, noseMat);
                patch.position.set(0, 0, -0.04);
                patch.rotation.z = x > 0 ? -0.25 : 0.25;
                eyeGroup.add(patch);
            }

            // Big expressive eyeball
            const eyeGeo = new THREE.SphereGeometry(0.095, 20, 20);
            eyeGeo.scale(1.0, 1.18, 0.4);
            const eyeBall = new THREE.Mesh(eyeGeo, eyeMat);
            eyeGroup.add(eyeBall);

            // Major Sparkle Highlight (Top Right)
            const star1Geo = new THREE.SphereGeometry(0.032, 12, 12);
            const star1 = new THREE.Mesh(star1Geo, starMat);
            star1.position.set(x > 0 ? 0.025 : -0.01, 0.04, 0.04);
            eyeGroup.add(star1);

            // Minor Secondary Reflection (Bottom Left)
            const star2Geo = new THREE.SphereGeometry(0.016, 10, 10);
            const star2 = new THREE.Mesh(star2Geo, starMat);
            star2.position.set(x > 0 ? -0.03 : 0.02, -0.035, 0.04);
            eyeGroup.add(star2);

            headMesh.add(eyeGroup);
            if (idx === 0) leftEye = eyeGroup;
            else rightEye = eyeGroup;
        });

        // Radiant Pastel Peach Blush
        [-0.34, 0.34].forEach((x) => {
            const blushGeo = new THREE.CircleGeometry(0.08, 16);
            const blushMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.55 });
            const blush = new THREE.Mesh(blushGeo, blushMat);
            blush.position.set(x, -0.06, 0.42);
            blush.rotation.y = x > 0 ? 0.45 : -0.45;
            headMesh.add(blush);
        });

        // 4. CUTE ANIME EARS
        let leftEar = null;
        let rightEar = null;

        if (cfg.longEars) {
            // Bunny floppy kawaii ears
            [-0.18, 0.18].forEach((x, idx) => {
                const earGeo = new THREE.CylinderGeometry(0.09, 0.05, 0.68, 16);
                earGeo.scale(0.85, 1.0, 0.4);
                const ear = new THREE.Mesh(earGeo, bodyMat);
                ear.position.set(x, 0.68, -0.05);
                ear.rotation.z = x > 0 ? -0.18 : 0.18;
                headMesh.add(ear);

                const innerEarGeo = new THREE.CylinderGeometry(0.06, 0.03, 0.56, 12);
                innerEarGeo.scale(0.75, 1.0, 0.2);
                const inner = new THREE.Mesh(innerEarGeo, earInnerMat);
                inner.position.set(x, 0.68, -0.02);
                inner.rotation.z = x > 0 ? -0.18 : 0.18;
                headMesh.add(inner);

                if (idx === 0) leftEar = ear;
                else rightEar = ear;
            });
        } else {
            [-0.3, 0.3].forEach((x, idx) => {
                const isPanda = species === 'panda';
                const earGeo = isPanda ? new THREE.SphereGeometry(0.15, 16, 16) : new THREE.ConeGeometry(0.19, 0.32, 14);
                const ear = new THREE.Mesh(earGeo, isPanda ? noseMat : bodyMat);
                ear.position.set(x, 0.45, 0.05);
                ear.rotation.z = isPanda ? 0 : (x > 0 ? -0.42 : 0.42);
                ear.rotation.x = -0.12;
                headMesh.add(ear);

                if (!isPanda) {
                    const innerGeo = new THREE.ConeGeometry(0.12, 0.24, 10);
                    const inner = new THREE.Mesh(innerGeo, earInnerMat);
                    inner.position.set(x, 0.45, 0.09);
                    inner.rotation.z = x > 0 ? -0.42 : 0.42;
                    inner.rotation.x = -0.09;
                    headMesh.add(inner);
                }

                if (idx === 0) leftEar = ear;
                else rightEar = ear;
            });
        }

        // Dragon Horns
        if (cfg.hasHorns) {
            [-0.22, 0.22].forEach((x) => {
                const hornGeo = new THREE.ConeGeometry(0.08, 0.38, 12);
                const horn = new THREE.Mesh(hornGeo, goldMat);
                horn.position.set(x, 0.48, -0.05);
                horn.rotation.z = x > 0 ? -0.32 : 0.32;
                horn.rotation.x = -0.22;
                headMesh.add(horn);
            });
        }

        // 5. 3D DJ HEADPHONES (Pop Mart Neon Edition)
        const headphonesMesh = new THREE.Group();
        const hpMat = createVinylMaterial(0x6366f1, 0.15, 1.0);
        const bandGeo = new THREE.TorusGeometry(0.5, 0.05, 10, 24, Math.PI);
        const band = new THREE.Mesh(bandGeo, hpMat);
        band.rotation.x = -Math.PI / 2;
        band.rotation.z = Math.PI / 2;
        band.position.set(0, 0.25, 0);
        headphonesMesh.add(band);

        [-0.5, 0.5].forEach((x) => {
            const cupGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.11, 18);
            cupGeo.rotateZ(Math.PI / 2);
            const cup = new THREE.Mesh(cupGeo, hpMat);
            cup.position.set(x, 0.25, 0);

            const ringGeo = new THREE.RingGeometry(0.07, 0.13, 18);
            ringGeo.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x + (x > 0 ? 0.06 : -0.06), 0.25, 0);
            headphonesMesh.add(cup);
            headphonesMesh.add(ring);
        });

        headphonesMesh.visible = isDancing;
        headMesh.add(headphonesMesh);
        petGroup.add(headMesh);

        // 6. CHIBI PAWS WITH PINK TOE PADS
        const pawMat = species === 'panda' ? noseMat : bellyMat;
        const padMat = createVinylMaterial(0xf472b6, 0.3, 0.5);

        [
            [-0.26, 0.12, 0.36],
            [0.26, 0.12, 0.36],
            [-0.32, 0.09, -0.2],
            [0.32, 0.09, -0.2]
        ].forEach((pos, idx) => {
            const pawGroup = new THREE.Group();
            pawGroup.position.set(...pos);

            const pawGeo = new THREE.SphereGeometry(0.14, 16, 16);
            pawGeo.scale(1.0, 0.72, 1.25);
            const paw = new THREE.Mesh(pawGeo, pawMat);
            paw.castShadow = true;
            pawGroup.add(paw);

            // Cute Paw Pad on front feet
            if (idx < 2) {
                const padGeo = new THREE.SphereGeometry(0.05, 10, 10);
                padGeo.scale(1.0, 0.5, 1.2);
                const pad = new THREE.Mesh(padGeo, padMat);
                pad.position.set(0, 0.08, 0.06);
                pawGroup.add(pad);
            }

            petGroup.add(pawGroup);
        });

        // 7. CUTE ANIMATED TAIL
        let tailMesh = null;
        if (cfg.tailCurled) {
            // Shiba Curled Donut Tail
            const tailGeo = new THREE.TorusGeometry(0.16, 0.085, 12, 20, Math.PI * 1.45);
            tailMesh = new THREE.Mesh(tailGeo, bodyMat);
            tailMesh.position.set(0, 0.52, -0.48);
            tailMesh.rotation.x = Math.PI / 2.2;
            petGroup.add(tailMesh);
        } else if (cfg.bushyTail) {
            // Fox Fluffy Dual-Tone Tail
            const tailGroup = new THREE.Group();
            tailGroup.position.set(0, 0.48, -0.6);
            tailGroup.rotation.x = -Math.PI / 3;

            const tailGeo = new THREE.ConeGeometry(0.25, 0.68, 16);
            const tailMain = new THREE.Mesh(tailGeo, bodyMat);
            tailGroup.add(tailMain);

            const tipGeo = new THREE.ConeGeometry(0.14, 0.28, 12);
            const tip = new THREE.Mesh(tipGeo, bellyMat);
            tip.position.set(0, 0.2, 0);
            tailGroup.add(tip);

            tailMesh = tailGroup;
            petGroup.add(tailGroup);
        } else {
            // Cat / Bunny / Dragon Tail
            const isBunny = species === 'bunny';
            const tailGeo = isBunny ? new THREE.SphereGeometry(0.12, 16, 16) : new THREE.CylinderGeometry(0.05, 0.09, 0.48, 12);
            tailMesh = new THREE.Mesh(tailGeo, bodyMat);
            tailMesh.position.set(0, isBunny ? 0.38 : 0.36, -0.48);
            if (!isBunny) tailMesh.rotation.x = -Math.PI / 3.8;
            petGroup.add(tailMesh);
        }

        // 8. DRAGON WINGS
        let leftWing = null;
        let rightWing = null;
        if (cfg.hasWings) {
            leftWing = createWingMesh(true, bodyMat);
            rightWing = createWingMesh(false, bodyMat);
            leftWing.position.set(-0.35, 0.62, -0.15);
            rightWing.position.set(0.35, 0.62, -0.15);
            petGroup.add(leftWing);
            petGroup.add(rightWing);
        }

        return {
            petGroup,
            headMesh,
            bodyMesh,
            tailMesh,
            leftEar,
            rightEar,
            leftEye,
            rightEye,
            leftWing,
            rightWing,
            headphonesMesh,
            bellMesh
        };
    }

    function createWingMesh(isLeft, mat) {
        const wingGroup = new THREE.Group();
        const wingGeo = new THREE.ConeGeometry(0.26, 0.52, 6);
        wingGeo.scale(1, 0.16, 0.8);
        const wing = new THREE.Mesh(wingGeo, mat);
        wing.rotation.z = isLeft ? Math.PI / 3 : -Math.PI / 3;
        wing.rotation.y = isLeft ? 0.3 : -0.3;
        wingGroup.add(wing);
        return wingGroup;
    }

    function buildPetForViewport(vp, species) {
        if (!vp || !vp.scene) return;
        if (vp.petGroup) {
            vp.scene.remove(vp.petGroup);
            disposeHierarchy(vp.petGroup);
        }

        const model = buildPetModel(species);
        vp.petGroup = model.petGroup;
        vp.headMesh = model.headMesh;
        vp.bodyMesh = model.bodyMesh;
        vp.tailMesh = model.tailMesh;
        vp.leftEar = model.leftEar;
        vp.rightEar = model.rightEar;
        vp.leftEye = model.leftEye;
        vp.rightEye = model.rightEye;
        vp.leftWing = model.leftWing;
        vp.rightWing = model.rightWing;
        vp.headphonesMesh = model.headphonesMesh;
        vp.bellMesh = model.bellMesh;

        vp.scene.add(vp.petGroup);
    }

    function buildPets(species) {
        currentSpecies = species;
        buildPetForViewport(roaming, species);
        buildPetForViewport(panel, species);
    }

    function setDancing(active) {
        isDancing = active;
        [roaming, panel].forEach(vp => {
            if (vp && vp.headphonesMesh) {
                vp.headphonesMesh.visible = active;
            }
        });
        if (active) {
            spawnParticles('note', 4);
        }
    }

    function poke() {
        if (isJumping) return;
        isJumping = true;
        jumpTime = 0;
        spawnParticles('heart', 4);

        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        showBubble(cfg.sound, '🐾 Cưng nựng', 3000);

        if (window.triggerPetBrief) {
            window.triggerPetBrief();
        }
    }

    function feed() {
        if (isEating) return;
        isEating = true;
        eatProgress = 0;
        spawnParticles('star', 6);

        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];

        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene) return;
            const foodMat = createVinylMaterial(cfg.foodColor, 0.15, 0.9);
            const foodGeo = new THREE.DodecahedronGeometry(0.18);
            vp.foodMesh = new THREE.Mesh(foodGeo, foodMat);
            vp.foodMesh.position.set(0, 1.85, 0.4);
            vp.scene.add(vp.foodMesh);
        });

        showBubble(`Ngon quá! +10 XP 🎉`, '🍖 Đang ăn...', 3000);
    }

    function spawnParticles(type, count) {
        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene || !vp.particleGroup) return;

            for (let i = 0; i < count; i++) {
                const canvasP = document.createElement('canvas');
                canvasP.width = 64;
                canvasP.height = 64;
                const ctx = canvasP.getContext('2d');
                ctx.font = '40px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let icon = '❤️';
                if (type === 'note') icon = ['🎵', '🎶', '🎧'][Math.floor(Math.random() * 3)];
                else if (type === 'star') icon = '⭐';
                else if (type === 'zzz') icon = '💤';

                ctx.fillText(icon, 32, 32);

                const texture = new THREE.CanvasTexture(canvasP);
                const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1.0 });
                const sprite = new THREE.Sprite(spriteMat);
                sprite.scale.set(0.35, 0.35, 1);
                sprite.position.set(
                    (Math.random() - 0.5) * 0.8,
                    0.9 + Math.random() * 0.4,
                    0.2 + (Math.random() - 0.5) * 0.3
                );

                vp.particleGroup.add(sprite);
                vp.particles.push({
                    mesh: sprite,
                    vy: 0.015 + Math.random() * 0.012,
                    vx: (Math.random() - 0.5) * 0.008,
                    life: 1.0
                });
            }
        });
    }

    function updateParticlesFor(vp) {
        if (!vp) return;
        for (let i = vp.particles.length - 1; i >= 0; i--) {
            const p = vp.particles[i];
            p.mesh.position.y += p.vy;
            p.mesh.position.x += p.vx;
            p.life -= 0.02;
            p.mesh.material.opacity = p.life;

            if (p.life <= 0) {
                vp.particleGroup.remove(p.mesh);
                p.mesh.material.dispose();
                p.mesh.material.map.dispose();
                vp.particles.splice(i, 1);
            }
        }
    }

    function updateViewportAnimation(vp, time, delta) {
        if (!vp || !vp.petGroup || !vp.canvas || vp.canvas.offsetParent === null) return;

        // 1. Natural LookAt Cursor with Soft Head Tilt
        const targetRotY = (mousePos.x / window.innerWidth - 0.5) * 0.65;
        const targetRotX = (mousePos.y / window.innerHeight - 0.5) * 0.28;
        const targetTiltZ = -(mousePos.x / window.innerWidth - 0.5) * 0.15; // Inquisitive head tilt

        if (vp.headMesh) {
            vp.headMesh.rotation.y += (targetRotY - vp.headMesh.rotation.y) * 0.09;
            vp.headMesh.rotation.x += (targetRotX - vp.headMesh.rotation.x) * 0.09;
            vp.headMesh.rotation.z += (targetTiltZ - vp.headMesh.rotation.z) * 0.09;
        }

        // 2. Natural Blinking Animation
        let eyeScaleY = 1.0;
        if (isBlinking) {
            blinkProgress += delta * 12.0;
            if (blinkProgress >= Math.PI) {
                isBlinking = false;
                eyeScaleY = 1.0;
            } else {
                eyeScaleY = Math.max(0.08, 1.0 - Math.sin(blinkProgress) * 0.92);
            }
        }
        if (vp.leftEye && vp.rightEye) {
            vp.leftEye.scale.y = eyeScaleY;
            vp.rightEye.scale.y = eyeScaleY;
        }

        // 3. Squash & Stretch Breathing
        const breath = Math.sin(time * 2.6) * 0.035;
        if (vp.bodyMesh) {
            vp.bodyMesh.scale.set(1.0 + breath * 0.4, 0.92 + breath, 1.08 - breath * 0.3);
        }

        // 4. Ear Wiggles & Tail Wag
        if (vp.leftEar && vp.rightEar) {
            const earWiggle = Math.sin(time * 3.5) * 0.05;
            vp.leftEar.rotation.z = (vp.leftEar.rotation.z || 0) + earWiggle * 0.05;
            vp.rightEar.rotation.z = (vp.rightEar.rotation.z || 0) - earWiggle * 0.05;
        }

        if (vp.tailMesh) {
            vp.tailMesh.rotation.z = Math.sin(time * 5.2) * 0.28;
        }

        if (vp.bellMesh) {
            vp.bellMesh.rotation.z = Math.sin(time * 4.0) * 0.15;
        }

        if (vp.leftWing && vp.rightWing) {
            vp.leftWing.rotation.z = Math.PI / 3 + Math.sin(time * 4.5) * 0.25;
            vp.rightWing.rotation.z = -Math.PI / 3 - Math.sin(time * 4.5) * 0.25;
        }

        // 5. Jump Animation with Squash & Stretch
        if (isJumping) {
            const jumpArc = Math.sin(jumpTime * Math.PI);
            vp.petGroup.position.y = -0.05 + jumpArc * 0.52;
            vp.petGroup.rotation.y += 0.22;
            // Stretch while rising, squash while landing
            const stretch = (jumpTime < 0.5 ? 1.15 : 0.88);
            vp.petGroup.scale.set(1 / stretch, stretch, 1 / stretch);
        } else if (!isDancing) {
            vp.petGroup.position.y = -0.05;
            vp.petGroup.rotation.y = 0;
            vp.petGroup.scale.set(1, 1, 1);
        }

        // 6. Food Physics
        if (isEating && vp.foodMesh) {
            vp.foodMesh.position.y -= 0.038;
            vp.foodMesh.rotation.x += 0.08;
            vp.foodMesh.rotation.y += 0.08;

            if (vp.headMesh) {
                vp.headMesh.rotation.x = -0.22;
            }

            if (vp.foodMesh.position.y <= 0.82) {
                vp.scene.remove(vp.foodMesh);
                vp.foodMesh.geometry.dispose();
                vp.foodMesh.material.dispose();
                vp.foodMesh = null;
            }
        }

        // 7. DJ Dancing Animation
        if (isDancing && !isJumping) {
            const beat = time * 8.5;
            vp.petGroup.position.y = -0.05 + Math.abs(Math.sin(beat)) * 0.14;
            vp.petGroup.rotation.z = Math.sin(beat * 0.5) * 0.14;
            if (vp.headMesh) {
                vp.headMesh.rotation.z = -Math.sin(beat * 0.5) * 0.18;
            }

            if (Math.random() < 0.02) {
                spawnParticles('note', 1);
            }
        }

        updateParticlesFor(vp);
        vp.renderer.render(vp.scene, vp.camera);
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        if (!clock) return;

        const delta = clock.getDelta();
        const time = clock.getElapsedTime();

        // Check blink timer (every ~3.5 seconds)
        blinkTimer += delta;
        if (blinkTimer >= 3.6) {
            blinkTimer = Math.random() * 0.8; // randomize next blink interval
            isBlinking = true;
            blinkProgress = 0;
        }

        // Global jump time
        if (isJumping) {
            jumpTime += 0.075;
            if (jumpTime >= 1.0) {
                isJumping = false;
            }
        }

        // Global eating progress
        if (isEating) {
            eatProgress += 0.038;
            if (eatProgress >= 1.0) {
                isEating = false;
                spawnParticles('star', 4);
            }
        }

        // Render both viewports (Outside & Inside Panel)
        updateViewportAnimation(roaming, time, delta);
        updateViewportAnimation(panel, time, delta);
    }

    function setupListeners() {
        window.addEventListener('mousemove', (e) => {
            mousePos.x = e.clientX;
            mousePos.y = e.clientY;
        });

        // Click outside roaming pet
        const roamingCanvas = document.getElementById('roaming-pet-canvas');
        if (roamingCanvas) {
            roamingCanvas.addEventListener('click', (e) => {
                e.stopPropagation();
                poke();
            });
        }
        const roamingEl = document.getElementById('roaming-pet-container');
        if (roamingEl) {
            roamingEl.addEventListener('click', (e) => {
                if (e.target.closest('.pet-speech-btn') || e.target.closest('.pet-speech-bubble')) return;
                poke();
            });
        }

        // Click inside panel pet
        const panelCanvas = document.getElementById('panel-pet-canvas');
        if (panelCanvas) {
            panelCanvas.addEventListener('click', (e) => {
                e.stopPropagation();
                poke();
            });
        }
        const petDisplay = document.getElementById('pet-display');
        if (petDisplay) {
            petDisplay.addEventListener('click', (e) => {
                if (e.target.closest('.pet-stage-badge')) return;
                poke();
            });
        }
    }

    function checkErgonomicsTimer() {
        setInterval(() => {
            const lang = typeof CURRENT_LANG !== 'undefined' ? CURRENT_LANG : 'vi';
            const msg = lang === 'ja' ? 'お水を一口飲んで、少し休憩しましょう！💧' : 'Bạn ơi, uống một ngụm nước và chớp mắt thư giãn 1 chút nhé! 💧';
            showBubble(msg, '💧 Sức khỏe', 8000);
        }, 45 * 60 * 1000);
    }

    function showBubble(text, tag, duration = 8000) {
        const bubble = document.getElementById('pet-speech-bubble');
        const textEl = document.getElementById('pet-speech-text');
        const tagEl = document.getElementById('pet-speech-tag');
        if (!bubble || !textEl) return;

        textEl.innerHTML = text;
        if (tagEl) {
            tagEl.textContent = tag || '';
            tagEl.style.display = tag ? 'inline-block' : 'none';
        }

        bubble.classList.add('active');
        clearTimeout(bubble._hideTimer);
        bubble._hideTimer = setTimeout(() => {
            bubble.classList.remove('active');
        }, duration);
    }

    function switchSpecies(newSpecies) {
        if (!SPECIES_CONFIG[newSpecies]) return;
        currentSpecies = newSpecies;
        buildPets(newSpecies);
        showBubble(`Tada! Mình là ${SPECIES_CONFIG[newSpecies].name_vi} đây! ✨`, '🔄 Đổi thú cưng', 4000);
    }

    function fallbackTo2D() {
        is3DActive = false;
        const panelBox = document.getElementById('panel-pet-canvas-box');
        if (panelBox) {
            const emoji = SPECIES_CONFIG[currentSpecies] ? SPECIES_CONFIG[currentSpecies].emoji : '🐾';
            panelBox.innerHTML = `<div style="font-size: 76px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));">${emoji}</div>`;
        }
    }

    function disposeHierarchy(obj) {
        obj.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose());
                } else if (child.material) {
                    child.material.dispose();
                }
            }
        });
    }

    function onPanelShow() {
        if (panel && panel.renderer && panel.canvas) {
            panel.renderer.setSize(150, 150);
        }
    }

    const api = {
        init: init,
        syncPet: function (data) {
            petData = data || {};
            const species = petData.type || 'shiba';
            if (species !== currentSpecies) {
                switchSpecies(species);
            }
        },
        feed: feed,
        poke: poke,
        setDancing: setDancing,
        switchSpecies: switchSpecies,
        showBubble: showBubble,
        onPanelShow: onPanelShow,
        destroy: function () {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (roaming && roaming.renderer) roaming.renderer.dispose();
            if (panel && panel.renderer) panel.renderer.dispose();
        }
    };

    window.PetRoamEngine = api;
    window.Pet3DEngine = api;
    window.triggerPetFeedAnimation = function () {
        api.feed();
    };

    return api;
})();
