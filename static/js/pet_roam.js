/**
 * 🐾 VN Pet System - V2.1 GIF Roaming Engine
 * Thay thế SVG phức tạp bằng ảnh GIF chất lượng cao.
 */

window.PetRoamEngine = (function() {
    let petData = null;
    let petElement = null;
    
    // Config URLs for different pet types
    const PET_GIFS = {
        'neko': 'https://media.tenor.com/FwWk8c2B4p0AAAAj/pixel-cat.gif',
        'shiba': 'https://media.tenor.com/0Fw9Q1sKj4EAAAAj/pixel-dog.gif',
        'bunny': 'https://media.tenor.com/xO7vS-Q3i_QAAAAj/rabbit-pixel.gif',
        'dragon': 'https://media.tenor.com/B_O9UXXq63UAAAAj/dragon-pixel.gif',
        'fox': 'https://media.tenor.com/v2J_q2oOaN8AAAAj/fox-pixel.gif',
        'hamster': 'https://media.tenor.com/5Xh5yWwG24EAAAAj/hamster-pixel.gif'
    };

    const FALLBACK_GIF = 'https://media.tenor.com/FwWk8c2B4p0AAAAj/pixel-cat.gif';

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
            targetX = e.clientX - 30;
            targetY = e.clientY - 30;
            
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
        
        // Cấp bậc level quyết định kích cỡ
        const level = petData.level || 1;
        const scale = Math.min(1.5, 0.8 + (level * 0.02)); 
        petElement.style.transform = `scale(${scale}) scaleX(${direction})`;

        const img = document.createElement('img');
        img.src = PET_GIFS[petData.type] || FALLBACK_GIF;
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'contain';
        img.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
        
        petElement.appendChild(img);
        
        // Add accessories container
        const accContainer = document.createElement('div');
        accContainer.id = 'roaming-pet-accessories';
        accContainer.style.position = 'absolute';
        accContainer.style.top = '0';
        accContainer.style.left = '0';
        accContainer.style.width = '100%';
        accContainer.style.height = '100%';
        petElement.appendChild(accContainer);

        renderAccessories();
        document.body.appendChild(petElement);
    }

    function renderAccessories() {
        if (!petElement) return;
        const accContainer = petElement.querySelector('#roaming-pet-accessories');
        if (!accContainer) return;
        accContainer.innerHTML = '';
        
        const accs = petData.accessories || [];
        accs.forEach(acc => {
            let emoji = '';
            let style = '';
            switch(acc) {
                case 'sunglasses': emoji='🕶️'; style='top: 20%; left: 30%; font-size: 20px;'; break;
                case 'magic_hat': emoji='🎩'; style='top: -20%; left: 30%; font-size: 24px;'; break;
                case 'bow': emoji='🎀'; style='top: -10%; left: 10%; font-size: 20px;'; break;
                case 'crown': emoji='👑'; style='top: -20%; left: 30%; font-size: 24px;'; break;
                case 'halo': emoji='👼'; style='top: -30%; left: 30%; font-size: 24px;'; break;
                case 'gold_chain': emoji='🏅'; style='top: 50%; left: 30%; font-size: 20px;'; break;
            }
            if (emoji) {
                accContainer.innerHTML += `<div style="position:absolute; ${style}">${emoji}</div>`;
            }
        });
    }

    function loop() {
        if (!petElement || !petData) return;

        // Bỏ qua nếu là cuối tuần (ngủ)
        const day = new Date().getDay();
        if (day === 0 || day === 6) {
            state = 'sleep';
        }

        if (state === 'sleep') {
            // Ngủ dưới đáy màn hình
            targetY = window.innerHeight - 80;
            y += (targetY - y) * 0.05;
            petElement.style.left = `${x}px`;
            petElement.style.top = `${y}px`;
            const level = petData.level || 1;
            const scale = Math.min(1.5, 0.8 + (level * 0.02)); 
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

            // Walk logic
            const dx = targetX - x;
            const dy = targetY - y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > 50) {
                state = 'walk';
                x += dx * 0.03;
                y += dy * 0.03;
                direction = dx > 0 ? 1 : -1;
            } else {
                state = 'idle';
            }

            // Update DOM
            petElement.style.left = `${x}px`;
            petElement.style.top = `${y}px`;
            
            const level = petData.level || 1;
            const scale = Math.min(1.5, 0.8 + (level * 0.02)); 
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
