/**
 * 🐾 VN Pet System - V2.4 Multi-State Roaming Engine
 * Đứng im tại góc phải, hỗ trợ 5 hoạt ảnh:
 * 1: Clicked
 * 2: Fed
 * 3: Ignored (10 mins)
 * 4: Starving
 * 5: Clicked outside
 */

window.PetRoamEngine = (function() {
    let petData = null;
    let petElement = null;
    let imgElement = null;
    
    // Config URLs
    const IDLE_GIF = '/static/img/idle.gif';
    const CLICK_PET_GIF = '/static/img/pet/1.gif';
    const FEED_GIF = '/static/img/pet/2.gif';
    const IGNORE_GIF = '/static/img/pet/3.gif';
    const STARVE_GIF = '/static/img/pet/4.gif';
    const CLICK_OUTSIDE_GIF = '/static/img/pet/5.gif';

    let stateTimeout = null;
    let idleTimer = null;
    let currentState = 'idle';

    function init(initialPetData) {
        petData = initialPetData;
        if (!petData) return;

        createPetDOM();
        resetIdleTimer();

        // Listen for global clicks (Clicked somewhere else)
        document.addEventListener('mousedown', (e) => {
            if (!petElement || !imgElement) return;
            // Nếu click KHÔNG PHẢI vào pet và KHÔNG PHẢI nút cho ăn
            if (!petElement.contains(e.target) && !e.target.closest('.pet-feed-btn')) {
                changeState('click_outside', CLICK_OUTSIDE_GIF, 0); // Giữ nguyên gif 5
            }
            resetIdleTimer();
        });

        // Listen for mouse movement to reset idle timer
        document.addEventListener('mousemove', () => {
            resetIdleTimer();
        });
    }

    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        
        // Nếu đang ở trạng thái ignore (bị ngó lơ) thì thoát ra ngay
        if (currentState === 'ignore') {
            revertToDefault();
        }

        // Set timer cho 10 phút (600,000 ms)
        idleTimer = setTimeout(() => {
            changeState('ignore', IGNORE_GIF, 0); // Ngó lơ mãi mãi cho đến khi có tương tác
        }, 10 * 60 * 1000);
    }

    function changeState(stateName, gifPath, durationMs) {
        if (!imgElement) return;
        currentState = stateName;
        imgElement.src = gifPath;
        
        if (stateTimeout) clearTimeout(stateTimeout);
        
        if (durationMs > 0) {
            stateTimeout = setTimeout(() => {
                revertToDefault();
            }, durationMs);
        }
    }

    function revertToDefault() {
        if (!petData) return;
        // Kiểm tra starvation: Nếu hết sạch thức ăn = starving
        if (petData.food <= 0) {
            changeState('starve', STARVE_GIF, 0);
        } else {
            changeState('idle', IDLE_GIF, 0);
        }
    }

    function createPetDOM() {
        if (petElement) {
            petElement.remove();
        }

        petElement = document.createElement('div');
        petElement.id = 'roaming-pet-container';
        petElement.style.position = 'fixed';
        petElement.style.zIndex = '9998';
        petElement.style.pointerEvents = 'auto'; // Cho phép click
        petElement.style.cursor = 'pointer';
        
        // VỊ TRÍ ĐỨNG IM GẦN TEAM CHAT (DƯỚI CÙNG GÓC PHẢI)
        petElement.style.bottom = '-25px'; // Lép sát thanh taskbar hơn
        petElement.style.right = '130px';  // Dịch sang trái một chút
        
        const level = petData.level || 1;
        const scale = Math.min(2.5, 1.5 + (level * 0.03)); 
        petElement.style.transform = `scale(${scale})`; // Không cần scaleX nữa vì đứng yên
        petElement.style.transformOrigin = 'bottom center';

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
            changeState('click_pet', CLICK_PET_GIF, 2000); // Bóp má 2s rồi thả ra
            resetIdleTimer();
            e.stopPropagation(); // Ngăn sự kiện truyền ra ngoài gây ra lỗi "click outside"
        });
        
        // Khi rê chuột gần pet (mouseenter), khôi phục trạng thái nếu đang dỗi vì click chỗ khác
        petElement.addEventListener('mouseenter', () => {
            if (currentState === 'click_outside') {
                revertToDefault();
            }
        });
        
        document.body.appendChild(petElement);
        revertToDefault(); // Kích hoạt ngay lúc đầu (để check starve)
    }

    // API public để gọi từ dashboard.html khi bấm Cho Ăn
    window.triggerPetFeedAnimation = () => {
        changeState('feed', FEED_GIF, 3000); // Nhai trong 3 giây
        resetIdleTimer();
    };

    return {
        syncPets: (pets) => {
            if (Array.isArray(pets)) {
                if (pets.length > 0) init(pets[0]);
            } else {
                init(pets);
            }
        },
        syncPet: (pet) => {
            if (!petElement) {
                init(pet);
            } else {
                petData = pet; // Cập nhật data mới
                revertToDefault(); // Cập nhật lại animation (ví dụ vừa ăn xong -> hết đói)
            }
        },
        destroy: () => {
            if (idleTimer) clearTimeout(idleTimer);
            if (stateTimeout) clearTimeout(stateTimeout);
            if (petElement) petElement.remove();
        }
    };
})();
