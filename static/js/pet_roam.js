/**
 * 🐾 VN Pet System - V2.1 GIF Roaming Engine
 * Thay thế SVG phức tạp bằng ảnh GIF chất lượng cao.
 */

window.PetRoamEngine = (function() {
    let petData = null;
    let petElement = null;
    
    // Config URLs for different pet types
    const PET_GIFS = {
        'neko': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/totoro/gray_walk_8fps.gif',
        'shiba': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/dog/akita_walk_8fps.gif',
        'bunny': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/fox/white_walk_8fps.gif',
        'dragon': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/snake/snake_walk_8fps.gif',
        'fox': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/fox/red_walk_8fps.gif',
        'hamster': 'https://raw.githubusercontent.com/tonybaloney/vscode-pets/main/media/totoro/gray_walk_8fps.gif'
    };

    const FALLBACK_GIF = '/static/img/pifei_spritesheet.webp';

    // State
    let x = window.innerWidth / 2;
    let y = window.innerHeight - 100;
    let targetX = x;
    let targetY = y;
    let state = 'idle'; // idle, walk, sleep
    let direction = 1; // 1 = right, -1 = left
    let animationFrameId = null;

    function init(initialPetData) {
        petData = initialPetData;
        if (!petData) return;

        createPetDOM();
        startLoop();

        // Mouse tracking
        document.addEventListener('mousemove', (e) => {
            if (state === 'sleep' || !petData) return;
            // Target is a bit above and to the left of the cursor
            targetX = e.clientX - 40;
            
            // LIMIT Y TO BOTTOM AREA (At least window.innerHeight - 150)
            const floorLevel = window.innerHeight - 120;
            targetY = Math.max(e.clientY - 40, floorLevel);
            
            if (state === 'idle') {
                state = 'walk';
            }
        });
    }

    function createPetDOM() {
        if (petElement) {
            petElement.remove();
        }

        petElement = document.createElement('div');
        petElement.id = 'roaming-pet-container';
        petElement.style.position = 'fixed';
        petElement.style.zIndex = '9998';
        petElement.style.pointerEvents = 'none'; // let mouse pass through initially
        petElement.style.transition = 'transform 0.2s';
        
        // Cấp bậc level quyết định kích cỡ (to hơn)
        const level = petData.level || 1;
        const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
        petElement.style.transform = `scale(${scale}) scaleX(${direction})`;

        const url = PET_GIFS[petData.type] || FALLBACK_GIF;

        if (url.endsWith('.webp')) {
            // Spritesheet mode (for Pifei)
            const spriteDiv = document.createElement('div');
            spriteDiv.id = 'pet-sprite-div';
            spriteDiv.style.width = '48px'; // Kích thước 1 khung hình (48x48)
            spriteDiv.style.height = '48px';
            spriteDiv.style.backgroundImage = `url('${url}')`;
            spriteDiv.style.backgroundRepeat = 'no-repeat';
            // Scale up for visibility
            spriteDiv.style.transform = 'scale(1.5)';
            spriteDiv.style.transformOrigin = 'bottom center';
            spriteDiv.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))';
            
            // Default row 1 (walk) - Tạm tính row = 1
            let row = window.pifei_row !== undefined ? window.pifei_row : 1;
            
            // Allow dynamic update in console
            window.updatePifeiRow = (newRow) => {
                row = newRow;
                spriteDiv.style.backgroundPosition = `0px -${row * cellWidth}px`;
            };

            const frameCount = 4; // Tạm tính 4 frame
            const cellWidth = 48;
            spriteDiv.style.backgroundPosition = `0px -${row * cellWidth}px`;
            
            // Add CSS animation keyframes if not exists
            if (!document.getElementById('pet-sprite-style')) {
                const style = document.createElement('style');
                style.id = 'pet-sprite-style';
                style.innerHTML = `
                    @keyframes pet-sprite-anim {
                        from { background-position-x: 0px; }
                        to { background-position-x: -${frameCount * cellWidth}px; }
                    }
                `;
                document.head.appendChild(style);
            }
            spriteDiv.style.animation = `pet-sprite-anim 0.8s steps(${frameCount}) infinite`;
            
            petElement.appendChild(spriteDiv);
        } else {
            // Normal GIF mode
            const img = document.createElement('img');
            img.src = url;
            img.style.width = '80px'; // To hơn gốc
            img.style.height = '80px';
            img.style.objectFit = 'contain';
            img.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))';
            petElement.appendChild(img);
        }
        
        document.body.appendChild(petElement);
    }

    function loop() {
        if (!petElement || !petData) return;

        // Bỏ qua nếu là cuối tuần (ngủ)
        const day = new Date().getDay();
        if (day === 0 || day === 6) {
            state = 'sleep';
        }

        const floorLevel = window.innerHeight - 120;

        if (state === 'sleep') {
            // Ngủ dưới đáy màn hình
            targetY = floorLevel;
            y += (targetY - y) * 0.05;
            petElement.style.left = `${x}px`;
            petElement.style.top = `${y}px`;
            const level = petData.level || 1;
            const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
            petElement.style.transform = `scale(${scale}) scaleX(${direction})`;
            
            // Add Zz if not exists
            if (!document.getElementById('pet-zz')) {
                const zz = document.createElement('div');
                zz.id = 'pet-zz';
                zz.innerHTML = 'Zz';
                zz.style.position = 'absolute';
                zz.style.top = '-20px';
                zz.style.right = '0';
                zz.style.color = '#fff';
                zz.style.fontWeight = 'bold';
                zz.style.animation = 'float 2s infinite ease-in-out';
                petElement.appendChild(zz);
            }
        } else {
            // Remove Zz
            const zz = document.getElementById('pet-zz');
            if (zz) zz.remove();

            // Nếu chuột đi quá xa lên trên, vẫn giữ nguyên ở dưới
            if (targetY < floorLevel) targetY = floorLevel;

            // WALK LOGIC RESTRICTIONS (Bottom Right 1/3 of screen)
            const minX = window.innerWidth * 2 / 3;
            const maxX = window.innerWidth - 60; // Trừ đi một chút lề
            
            // Ép buộc targetX nằm trong vùng 1/3 bên phải màn hình
            if (targetX < minX) targetX = minX;
            if (targetX > maxX) targetX = maxX;

            // Nếu chuột đi ra ngoài vùng này, pet sẽ đi đến rìa vùng đó rồi đứng chờ
            
            const dx = targetX - x;
            const dy = targetY - y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > 50) {
                state = 'walk';
                x += dx * 0.03;
                y += dy * 0.03;
                
                // Giữ thú cưng không văng ra ngoài khung
                if (x < minX) x = minX;
                if (x > maxX) x = maxX;

                direction = dx > 0 ? 1 : -1;
            } else {
                state = 'idle';
            }

            // Update DOM
            petElement.style.left = `${x}px`;
            petElement.style.top = `${y}px`;
            
            const level = petData.level || 1;
            const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
            petElement.style.transform = `scale(${scale}) scaleX(${direction})`;
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    function startLoop() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        loop();
    }

    return {
        syncPets: (pets) => {
            // Because we reverted to single pet, this might receive an array or object
            if (Array.isArray(pets)) {
                if (pets.length > 0) init(pets[0]);
            } else {
                init(pets);
            }
        },
        syncPet: (pet) => {
            init(pet);
        },
        destroy: () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (petElement) petElement.remove();
        }
    };
})();
