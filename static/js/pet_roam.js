/**
 * 🐾 VN Pet System - V2.2 Fixed Y-Axis Roaming Engine
 * Chỉ dùng 1 ảnh GIF duy nhất và chỉ chạy ngang trên taskbar.
 */

window.PetRoamEngine = (function() {
    let petData = null;
    let petElement = null;
    
    // Config duy nhất 1 ảnh GIF do user cung cấp
    const CAT_GIF = '/static/img/cat.gif';

    // State
    let x = window.innerWidth / 2;
    // Cố định Y ở dưới cùng màn hình (trên taskbar)
    let getFixedY = () => window.innerHeight - 110; 
    let targetX = x;
    let state = 'idle'; // idle, walk, sleep
    let direction = 1; // 1 = right, -1 = left
    let animationFrameId = null;

    function init(initialPetData) {
        petData = initialPetData;
        if (!petData) return;

        createPetDOM();
        startLoop();

        // Mouse tracking (Chỉ lấy trục X)
        document.addEventListener('mousemove', (e) => {
            if (state === 'sleep' || !petData) return;
            // Pet chạy theo con trỏ chuột theo chiều ngang
            targetX = e.clientX - 40;
            
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

        // Chỉ dùng ảnh GIF duy nhất
        const img = document.createElement('img');
        img.src = CAT_GIF;
        img.style.width = '80px'; // To hơn gốc
        img.style.height = '80px';
        img.style.objectFit = 'contain';
        img.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))';
        
        petElement.appendChild(img);
        
        document.body.appendChild(petElement);
    }

    function loop() {
        if (!petElement || !petData) return;

        // Bỏ qua nếu là cuối tuần (ngủ)
        const day = new Date().getDay();
        if (day === 0 || day === 6) {
            state = 'sleep';
        }

        // LUÔN LUÔN CỐ ĐỊNH TRỤC Y Ở ĐÁY MÀN HÌNH
        let y = getFixedY();

        if (state === 'sleep') {
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

            // Walk logic CHỈ THEO TRỤC X
            const dx = targetX - x;
            const dist = Math.abs(dx);

            if (dist > 10) { // Sai số 10px để tránh giật
                state = 'walk';
                x += dx * 0.03;
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
