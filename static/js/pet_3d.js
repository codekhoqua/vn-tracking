/**
 * 🐾 VN-Tracking 3D Virtual Pet Engine (Dual Viewport: Outside Roaming & Inside Panel)
 * Powered by Three.js & Modern Interactive Canvas
 * Supports: Shiba, Neko (Cat), Bunny, Fox, Panda, Baby Dragon
 * Features: Dual 3D Rendering (Outside & Inside Menu), LookAt Cursor, Poke/Jump, Feed physics, DJ Dance Mode, Smart Notifications
 */

window.Pet3DEngine = (function () {
    let petData = null;
    let currentSpecies = 'shiba';
    let is3DActive = true;
    let animationFrameId = null;
    let clock = null;

    // Animation States (Synchronized between both outside and inside viewports)
    let isDancing = false;
    let isEating = false;
    let isJumping = false;
    let jumpTime = 0;
    let eatProgress = 0;
    let mousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    // Viewports: 1. Roaming (Outside bottom-right) & 2. Panel (Inside My Pet modal)
    let roaming = null;
    let panel = null;

    // Species Color & Design Palette
    const SPECIES_CONFIG = {
        shiba: {
            bodyColor: 0xdf9845,
            bellyColor: 0xfff0dd,
            noseColor: 0x221a15,
            earInner: 0xf5b7b1,
            tailCurled: true,
            hasWings: false,
            hasHorns: false,
            foodColor: 0xf8fafc,
            sound: 'Gâu gâu! 🐾',
            name_vi: 'Chó Shiba',
            emoji: '🐕'
        },
        neko: {
            bodyColor: 0xf1f5f9,
            bellyColor: 0xffffff,
            earInner: 0xfbcfe8,
            noseColor: 0xf472b6,
            tailCurled: false,
            hasWings: false,
            hasHorns: false,
            foodColor: 0x38bdf8,
            sound: 'Nya~ Meow! 🐾',
            name_vi: 'Mèo Neko',
            emoji: '🐈'
        },
        bunny: {
            bodyColor: 0xffffff,
            bellyColor: 0xfff1f2,
            earInner: 0xfecdd3,
            noseColor: 0xf43f5e,
            tailCurled: false,
            longEars: true,
            hasWings: false,
            hasHorns: false,
            foodColor: 0xf97316,
            sound: 'Pyon pyon~ 🥕',
            name_vi: 'Thỏ Bunny',
            emoji: '🐰'
        },
        fox: {
            bodyColor: 0xea580c,
            bellyColor: 0xffffff,
            earInner: 0x1e293b,
            noseColor: 0x0f172a,
            tailCurled: false,
            bushyTail: true,
            hasWings: false,
            hasHorns: false,
            foodColor: 0xa855f7,
            sound: 'Kon kon~ 🍂',
            name_vi: 'Cáo Kitsune',
            emoji: '🦊'
        },
        panda: {
            bodyColor: 0xffffff,
            bellyColor: 0x0f172a,
            earInner: 0x0f172a,
            noseColor: 0x0f172a,
            eyePatch: true,
            tailCurled: false,
            hasWings: false,
            hasHorns: false,
            foodColor: 0x22c55e,
            sound: 'Panda roll~ 🎋',
            name_vi: 'Gấu Trúc',
            emoji: '🐼'
        },
        dragon: {
            bodyColor: 0x0ea5e9,
            bellyColor: 0xfef08a,
            earInner: 0x38bdf8,
            noseColor: 0x0369a1,
            tailCurled: false,
            hasWings: true,
            hasHorns: true,
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

        // Check if radio was already playing
        if (window.radioState && window.radioState.is_playing && window.isListening) {
            setDancing(true);
        }
    }

    function createDOM() {
        // Clean up legacy 2D pet elements
        document.querySelectorAll('img[src*="/static/img/pet/"], img[src*="2.gif"], img[src*="1.gif"]').forEach(img => {
            img.remove();
        });

        // 1. OUTSIDE ROAMING PET CONTAINER (Bottom Right)
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

        // 2. INSIDE PANEL PET CONTAINER (#pet-display)
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

    function createToonMaterial(colorHex, roughness = 0.4) {
        return new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: roughness,
            metalness: 0.05
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
            powerPreference: 'low-power'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Ambient & Directional Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.88);
        scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.15);
        dirLight.position.set(2, 4, 3);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 512;
        dirLight.shadow.mapSize.height = 512;
        scene.add(dirLight);

        const softFill = new THREE.DirectionalLight(0xdbeafe, 0.45);
        softFill.position.set(-2, -1, 1);
        scene.add(softFill);

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
            leftWing: null,
            rightWing: null,
            headphonesMesh: null,
            foodMesh: null,
            width,
            height
        };
    }

    function initThree() {
        if (typeof THREE === 'undefined') {
            console.warn('[Pet3D] Three.js not found, fallback to 2D sprite.');
            fallbackTo2D();
            return;
        }

        try {
            clock = new THREE.Clock();

            // Create Outside Roaming Viewport
            roaming = createViewport('roaming-pet-canvas', 160, 170, { x: 0, y: 0.9, z: 3.8 }, { x: 0, y: 0.45, z: 0 });

            // Create Inside Panel Viewport
            panel = createViewport('panel-pet-canvas', 150, 150, { x: 0, y: 0.85, z: 3.8 }, { x: 0, y: 0.52, z: 0 });

            if (!roaming && !panel) {
                console.error('[Pet3D] Failed to find either canvas');
                return;
            }

            // Start animation loop
            if (!animationFrameId) {
                animate();
            }
        } catch (err) {
            console.error('[Pet3D] WebGL init error:', err);
            fallbackTo2D();
        }
    }

    // Procedural Stylized 3D Pet Model Builder
    function buildPetModel(species) {
        const cfg = SPECIES_CONFIG[species] || SPECIES_CONFIG['shiba'];
        const petGroup = new THREE.Group();
        petGroup.position.set(0, -0.1, 0);

        const bodyMat = createToonMaterial(cfg.bodyColor);
        const bellyMat = createToonMaterial(cfg.bellyColor);
        const noseMat = createToonMaterial(cfg.noseColor);
        const earInnerMat = createToonMaterial(cfg.earInner);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x18181b });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // 1. BODY
        const bodyGeo = new THREE.SphereGeometry(0.55, 20, 20);
        bodyGeo.scale(1.0, 1.05, 1.15);
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.set(0, 0.45, 0);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        petGroup.add(bodyMesh);

        // Belly patch
        const bellyGeo = new THREE.SphereGeometry(0.48, 16, 16);
        bellyGeo.scale(0.85, 0.9, 0.6);
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.position.set(0, 0.4, 0.38);
        petGroup.add(belly);

        // 2. HEAD
        const headMesh = new THREE.Group();
        headMesh.position.set(0, 0.92, 0.18);

        const headGeo = new THREE.SphereGeometry(0.5, 22, 22);
        headGeo.scale(1.05, 0.98, 1.0);
        const headMain = new THREE.Mesh(headGeo, bodyMat);
        headMain.castShadow = true;
        headMesh.add(headMain);

        // Cheeks / Snout
        const snoutGeo = new THREE.SphereGeometry(0.24, 16, 16);
        snoutGeo.scale(0.9, 0.7, 1.0);
        const snout = new THREE.Mesh(snoutGeo, bellyMat);
        snout.position.set(0, -0.06, 0.38);
        headMesh.add(snout);

        // Nose
        const noseGeo = new THREE.SphereGeometry(0.06, 12, 12);
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.set(0, 0.02, 0.58);
        headMesh.add(nose);

        // Eyes
        [-0.2, 0.2].forEach((x) => {
            if (cfg.eyePatch) {
                // Panda Eye Patch
                const patchGeo = new THREE.SphereGeometry(0.14, 12, 12);
                patchGeo.scale(1, 1.2, 0.4);
                const patch = new THREE.Mesh(patchGeo, noseMat);
                patch.position.set(x, 0.06, 0.4);
                patch.rotation.z = x > 0 ? -0.2 : 0.2;
                headMesh.add(patch);
            }

            const eyeGeo = new THREE.SphereGeometry(0.065, 12, 12);
            eyeGeo.scale(1, 1.1, 0.5);
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(x, 0.07, 0.44);
            headMesh.add(eye);

            const pupilGeo = new THREE.SphereGeometry(0.022, 8, 8);
            const pupil = new THREE.Mesh(pupilGeo, pupilMat);
            pupil.position.set(x + (x > 0 ? -0.015 : 0.015), 0.09, 0.47);
            headMesh.add(pupil);
        });

        // Blush marks
        [-0.32, 0.32].forEach((x) => {
            const blushGeo = new THREE.CircleGeometry(0.065, 12);
            const blushMat = new THREE.MeshBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.65 });
            const blush = new THREE.Mesh(blushGeo, blushMat);
            blush.position.set(x, -0.04, 0.43);
            blush.rotation.y = x > 0 ? 0.4 : -0.4;
            headMesh.add(blush);
        });

        // 3. EARS
        if (cfg.longEars) {
            [-0.18, 0.18].forEach((x) => {
                const earGeo = new THREE.CylinderGeometry(0.09, 0.06, 0.65, 12);
                earGeo.scale(0.8, 1, 0.4);
                const ear = new THREE.Mesh(earGeo, bodyMat);
                ear.position.set(x, 0.65, -0.05);
                ear.rotation.z = x > 0 ? -0.15 : 0.15;
                headMesh.add(ear);

                const innerEarGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.52, 10);
                innerEarGeo.scale(0.7, 1, 0.2);
                const inner = new THREE.Mesh(innerEarGeo, earInnerMat);
                inner.position.set(x, 0.65, -0.02);
                inner.rotation.z = x > 0 ? -0.15 : 0.15;
                headMesh.add(inner);
            });
        } else {
            [-0.3, 0.3].forEach((x) => {
                const isPanda = species === 'panda';
                const earGeo = isPanda ? new THREE.SphereGeometry(0.14, 12, 12) : new THREE.ConeGeometry(0.18, 0.3, 10);
                const ear = new THREE.Mesh(earGeo, bodyMat);
                ear.position.set(x, 0.42, 0.05);
                ear.rotation.z = isPanda ? 0 : (x > 0 ? -0.4 : 0.4);
                ear.rotation.x = -0.1;
                headMesh.add(ear);

                if (!isPanda) {
                    const innerGeo = new THREE.ConeGeometry(0.11, 0.22, 8);
                    const inner = new THREE.Mesh(innerGeo, earInnerMat);
                    inner.position.set(x, 0.42, 0.09);
                    inner.rotation.z = x > 0 ? -0.4 : 0.4;
                    inner.rotation.x = -0.08;
                    headMesh.add(inner);
                }
            });
        }

        // Dragon Horns
        if (cfg.hasHorns) {
            [-0.22, 0.22].forEach((x) => {
                const hornGeo = new THREE.ConeGeometry(0.08, 0.35, 8);
                const hornMat = createToonMaterial(0xfde047);
                const horn = new THREE.Mesh(hornGeo, hornMat);
                horn.position.set(x, 0.46, -0.05);
                horn.rotation.z = x > 0 ? -0.3 : 0.3;
                horn.rotation.x = -0.2;
                headMesh.add(horn);
            });
        }

        // 4. ACCESSORIES: 3D DJ Headphones
        const headphonesMesh = new THREE.Group();
        const hpMat = createToonMaterial(0x6366f1);
        const bandGeo = new THREE.TorusGeometry(0.48, 0.04, 8, 20, Math.PI);
        const band = new THREE.Mesh(bandGeo, hpMat);
        band.rotation.x = -Math.PI / 2;
        band.rotation.z = Math.PI / 2;
        band.position.set(0, 0.22, 0);
        headphonesMesh.add(band);

        [-0.48, 0.48].forEach((x) => {
            const cupGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.09, 14);
            cupGeo.rotateZ(Math.PI / 2);
            const cup = new THREE.Mesh(cupGeo, hpMat);
            cup.position.set(x, 0.22, 0);

            const ringGeo = new THREE.RingGeometry(0.06, 0.11, 14);
            ringGeo.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(x + (x > 0 ? 0.05 : -0.05), 0.22, 0);
            headphonesMesh.add(cup);
            headphonesMesh.add(ring);
        });

        headphonesMesh.visible = isDancing;
        headMesh.add(headphonesMesh);
        petGroup.add(headMesh);

        // 5. PAWS
        const pawMat = species === 'panda' ? noseMat : bellyMat;
        [
            [-0.28, 0.12, 0.35],
            [0.28, 0.12, 0.35],
            [-0.32, 0.1, -0.22],
            [0.32, 0.1, -0.22]
        ].forEach((pos) => {
            const pawGeo = new THREE.SphereGeometry(0.14, 12, 12);
            pawGeo.scale(1, 0.7, 1.2);
            const paw = new THREE.Mesh(pawGeo, pawMat);
            paw.position.set(...pos);
            paw.castShadow = true;
            petGroup.add(paw);
        });

        // 6. TAIL
        let tailMesh = null;
        if (cfg.tailCurled) {
            const tailGeo = new THREE.TorusGeometry(0.16, 0.08, 10, 16, Math.PI * 1.4);
            tailMesh = new THREE.Mesh(tailGeo, bodyMat);
            tailMesh.position.set(0, 0.55, -0.5);
            tailMesh.rotation.x = Math.PI / 2.2;
            petGroup.add(tailMesh);
        } else if (cfg.bushyTail) {
            const tailGeo = new THREE.ConeGeometry(0.24, 0.65, 12);
            tailGeo.scale(1, 1, 0.8);
            tailMesh = new THREE.Mesh(tailGeo, bodyMat);
            tailMesh.position.set(0, 0.5, -0.65);
            tailMesh.rotation.x = -Math.PI / 3;
            petGroup.add(tailMesh);
        } else {
            const length = species === 'bunny' ? 0.18 : 0.45;
            const tailGeo = new THREE.CylinderGeometry(0.05, 0.08, length, 10);
            tailMesh = new THREE.Mesh(tailGeo, bodyMat);
            tailMesh.position.set(0, 0.35, -0.5);
            tailMesh.rotation.x = -Math.PI / 4;
            petGroup.add(tailMesh);
        }

        // 7. DRAGON WINGS
        let leftWing = null;
        let rightWing = null;
        if (cfg.hasWings) {
            leftWing = createWingMesh(true, bodyMat);
            rightWing = createWingMesh(false, bodyMat);
            leftWing.position.set(-0.35, 0.6, -0.15);
            rightWing.position.set(0.35, 0.6, -0.15);
            petGroup.add(leftWing);
            petGroup.add(rightWing);
        }

        return {
            petGroup,
            headMesh,
            bodyMesh,
            tailMesh,
            leftWing,
            rightWing,
            headphonesMesh
        };
    }

    function createWingMesh(isLeft, mat) {
        const wingGroup = new THREE.Group();
        const wingGeo = new THREE.ConeGeometry(0.25, 0.5, 4);
        wingGeo.scale(1, 0.15, 0.8);
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
        vp.leftWing = model.leftWing;
        vp.rightWing = model.rightWing;
        vp.headphonesMesh = model.headphonesMesh;

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
        spawnParticles('heart', 3);

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
        spawnParticles('star', 5);

        const cfg = SPECIES_CONFIG[currentSpecies] || SPECIES_CONFIG['shiba'];

        [roaming, panel].forEach(vp => {
            if (!vp || !vp.scene) return;
            const foodMat = createToonMaterial(cfg.foodColor);
            const foodGeo = new THREE.DodecahedronGeometry(0.18);
            vp.foodMesh = new THREE.Mesh(foodGeo, foodMat);
            vp.foodMesh.position.set(0, 1.8, 0.4);
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

    function updateViewportAnimation(vp, time) {
        if (!vp || !vp.petGroup || !vp.canvas || vp.canvas.offsetParent === null) return;

        // 1. LookAt Cursor interpolation
        const targetRotY = (mousePos.x / window.innerWidth - 0.5) * 0.7;
        const targetRotX = (mousePos.y / window.innerHeight - 0.5) * 0.3;

        if (vp.headMesh) {
            vp.headMesh.rotation.y += (targetRotY - vp.headMesh.rotation.y) * 0.08;
            vp.headMesh.rotation.x += (targetRotX - vp.headMesh.rotation.x) * 0.08;
        }

        // 2. Idle Breathing & Tail Wagging
        const breath = Math.sin(time * 2.8) * 0.03;
        if (vp.bodyMesh) {
            vp.bodyMesh.scale.set(1.0 + breath * 0.5, 1.05 + breath, 1.15);
        }

        if (vp.tailMesh) {
            vp.tailMesh.rotation.z = Math.sin(time * 5.0) * 0.25;
        }

        if (vp.leftWing && vp.rightWing) {
            vp.leftWing.rotation.z = Math.PI / 3 + Math.sin(time * 4.0) * 0.2;
            vp.rightWing.rotation.z = -Math.PI / 3 - Math.sin(time * 4.0) * 0.2;
        }

        // 3. Jump Animation
        if (isJumping) {
            vp.petGroup.position.y = -0.1 + Math.sin(jumpTime * Math.PI) * 0.45;
            vp.petGroup.rotation.y += 0.2;
        } else if (!isDancing) {
            vp.petGroup.position.y = -0.1;
            vp.petGroup.rotation.y = 0;
        }

        // 4. Feed Animation
        if (isEating && vp.foodMesh) {
            vp.foodMesh.position.y -= 0.035;
            vp.foodMesh.rotation.x += 0.08;
            vp.foodMesh.rotation.y += 0.08;

            if (vp.headMesh) {
                vp.headMesh.rotation.x = -0.25;
            }

            if (vp.foodMesh.position.y <= 0.8) {
                vp.scene.remove(vp.foodMesh);
                vp.foodMesh.geometry.dispose();
                vp.foodMesh.material.dispose();
                vp.foodMesh = null;
            }
        }

        // 5. DJ Dancing Animation
        if (isDancing && !isJumping) {
            const beat = time * 8.0;
            vp.petGroup.position.y = -0.1 + Math.abs(Math.sin(beat)) * 0.12;
            vp.petGroup.rotation.z = Math.sin(beat * 0.5) * 0.12;
            if (vp.headMesh) {
                vp.headMesh.rotation.z = -Math.sin(beat * 0.5) * 0.15;
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

        const time = clock.getElapsedTime();

        // Advance global jump time
        if (isJumping) {
            jumpTime += 0.08;
            if (jumpTime >= 1.0) {
                isJumping = false;
            }
        }

        // Advance global eating progress
        if (isEating) {
            eatProgress += 0.04;
            if (eatProgress >= 1.0) {
                isEating = false;
                spawnParticles('star', 3);
            }
        }

        // Render both viewports (Outside & Inside Panel)
        updateViewportAnimation(roaming, time);
        updateViewportAnimation(panel, time);
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
        // Remind water every 45 mins
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

    // Legacy compatibility aliases
    window.PetRoamEngine = api;
    window.triggerPetFeedAnimation = function() {
        api.feed();
    };

    return api;
})();
