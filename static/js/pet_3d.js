/**
 * 🐾 VN-Tracking 3D Virtual Pet Engine - Animal Pack (FBX & GLTF Rigged Models)
 * Dual Viewport: Outside Roaming Pet & Inside My Pet Menu
 * 
 * Features & Fixes:
 * - Single-Instance Guarantee: Guaranteed 0 duplicate models on pet switch (petContainer.clear() + loadId generation guard)
 * - True Skeletal Animations (FBX AnimStacks: _idle, _walk, _run)
 * - Color Palette Texture Mapping with sRGB encoding & proper skinning
 * - Balanced Studio Lighting (no blowout/washout)
 * - Auto-Fit Bounding Box Normalization (paws grounded at y=0)
 * - Interactive Treat Feeding & Particles (❤️ / ⭐ / 🎵)
 * - Neon DJ Headphones with music sync
 * - Natural LookAt Cursor physics
 */

window.Pet3DEngine = (function () {
    let petData = null;
    let currentSpecies = 'shiba';
    let is3DActive = true;
    let isInitialized = false;
    let animationFrameId = null;
    let clock = null;
    let lastAnimTimestamp = performance.now();

    // Animation states
    let isDancing = false;
    let isEating = false;
    let isRunning = false;
    let isCelebrating = false;
    let isHovered = false;
    let runTimer = null;
    let celebrateTimer = null;
    let currentPose = 'idle'; // 'idle' | 'walk' | 'run' | 'eat' | 'trick'
    let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Viewports: 1. Roaming (Outside bottom-right) & 2. Panel (Inside My Pet menu) & 3. Switch Preview
    let roaming = null;
    let panel = null;
    let switchPreview = null;

    // Loaders
    let fbxLoader = null;
    let gltfLoader = null;
    let textureLoader = null;
    let sharedTexture = null;

    // Animal Pack Models & Configurations (Matching User's ANIMAL folder & GLTF assets)
    const SPECIES_CONFIG = {
        shiba: {
            modelUrl: '/static/models/ithappy/Dog_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Chó Cưng (Dog)',
            emoji: '🐕',
            sound: 'Gâu gâu! Woof! 🐾',
            food_name: 'Xương thịt 🍖',
            targetHeight: 1.30,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        },
        neko: {
            modelUrl: '/static/models/ithappy/Kitty_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Mèo Kitty',
            emoji: '🐱',
            sound: 'Nya~ Meow! 🐾',
            food_name: 'Cá tươi 🐟',
            targetHeight: 1.25,
            rotOffsetY: -0.32,
            camY: 0.55,
            camPosY: 1.12
        },
        fox: {
            modelUrl: '/static/models/ithappy/Tiger_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Hổ Vằn (Tiger)',
            emoji: '🐯',
            sound: 'Grrr~ Gầm! 🐾',
            food_name: 'Thịt bò 🥩',
            targetHeight: 1.35,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        },
        bunny: {
            modelUrl: '/static/models/ithappy/Pinguin_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Cánh Cụt (Penguin)',
            emoji: '🐧',
            sound: 'Pingu pingu~ ❄️',
            food_name: 'Cá nhỏ 🐟',
            targetHeight: 1.20,
            rotOffsetY: -0.35,
            camY: 0.66,
            camPosY: 1.18,
            haloExtraY: 0.08
        },
        panda: {
            modelUrl: '/static/models/ithappy/Horse_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Ngựa Con (Pony)',
            emoji: '🐴',
            sound: 'Hí hí~ Nhong! 🌾',
            food_name: 'Cà rốt 🥕',
            targetHeight: 1.35,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        },
        dragon: {
            modelUrl: '/static/models/ithappy/Deer_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Hươu Sao (Deer)',
            emoji: '🦌',
            sound: 'Ngơ ngác ngác~ 🌿',
            food_name: 'Lộc non 🍀',
            targetHeight: 1.35,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        },
        chicken: {
            modelUrl: '/static/models/ithappy/Chicken_001.glb',
            textureUrl: '/static/models/ithappy/Texture_1.png',
            name_vi: 'Gà Con (Chick)',
            emoji: '🐥',
            sound: 'Chíp chíp! 🌾',
            food_name: 'Thóc vàng 🌾',
            targetHeight: 1.15,
            rotOffsetY: -0.35,
            camY: 0.52,
            camPosY: 1.10
        },
        husky: {
            modelUrl: '/static/models/husky.gltf',
            name_vi: 'Chó Husky',
            emoji: '🐺',
            sound: 'Húuu~ Woof! ❄️',
            food_name: 'Thịt nướng 🍖',
            targetHeight: 1.30,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        },
        alpaca: {
            modelUrl: '/static/models/alpaca.gltf',
            name_vi: 'Lạc Đà Alpaca',
            emoji: '🦙',
            sound: 'Hummm~ 🌸',
            food_name: 'Cỏ non 🌿',
            targetHeight: 1.35,
            rotOffsetY: -0.35,
            camY: 0.58,
            camPosY: 1.15
        }
    };

    // Aliases for developer convenience & multi-key compatibility
    SPECIES_CONFIG.dog = SPECIES_CONFIG.shiba;
    SPECIES_CONFIG.kitty = SPECIES_CONFIG.neko;
    SPECIES_CONFIG.cat = SPECIES_CONFIG.neko;
    SPECIES_CONFIG.tiger = SPECIES_CONFIG.fox;
    SPECIES_CONFIG.penguin = SPECIES_CONFIG.bunny;
    SPECIES_CONFIG.pinguin = SPECIES_CONFIG.bunny;
    SPECIES_CONFIG.horse = SPECIES_CONFIG.panda;
    SPECIES_CONFIG.deer = SPECIES_CONFIG.dragon;

    function init(data) {
        petData = data || {};
        const newSpecies = petData.type && SPECIES_CONFIG[petData.type] ? petData.type : 'shiba';

        if (isInitialized) {
            if (newSpecies !== currentSpecies) {
                switchSpecies(newSpecies);
            }
            return;
        }

        currentSpecies = newSpecies;
        createDOM();
        initThree();
        setupListeners();
        buildPets(currentSpecies);
        checkErgonomicsTimer();
        isInitialized = true;

        const isMusicActive = Boolean(window.radioState && window.radioState.is_playing && (window.isRadioDJ || window.isListening));
        setDancing(isMusicActive);
    }

    function createDOM() {
        // Clean legacy 2D img elements
        document.querySelectorAll('img[src*="/static/img/pet/"], img[src*="2.gif"], img[src*="1.gif"]').forEach(img => img.remove());

        // 1. OUTSIDE ROAMING CONTAINER
        let roamingEl = document.getElementById('roaming-pet-container');
        if (!roamingEl) {
            roamingEl = document.createElement('div');
            roamingEl.id = 'roaming-pet-container';
            roamingEl.className = 'roaming-pet-3d-wrapper';
            roamingEl.innerHTML = `
                <div class="pet-3d-canvas-box">
                    <canvas id="roaming-pet-canvas" width="160" height="185"></canvas>
                </div>
                <div id="pet-speech-bubble" class="pet-speech-bubble">
                    <div id="pet-speech-tag" class="pet-speech-tag"></div>
                    <div id="pet-speech-text" class="pet-speech-text"></div>
                    <div id="pet-speech-actions" class="pet-speech-actions"></div>
                </div>
                <div class="pet-interaction-ring" title="Xoa đầu / Trò chuyện"></div>
            `;
            document.body.appendChild(roamingEl);
        } else if (!document.getElementById('roaming-pet-canvas')) {
            roamingEl.innerHTML = `
                <div class="pet-3d-canvas-box">
                    <canvas id="roaming-pet-canvas" width="160" height="185"></canvas>
                </div>
                <div id="pet-speech-bubble" class="pet-speech-bubble">
                    <div id="pet-speech-tag" class="pet-speech-tag"></div>
                    <div id="pet-speech-text" class="pet-speech-text"></div>
                    <div id="pet-speech-actions" class="pet-speech-actions"></div>
                </div>
                <div class="pet-interaction-ring" title="Xoa đầu / Trò chuyện"></div>
            `;
        }
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
        renderer.toneMappingExposure = 1.0;
        if (THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // Balanced Studio Lighting
        const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x1e293b, 0.95);
        scene.add(hemiLight);

        const keyLight = new THREE.DirectionalLight(0xfffaed, 1.1);
        keyLight.position.set(2.5, 4.0, 3.2);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.bias = -0.001;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xbfdbfe, 0.5);
        fillLight.position.set(-2.8, 1.8, 2);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xfef08a, 0.4);
        rimLight.position.set(0, 2.5, -2.8);
        scene.add(rimLight);

        // Ground Contact Shadow Disk
        const shadowGeo = new THREE.CircleGeometry(0.55, 24);
        shadowGeo.scale(1.0, 1.4, 1.0);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 });
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.set(0, 0.015, 0);
        scene.add(shadowMesh);

        // Dedicated Pet Container (Single Source of Truth for models)
        const petContainer = new THREE.Group();
        petContainer.name = 'petContainer';
        scene.add(petContainer);

        const particleGroup = new THREE.Group();
        scene.add(particleGroup);

        return {
            canvas,
            scene,
            camera,
            renderer,
            petContainer,
            particleGroup,
            particles: [],
            modelGroup: null,
            mixer: null,
            animations: [],
            actions: {},
            currentAction: null,
            headphonesMesh: null,
            foodMesh: null,
            loadGen: 0,
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
            if (typeof THREE.FBXLoader !== 'undefined') {
                fbxLoader = new THREE.FBXLoader();
            }
            if (typeof THREE.GLTFLoader !== 'undefined') {
                gltfLoader = new THREE.GLTFLoader();
            }
            if (typeof THREE.TextureLoader !== 'undefined') {
                textureLoader = new THREE.TextureLoader();
                sharedTexture = textureLoader.load('/static/models/ithappy/Texture_1.png');
                if (sharedTexture) {
                    sharedTexture.encoding = THREE.sRGBEncoding;
                    sharedTexture.flipY = true;
                }
            }

            roaming = createViewport('roaming-pet-canvas', 160, 185, { x: 1.1, y: 1.05, z: 2.5 }, { x: 0, y: 0.46, z: 0 });
            panel = createViewport('panel-pet-canvas', 150, 150, { x: 1.0, y: 0.98, z: 2.35 }, { x: 0, y: 0.44, z: 0 });

            if (!animationFrameId) {
                animate();
            }
        } catch (err) {
            console.error('[Pet3D] WebGL init error:', err);
            fallbackTo2D();
        }
    }

    // ==========================================
    // 🐾 BULLETPROOF MODEL LOADER (NO DUPLICATES)
    // ==========================================
    function loadModelForViewport(vp, species) {
        if (!vp || !vp.scene) return;
        const cfg = SPECIES_CONFIG[species] || SPECIES_CONFIG['shiba'];

        // Increment load generation to invalidate any in-flight requests
        vp.loadGen = (vp.loadGen || 0) + 1;
        const thisGen = vp.loadGen;

        // Clear existing model immediately
        if (vp.petContainer) {
            while (vp.petContainer.children.length > 0) {
                const old = vp.petContainer.children[0];
                vp.petContainer.remove(old);
                disposeHierarchy(old);
            }
        }
        if (vp.modelGroup && vp.modelGroup.parent) {
            vp.modelGroup.parent.remove(vp.modelGroup);
            disposeHierarchy(vp.modelGroup);
        }
        vp.modelGroup = null;

        if (vp.mixer) {
            vp.mixer.stopAllAction();
            vp.mixer = null;
        }
        vp.actions = {};
        vp.currentAction = null;
        vp.headphonesMesh = null;

        const isFbx = cfg.modelUrl.endsWith('.fbx');

        if (isFbx) {
            const loader = fbxLoader || (typeof THREE.FBXLoader !== 'undefined' ? new THREE.FBXLoader() : null);
            if (!loader) {
                console.warn('[Pet3D] FBXLoader not ready, using fallback.');
                buildProceduralFallback(vp, cfg, thisGen);
                return;
            }

            loader.load(cfg.modelUrl, (object) => {
                setupLoadedModel(vp, object, object.animations, cfg, true, thisGen);
            }, undefined, (err) => {
                console.error('[Pet3D] FBX load error:', cfg.modelUrl, err);
                buildProceduralFallback(vp, cfg, thisGen);
            });
        } else {
            const loader = gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null);
            if (!loader) {
                buildProceduralFallback(vp, cfg, thisGen);
                return;
            }

            loader.load(cfg.modelUrl, (gltf) => {
                setupLoadedModel(vp, gltf.scene, gltf.animations, cfg, false, thisGen);
            }, undefined, (err) => {
                console.error('[Pet3D] GLTF load error:', cfg.modelUrl, err);
                buildProceduralFallback(vp, cfg, thisGen);
            });
        }
    }

    function setupLoadedModel(vp, root, animations, cfg, isFbx, genId) {
        if (!vp || !vp.scene) return;

        // Invalidate stale in-flight loads
        if (genId !== undefined && vp.loadGen !== genId) {
            disposeHierarchy(root);
            return;
        }

        // 1. GUARANTEED PURGE: Empty petContainer completely
        if (vp.petContainer) {
            while (vp.petContainer.children.length > 0) {
                const c = vp.petContainer.children[0];
                vp.petContainer.remove(c);
                disposeHierarchy(c);
            }
        }

        // 2. Scan scene for any orphan petModelWrapper objects or food treats
        for (let i = vp.scene.children.length - 1; i >= 0; i--) {
            const c = vp.scene.children[i];
            if (c.name === 'petModelWrapper' || c.name === 'petFoodTreat' || c === vp.modelGroup || c === vp.foodMesh) {
                vp.scene.remove(c);
                disposeHierarchy(c);
            }
        }
        vp.foodMesh = null;

        // 3. Texture and Material Setup
        if (isFbx) {
            const tex = sharedTexture || (textureLoader ? textureLoader.load(cfg.textureUrl) : null);
            if (tex) {
                tex.encoding = THREE.sRGBEncoding;
                tex.flipY = true;
                tex.needsUpdate = true;
            }

            root.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Always ensure proper map and skinning parameters
                    const mat = new THREE.MeshStandardMaterial({
                        map: tex || (child.material && child.material.map ? child.material.map : null),
                        roughness: 0.5,
                        metalness: 0.02,
                        skinning: (child.isSkinnedMesh === true)
                    });
                    if (mat.map) {
                        mat.map.encoding = THREE.sRGBEncoding;
                    }
                    child.material = mat;
                    child.material.needsUpdate = true;
                }
            });
        } else {
            root.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.roughness = Math.min(child.material.roughness !== undefined ? child.material.roughness : 0.5, 0.65);
                        child.material.metalness = Math.min(child.material.metalness !== undefined ? child.material.metalness : 0.05, 0.15);
                        if (child.material.map) {
                            child.material.map.encoding = THREE.sRGBEncoding;
                            child.material.map.needsUpdate = true;
                        }
                        if (child.isSkinnedMesh) {
                            child.material.skinning = true;
                        }
                        child.material.needsUpdate = true;
                    }
                }
            });
        }

        // 4. Auto-Fit Bounding Box Normalization
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        const targetHeight = cfg.targetHeight || 1.35;
        const scale = targetHeight / maxDim;

        const modelWrapper = new THREE.Group();
        modelWrapper.name = 'petModelWrapper';
        modelWrapper.position.set(0, 0, 0);
        modelWrapper.rotation.y = cfg.rotOffsetY || -0.35;

        root.scale.setScalar(scale);
        root.position.x = -center.x * scale;
        root.position.y = -box.min.y * scale; // Feet on ground at y = 0
        root.position.z = -center.z * scale;

        modelWrapper.add(root);

        // 5. Floating Music DJ Halo (Safely floating above head, NO clipping or covering pet)
        const headY = (box.max.y - box.min.y) * scale * 1.08 + (cfg.haloExtraY || 0);
        const musicAura = createMusicAuraMesh();
        musicAura.position.set(0, headY, 0);
        musicAura.visible = isDancing;
        modelWrapper.add(musicAura);
        vp.musicAura = musicAura;
        vp.headphonesMesh = musicAura; // For backwards compatibility

        // 6. Animation Mixer setup
        if (vp.mixer) {
            vp.mixer.stopAllAction();
            vp.mixer = null;
        }
        vp.actions = {};
        vp.currentAction = null;

        if (animations && animations.length > 0) {
            vp.animations = animations;
            vp.mixer = new THREE.AnimationMixer(root);
            animations.forEach(clip => {
                vp.actions[clip.name] = vp.mixer.clipAction(clip);
            });
            playAnimation(vp, isDancing ? 'dance' : currentPose);
        }

        vp.modelGroup = modelWrapper;
        if (vp.petContainer) {
            vp.petContainer.add(modelWrapper);
        } else {
            vp.scene.add(modelWrapper);
        }

        if (cfg.camPosY) {
            vp.camera.position.y = cfg.camPosY;
        } else {
            vp.camera.position.y = (vp === roaming ? 1.05 : 0.98);
        }
        if (cfg.camY) {
            vp.camera.lookAt(0, cfg.camY, 0);
        } else {
            vp.camera.lookAt(0, vp === roaming ? 0.46 : 0.44, 0);
        }
    }

    function findClipForPose(anims, pose) {
        if (!anims || anims.length === 0) return null;
        const norm = (str) => (str || '').toLowerCase();

        if (pose === 'idle') {
            return anims.find(a => norm(a.name).includes('idle') && !norm(a.name).includes('rare')) ||
                   anims.find(a => norm(a.name).includes('survey')) || anims[0];
        }
        if (pose === 'walk') {
            return anims.find(a => norm(a.name).includes('walk')) ||
                   anims.find(a => norm(a.name).includes('run')) || anims[0];
        }
        if (pose === 'run' || pose === 'dance') {
            return anims.find(a => norm(a.name).includes('run') || norm(a.name).includes('gallop')) ||
                   anims.find(a => norm(a.name).includes('walk')) || anims[0];
        }
        if (pose === 'eat') {
            return anims.find(a => norm(a.name).includes('eat') || norm(a.name).includes('eating')) ||
                   anims.find(a => norm(a.name).includes('idle')) || anims[0];
        }
        if (pose === 'trick' || pose === 'jump') {
            return anims.find(a => norm(a.name).includes('rare') || norm(a.name).includes('jump') || norm(a.name).includes('attack') || norm(a.name).includes('bark') || norm(a.name).includes('headbutt')) ||
                   anims.find(a => norm(a.name).includes('run')) || anims[0];
        }
        return anims[0];
    }

    function doTrickEffect(vp) {
        if (!vp || !vp.modelGroup) return;
        spawnParticles('star', 7);
        const startY = 0;
        const startTime = performance.now();
        const duration = 1100;
        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        const baseRotY = cfg.rotOffsetY || -0.35;

        const spinAnim = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            
            // Leaping parabolic arc: 4 * h * p * (1 - p)
            const jumpHeight = 0.35;
            vp.modelGroup.position.y = startY + 4 * jumpHeight * progress * (1 - progress);
            // Joyful 360-degree spin
            vp.modelGroup.rotation.y = baseRotY + progress * Math.PI * 2;

            if (progress < 1.0) {
                requestAnimationFrame(spinAnim);
            } else {
                vp.modelGroup.position.y = startY;
                vp.modelGroup.rotation.y = baseRotY;
                spawnParticles('star', 4);
            }
        };
        requestAnimationFrame(spinAnim);
    }

    function dropFoodTreat(vp) {
        if (!vp || !vp.scene) return;
        // Clean any existing food treat in scene
        for (let i = vp.scene.children.length - 1; i >= 0; i--) {
            const child = vp.scene.children[i];
            if (child.name === 'petFoodTreat' || child === vp.foodMesh) {
                vp.scene.remove(child);
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            }
        }
        vp.foodMesh = null;

        const foodMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25 });
        const foodGeo = new THREE.DodecahedronGeometry(0.10);
        const food = new THREE.Mesh(foodGeo, foodMat);
        food.name = 'petFoodTreat';
        food.position.set(0, 0.95, 0.22); // Start nicely above head, well within 185px canvas
        vp.scene.add(food);
        vp.foodMesh = food;

        const startY = 0.95;
        const targetY = 0.32;
        const startTime = performance.now();
        const dropDuration = 950;

        const anim = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / dropDuration, 1.0);
            if (food && food.parent) {
                food.position.y = startY + (targetY - startY) * progress;
                food.rotation.x += 0.09;
                food.rotation.y += 0.09;

                if (progress < 1.0) {
                    requestAnimationFrame(anim);
                } else {
                    spawnParticles('heart', 3);
                    vp.scene.remove(food);
                    food.geometry.dispose();
                    food.material.dispose();
                    if (vp.foodMesh === food) vp.foodMesh = null;
                }
            }
        };
        requestAnimationFrame(anim);
    }

    function doEatEffect(vp) {
        if (!vp || !vp.scene) return;
        spawnParticles('heart', 4);
        dropFoodTreat(vp);

        // Head chewing bobbing
        const startRotX = vp.modelGroup ? vp.modelGroup.rotation.x : 0;
        const startTime = performance.now();
        const chewDuration = 2200;
        const chewAnim = () => {
            const elapsed = performance.now() - startTime;
            if (elapsed < chewDuration && vp.modelGroup) {
                vp.modelGroup.rotation.x = startRotX + Math.sin(elapsed * 0.015) * 0.12 + 0.08;
                requestAnimationFrame(chewAnim);
            } else if (vp.modelGroup) {
                vp.modelGroup.rotation.x = startRotX;
            }
        };
        requestAnimationFrame(chewAnim);
    }

    function playAnimation(vp, animType) {
        if (!vp || !vp.mixer || !vp.animations || vp.animations.length === 0) return;

        const targetClip = findClipForPose(vp.animations, animType);
        if (!targetClip) return;

        const newAction = vp.actions[targetClip.name] || vp.mixer.clipAction(targetClip);

        if (vp.currentAction && vp.currentAction !== newAction) {
            vp.currentAction.fadeOut(0.2);
        }

        newAction.reset();
        newAction.fadeIn(0.2);
        const speed = animType === 'eat' ? 0.75 : (animType === 'run' ? 1.35 : 1.0);
        newAction.setEffectiveTimeScale(speed);
        newAction.setEffectiveWeight(1.0);
        newAction.setLoop(THREE.LoopRepeat);
        newAction.play();

        vp.currentAction = newAction;

        if (animType === 'trick') {
            doTrickEffect(vp);
        } else if (animType === 'eat') {
            doEatEffect(vp);
        }
    }

    function setPose(poseName) {
        if (runTimer) { clearTimeout(runTimer); isRunning = false; }
        if (celebrateTimer) { clearTimeout(celebrateTimer); isCelebrating = false; }
        isEating = (poseName === 'eat');
        if (poseName === 'run') isRunning = true;
        if (poseName === 'trick') isCelebrating = true;

        if (isDancing) {
            isDancing = false;
            [roaming, panel].forEach(vp => {
                if (vp && vp.musicAura) vp.musicAura.visible = false;
                if (vp && vp.modelGroup) vp.modelGroup.position.y = 0;
            });
        }
        applyPose(poseName);
        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        const poseLabels = {
            idle: 'Nghỉ ngơi 🧘',
            walk: 'Đi dạo thong thả 🚶',
            run: 'Chạy tung tăng 🏃',
            eat: `Nhai ${cfg.food_name || 'thức ăn'} 🍖`,
            trick: 'Vui mừng thăng hạng ✨'
        };
        showBubble(poseLabels[poseName] || 'Tư thế mới!', '🎭 Hoạt ảnh', 2500);

        if (poseName === 'run' || poseName === 'trick' || poseName === 'eat') {
            const timeoutDuration = (poseName === 'eat' ? 3000 : 3500);
            setTimeout(() => {
                if (currentPose === poseName) {
                    if (poseName === 'run') isRunning = false;
                    if (poseName === 'trick') isCelebrating = false;
                    if (poseName === 'eat') isEating = false;
                    applyPose(isHovered ? 'walk' : 'idle');
                }
            }, timeoutDuration);
        }
    }

    function createMusicAuraMesh() {
        const auraGroup = new THREE.Group();
        auraGroup.name = 'petMusicAura';

        // Floating glowing neon ring high above head (never touches head or face)
        const ringGeo = new THREE.TorusGeometry(0.24, 0.022, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        auraGroup.add(ring);

        // Glowing music note floating cleanly above halo
        const noteCanvas = document.createElement('canvas');
        noteCanvas.width = 64; noteCanvas.height = 64;
        const ctx = noteCanvas.getContext('2d');
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🎵', 32, 32);
        const noteTex = new THREE.CanvasTexture(noteCanvas);
        const noteMat = new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0.95 });
        const noteSprite = new THREE.Sprite(noteMat);
        noteSprite.scale.set(0.3, 0.3, 1);
        noteSprite.position.set(0, 0.18, 0);
        auraGroup.add(noteSprite);

        return auraGroup;
    }

    function buildProceduralFallback(vp, cfg, genId) {
        if (genId !== undefined && vp.loadGen !== genId) return;
        if (vp.petContainer) {
            while (vp.petContainer.children.length > 0) {
                const c = vp.petContainer.children[0];
                vp.petContainer.remove(c);
                disposeHierarchy(c);
            }
        }
        const group = new THREE.Group();
        group.name = 'petModelWrapper';
        const mat = new THREE.MeshStandardMaterial({ color: 0xdf8435, roughness: 0.4 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20), mat);
        body.position.y = 0.45;
        group.add(body);
        vp.modelGroup = group;
        if (vp.petContainer) vp.petContainer.add(group);
        else vp.scene.add(group);
    }

    function buildPets(species) {
        currentSpecies = species;
        loadModelForViewport(roaming, species);
        loadModelForViewport(panel, species);
    }

    function setDancing(active) {
        isDancing = Boolean(active);
        [roaming, panel].forEach(vp => {
            if (!vp) return;
            if (vp.musicAura) {
                vp.musicAura.visible = isDancing;
            }
            if (vp.modelGroup && !isDancing) {
                vp.modelGroup.position.y = 0;
            }
            playAnimation(vp, isDancing ? 'dance' : currentPose);
        });
        if (isDancing) {
            spawnParticles('note', 4);
        }
    }

    function triggerClickRun() {
        if (isEating || isCelebrating) return;
        isRunning = true;
        if (runTimer) clearTimeout(runTimer);

        spawnParticles('dash', 5);
        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        showBubble(cfg.sound || 'Gâu gâu! 🐾', '🏃 Chạy tung tăng', 3000);

        applyPose('run');

        if (window.triggerPetBrief) {
            window.triggerPetBrief();
        }

        runTimer = setTimeout(() => {
            isRunning = false;
            applyPose(isHovered ? 'walk' : 'idle');
        }, 3500);
    }

    function feed() {
        if (isEating) return;
        isEating = true;
        if (runTimer) { clearTimeout(runTimer); isRunning = false; }

        spawnParticles('star', 6);
        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];

        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene) return;
            playAnimation(vp, 'eat');
        });

        applyPose('eat');
        showBubble(`Ngon quá! +10 XP 🎉`, '🍖 Đang ăn...', 3000);

        setTimeout(() => {
            isEating = false;
            applyPose(isHovered ? 'walk' : 'idle');
        }, 3000);
    }

    function spawnParticles(type, count) {
        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene || !vp.particleGroup) return;

            for (let i = 0; i < count; i++) {
                const canvasP = document.createElement('canvas');
                canvasP.width = 64;
                canvasP.height = 64;
                const ctx = canvasP.getContext('2d');
                ctx.font = '38px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let icon = '❤️';
                if (type === 'note') icon = ['🎵', '🎶', '🎧'][Math.floor(Math.random() * 3)];
                else if (type === 'star') icon = '⭐';
                else if (type === 'zzz') icon = '💤';
                else if (type === 'dash') icon = ['💨', '✨', '🐾'][Math.floor(Math.random() * 3)];

                ctx.fillText(icon, 32, 32);

                const texture = new THREE.CanvasTexture(canvasP);
                const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1.0 });
                const sprite = new THREE.Sprite(spriteMat);
                sprite.scale.set(0.32, 0.32, 1);
                sprite.position.set(
                    (Math.random() - 0.5) * 0.7,
                    0.85 + Math.random() * 0.4,
                    0.2 + (Math.random() - 0.5) * 0.3
                );

                vp.particleGroup.add(sprite);
                vp.particles.push({
                    mesh: sprite,
                    vy: 0.014 + Math.random() * 0.012,
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
        if (!vp || !vp.canvas || !vp.renderer || !vp.scene || !vp.camera) return;

        // Skip rendering panel if pet-panel is closed (save GPU)
        if (vp === panel) {
            const pEl = document.getElementById('pet-panel');
            if (pEl && !pEl.classList.contains('active')) return;
        }

        // Skip rendering roaming if roaming container is hidden
        if (vp === roaming) {
            const rEl = document.getElementById('roaming-pet-container');
            if (rEl && rEl.style.display === 'none') return;
        }

        // Skip rendering switchPreview if switch modal is closed (save GPU)
        if (vp === switchPreview) {
            const sModal = document.getElementById('pet-switch-modal');
            if (!sModal || !sModal.classList.contains('active')) return;
        }

        // Update skeletal animations with accurate delta
        if (vp.mixer) {
            vp.mixer.update(delta);
        }

        // Turntable rotation for preview stage OR smooth LookAt Cursor for roaming & panel
        if (vp === switchPreview) {
            if (vp.modelGroup) {
                vp.modelGroup.rotation.y += delta * 0.75;
            }
        } else {
            const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
            const baseRotY = cfg.rotOffsetY || -0.35;
            const targetRotY = baseRotY + (mousePos.x / window.innerWidth - 0.5) * 0.65;
            const targetRotX = (mousePos.y / window.innerHeight - 0.5) * 0.22;

            if (vp.modelGroup) {
                vp.modelGroup.rotation.y += (targetRotY - vp.modelGroup.rotation.y) * 0.08;
                vp.modelGroup.rotation.x += (targetRotX - vp.modelGroup.rotation.x) * 0.08;
            }
        }

        // Dynamic pose bounce & physics
        if (vp.modelGroup && !isCelebrating) {
            if (vp !== switchPreview && isDancing) {
                const beat = time * 7.5;
                vp.modelGroup.position.y = Math.abs(Math.sin(beat)) * 0.06;
                if (Math.random() < 0.02) {
                    spawnParticles('note', 1);
                }
            } else if (vp !== switchPreview && currentPose === 'run') {
                vp.modelGroup.position.y = Math.abs(Math.sin(time * 9.0)) * 0.045;
            } else if (vp !== switchPreview && currentPose === 'walk') {
                vp.modelGroup.position.y = Math.sin(time * 5.0) * 0.025;
            } else if (currentPose === 'idle' || vp === switchPreview) {
                vp.modelGroup.position.y = 0;
            }
        }

        updateParticlesFor(vp);
        vp.renderer.render(vp.scene, vp.camera);
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        const now = performance.now();
        const delta = Math.min((now - lastAnimTimestamp) / 1000, 0.1);
        lastAnimTimestamp = now;
        const time = clock ? clock.getElapsedTime() : (now / 1000);

        updateViewportAnimation(roaming, time, delta);
        updateViewportAnimation(panel, time, delta);
        if (switchPreview) {
            updateViewportAnimation(switchPreview, time, delta);
        }
    }

    function onPanelShow() {
        if (panel && panel.renderer && panel.camera) {
            panel.renderer.setSize(panel.width, panel.height);
            panel.camera.aspect = panel.width / panel.height;
            panel.camera.updateProjectionMatrix();
        }
    }

    function resetPosition() {
        try {
            localStorage.removeItem('roaming_pet_pos');
        } catch(e) {}
        const roamingContainer = document.getElementById('roaming-pet-container');
        if (roamingContainer) {
            roamingContainer.style.left = '';
            roamingContainer.style.top = '';
            roamingContainer.style.bottom = '6px';
            roamingContainer.style.right = '90px';
            roamingContainer.classList.remove('shifted-for-panel');
        }
        showBubble('Đã đưa thú cưng về góc phải màn hình! 📍', 'Vị trí mặc định', 2500);
    }

    function handleHoverEnter() {
        isHovered = true;
        if (!isDancing && !isCelebrating && !isEating && !isRunning) {
            applyPose('walk');
        }
    }

    function handleHoverLeave() {
        isHovered = false;
        if (!isDancing && !isCelebrating && !isEating && !isRunning) {
            applyPose('idle');
        }
    }

    function celebrate(newLevel) {
        isCelebrating = true;
        if (runTimer) { clearTimeout(runTimer); isRunning = false; }
        if (isEating) isEating = false;

        spawnParticles('star', 8);
        spawnParticles('heart', 6);

        applyPose('trick');
        const msg = newLevel ? `🎉 Tuyệt vời! Thăng hạng Lv.${newLevel} rồi! ✨` : '🎉 Yay! Thăng hạng thành công! ✨';
        showBubble(msg, '🌟 Vui mừng thăng hạng', 4000);

        if (celebrateTimer) clearTimeout(celebrateTimer);
        celebrateTimer = setTimeout(() => {
            isCelebrating = false;
            applyPose(isHovered ? 'walk' : 'idle');
        }, 3600);
    }

    function applyPose(poseName) {
        currentPose = poseName;
        [roaming, panel].forEach(vp => {
            if (!vp) return;
            playAnimation(vp, isDancing ? 'dance' : poseName);
        });
        if (window.onPetPoseChanged) {
            window.onPetPoseChanged(poseName);
        }
    }

    function setupListeners() {
        window.addEventListener('mousemove', (e) => {
            mousePos.x = e.clientX;
            mousePos.y = e.clientY;
        }, { passive: true });

        const roamingContainer = document.getElementById('roaming-pet-container');
        if (roamingContainer) {
            let isDraggingPet = false;
            let dragPetStart = { x: 0, y: 0 };
            let petStartPos = { left: 0, top: 0 };
            let hasMoved = false;

            // Restore saved position if available, or reset if stuck on left due to previous bug
            try {
                const savedPos = JSON.parse(localStorage.getItem('roaming_pet_pos') || 'null');
                if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
                    if (savedPos.left < window.innerWidth * 0.65 || (savedPos.left > window.innerWidth * 0.7 && savedPos.top > window.innerHeight - 240)) {
                        localStorage.removeItem('roaming_pet_pos');
                        roamingContainer.style.left = '';
                        roamingContainer.style.top = '';
                        roamingContainer.style.bottom = '6px';
                        roamingContainer.style.right = '90px';
                    } else {
                        const maxLeft = Math.max(10, window.innerWidth - 180);
                        const maxTop = Math.max(10, window.innerHeight - 200);
                        const clampedLeft = Math.max(10, Math.min(maxLeft, savedPos.left));
                        const clampedTop = Math.max(10, Math.min(maxTop, savedPos.top));
                        roamingContainer.style.left = clampedLeft + 'px';
                        roamingContainer.style.top = clampedTop + 'px';
                        roamingContainer.style.bottom = 'auto';
                        roamingContainer.style.right = 'auto';
                    }
                } else {
                    roamingContainer.style.left = '';
                    roamingContainer.style.top = '';
                    roamingContainer.style.bottom = '6px';
                    roamingContainer.style.right = '90px';
                }
            } catch(e) {}

            roamingContainer.addEventListener('mouseenter', handleHoverEnter);
            roamingContainer.addEventListener('mouseleave', handleHoverLeave);

            // Double click on pet resets position to default bottom-right
            roamingContainer.addEventListener('dblclick', (e) => {
                e.preventDefault();
                resetPosition();
            });

            roamingContainer.addEventListener('mousedown', (e) => {
                if (e.target.closest('#pet-speech-actions') || e.target.closest('button')) return;
                isDraggingPet = true;
                hasMoved = false;
                dragPetStart = { x: e.clientX, y: e.clientY };
                roamingContainer.classList.remove('shifted-for-panel');
                const rect = roamingContainer.getBoundingClientRect();
                petStartPos = { left: rect.left, top: rect.top };
                roamingContainer.style.transition = 'none';
                roamingContainer.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDraggingPet) return;
                const dx = e.clientX - dragPetStart.x;
                const dy = e.clientY - dragPetStart.y;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    hasMoved = true;
                }
                if (hasMoved) {
                    const newLeft = Math.max(10, Math.min(window.innerWidth - 175, petStartPos.left + dx));
                    const newTop = Math.max(10, Math.min(window.innerHeight - 200, petStartPos.top + dy));
                    roamingContainer.style.left = newLeft + 'px';
                    roamingContainer.style.top = newTop + 'px';
                    roamingContainer.style.bottom = 'auto';
                    roamingContainer.style.right = 'auto';
                }
            });

            window.addEventListener('mouseup', (e) => {
                if (!isDraggingPet) return;
                isDraggingPet = false;
                roamingContainer.style.cursor = 'grab';
                roamingContainer.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';

                if (hasMoved) {
                    const rect = roamingContainer.getBoundingClientRect();
                    localStorage.setItem('roaming_pet_pos', JSON.stringify({ left: rect.left, top: rect.top }));
                } else {
                    if (!e.target.closest('#pet-speech-actions')) {
                        triggerClickRun();
                    }
                }
            });
        }

        const panelDisplay = document.getElementById('pet-display');
        if (panelDisplay) {
            panelDisplay.addEventListener('mouseenter', handleHoverEnter);
            panelDisplay.addEventListener('mouseleave', handleHoverLeave);
            panelDisplay.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.pet-stage-badge')) return;
                triggerClickRun();
            });
        }

        window.addEventListener('resize', () => {
            [roaming, panel].forEach(vp => {
                if (vp && vp.camera) {
                    vp.camera.aspect = vp.width / vp.height;
                    vp.camera.updateProjectionMatrix();
                    vp.renderer.setSize(vp.width, vp.height);
                }
            });
        });
    }

    function showBubble(text, tag = '', duration = 4000, actionsHtml = '') {
        const bubble = document.getElementById('pet-speech-bubble');
        if (!bubble) return;

        const tagEl = document.getElementById('pet-speech-tag');
        const textEl = document.getElementById('pet-speech-text');
        const actEl = document.getElementById('pet-speech-actions');

        if (tagEl) tagEl.textContent = tag;
        if (textEl) textEl.innerHTML = text;
        if (actEl) actEl.innerHTML = actionsHtml;

        bubble.classList.add('visible');

        if (window._petBubbleTimeout) clearTimeout(window._petBubbleTimeout);
        if (duration > 0) {
            window._petBubbleTimeout = setTimeout(() => {
                bubble.classList.remove('visible');
            }, duration);
        }
    }

    function hideBubble() {
        const bubble = document.getElementById('pet-speech-bubble');
        if (bubble) bubble.classList.remove('visible');
    }

    function checkErgonomicsTimer() {
        setInterval(() => {
            const tips = [
                'Uống một ngụm nước ấm cho tỉnh táo nha! 💧',
                'Hãy chớp mắt nhìn ra xa 20 giây để thư giãn mắt nhé! 🌿',
                'Ngồi thẳng lưng lên nào bạn ơi! 🪑',
                'Vươn vai một cái thật sảng khoái nào! 🧘'
            ];
            const tip = tips[Math.floor(Math.random() * tips.length)];
            showBubble(tip, '⏰ Nhắc nhở sức khỏe', 6000);
        }, 45 * 60 * 1000);
    }

    function switchSpecies(species) {
        if (SPECIES_CONFIG[species]) {
            currentSpecies = species;
            buildPets(species);
        }
    }

    function syncPet(data) {
        petData = data || {};
        if (petData.type && petData.type !== currentSpecies && SPECIES_CONFIG[petData.type]) {
            switchSpecies(petData.type);
        }
    }

    function disposeHierarchy(obj) {
        if (!obj) return;
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    function fallbackTo2D() {
        is3DActive = false;
        const roamingBox = document.querySelector('#roaming-pet-container .pet-3d-canvas-box');
        if (roamingBox) {
            roamingBox.innerHTML = `<img src="/static/img/pet/1.gif" style="width:100%;height:100%;object-fit:contain;" alt="Pet">`;
        }
    }

    function getOrCreateSwitchPreview() {
        const canvas = document.getElementById('switch-pet-preview-canvas');
        if (!canvas) return null;
        if (!switchPreview) {
            switchPreview = createViewport('switch-pet-preview-canvas', 210, 190, { x: 1.15, y: 1.05, z: 2.45 }, { x: 0, y: 0.46, z: 0 });
        }
        return switchPreview;
    }

    function previewSpecies(species) {
        if (!species || !SPECIES_CONFIG[species]) return;
        const vp = getOrCreateSwitchPreview();
        if (!vp) return;
        loadModelForViewport(vp, species);
    }

    return {
        init,
        poke: triggerClickRun,
        run: triggerClickRun,
        feed,
        celebrate,
        setDancing,
        setPose,
        getCurrentPose: () => currentPose,
        showBubble,
        hideBubble,
        switchSpecies,
        previewSpecies,
        getOrCreateSwitchPreview,
        syncPet,
        resetPosition,
        onPanelShow,
        SPECIES_CONFIG
    };
})();
