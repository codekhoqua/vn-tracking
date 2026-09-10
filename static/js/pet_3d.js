/**
 * 🐾 VN-Tracking 3D Virtual Pet Engine - Real 3D Animated Pets Edition
 * Dual Viewport: Outside Roaming Pet & Inside My Pet Menu
 * 
 * Features:
 * - Real Skeletal Rigged 3D Models (GLTF / GLB)
 * - True Skeletal Animations: Idle, Walk/Run, Eating, Jumping, Cheerful Dances
 * - Auto-Fit Bounding Box Normalization (Perfect Framing on all screen sizes)
 * - Dual Viewports: Roaming (#roaming-pet-canvas) & Panel (#panel-pet-canvas)
 * - LookAt Cursor tracking: Smooth realistic head/body tilt towards cursor
 * - 3D Neon DJ Headphones with audio sync
 * - Interactive Treat Feeding & Heart/Star particle effects
 * - Ergonomics Water Reminder & AI Brief integration
 */

window.Pet3DEngine = (function () {
    let petData = null;
    let currentSpecies = 'shiba';
    let is3DActive = true;
    let animationFrameId = null;
    let clock = null;

    // Animation states
    let isDancing = false;
    let isEating = false;
    let isJumping = false;
    let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Viewports: 1. Roaming (Outside bottom-right) & 2. Panel (Inside My Pet menu)
    let roaming = null;
    let panel = null;

    // Model loader instance
    let gltfLoader = null;
    const modelCache = {};

    // Real 3D Animated Pet Configurations
    const SPECIES_CONFIG = {
        shiba: {
            modelUrl: '/static/models/shiba.gltf',
            name_vi: 'Chó Shiba',
            emoji: '🐕',
            sound: 'Gâu gâu! Woof! 🐾',
            food_name: 'Xương thịt 🍖',
            targetHeight: 1.32,
            rotOffsetY: -0.35,
            camY: 0.48
        },
        neko: {
            modelUrl: '/static/models/cat.glb',
            name_vi: 'Mèo Neko',
            emoji: '🐈',
            sound: 'Nya~ Meow! 🐾',
            food_name: 'Cá hồi 🐟',
            targetHeight: 1.25,
            rotOffsetY: -0.32,
            camY: 0.42
        },
        fox: {
            modelUrl: '/static/models/fox.glb',
            name_vi: 'Cáo Kitsune',
            emoji: '🦊',
            sound: 'Kon kon~ 🍂',
            food_name: 'Bánh đậu 🥮',
            targetHeight: 1.28,
            rotOffsetY: -0.35,
            camY: 0.45
        },
        husky: {
            modelUrl: '/static/models/husky.gltf',
            name_vi: 'Chó Husky',
            emoji: '🐺',
            sound: 'Awoo~ Gâu gâu! 🐾',
            food_name: 'Thịt bò 🥩',
            targetHeight: 1.34,
            rotOffsetY: -0.35,
            camY: 0.50
        },
        bunny: {
            modelUrl: '/static/models/alpaca.gltf',
            name_vi: 'Lạc đà Alpaca',
            emoji: '🦙',
            sound: 'Pyon pyon~ 🥕',
            food_name: 'Cỏ tươi 🌿',
            targetHeight: 1.30,
            rotOffsetY: -0.35,
            camY: 0.52
        },
        panda: {
            modelUrl: '/static/models/husky.gltf',
            name_vi: 'Gấu Trúc / Husky',
            emoji: '🐼',
            sound: 'Panda roll~ 🎋',
            food_name: 'Cành trúc 🎋',
            targetHeight: 1.34,
            rotOffsetY: -0.35,
            camY: 0.50
        },
        dragon: {
            modelUrl: '/static/models/deer.gltf',
            name_vi: 'Hươu Sao / Thần Thú',
            emoji: '🦌',
            sound: 'Grrr~ Phì phì! 💫',
            food_name: 'Lộc biếc 🌿',
            targetHeight: 1.32,
            rotOffsetY: -0.35,
            camY: 0.52
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
        // Remove legacy 2D img elements
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
        renderer.toneMappingExposure = 1.15;
        if (THREE.sRGBEncoding) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }

        // Professional Studio Lighting for 3D Character Rendering
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.15);
        scene.add(hemiLight);

        const keyLight = new THREE.DirectionalLight(0xfffaed, 1.35);
        keyLight.position.set(2.5, 4.5, 3.5);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.bias = -0.001;
        scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xbfdbfe, 0.65);
        fillLight.position.set(-3, 2, 2);
        scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xfef08a, 0.6);
        rimLight.position.set(0, 3, -3);
        scene.add(rimLight);

        // Ground Contact Shadow Disk
        const shadowGeo = new THREE.CircleGeometry(0.55, 24);
        shadowGeo.scale(1.0, 1.4, 1.0);
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.set(0, 0.015, 0);
        scene.add(shadowMesh);

        const particleGroup = new THREE.Group();
        scene.add(particleGroup);

        return {
            canvas,
            scene,
            camera,
            renderer,
            particleGroup,
            particles: [],
            modelGroup: null,
            mixer: null,
            animations: [],
            actions: {},
            currentAction: null,
            headphonesMesh: null,
            foodMesh: null,
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
            if (typeof THREE.GLTFLoader !== 'undefined') {
                gltfLoader = new THREE.GLTFLoader();
            } else {
                console.warn('[Pet3D] GLTFLoader not loaded, will attempt dynamic load.');
            }

            roaming = createViewport('roaming-pet-canvas', 160, 170, { x: 1.1, y: 1.05, z: 2.5 }, { x: 0, y: 0.46, z: 0 });
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
    // 🐾 REAL 3D ANIMATED MODEL LOADER
    // ==========================================
    function loadModelForViewport(vp, species) {
        if (!vp || !vp.scene) return;
        const cfg = SPECIES_CONFIG[species] || SPECIES_CONFIG['shiba'];

        // Clean up previous model in this viewport
        if (vp.modelGroup) {
            vp.scene.remove(vp.modelGroup);
            disposeHierarchy(vp.modelGroup);
            vp.modelGroup = null;
        }
        if (vp.mixer) {
            vp.mixer.stopAllAction();
            vp.mixer = null;
        }
        vp.actions = {};
        vp.currentAction = null;
        vp.headphonesMesh = null;

        const loader = gltfLoader || (typeof THREE.GLTFLoader !== 'undefined' ? new THREE.GLTFLoader() : null);
        if (!loader) {
            console.warn('[Pet3D] GLTFLoader unavailable, using procedural fallback.');
            buildProceduralFallback(vp, cfg);
            return;
        }

        loader.load(cfg.modelUrl, (gltf) => {
            const root = gltf.scene;

            // Enable shadows & smooth materials
            root.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.roughness = Math.min(child.material.roughness || 0.45, 0.65);
                    }
                }
            });

            // Automatic bounding box normalization & centering
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;

            const targetHeight = cfg.targetHeight || 1.3;
            const scale = targetHeight / maxDim;

            const modelWrapper = new THREE.Group();
            modelWrapper.position.set(0, 0, 0);
            modelWrapper.rotation.y = cfg.rotOffsetY || -0.35;

            root.scale.setScalar(scale);
            root.position.x = -center.x * scale;
            root.position.y = -box.min.y * scale; // paw base at ground y = 0
            root.position.z = -center.z * scale;

            modelWrapper.add(root);

            // 3D Neon DJ Headphones attached to pet
            const headY = (box.max.y - box.min.y) * scale * 0.95;
            const hpGroup = createHeadphonesMesh();
            hpGroup.position.set(0, headY, 0);
            hpGroup.visible = isDancing;
            modelWrapper.add(hpGroup);
            vp.headphonesMesh = hpGroup;

            // Setup Skeletal Animation Mixer
            if (gltf.animations && gltf.animations.length > 0) {
                vp.animations = gltf.animations;
                vp.mixer = new THREE.AnimationMixer(root);

                gltf.animations.forEach(clip => {
                    const action = vp.mixer.clipAction(clip);
                    vp.actions[clip.name] = action;
                });

                // Play default idle animation
                playAnimation(vp, isDancing ? 'dance' : 'idle');
            }

            vp.modelGroup = modelWrapper;
            vp.scene.add(modelWrapper);

            // Adjust camera lookAt
            if (cfg.camY) {
                vp.camera.lookAt(0, cfg.camY, 0);
            }
        }, undefined, (err) => {
            console.error('[Pet3D] Error loading 3D model:', cfg.modelUrl, err);
            buildProceduralFallback(vp, cfg);
        });
    }

    function playAnimation(vp, animType) {
        if (!vp || !vp.mixer || !vp.animations || vp.animations.length === 0) return;

        const anims = vp.animations;
        let targetClip = null;

        if (animType === 'eat') {
            targetClip = anims.find(a => a.name.toLowerCase().includes('eat')) || anims[0];
        } else if (animType === 'jump') {
            targetClip = anims.find(a => a.name.toLowerCase().includes('jump') || a.name.toLowerCase().includes('headbutt') || a.name.toLowerCase().includes('attack')) || anims[0];
        } else if (animType === 'dance') {
            targetClip = anims.find(a => a.name.toLowerCase().includes('gallop') || a.name.toLowerCase().includes('run') || a.name.toLowerCase().includes('walk')) || anims[0];
        } else {
            // Idle
            targetClip = anims.find(a => a.name.toLowerCase().includes('idle') || a.name.toLowerCase().includes('survey')) || anims[0];
        }

        if (!targetClip) return;
        const newAction = vp.actions[targetClip.name] || vp.mixer.clipAction(targetClip);
        if (vp.currentAction === newAction && newAction.isRunning()) return;

        if (vp.currentAction) {
            vp.currentAction.fadeOut(0.25);
        }

        newAction.reset().fadeIn(0.25).play();

        if (animType === 'eat' || animType === 'jump') {
            newAction.setLoop(THREE.LoopOnce);
            newAction.clampWhenFinished = false;
        } else {
            newAction.setLoop(THREE.LoopRepeat);
        }

        vp.currentAction = newAction;
    }

    function createHeadphonesMesh() {
        const hpGroup = new THREE.Group();
        const bandMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.2, metalness: 0.3 });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 24, Math.PI), bandMat);
        band.rotation.x = -Math.PI / 2;
        band.rotation.z = Math.PI / 2;
        hpGroup.add(band);

        [-0.38, 0.38].forEach((x) => {
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), bandMat);
            cup.rotateZ(Math.PI / 2);
            cup.position.set(x, 0, 0);
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.10, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }));
            ring.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
            ring.position.set(x + (x > 0 ? 0.045 : -0.045), 0, 0);
            hpGroup.add(cup);
            hpGroup.add(ring);
        });
        return hpGroup;
    }

    function buildProceduralFallback(vp, cfg) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xdf8435, roughness: 0.4 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20), mat);
        body.position.y = 0.45;
        group.add(body);
        vp.modelGroup = group;
        vp.scene.add(group);
    }

    function buildPets(species) {
        currentSpecies = species;
        loadModelForViewport(roaming, species);
        loadModelForViewport(panel, species);
    }

    function setDancing(active) {
        isDancing = active;
        [roaming, panel].forEach(vp => {
            if (!vp) return;
            if (vp.headphonesMesh) {
                vp.headphonesMesh.visible = active;
            }
            playAnimation(vp, active ? 'dance' : 'idle');
        });
        if (active) {
            spawnParticles('note', 4);
        }
    }

    function poke() {
        if (isJumping) return;
        isJumping = true;
        spawnParticles('heart', 5);

        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        showBubble(cfg.sound, '🐾 Cưng nựng', 3000);

        [roaming, panel].forEach(vp => {
            if (!vp) return;
            playAnimation(vp, 'jump');
        });

        if (window.triggerPetBrief) {
            window.triggerPetBrief();
        }

        setTimeout(() => {
            isJumping = false;
            [roaming, panel].forEach(vp => {
                if (!vp) return;
                playAnimation(vp, isDancing ? 'dance' : 'idle');
            });
        }, 1600);
    }

    function feed() {
        if (isEating) return;
        isEating = true;
        spawnParticles('star', 6);

        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];

        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene) return;
            playAnimation(vp, 'eat');

            // Drop 3D treat
            const foodMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25 });
            const foodGeo = new THREE.DodecahedronGeometry(0.12);
            vp.foodMesh = new THREE.Mesh(foodGeo, foodMat);
            vp.foodMesh.position.set(0, 1.45, 0.25);
            vp.scene.add(vp.foodMesh);
        });

        showBubble(`Ngon quá! +10 XP 🎉`, '🍖 Đang ăn...', 3000);

        setTimeout(() => {
            isEating = false;
            [roaming, panel].forEach(vp => {
                if (!vp) return;
                playAnimation(vp, isDancing ? 'dance' : 'idle');
            });
        }, 2200);
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
        if (!vp || !vp.canvas || vp.canvas.offsetParent === null) return;

        // Update skeletal animations
        if (vp.mixer) {
            vp.mixer.update(delta);
        }

        // Smooth LookAt Cursor
        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];
        const baseRotY = cfg.rotOffsetY || -0.35;
        const targetRotY = baseRotY + (mousePos.x / window.innerWidth - 0.5) * 0.65;
        const targetRotX = (mousePos.y / window.innerHeight - 0.5) * 0.22;

        if (vp.modelGroup) {
            vp.modelGroup.rotation.y += (targetRotY - vp.modelGroup.rotation.y) * 0.08;
            vp.modelGroup.rotation.x += (targetRotX - vp.modelGroup.rotation.x) * 0.08;
        }

        // Food falling physics
        if (isEating && vp.foodMesh) {
            vp.foodMesh.position.y -= 0.032;
            vp.foodMesh.rotation.x += 0.08;
            vp.foodMesh.rotation.y += 0.08;

            if (vp.foodMesh.position.y <= 0.35) {
                vp.scene.remove(vp.foodMesh);
                vp.foodMesh.geometry.dispose();
                vp.foodMesh.material.dispose();
                vp.foodMesh = null;
            }
        }

        // DJ beat dancing bounce
        if (isDancing && vp.modelGroup) {
            const beat = time * 7.5;
            vp.modelGroup.position.y = Math.abs(Math.sin(beat)) * 0.06;
            if (Math.random() < 0.02) {
                spawnParticles('note', 1);
            }
        } else if (vp.modelGroup) {
            vp.modelGroup.position.y = 0;
        }

        updateParticlesFor(vp);
        vp.renderer.render(vp.scene, vp.camera);
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        const time = clock ? clock.getElapsedTime() : 0;
        const delta = clock ? clock.getDelta() : 0.016;

        updateViewportAnimation(roaming, time, delta);
        updateViewportAnimation(panel, time, delta);
    }

    function setupListeners() {
        window.addEventListener('mousemove', (e) => {
            mousePos.x = e.clientX;
            mousePos.y = e.clientY;
        }, { passive: true });

        const roamingContainer = document.getElementById('roaming-pet-container');
        if (roamingContainer) {
            roamingContainer.addEventListener('click', (e) => {
                if (e.target.closest('#pet-speech-actions')) return;
                poke();
            });
        }

        const panelDisplay = document.getElementById('pet-display');
        if (panelDisplay) {
            panelDisplay.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.pet-stage-badge')) return;
                poke();
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

    return {
        init,
        poke,
        feed,
        setDancing,
        showBubble,
        hideBubble,
        switchSpecies,
        syncPet,
        SPECIES_CONFIG
    };
})();
