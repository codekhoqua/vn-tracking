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

    // Stylized Cartoon Pet Palette (Matching Reference Puppy & Kitten Figurines)
    const SPECIES_CONFIG = {
        shiba: {
            bodyColor: 0xdf8435,      // Warm golden honey caramel
            bellyColor: 0xfef4e2,     // Warm ivory cream underbelly & legs
            patchColor: 0x5c3217,     // Dark chocolate saddle on back + eye patch
            hasSaddle: true,
            hasBlaze: true,           // White blaze down forehead & snout
            eyePatch: true,
            eyePatchSide: 'left',     // Patch over left eye (like in photo!)
            floppyEars: true,         // Drooping floppy ears
            collarColor: 0xdc2626,    // Red collar ribbon
            tagType: 'bone',          // Golden bone tag!
            foodColor: 0xffedd5,
            sound: 'Gâu gâu! 🐾',
            name_vi: 'Cún Cưng',
            emoji: '🐶'
        },
        neko: {
            bodyColor: 0xdf8435,      // Warm caramel ginger coat
            bellyColor: 0xfef4e2,     // Cream muzzle, chest, legs
            patchColor: 0x6d4127,     // Chocolate tabby stripes & eye patch
            tabbyStripes: true,       // 3 back stripes & 3 forehead stripes
            eyePatch: true,
            eyePatchSide: 'right',    // Patch over right eye (like in photo!)
            whiskers: true,           // Cheek whiskers
            openMouth: true,          // Happy open mouth ':D' with pink tongue!
            earInner: 0xf29879,       // Soft coral peach inner ear
            collarColor: 0xdc2626,    // Red collar ribbon
            tagType: 'bell',          // Golden bell tag!
            isCat: true,              // Upright triangular ears, slender striped tail
            foodColor: 0x38bdf8,
            sound: 'Nya~ Meow! 🐾',
            name_vi: 'Mèo Neko',
            emoji: '🐱'
        },
        bunny: {
            bodyColor: 0xfdf4f5,      // Soft cream marshmallow
            bellyColor: 0xffffff,
            earInner: 0xf472b6,       // Strawberry pink
            longEars: true,           // Long soft floppy ears
            isBunny: true,            // Cotton ball tail
            collarColor: 0x10b981,    // Emerald choker
            tagType: 'bell',
            foodColor: 0xf97316,
            sound: 'Pyon pyon~ 🥕',
            name_vi: 'Thỏ Bunny',
            emoji: '🐰'
        },
        fox: {
            bodyColor: 0xf97316,      // Vivid autumn orange
            bellyColor: 0xfff7ed,     // Warm cream
            patchColor: 0x1e293b,     // Black sock paws & ear tips
            sockPaws: true,
            collarColor: 0xec4899,
            tagType: 'bell',
            foodColor: 0xa855f7,
            sound: 'Kon kon~ 🍂',
            name_vi: 'Cáo Kitsune',
            emoji: '🦊'
        },
        panda: {
            bodyColor: 0xf8fafc,      // Pure rice mochi white
            bellyColor: 0x18181b,     // Charcoal velvet limbs & patches
            patchColor: 0x18181b,
            hasSaddle: true,
            eyePatch: true,
            collarColor: 0x22c55e,    // Bamboo green
            tagType: 'bell',
            foodColor: 0x22c55e,
            sound: 'Panda roll~ 🎋',
            name_vi: 'Gấu Trúc',
            emoji: '🐼'
        },
        dragon: {
            bodyColor: 0x06b6d4,      // Electric pastel cyan
            bellyColor: 0xfef08a,     // Warm custard yellow
            earInner: 0x38bdf8,
            hasWings: true,
            hasHorns: true,
            collarColor: 0x6366f1,    // Royal indigo
            tagType: 'bell',
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

    // Stylized Soft Clay Material (Velvety Cartoon Toy - Zero Harsh Glare)
    function createClayMaterial(colorHex, roughness = 0.45, metalness = 0.02) {
        return new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: roughness,
            metalness: metalness
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
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        if (THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // SOFT CARTOON STUDIO LIGHTING (Warm, Gentle, True to Reference Art)
        // 1. Warm Sky & Ground Ambient Fill
        const hemiLight = new THREE.HemisphereLight(0xfff8ed, 0x1e1b4b, 0.95);
        scene.add(hemiLight);

        // 2. Key Light (Soft Warm Directional from Top-Front)
        const keyLight = new THREE.DirectionalLight(0xfffbf5, 0.95);
        keyLight.position.set(2.5, 4, 3);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.bias = -0.001;
        scene.add(keyLight);

        // 3. Fill Light (Soft Cool Lilac from Left)
        const fillLight = new THREE.DirectionalLight(0xe0e7ff, 0.5);
        fillLight.position.set(-3, 1.5, 2);
        scene.add(fillLight);

        // 4. Subtle Rim Backlight (Accentuates silhouette)
        const rimLight = new THREE.DirectionalLight(0xfde68a, 0.5);
        rimLight.position.set(0, 3, -3);
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
            bellMesh: null,
            frontLegs: [],
            backLegs: [],
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
            // 3/4 Perspective camera framing: captures full 4-legged body + cute head
            roaming = createViewport('roaming-pet-canvas', 160, 170, { x: 0.85, y: 0.90, z: 2.7 }, { x: 0.02, y: 0.44, z: 0.05 });
            panel = createViewport('panel-pet-canvas', 150, 150, { x: 0.80, y: 0.85, z: 2.5 }, { x: 0.02, y: 0.42, z: 0.05 });

            if (!animationFrameId) {
                animate();
            }
        } catch (err) {
            console.error('[Pet3D] WebGL init error:', err);
            fallbackTo2D();
        }
    }

    // ==========================================
    // 🎨 4-LEGGED STYLIZED CARTOON PET GENERATOR
    // ==========================================
    function buildPetModel(species) {
        const cfg = SPECIES_CONFIG[species] || SPECIES_CONFIG['shiba'];
        const petGroup = new THREE.Group();
        petGroup.position.set(0, -0.05, 0);
        // Stylized 3/4 perspective angle as in reference photo
        petGroup.rotation.y = -0.32;

        const bodyMat = createClayMaterial(cfg.bodyColor, 0.45);
        const bellyMat = createClayMaterial(cfg.bellyColor, 0.42);
        const patchMat = createClayMaterial(cfg.patchColor || 0x6d4127, 0.48);
        const earInnerMat = createClayMaterial(cfg.earInner || 0xf29879, 0.45);
        const collarMat = createClayMaterial(cfg.collarColor || 0xdc2626, 0.35);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.92, roughness: 0.12 });
        const noseMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.05, metalness: 0.1 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.02, metalness: 0.1 });
        const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const tongueMat = createClayMaterial(0xf43f5e, 0.4);

        // 0. SOFT GROUND CONTACT SHADOW (Grounds the 4-legged pet)
        const shadowGeo = new THREE.CircleGeometry(0.52, 24);
        shadowGeo.scale(1.0, 1.45, 1.0);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.set(0, 0.015, 0);
        petGroup.add(shadowMesh);

        // 1. HORIZONTAL ROUNDED TORSO (Quadruped body)
        const bodyMesh = new THREE.Group();
        bodyMesh.position.set(0, 0.46, 0);

        // Main cylindrical torso
        const torsoGeo = new THREE.CylinderGeometry(0.30, 0.32, 0.58, 24);
        torsoGeo.rotateX(Math.PI / 2);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.castShadow = true;
        bodyMesh.add(torso);

        // Front chest round cap
        const chestGeo = new THREE.SphereGeometry(0.32, 20, 20);
        const chest = new THREE.Mesh(chestGeo, bodyMat);
        chest.position.set(0, 0.01, 0.28);
        chest.castShadow = true;
        bodyMesh.add(chest);

        // Rear rump round cap
        const rumpGeo = new THREE.SphereGeometry(0.31, 20, 20);
        const rump = new THREE.Mesh(rumpGeo, bodyMat);
        rump.position.set(0, 0.03, -0.28);
        rump.castShadow = true;
        bodyMesh.add(rump);

        // Soft Cream Underbelly & Chest
        const bellyGeo = new THREE.SphereGeometry(0.31, 20, 20);
        bellyGeo.scale(0.88, 0.65, 0.95);
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.position.set(0, -0.10, 0.05);
        bodyMesh.add(belly);

        // Dog: Chocolate Saddle on Back / Cat: Tabby Stripes
        if (cfg.hasSaddle) {
            const saddleGeo = new THREE.SphereGeometry(0.30, 20, 20);
            saddleGeo.scale(0.92, 0.32, 0.72);
            const saddle = new THREE.Mesh(saddleGeo, patchMat);
            saddle.position.set(0, 0.16, -0.06);
            bodyMesh.add(saddle);
        } else if (cfg.tabbyStripes) {
            [-0.14, 0.0, 0.14].forEach((sz) => {
                const stripeGeo = new THREE.TorusGeometry(0.31, 0.022, 8, 20, Math.PI);
                const stripe = new THREE.Mesh(stripeGeo, patchMat);
                stripe.position.set(0, 0.02, sz);
                stripe.rotation.x = -Math.PI / 2;
                bodyMesh.add(stripe);
            });
        }
        petGroup.add(bodyMesh);

        // 2. RED COLLAR CHOKER WITH GOLDEN PENDANT
        const collarGeo = new THREE.TorusGeometry(0.26, 0.034, 12, 32);
        const collar = new THREE.Mesh(collarGeo, collarMat);
        collar.position.set(0, 0.62, 0.32);
        collar.rotation.x = Math.PI / 2.8;
        petGroup.add(collar);

        let bellMesh = null;
        if (cfg.tagType === 'bone') {
            // Golden Bone Tag for Dog
            const boneGroup = new THREE.Group();
            boneGroup.position.set(0, 0.48, 0.45);
            const boneBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 10), goldMat);
            boneBar.rotation.z = Math.PI / 2;
            boneGroup.add(boneBar);
            [[-0.07, 0.025], [-0.07, -0.025], [0.07, 0.025], [0.07, -0.025]].forEach(([bx, by]) => {
                const bCap = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), goldMat);
                bCap.position.set(bx, by, 0);
                boneGroup.add(bCap);
            });
            bellMesh = boneGroup;
            petGroup.add(boneGroup);
        } else {
            // Golden Bell for Cat / others
            const bellGeo = new THREE.SphereGeometry(0.065, 16, 16);
            bellMesh = new THREE.Mesh(bellGeo, goldMat);
            bellMesh.position.set(0, 0.48, 0.44);
            petGroup.add(bellMesh);
        }

        // 3. FOUR PLAYFUL STUBBY LEGS
        const frontLegs = [];
        const backLegs = [];
        const legPositions = [
            { pos: [-0.17, 0.20, 0.22], isFront: true, isRight: false },
            { pos: [0.17, 0.22, 0.28], isFront: true, isRight: true }, // Stepping forward like in photo!
            { pos: [-0.17, 0.20, -0.22], isFront: false, isRight: false },
            { pos: [0.17, 0.20, -0.22], isFront: false, isRight: true }
        ];

        const legMat = cfg.sockPaws ? patchMat : bellyMat;
        legPositions.forEach(({ pos, isFront, isRight }) => {
            const legGroup = new THREE.Group();
            legGroup.position.set(...pos);

            const legGeo = new THREE.CylinderGeometry(0.082, 0.092, 0.38, 16);
            const legCyl = new THREE.Mesh(legGeo, legMat);
            legCyl.castShadow = true;
            legGroup.add(legCyl);

            const footGeo = new THREE.SphereGeometry(0.10, 14, 14);
            footGeo.scale(1.0, 0.65, 1.25);
            const foot = new THREE.Mesh(footGeo, legMat);
            foot.position.set(0, -0.16, 0.03);
            foot.castShadow = true;
            legGroup.add(foot);

            petGroup.add(legGroup);
            if (isFront) frontLegs.push(legGroup);
            else backLegs.push(legGroup);
        });

        // 4. BIG CUTE CARTOON HEAD
        const headMesh = new THREE.Group();
        headMesh.position.set(0, 0.84, 0.35);

        // Head Base (Rounded square/sphere)
        const headGeo = new THREE.SphereGeometry(0.44, 32, 32);
        headGeo.scale(1.12, 1.02, 1.0);
        const headMain = new THREE.Mesh(headGeo, bodyMat);
        headMain.castShadow = true;
        headMesh.add(headMain);

        // Cream Muzzle & Lower Cheeks
        const snoutGeo = new THREE.SphereGeometry(0.24, 20, 20);
        snoutGeo.scale(1.05, 0.85, 0.95);
        const snout = new THREE.Mesh(snoutGeo, bellyMat);
        snout.position.set(0, -0.10, 0.24);
        headMesh.add(snout);

        // White Blaze on Dog Forehead (Running down center)
        if (cfg.hasBlaze) {
            const blazeGeo = new THREE.CylinderGeometry(0.07, 0.13, 0.44, 12);
            blazeGeo.scale(0.7, 1.0, 0.08);
            const blaze = new THREE.Mesh(blazeGeo, bellyMat);
            blaze.position.set(0, 0.09, 0.43);
            blaze.rotation.x = -0.18;
            headMesh.add(blaze);
        }

        // Distinct Eye Patch (Cat: Right Eye, Dog: Left Eye)
        if (cfg.eyePatch) {
            const patchSide = cfg.eyePatchSide === 'left' ? -0.18 : 0.18;
            const patchGeo = new THREE.SphereGeometry(0.18, 20, 20);
            patchGeo.scale(1.05, 1.15, 0.12);
            const patch = new THREE.Mesh(patchGeo, patchMat);
            patch.position.set(patchSide, 0.04, 0.41);
            patch.rotation.y = patchSide > 0 ? 0.22 : -0.22;
            headMesh.add(patch);
        }

        // Forehead Tabby Stripes (Cat)
        if (cfg.tabbyStripes) {
            [-0.08, 0.0, 0.08].forEach((fx, fi) => {
                const fGeo = new THREE.ConeGeometry(0.024, fi === 1 ? 0.22 : 0.16, 8);
                fGeo.scale(1.0, 1.0, 0.2);
                const fStripe = new THREE.Mesh(fGeo, patchMat);
                fStripe.position.set(fx, 0.32, 0.28);
                fStripe.rotation.x = -0.45;
                fStripe.rotation.z = fx > 0 ? -0.15 : (fx < 0 ? 0.15 : 0);
                headMesh.add(fStripe);
            });
        }

        // Black Bead Eyes (With gleam)
        let leftEye = null;
        let rightEye = null;

        [-0.18, 0.18].forEach((x, idx) => {
            const eyeGroup = new THREE.Group();
            eyeGroup.position.set(x, 0.04, 0.43);
            eyeGroup.rotation.y = x > 0 ? 0.22 : -0.22;

            const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), eyeMat);
            eyeGroup.add(eyeBall);

            // Tiny White Sparkle Gleam
            const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), starMat);
            gleam.position.set(0.015, 0.018, 0.038);
            eyeGroup.add(gleam);

            // Soft Curved Brow
            const browGeo = new THREE.TorusGeometry(0.065, 0.009, 6, 12, Math.PI * 0.5);
            const brow = new THREE.Mesh(browGeo, patchMat);
            brow.position.set(0, 0.09, 0.02);
            brow.rotation.z = x > 0 ? -0.2 : 0.2;
            eyeGroup.add(brow);

            headMesh.add(eyeGroup);
            if (idx === 0) leftEye = eyeGroup;
            else rightEye = eyeGroup;
        });

        // Shiny Black Button Nose
        const noseGeo = new THREE.SphereGeometry(0.048, 14, 14);
        noseGeo.scale(1.2, 0.85, 0.9);
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, -0.03, 0.47);
        headMesh.add(nose);

        // Mouth (Cat: Open happy smiling mouth with pink tongue / Dog: cute smile line)
        if (cfg.openMouth) {
            // Open smiling mouth ':D' with pink tongue
            const mouthBg = new THREE.Mesh(
                new THREE.CircleGeometry(0.065, 16, 0, Math.PI),
                new THREE.MeshBasicMaterial({ color: 0x3b0712 })
            );
            mouthBg.position.set(0, -0.11, 0.45);
            mouthBg.rotation.z = Math.PI;
            headMesh.add(mouthBg);

            const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), tongueMat);
            tongue.scale.set(1.0, 0.6, 1.2);
            tongue.position.set(0, -0.125, 0.455);
            headMesh.add(tongue);
        } else {
            // Cute curved smile
            [-0.03, 0.03].forEach((mx) => {
                const lip = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 12, Math.PI), noseMat);
                lip.position.set(mx, -0.095, 0.46);
                lip.rotation.z = Math.PI;
                headMesh.add(lip);
            });
        }

        // Whisker Stripes on Cheeks (Cat)
        if (cfg.whiskers) {
            [-0.32, 0.32].forEach((wx) => {
                [-0.02, -0.05, -0.08].forEach((wy, wi) => {
                    const wGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6);
                    wGeo.rotateZ(Math.PI / 2);
                    const wMesh = new THREE.Mesh(wGeo, patchMat);
                    wMesh.position.set(wx, wy, 0.32);
                    wMesh.rotation.z = (wx > 0 ? -0.1 : 0.1) * (wi - 1);
                    headMesh.add(wMesh);
                });
            });
        }

        // 5. EARS (Specially crafted: Floppy Hound Ears for Dog, Upright Tabby Ears for Cat)
        let leftEar = null;
        let rightEar = null;

        if (cfg.floppyEars) {
            // Dog Floppy Drooping Ears (Warm Caramel / Brown)
            [-0.35, 0.35].forEach((x, idx) => {
                const earGroup = new THREE.Group();
                earGroup.position.set(x, 0.22, -0.02);

                const earGeo = new THREE.SphereGeometry(0.18, 20, 20);
                earGeo.scale(0.45, 1.65, 0.85);
                const earMesh = new THREE.Mesh(earGeo, bodyMat);
                earMesh.rotation.z = x > 0 ? -0.22 : 0.22;
                earMesh.rotation.x = 0.15;
                earMesh.castShadow = true;
                earGroup.add(earMesh);

                headMesh.add(earGroup);
                if (idx === 0) leftEar = earGroup;
                else rightEar = earGroup;
            });
        } else if (cfg.longEars) {
            // Bunny Floppy Ears
            [-0.18, 0.18].forEach((x, idx) => {
                const earGroup = new THREE.Group();
                earGroup.position.set(x, 0.44, -0.06);

                const earGeo = new THREE.SphereGeometry(0.12, 20, 20);
                earGeo.scale(0.85, 2.5, 0.32);
                const earMesh = new THREE.Mesh(earGeo, bodyMat);
                earGroup.add(earMesh);

                const inMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), earInnerMat);
                inMesh.scale.set(0.72, 2.0, 0.22);
                inMesh.position.set(0, 0, 0.03);
                earGroup.add(inMesh);

                earGroup.rotation.z = x > 0 ? -0.25 : 0.25;
                earGroup.rotation.x = -0.2;
                headMesh.add(earGroup);
                if (idx === 0) leftEar = earGroup;
                else rightEar = earGroup;
            });
        } else {
            // Cat Upright Triangular Ears with Coral Peach Interior
            [-0.26, 0.26].forEach((x, idx) => {
                const earGroup = new THREE.Group();
                earGroup.position.set(x, 0.38, 0.0);

                const earGeo = new THREE.ConeGeometry(0.18, 0.32, 16);
                earGeo.scale(1.0, 1.0, 0.62);
                const earMesh = new THREE.Mesh(earGeo, bodyMat);
                earMesh.rotation.z = x > 0 ? -0.38 : 0.38;
                earMesh.rotation.x = -0.12;
                earGroup.add(earMesh);

                const inGeo = new THREE.ConeGeometry(0.12, 0.24, 12);
                inGeo.scale(1.0, 1.0, 0.48);
                const inMesh = new THREE.Mesh(inGeo, earInnerMat);
                inMesh.position.set(0, 0, 0.04);
                inMesh.rotation.z = x > 0 ? -0.38 : 0.38;
                inMesh.rotation.x = -0.09;
                earGroup.add(inMesh);

                headMesh.add(earGroup);
                if (idx === 0) leftEar = earGroup;
                else rightEar = earGroup;
            });
        }

        // Dragon Horns
        if (cfg.hasHorns) {
            [-0.22, 0.22].forEach((x) => {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 12), goldMat);
                horn.position.set(x, 0.44, -0.05);
                horn.rotation.z = x > 0 ? -0.32 : 0.32;
                horn.rotation.x = -0.22;
                headMesh.add(horn);
            });
        }

        // 3D DJ HEADPHONES (Pop Mart Neon Edition)
        const headphonesMesh = new THREE.Group();
        const hpMat = createClayMaterial(0x6366f1, 0.2);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.045, 10, 24, Math.PI), hpMat);
        band.rotation.x = -Math.PI / 2;
        band.rotation.z = Math.PI / 2;
        band.position.set(0, 0.22, 0);
        headphonesMesh.add(band);

        [-0.44, 0.44].forEach((x) => {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.10, 18), hpMat);
            cup.rotateZ(Math.PI / 2);
            cup.position.set(x, 0.22, 0);
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.11, 18), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
            ring.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
            ring.position.set(x + (x > 0 ? 0.055 : -0.055), 0.22, 0);
            headphonesMesh.add(cup);
            headphonesMesh.add(ring);
        });
        headphonesMesh.visible = isDancing;
        headMesh.add(headphonesMesh);

        petGroup.add(headMesh);

        // 6. ANIMATED TAIL
        let tailMesh = null;
        if (cfg.isCat) {
            // Cat: Long Slender Curved Tail with Brown Ring Stripes & Cream Tip
            const tailGroup = new THREE.Group();
            tailGroup.position.set(0, 0.50, -0.38);

            const tTorus = new THREE.Mesh(
                new THREE.TorusGeometry(0.32, 0.052, 10, 24, Math.PI * 0.7),
                bodyMat
            );
            tTorus.rotation.y = Math.PI / 2;
            tTorus.rotation.z = -0.4;
            tailGroup.add(tTorus);

            // Cream Tip
            const tipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), bellyMat);
            tipMesh.position.set(0, 0.32, -0.22);
            tailGroup.add(tipMesh);

            tailMesh = tailGroup;
            petGroup.add(tailGroup);
        } else if (cfg.isBunny) {
            // Bunny Cotton Ball
            const bTail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), bellyMat);
            bTail.position.set(0, 0.45, -0.38);
            tailMesh = bTail;
            petGroup.add(bTail);
        } else {
            // Dog / Fox Wagging Pointy Tail with White Tip
            const dTailGroup = new THREE.Group();
            dTailGroup.position.set(0, 0.50, -0.36);
            dTailGroup.rotation.x = -Math.PI / 3;

            const tMain = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.36, 12), bodyMat);
            dTailGroup.add(tMain);

            const tTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 10), bellyMat);
            tTip.position.set(0, 0.12, 0);
            dTailGroup.add(tTip);

            tailMesh = dTailGroup;
            petGroup.add(dTailGroup);
        }

        // Dragon Wings
        let leftWing = null;
        let rightWing = null;
        if (cfg.hasWings) {
            leftWing = createWingMesh(true, bodyMat);
            rightWing = createWingMesh(false, bodyMat);
            leftWing.position.set(-0.30, 0.60, 0.0);
            rightWing.position.set(0.30, 0.60, 0.0);
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
            bellMesh,
            frontLegs,
            backLegs
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
        vp.frontLegs = model.frontLegs;
        vp.backLegs = model.backLegs;

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
            const foodMat = createClayMaterial(cfg.foodColor, 0.25, 0.1);
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

        // 4. Ear Wiggles, Tail Wag & Quadruped Trot
        if (vp.tailMesh) {
            vp.tailMesh.rotation.y = Math.sin(time * 6.8) * 0.38;
        }

        // Front right leg playful step/trot
        if (vp.frontLegs && vp.frontLegs.length === 2) {
            const trot = Math.sin(time * 3.2) * 0.02;
            vp.frontLegs[1].position.y = 0.22 + Math.abs(trot);
        }

        // Floppy dog ear bounce
        if (vp.leftEar && vp.rightEar && SPECIES_CONFIG[currentSpecies] && SPECIES_CONFIG[currentSpecies].floppyEars) {
            const earSway = Math.sin(time * 3.8) * 0.06;
            vp.leftEar.rotation.z = -0.22 + earSway;
            vp.rightEar.rotation.z = 0.22 - earSway;
        }

        if (vp.bellMesh) {
            vp.bellMesh.rotation.z = Math.sin(time * 4.0) * 0.15;
        }

        if (vp.leftWing && vp.rightWing) {
            vp.leftWing.rotation.z = Math.PI / 3 + Math.sin(time * 4.5) * 0.25;
            vp.rightWing.rotation.z = -Math.PI / 3 - Math.sin(time * 4.5) * 0.25;
        }

        // 5. Jump Animation with Squash & Stretch
        const baseRotY = -0.32;
        if (isJumping) {
            const jumpArc = Math.sin(jumpTime * Math.PI);
            vp.petGroup.position.y = -0.05 + jumpArc * 0.52;
            vp.petGroup.rotation.y = baseRotY + jumpTime * Math.PI * 2;
            // Stretch while rising, squash while landing
            const stretch = (jumpTime < 0.5 ? 1.15 : 0.88);
            vp.petGroup.scale.set(1 / stretch, stretch, 1 / stretch);
        } else if (!isDancing) {
            vp.petGroup.position.y = -0.05;
            vp.petGroup.rotation.y = baseRotY;
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
            vp.petGroup.position.y = -0.05 + Math.abs(Math.sin(beat)) * 0.12;
            vp.petGroup.rotation.z = Math.sin(beat * 0.5) * 0.10;
            vp.petGroup.rotation.y = baseRotY + Math.sin(beat * 0.5) * 0.15;
            if (vp.headMesh) {
                vp.headMesh.rotation.z = -Math.sin(beat * 0.5) * 0.14;
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
