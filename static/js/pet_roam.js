// ==========================================
// VN PET ROAMING ENGINE (SVG ANIMATION)
// ==========================================

const PetAssets = {
    // Generates an SVG string for a pet. We use basic shapes grouped so we can animate them via CSS.
    generateSVG: (type, mood) => {
        let color = '#f59e0b'; // default orange
        let earShape = '';
        let tailShape = '';
        let extra = '';

        switch(type) {
            case 'neko': 
                color = '#f97316'; 
                earShape = '<polygon points="10,10 20,25 30,10" fill="'+color+'"/><polygon points="40,10 50,25 60,10" fill="'+color+'"/>';
                tailShape = '<path class="pet-tail" d="M 60 50 Q 80 40 70 20" stroke="'+color+'" stroke-width="6" fill="none" stroke-linecap="round"/>';
                break;
            case 'shiba':
                color = '#fcd34d';
                earShape = '<polygon points="12,12 25,25 25,12" fill="'+color+'"/><polygon points="45,12 45,25 58,12" fill="'+color+'"/>';
                tailShape = '<path class="pet-tail" d="M 60 45 Q 75 35 65 25" stroke="'+color+'" stroke-width="8" fill="none" stroke-linecap="round"/>';
                break;
            case 'bunny':
                color = '#f8fafc';
                earShape = '<ellipse cx="20" cy="5" rx="5" ry="15" fill="'+color+'"/><ellipse cx="50" cy="5" rx="5" ry="15" fill="'+color+'"/>';
                tailShape = '<circle cx="65" cy="50" r="5" fill="'+color+'"/>';
                break;
            case 'dragon':
                color = '#4ade80';
                earShape = '<polygon points="10,15 5,5 20,15" fill="#166534"/><polygon points="60,15 65,5 50,15" fill="#166534"/>';
                tailShape = '<path class="pet-tail" d="M 60 55 Q 80 60 90 40" stroke="'+color+'" stroke-width="6" fill="none" stroke-linecap="round"/>';
                extra = '<polygon points="25,25 35,15 45,25" fill="#166534"/>'; // horn
                break;
            case 'fox':
                color = '#ea580c';
                earShape = '<polygon points="10,5 25,25 30,15" fill="'+color+'"/><polygon points="60,5 45,25 40,15" fill="'+color+'"/>';
                tailShape = '<path class="pet-tail" d="M 60 45 Q 85 45 75 25" stroke="'+color+'" stroke-width="12" fill="none" stroke-linecap="round"/>';
                break;
            case 'hamster':
                color = '#d6d3d1';
                earShape = '<circle cx="15" cy="15" r="6" fill="'+color+'"/><circle cx="55" cy="15" r="6" fill="'+color+'"/>';
                tailShape = '<circle cx="62" cy="55" r="3" fill="'+color+'"/>';
                break;
        }

        // Eyes based on mood
        let eyes = '<circle cx="25" cy="35" r="3" fill="#000"/><circle cx="45" cy="35" r="3" fill="#000"/>';
        if (mood === 'sleep') {
            eyes = '<path d="M 20 35 Q 25 38 30 35" stroke="#000" stroke-width="2" fill="none"/><path d="M 40 35 Q 45 38 50 35" stroke="#000" stroke-width="2" fill="none"/>';
        } else if (mood === 'happy') {
            eyes = '<path d="M 20 35 Q 25 30 30 35" stroke="#000" stroke-width="2" fill="none"/><path d="M 40 35 Q 45 30 50 35" stroke="#000" stroke-width="2" fill="none"/>';
        } else if (mood === 'sad') {
            eyes = '<path d="M 20 32 Q 25 30 30 35" stroke="#000" stroke-width="2" fill="none"/><path d="M 40 35 Q 45 30 50 32" stroke="#000" stroke-width="2" fill="none"/>';
        }

        return `
            <svg viewBox="0 0 100 80" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <style>
                    .pet-leg { transform-origin: top center; }
                    .walk .leg-1, .walk .leg-3 { animation: legSwing 0.4s infinite alternate ease-in-out; }
                    .walk .leg-2, .walk .leg-4 { animation: legSwing 0.4s infinite alternate-reverse ease-in-out; }
                    .wave .leg-1 { animation: waveArm 0.5s infinite alternate ease-in-out; transform-origin: right top; }
                    .sleep .z-mark { animation: floatZ 2s infinite linear; opacity: 0; }
                    .sleep .z-2 { animation-delay: 1s; }
                    
                    @keyframes legSwing { from { transform: rotate(-15deg); } to { transform: rotate(15deg); } }
                    @keyframes waveArm { from { transform: rotate(-30deg) translateY(-5px); } to { transform: rotate(45deg) translateY(-15px); } }
                    @keyframes floatZ { 0% { transform: translate(0,0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(10px, -20px); opacity: 0; } }
                </style>
                
                <g class="pet-body-group">
                    ${tailShape}
                    <!-- Legs -->
                    <rect class="pet-leg leg-3" x="40" y="55" width="8" height="15" rx="4" fill="${color}" />
                    <rect class="pet-leg leg-4" x="50" y="55" width="8" height="15" rx="4" fill="${color}" />
                    
                    <!-- Body -->
                    <rect x="15" y="25" width="45" height="35" rx="15" fill="${color}" />
                    
                    ${earShape}
                    ${extra}
                    
                    <!-- Front Legs (arm for waving) -->
                    <rect class="pet-leg leg-1" x="20" y="50" width="8" height="15" rx="4" fill="${color}" />
                    <rect class="pet-leg leg-2" x="30" y="50" width="8" height="15" rx="4" fill="${color}" />
                    
                    <!-- Face -->
                    ${eyes}
                    <path d="M 32 42 Q 35 45 38 42" stroke="#000" stroke-width="2" fill="none"/>
                </g>
                
                ${mood === 'sleep' ? '<text class="z-mark z-1" x="60" y="20" font-size="12" fill="#8b5cf6" font-family="sans-serif">z</text><text class="z-mark z-2" x="70" y="10" font-size="16" fill="#8b5cf6" font-family="sans-serif">Z</text>' : ''}
            </svg>
        `;
    },
    
    getAccessorySVG: (accId) => {
        switch(accId) {
            case 'sunglasses': return '<div style="position:absolute; top:35%; left:25%; font-size:24px; line-height:1; pointer-events:none;">🕶️</div>';
            case 'magic_hat': return '<div style="position:absolute; top:-10%; left:25%; font-size:28px; line-height:1; pointer-events:none;">🎩</div>';
            case 'bow': return '<div style="position:absolute; top:65%; left:30%; font-size:20px; line-height:1; pointer-events:none;">🎀</div>';
            case 'crown': return '<div style="position:absolute; top:-5%; left:30%; font-size:24px; line-height:1; pointer-events:none;">👑</div>';
            case 'halo': return '<div style="position:absolute; top:-15%; left:25%; font-size:28px; line-height:1; pointer-events:none;">👼</div>';
            case 'gold_chain': return '<div style="position:absolute; top:65%; left:25%; font-size:24px; line-height:1; pointer-events:none;">🏅</div>';
            default: return '';
        }
    }
};

class PetRoamEngine {
    constructor() {
        this.pets = [];
        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;
        this.container = document.createElement('div');
        this.container.id = 'pet-roam-container';
        this.container.style.position = 'fixed';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.pointerEvents = 'none'; // click through
        this.container.style.zIndex = '9997'; // below widgets
        document.body.appendChild(this.container);

        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        this.updateLoop = this.updateLoop.bind(this);
        requestAnimationFrame(this.updateLoop);
    }

    syncPets(petsData) {
        // Xóa pet cũ không còn tồn tại
        this.pets = this.pets.filter(p => {
            if (!petsData.find(d => d.name === p.data.name)) {
                p.el.remove();
                return false;
            }
            return true;
        });

        // Thêm hoặc cập nhật pet
        petsData.forEach((pData, idx) => {
            let p = this.pets.find(x => x.data.name === pData.name);
            if (!p) {
                // Tạo mới
                const el = document.createElement('div');
                el.style.position = 'absolute';
                el.style.width = '80px';
                el.style.height = '64px';
                el.style.transition = 'transform 0.1s';
                // Clickable body
                el.style.pointerEvents = 'auto';
                el.style.cursor = 'pointer';
                el.onclick = () => this.triggerWave(p);

                this.container.appendChild(el);
                
                p = {
                    el: el,
                    data: pData,
                    x: Math.random() * window.innerWidth,
                    y: window.innerHeight - 100,
                    vx: 0, vy: 0,
                    state: 'idle', // idle, walk, wave, sleep
                    stateTimer: 0,
                    targetX: 0, targetY: 0,
                    scale: 1
                };
                this.pets.push(p);
            } else {
                p.data = pData;
            }
            this.renderPetHTML(p);
        });
    }

    renderPetHTML(p) {
        // Tính scale dựa trên level (1 = 80px, level 30 = 120px)
        const baseSize = 80;
        const growth = Math.min(p.data.level, 30) * 1.5;
        p.el.style.width = (baseSize + growth) + 'px';
        p.el.style.height = ((baseSize + growth) * 0.8) + 'px';

        let innerSVG = PetAssets.generateSVG(p.data.type, p.data.mood);
        let accHTML = '';
        if (p.data.accessories) {
            p.data.accessories.forEach(acc => {
                accHTML += PetAssets.getAccessorySVG(acc);
            });
        }
        
        p.el.innerHTML = `
            <div class="pet-svg-wrapper ${p.state}" style="width:100%; height:100%; position:relative;">
                ${innerSVG}
                ${accHTML}
            </div>
            <div style="text-align:center; font-size:10px; font-weight:bold; color:#fff; text-shadow:1px 1px 2px #000; margin-top:-5px; pointer-events:none;">
                Lv.${p.data.level} ${p.data.name}
            </div>
        `;
    }

    triggerWave(p) {
        if (p.data.mood === 'sleep') return;
        p.state = 'wave';
        p.stateTimer = 100; // ~1.5 seconds at 60fps
        this.renderPetHTML(p);
        // show a heart
        const heart = document.createElement('div');
        heart.textContent = '❤️';
        heart.style.position = 'absolute';
        heart.style.top = '-20px';
        heart.style.left = '50%';
        heart.style.animation = 'floatZ 1s ease-out forwards';
        p.el.appendChild(heart);
    }

    updateLoop() {
        this.pets.forEach(p => {
            if (p.data.mood === 'sleep') {
                p.state = 'sleep';
                // Ngủ thì rơi xuống đáy màn hình
                p.y += (window.innerHeight - 100 - p.y) * 0.05;
            } else {
                if (p.stateTimer > 0) {
                    p.stateTimer--;
                    if (p.stateTimer <= 0) p.state = 'idle';
                } else {
                    // AI logic
                    const dx = this.mouseX - p.x;
                    const dy = this.mouseY - p.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist > 150) {
                        // Đuổi theo chuột
                        p.state = 'walk';
                        p.vx = (dx / dist) * 2;
                        p.vy = (dy / dist) * 2;
                    } else if (dist < 50) {
                        // Tránh quá gần chuột
                        p.state = 'walk';
                        p.vx = -(dx / dist) * 1;
                        p.vy = -(dy / dist) * 1;
                    } else {
                        // Đi loăng quăng
                        if (Math.random() < 0.02) {
                            p.state = Math.random() < 0.5 ? 'walk' : 'idle';
                            if (p.state === 'walk') {
                                p.vx = (Math.random() - 0.5) * 3;
                                p.vy = (Math.random() - 0.5) * 3;
                            }
                            p.stateTimer = 60 + Math.random() * 60;
                        }
                        if (p.state === 'idle') {
                            p.vx *= 0.9;
                            p.vy *= 0.9;
                        }
                    }
                }

                if (p.state === 'walk') {
                    p.x += p.vx;
                    p.y += p.vy;
                    // Lật hướng
                    if (p.vx > 0.5) p.scale = 1;
                    if (p.vx < -0.5) p.scale = -1;
                }
            }

            // Boundary check
            p.x = Math.max(0, Math.min(window.innerWidth - 80, p.x));
            p.y = Math.max(0, Math.min(window.innerHeight - 80, p.y));

            p.el.style.transform = `translate(${p.x}px, ${p.y}px) scaleX(${p.scale})`;
            
            // Re-render class if changed
            const wrapper = p.el.querySelector('.pet-svg-wrapper');
            if (wrapper && !wrapper.classList.contains(p.state)) {
                wrapper.className = `pet-svg-wrapper ${p.state}`;
            }
        });

        requestAnimationFrame(this.updateLoop);
    }
}

window.PetRoamEngine = new PetRoamEngine();
