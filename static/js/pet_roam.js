/**
 * 🐾 VN Pet System - V2.3 Interactive Roaming Engine
 * Hỗ trợ nhiều trạng thái GIF (Idle & Interact).
 */

window.PetRoamEngine = (function() {
    let petData = null;
    let petElement = null;
    let imgElement = null;
    
    // Config URLs
    const IDLE_GIF = '/static/img/idle.gif';
    const INTERACT_GIF = '/static/img/interact.gif';

    // State
    let x = window.innerWidth / 2;
    // Cố định Y ở dưới cùng màn hình (trên taskbar)
    let getFixedY = () => window.innerHeight - 110; 
    let targetX = x;
    let state = 'idle'; // idle, walk, sleep
    let direction = 1; // 1 = right, -1 = left
    let animationFrameId = null;
    let isInteracting = false;
    let interactTimeout = null;

    function init(initialPetData) {
        petData = initialPetData;
        if (!petData) return;

        createPetDOM();
        startLoop();

        // Mouse tracking (Chỉ lấy trục X)
        document.addEventListener('mousemove', (e) => {
            if (state === 'sleep' || !petData || isInteracting) return;
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
        petElement.style.pointerEvents = 'auto'; // Cho phép click vào Pet
        petElement.style.cursor = 'pointer';
        petElement.style.transition = 'transform 0.2s';
        
        const level = petData.level || 1;
        const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
        petElement.style.transform = `scale(${scale}) scaleX(${direction})`;

        imgElement = document.createElement('img');
        imgElement.src = IDLE_GIF;
        imgElement.style.width = '80px';
        imgElement.style.height = '80px';
        imgElement.style.objectFit = 'contain';
        imgElement.style.filter = 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))';
        imgElement.draggable = false;
        
        petElement.appendChild(imgElement);

        // Interaction logic (Click / Mousedown)
        petElement.addEventListener('mousedown', (e) => {
            isInteracting = true;
            imgElement.src = INTERACT_GIF;
            
            // Xóa timeout cũ nếu click liên tục
            if (interactTimeout) clearTimeout(interactTimeout);
        });

        // Revert khi nhả chuột hoặc di chuột ra ngoài
        const endInteraction = () => {
            if (isInteracting) {
                // Đợi một xíu cho hoạt ảnh bóp má mượt hơn
                interactTimeout = setTimeout(() => {
                    isInteracting = false;
                    imgElement.src = IDLE_GIF;
                }, 800);
            }
        };

        petElement.addEventListener('mouseup', endInteraction);
        petElement.addEventListener('mouseleave', endInteraction);
        
        document.body.appendChild(petElement);
    }

    function loop() {
        if (!petElement || !petData) return;

        const day = new Date().getDay();
        if (day === 0 || day === 6) {
            state = 'sleep';
        }

        let y = getFixedY();

        if (state === 'sleep') {
            petElement.style.left = `${x}px`;
            petElement.style.top = `${y}px`;
            const level = petData.level || 1;
            const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
            petElement.style.transform = `scale(${scale}) scaleX(${direction})`;
            
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
                zz.style.pointerEvents = 'none';
                petElement.appendChild(zz);
            }
        } else {
            const zz = document.getElementById('pet-zz');
            if (zz) zz.remove();

            // Nếu đang bị tương tác (bóp má) thì đứng im
            if (!isInteracting) {
                const dx = targetX - x;
                const dist = Math.abs(dx);

                if (dist > 10) {
                    state = 'walk';
                    x += dx * 0.03;
                    direction = dx > 0 ? 1 : -1;
                } else {
                    state = 'idle';
                }
            }

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
