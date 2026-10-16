/* ================================================================
   VN-TRACKING DASHBOARD — FRONTEND LOGIC v3 (Kanban)
   ================================================================ */

// ===================== 120Hz APPLE-STYLE SMOOTH SCROLL (LENIS) =====================
(function initSmoothScroll() {
    if (typeof Lenis === 'undefined') return;

    try {
        const lenis = new Lenis({
            duration: 1.15,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Apple exponential ease-out
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothWheel: true,
            wheelMultiplier: 1.0,
            touchMultiplier: 1.6,
            infinite: false,
        });

        window.lenis = lenis;

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        // Mark internal scroll containers with data-lenis-prevent so their nested scrolling remains native and unblocked
        const markPreventContainers = () => {
            const selectors = [
                '.sidebar',
                '.kanban-column',
                '.kanban-board',
                '.profile-panel',
                '#profile-panel',
                '.pet-flyout-panel',
                '#pet-panel',
                '.modal',
                '.modal-dialog',
                '.modal-content',
                '.table-responsive',
                '.table-container',
                '.flatpickr-calendar',
                '.dropdown-menu',
                '.notification-panel'
            ];
            document.querySelectorAll(selectors.join(', ')).forEach(el => {
                if (!el.hasAttribute('data-lenis-prevent')) {
                    el.setAttribute('data-lenis-prevent', '');
                }
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', markPreventContainers);
        } else {
            markPreventContainers();
        }

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    markPreventContainers();
                    break;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

    } catch (e) {
        console.warn('[Lenis] Smooth scroll init failed:', e);
    }
})();

// ===================== TOAST =====================
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const icon = icons[type] || icons.info;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
}

// ===================== TAB MANAGEMENT =====================
function switchTab(tabId, syncChart = true) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
    document.querySelectorAll('.info-banner').forEach(b => b.style.display = b.id === `banner-${tabId}` ? 'flex' : 'none');

    // Show only table rows for active tab
    document.querySelectorAll('.table-row').forEach(row => {
        row.style.display = row.classList.contains(`table-${tabId}`) ? '' : 'none';
    });

    sessionStorage.setItem('activeTab', tabId);

    // Sync chart week if applicable
    if (syncChart && typeof selectWeek === 'function') {
        const isVi = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
        
        // Ensure the chart period "week" button is active
        document.querySelectorAll('.chart-time-controls button').forEach(btn => {
            if (btn.dataset.period === 'week') {
                btn.classList.add('active', 'btn-primary');
                btn.classList.remove('btn-outline');
            } else {
                btn.classList.remove('active', 'btn-primary');
                btn.classList.add('btn-outline');
            }
        });
        
        const weekSelect = document.getElementById('custom-week-select');
        const monthSelect = document.getElementById('custom-month-select');
        if (weekSelect) weekSelect.style.display = 'block';
        if (monthSelect) monthSelect.style.display = 'none';
        
        if (tabId === 'truoc') selectWeek(-1, isVi ? 'Tuần trước' : '先週', null, false);
        else if (tabId === 'nay') selectWeek(0, isVi ? 'Tuần này' : '今週', null, false);
        else if (tabId === 'sau') selectWeek(1, isVi ? 'Tuần sau' : '来週', null, false);
    }
}

// ===================== DRAWER FILTER =====================
function toggleFilters() {
    const drawer = document.getElementById('filter-drawer');
    const overlay = document.getElementById('filter-overlay');
    if (drawer) drawer.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
}

function applyFilters() {
    const getChecked = (group) => Array.from(document.querySelectorAll(`[data-filter-group="${group}"]:checked`)).map(cb => cb.value.trim());

    const cvNay = getChecked('cv-nay');
    const nguoiNay = getChecked('nguoi-nay');
    const cvSau = getChecked('cv-sau');
    const nguoiSau = getChecked('nguoi-sau');

    filterSection('nay', cvNay, nguoiNay);
    filterSection('sau', cvSau, nguoiSau);
}

function filterSection(tabKey, cvFilter, workerFilter) {
    const tab = document.getElementById(`tab-${tabKey}`);
    if (!tab) return;

    let colCounts = [0, 0, 0]; // not-started, in-progress, delivered

    tab.querySelectorAll('.kanban-column').forEach((col, idx) => {
        let count = 0;
        col.querySelectorAll('.progress-card').forEach(card => {
            const cvPart = (card.querySelector('.tag')?.textContent || '').trim();
            const worker = (card.querySelector('.worker-name')?.textContent || '').trim();

            const cvOk = cvFilter.length === 0 || cvFilter.includes(cvPart);
            const wOk = workerFilter.length === 0 || workerFilter.some(w => worker.includes(w));

            if (cvOk && wOk) {
                card.style.display = '';
                count++;
            } else {
                card.style.display = 'none';
            }
        });

        // Update column count
        const countBadge = col.querySelector('.kanban-col-count');
        if (countBadge) countBadge.textContent = count;
    });
}

// ===================== LUCIAN #040 SIDEBAR RAIL & NAVIGATION =====================
function placeSidebarHighlight(it) {
    const hl = document.getElementById('sidebar-hl');
    const nav = document.getElementById('sidebar-nav');
    if (!hl || !nav) return;
    let activeItem = it;
    if (activeItem && !nav.contains(activeItem)) activeItem = null;
    if (!activeItem) activeItem = nav.querySelector('.nav-item.active');
    if (!activeItem) {
        hl.style.opacity = '0';
        return;
    }
    hl.style.setProperty('--y', activeItem.offsetTop + 'px');
    hl.style.height = activeItem.offsetHeight + 'px';
    hl.style.opacity = '1';
}

function placeToolsHighlight(it) {
    const hl = document.getElementById('sidebar-tools-hl');
    const nav = document.getElementById('sidebar-tools');
    if (!hl || !nav) return;
    let activeItem = it;
    if (activeItem && !nav.contains(activeItem)) activeItem = null;
    if (!activeItem) activeItem = nav.querySelector('.nav-item.active');
    if (!activeItem) {
        hl.style.opacity = '0';
        return;
    }
    hl.style.setProperty('--y', activeItem.offsetTop + 'px');
    hl.style.height = activeItem.offsetHeight + 'px';
    hl.style.opacity = '1';
}

function toggleSidebarRail() {
    const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
    const tog = document.getElementById('sidebar-rail-tog');
    if (tog) {
        tog.setAttribute('aria-expanded', String(!isCollapsed));
        tog.setAttribute('aria-label', isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu');
    }
    try {
        localStorage.setItem('vn_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    } catch (e) {}
    placeSidebarHighlight();
    placeToolsHighlight();
    setTimeout(() => {
        placeSidebarHighlight();
        placeToolsHighlight();
    }, 310);
}

// Restore saved sidebar collapsed state on load
(function initSidebarRail() {
    try {
        if (window.innerWidth > 1024 && localStorage.getItem('vn_sidebar_collapsed') === 'true') {
            document.body.classList.add('sidebar-collapsed');
            const tog = document.getElementById('sidebar-rail-tog');
            if (tog) {
                tog.setAttribute('aria-expanded', 'false');
                tog.setAttribute('aria-label', 'Mở rộng menu');
            }
        }
    } catch (e) {}
})();

function updateSidebarActiveState(isTableVisible) {
    if (document.querySelector('.tool-page-view.open')) return;
    const navItems = document.querySelectorAll('#sidebar-nav .nav-item');
    if (navItems.length < 2) return;

    navItems.forEach(item => item.classList.remove('active'));
    if (isTableVisible) {
        navItems[1].classList.add('active'); // Data Table
        placeSidebarHighlight(navItems[1]);
    } else {
        navItems[0].classList.add('active'); // Dashboard
        placeSidebarHighlight(navItems[0]);
    }
}

function scrollToTable() {
    const tableWrapper = document.getElementById('table-wrapper');
    const tableSection = document.querySelector('.table-section');
    if (tableWrapper && tableSection) {
        if (!tableWrapper.classList.contains('open')) {
            toggleTable();
        }
        if (window.lenis) {
            window.lenis.scrollTo(tableSection, { offset: -24, duration: 1.15 });
        } else {
            tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateSidebarActiveState(true);
    }
}

// Scroll spy using Intersection Observer
document.addEventListener('DOMContentLoaded', () => {
    const tableSection = document.querySelector('.table-section');
    if (tableSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // If table is at least 30% visible on screen, highlight Data Table
                updateSidebarActiveState(entry.isIntersecting);
            });
        }, { threshold: 0.3 });

        observer.observe(tableSection);
    }

    // Nav click handlers & sliding highlight (Main navigation only)
    const mainNavItems = document.querySelectorAll('#sidebar-nav .nav-item');
    mainNavItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            // Close any open tool page views when navigating main dashboard/table
            ['drive', 'calendar', 'psd', 'role'].forEach(t => {
                const el = document.getElementById(`page-view-${t}`);
                if (el && el.classList.contains('open')) closeToolPage(t);
            });
            if (index === 0) {
                if (window.lenis) {
                    window.lenis.scrollTo(0, { duration: 1.15 });
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                updateSidebarActiveState(false);
            } else if (index === 1) {
                // scrollToTable handled by onclick
            }
        });
    });

    // Keyboard navigation across all sidebar items
    const allNavItems = document.querySelectorAll('.sidebar .nav-item:not(.nav-item-settings)');
    allNavItems.forEach((item, index) => {
        item.addEventListener('keydown', (e) => {
            const dir = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
            if (dir) {
                e.preventDefault();
                allNavItems[(index + dir + allNavItems.length) % allNavItems.length].focus();
            }
        });
    });

    // Initial highlight position after DOM paint
    setTimeout(() => {
        placeSidebarHighlight();
        placeToolsHighlight();
    }, 150);

    window.addEventListener('resize', () => {
        placeSidebarHighlight();
        placeToolsHighlight();
    });

    // Preload LSA Drive iframe in background so clicking it opens INSTANTLY
    function preloadDriveIframe() {
        const iframe = document.getElementById('drive-page-iframe');
        if (iframe && (!iframe.src || iframe.src === window.location.href || iframe.src.endsWith('/'))) {
            iframe.src = '/drive?modal=1';
        }
    }
    const navDrive = document.getElementById('nav-drive');
    if (navDrive) {
        navDrive.addEventListener('mouseenter', preloadDriveIframe, { once: true });
    }
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => setTimeout(preloadDriveIframe, 1000));
    } else {
        setTimeout(preloadDriveIframe, 1500);
    }
});

// ===================== LANGUAGE SWITCHING =====================
function toggleLangSelect(event) {
    if (event) event.stopPropagation();
    document.getElementById('custom-lang-select').classList.toggle('open');
}

function changeLang(lang, event) {
    if (event) event.stopPropagation();
    document.getElementById('custom-lang-select').classList.remove('open');

    // The backend uses a GET route for /set-lang which redirects back to dashboard
    window.location.href = '/set-lang?lang=' + lang;
}

// Close language dropdown on outside click
document.addEventListener('click', function (e) {
    const langSelect = document.getElementById('custom-lang-select');
    if (langSelect && langSelect.classList.contains('open')) {
        langSelect.classList.remove('open');
    }
});

// ===================== DATA TABLE =====================
function toggleTable() {
    const wrapper = document.getElementById('table-wrapper');
    const arrow = document.getElementById('table-arrow');
    if (wrapper) {
        const isOpen = wrapper.classList.toggle('open');
        if (arrow) arrow.textContent = isOpen ? '▲' : '▼';
        if (isOpen) {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function scrollToTable() {
    const wrapper = document.getElementById('table-wrapper');
    if (wrapper) {
        if (!wrapper.classList.contains('open')) {
            wrapper.classList.add('open');
            const arrow = document.getElementById('table-arrow');
            if (arrow) arrow.textContent = '▲';
        }
        if (window.lenis) {
            window.lenis.scrollTo(wrapper, { offset: -24, duration: 1.15 });
        } else {
            wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        updateSidebarActiveState(true);
    }
}

// ===================== WEATHER & TIME REALTIME =====================
let weatherPollingInterval = null;
let userWeatherOverride = null;
let lastWeatherPayload = null;

function initWeatherTime() {
    const el = document.getElementById('main-hero-banner');
    if (!el) return;

    // Initialize 35mm Cinema Filmstrip Album
    if (window.initWeatherFilmstripAlbum) {
        window.initWeatherFilmstripAlbum();
    }

    // Fetch immediately
    fetchRealtimeWeather(false);

    // Setup polling every 60s for immediate detection of real-time weather changes
    if (weatherPollingInterval) clearInterval(weatherPollingInterval);
    weatherPollingInterval = setInterval(() => {
        fetchRealtimeWeather(false);
    }, 60000);

    // Re-check weather when user switches back to this tab
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            fetchRealtimeWeather(false);
        }
    });
}

function fetchRealtimeWeather(force = false) {
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const locQuery = isVN ? "Ho Chi Minh" : "Gifu";
    const locName = isVN ? "TP.HCM" : "Gifu";

    // Build URL
    let url = `/api/weather?loc=${encodeURIComponent(locQuery)}&force=${force ? 1 : 0}`;

    // If geolocation is cached in sessionStorage, use precise coordinates
    try {
        const cachedLat = sessionStorage.getItem('user_geo_lat');
        const cachedLon = sessionStorage.getItem('user_geo_lon');
        if (cachedLat && cachedLon) {
            url += `&lat=${cachedLat}&lon=${cachedLon}`;
        } else if (navigator.geolocation && !sessionStorage.getItem('user_geo_asked')) {
            sessionStorage.setItem('user_geo_asked', '1');
            navigator.geolocation.getCurrentPosition((pos) => {
                sessionStorage.setItem('user_geo_lat', pos.coords.latitude.toFixed(4));
                sessionStorage.setItem('user_geo_lon', pos.coords.longitude.toFixed(4));
                fetchRealtimeWeather(true);
            }, () => {}, { timeout: 4000 });
        }
    } catch (e) {}

    fetch(url)
        .then(r => r.json())
        .then(data => {
            lastWeatherPayload = data;
            renderWeatherUI(data, isVN, locName);
        })
        .catch(err => {
            console.error("Weather fetch err:", err);
        });
}

// Helper: Generate 3D Weather Scene Markup (Gapsy / Dribbble Style)
function getWeather3DMarkup(category, isDay, wCode) {
    if (category === 'snow' || [227, 230, 323, 326, 329, 332, 335, 338, 350, 371].includes(wCode)) {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-cloud">
                        <div class="weather-3d-rain" style="bottom: -12px;">
                            <span class="weather-3d-star" style="width: 6px; height: 6px; left: 6px;"></span>
                            <span class="weather-3d-star" style="width: 7px; height: 7px; left: 20px; animation-delay: 0.5s;"></span>
                            <span class="weather-3d-star" style="width: 5px; height: 5px; left: 34px; animation-delay: 1s;"></span>
                        </div>
                    </div>
                </div>
            </div>`;
    } else if (category === 'thunder' || [200, 386, 389, 392, 395].includes(wCode)) {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-cloud storm">
                        <svg class="weather-3d-bolt" viewBox="0 0 24 24" fill="#facc15">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                    </div>
                </div>
            </div>`;
    } else if (category === 'rain' || (wCode >= 263 && wCode <= 314) || [353, 356, 359].includes(wCode)) {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-cloud">
                        <div class="weather-3d-rain">
                            <span class="weather-3d-drop"></span>
                            <span class="weather-3d-drop"></span>
                            <span class="weather-3d-drop"></span>
                        </div>
                    </div>
                </div>
            </div>`;
    } else if (category === 'clouds' || [116, 119, 122].includes(wCode)) {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-sun-cloud">
                        <div class="weather-3d-sun"></div>
                        <div class="weather-3d-cloud"></div>
                    </div>
                </div>
            </div>`;
    } else if (!isDay) {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-moon">
                        <span class="weather-3d-star" style="width: 4px; height: 4px; top: -4px; right: 2px;"></span>
                        <span class="weather-3d-star" style="width: 3px; height: 3px; bottom: 4px; right: -8px; animation-delay: 0.7s;"></span>
                        <span class="weather-3d-star" style="width: 5px; height: 5px; top: 14px; left: -10px; animation-delay: 1.2s;"></span>
                    </div>
                </div>
            </div>`;
    } else {
        return `
            <div class="weather-3d-scene">
                <div class="weather-3d-float">
                    <div class="weather-3d-sun">
                        <div class="weather-3d-sun-rays"></div>
                    </div>
                </div>
            </div>`;
    }
}

// 3D Mouse Parallax & Tilt Handler (Disabled per user request: card stays completely still)
function attachWeather3DTilt(card) {
    if (!card) return;
    card.style.transform = 'none';
}

function renderWeatherUI(data, isVN, defaultLocName) {
    if (!data || !data.current_condition || !data.current_condition[0]) return;
    const cc = data.current_condition[0];
    const weather = data.weather ? data.weather[0] : {};
    const temp = cc.temp_C || '27';
    const feelsLike = cc.FeelsLikeC || temp;
    const maxTemp = weather.maxtempC || temp;
    const minTemp = weather.mintempC || temp;
    const wCode = parseInt(cc.weatherCode || 113);
    const category = cc.category || 'sun';
    const isDay = cc.is_day !== undefined ? cc.is_day : 1;
    const locName = data.location || defaultLocName;

    let desc = isVN ? "Nhiều mây" : "曇り";
    let bgUrl = "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?q=80&w=1200";
    let themeRgb = "148, 163, 184"; // Slate
    let effectiveEffect = category;

    if (category === 'snow' || [227, 230, 323, 326, 329, 332, 335, 338, 350, 371].includes(wCode)) {
        desc = isVN ? "Tuyết rơi" : "雪";
        bgUrl = "https://images.unsplash.com/photo-1542601098-3adb3baeb1ec?q=80&w=1200";
        themeRgb = "186, 230, 253";
        effectiveEffect = 'snow';
    } else if (category === 'thunder' || [200, 386, 389, 392, 395].includes(wCode)) {
        desc = isVN ? "Giông bão" : "雷雨";
        bgUrl = "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?q=80&w=1200";
        themeRgb = "250, 204, 21";
        effectiveEffect = 'thunder';
    } else if (category === 'rain' || (wCode >= 263 && wCode <= 314) || [353, 356, 359].includes(wCode)) {
        desc = isVN ? (wCode === 266 ? "Mưa phùn" : "Có mưa") : "雨";
        bgUrl = "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=1200";
        themeRgb = "56, 189, 248";
        effectiveEffect = 'rain';
    } else if (category === 'fog' || [143, 248, 260].includes(wCode)) {
        desc = isVN ? "Sương mù" : "霧";
        bgUrl = "https://images.unsplash.com/photo-1487621167305-5d248087c724?q=80&w=1200";
        themeRgb = "203, 213, 225";
        effectiveEffect = 'fog';
    } else if (category === 'clouds' || [116, 119, 122].includes(wCode)) {
        desc = isVN ? "Nhiều mây" : "曇り";
        bgUrl = "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?q=80&w=1200";
        themeRgb = "148, 163, 184";
        effectiveEffect = 'clouds';
    } else if (!isDay) {
        desc = isVN ? "Trời quang (Đêm)" : "快晴 (夜)";
        bgUrl = "https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?q=80&w=1200";
        themeRgb = "129, 140, 248";
        effectiveEffect = 'clear_night';
    } else {
        desc = isVN ? "Nắng đẹp" : "晴れ";
        bgUrl = "https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1200";
        themeRgb = "245, 158, 11";
        effectiveEffect = 'sun';
    }

    // Extract extra weather indicators
    const humidity = (cc.humidity !== undefined && cc.humidity !== null) ? cc.humidity : 80;
    const windKmh = (cc.wind_kmh !== undefined && cc.wind_kmh !== null) ? cc.wind_kmh : 8;
    const uvIdx = (cc.uv_index !== undefined && cc.uv_index !== null) ? cc.uv_index : 0;
    const rainMm = (cc.rain_mm !== undefined && cc.rain_mm !== null) ? cc.rain_mm : 0;
    const formattedRain = (typeof rainMm === 'number') ? (rainMm % 1 === 0 ? rainMm : Number(rainMm.toFixed(1))) : rainMm;

    // Apply manual user simulation override if active
    if (userWeatherOverride) {
        effectiveEffect = userWeatherOverride;
    }

    // Apply the active atmospheric effect (rain, snow, sun, thunder)
    if (window.applyWeatherEffect) {
        window.applyWeatherEffect(effectiveEffect);
    }

    // Update Hero background with clean atmospheric sky gradient (Dribbble & Honor style)
    const skyGradients = {
        sun: "radial-gradient(circle at 78% 25%, rgba(245, 158, 11, 0.22) 0%, rgba(251, 191, 36, 0.08) 35%, transparent 65%), linear-gradient(135deg, #0a1226 0%, #0f1c3f 50%, #151a30 100%)",
        clear: "radial-gradient(circle at 78% 25%, rgba(245, 158, 11, 0.22) 0%, rgba(251, 191, 36, 0.08) 35%, transparent 65%), linear-gradient(135deg, #0a1226 0%, #0f1c3f 50%, #151a30 100%)",
        rain: "linear-gradient(135deg, #090e17 0%, #0f1c2e 50%, #162438 100%)",
        thunder: "linear-gradient(135deg, #070711 0%, #0f1129 50%, #1e1135 100%)",
        snow: "linear-gradient(135deg, #081326 0%, #10233f 50%, #172d4d 100%)",
        clouds: "linear-gradient(135deg, #0a0f1d 0%, #162033 50%, #1c273c 100%)",
        fog: "linear-gradient(135deg, #0c1220 0%, #182234 50%, #1e2838 100%)",
        clear_night: "linear-gradient(135deg, #050814 0%, #0b1026 50%, #121338 100%)"
    };
    const bgEl = document.getElementById('hero-weather-bg');
    if (bgEl) {
        bgEl.style.backgroundImage = 'none';
        bgEl.style.background = skyGradients[effectiveEffect] || skyGradients.sun;
    }

    // Update Inline Container with horizontal weather mockup format
    const inlineContainer = document.getElementById('inline-weather-container');
    if (inlineContainer) {
        inlineContainer.style.display = 'flex';
        inlineContainer.style.alignItems = 'center';
        inlineContainer.innerHTML = `
            <div class="weather-mockup-bar" id="weather-3d-card" style="--weather-theme-rgb: ${themeRgb};">
                <!-- Icon + Temp + City Info -->
                <div class="weather-mockup-main">
                    ${getWeather3DMarkup(category, isDay, wCode)}
                    
                    <div class="weather-mockup-temp">
                        ${temp}<sup>°c</sup>
                    </div>
                    
                    <div class="weather-mockup-meta">
                        <div class="weather-mockup-condition">
                            <span>${desc}</span>
                            <span class="weather-live-dot" title="Live update: 60s"></span>
                            <i class="fas fa-sync-alt" id="weather-sync-icon" style="font-size: 0.72rem; color: rgba(255,255,255,0.45); margin-left: 3px; cursor: pointer;" title="${isVN ? 'Cập nhật thời tiết ngay' : '今すぐ更新'}"></i>
                        </div>
                        <div class="weather-mockup-range">${locName} · ${minTemp}° – ${maxTemp}°</div>
                    </div>
                </div>

                <!-- Weather Metric Pills -->
                <div class="weather-mockup-pills">
                    <div class="weather-mockup-pill" title="${isVN ? 'Nhiệt độ cảm nhận thực tế' : '体感温度'}">
                        <span>${isVN ? 'Cảm giác như' : '体感'}</span>
                        <strong>${feelsLike}°</strong>
                    </div>
                    <div class="weather-mockup-pill" title="${isVN ? 'Độ ẩm không khí' : '湿度'}">
                        <span>${isVN ? 'Độ ẩm' : '湿度'}</span>
                        <strong>${humidity}%</strong>
                    </div>
                    <div class="weather-mockup-pill" title="${isVN ? 'Tốc độ gió' : '風速'}">
                        <span>${isVN ? 'Gió' : '風速'}</span>
                        <strong>${windKmh} km/h</strong>
                    </div>
                    <div class="weather-mockup-pill" title="${isVN ? 'Chỉ số tia UV' : 'UVインデックス'}">
                        <span>UV</span>
                        <strong>${uvIdx}</strong>
                    </div>
                    ${rainMm > 0 ? `
                    <div class="weather-mockup-pill" title="${isVN ? 'Lượng mưa hiện tại' : '降水量'}">
                        <span>${isVN ? 'Mưa' : '降水量'}</span>
                        <strong>${formattedRain} mm</strong>
                    </div>` : ''}
                </div>
            </div>
        `;

        // Attach mouse tilt interaction
        const cardEl = document.getElementById('weather-3d-card');
        if (cardEl) {
            attachWeather3DTilt(cardEl);
        }
    }
}

// Click Router: Sync refresh vs Open 3D Forecast Modal
window.handleWeatherCardClick = function(e) {
    if (e.target && (e.target.id === 'weather-sync-icon' || e.target.closest('#weather-sync-icon'))) {
        window.refreshWeatherNow(e);
    } else {
        window.openWeatherForecastModal();
    }
};

window.refreshWeatherNow = function(e) {
    if (e) e.stopPropagation();
    const syncIcon = document.getElementById('weather-sync-icon');
    if (syncIcon) syncIcon.classList.add('fa-spin');
    
    // Clear user override if any, return to real-time
    userWeatherOverride = null;
    
    fetchRealtimeWeather(true);
    if (window.showToast) {
        const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
        showToast(isVN ? "🌤️ Đang cập nhật thời tiết thực tế..." : "🌤️ リアルタイム天気を更新中...", "info");
    }
    setTimeout(() => {
        const syncIcon = document.getElementById('weather-sync-icon');
        if (syncIcon) syncIcon.classList.remove('fa-spin');
    }, 1200);
};

// =================== 3D WEATHER FORECAST MODAL (SHOWCASE) ===================
window.openWeatherForecastModal = function() {
    const backdrop = document.getElementById('weather-forecast-modal-backdrop');
    const modalBody = document.getElementById('weather-modal-body');
    if (!backdrop || !modalBody) return;

    const data = lastWeatherPayload;
    if (!data || !data.current_condition || !data.current_condition[0]) {
        fetchRealtimeWeather(false);
        return;
    }

    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const cc = data.current_condition[0];
    const weather = data.weather ? data.weather[0] : {};
    const temp = cc.temp_C || '28';
    const feelsLike = cc.FeelsLikeC || temp;
    const maxTemp = weather.maxtempC || temp;
    const minTemp = weather.mintempC || temp;
    const wCode = parseInt(cc.weatherCode || 113);
    const category = cc.category || 'sun';
    const isDay = cc.is_day !== undefined ? cc.is_day : 1;
    const locName = data.location || (isVN ? "TP.HCM" : "Gifu");
    const humidity = cc.humidity || 75;
    const windKmh = cc.wind_kmh || 8;
    const uvIdx = cc.uv_index || 0;
    const pressure = cc.pressure_hpa || 1012;
    const cloudPct = cc.cloud_pct || 40;
    const forecast = data.forecast || [];

    // Format weekday
    const dayNamesVN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayNamesJA = ['日', '月', '火', '水', '木', '金', '土'];

    let forecastHtml = '';
    forecast.forEach((f, idx) => {
        let dayLabel = isVN ? 'Hôm nay' : '今日';
        if (idx > 0) {
            try {
                const d = new Date(f.date + 'T00:00:00');
                const dayIdx = d.getDay();
                dayLabel = isVN ? dayNamesVN[dayIdx] : dayNamesJA[dayIdx];
            } catch (e) {
                dayLabel = `+${idx}d`;
            }
        }
        
        let miniIcon = '☀️';
        if (f.category === 'rain') miniIcon = '🌧️';
        else if (f.category === 'thunder') miniIcon = '⛈️';
        else if (f.category === 'snow') miniIcon = '❄️';
        else if (f.category === 'clouds') miniIcon = '⛅';
        else if (f.category === 'fog') miniIcon = '🌫️';

        forecastHtml += `
            <div class="forecast-day-card ${idx === 0 ? 'today' : ''}">
                <div style="font-size: 0.78rem; font-weight: 700; color: ${idx === 0 ? '#38bdf8' : 'rgba(255,255,255,0.7)'}; margin-bottom: 6px;">${dayLabel}</div>
                <div style="font-size: 1.6rem; margin-bottom: 6px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));">${miniIcon}</div>
                <div style="font-size: 0.88rem; font-weight: 700; color: #fff;">${f.max_temp}°</div>
                <div style="font-size: 0.72rem; color: rgba(255,255,255,0.5); font-weight: 500;">${f.min_temp}°</div>
            </div>
        `;
    });

    modalBody.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
            <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span class="weather-live-dot"></span>
                    <span style="font-size: 1.3rem; font-weight: 800; color: #fff; letter-spacing: -0.01em;">${locName}</span>
                    <span style="font-size: 0.78rem; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 8px; border-radius: 999px; font-weight: 600;">3D LIVE</span>
                </div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">
                    ${isVN ? 'Dữ liệu khí tượng Open-Meteo vệ tinh thời gian thực' : '気象衛星リアルタイム観測データ'}
                </div>
            </div>
            <button onclick="refreshWeatherNow(event)" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 6px 14px; color: #fff; font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.16)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
                <i class="fas fa-sync-alt" id="modal-weather-sync-icon"></i>
                <span>${isVN ? 'Làm mới vệ tinh' : '衛星データ更新'}</span>
            </button>
        </div>

        <!-- 3D Hero Display Box -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 20px 28px; margin-bottom: 22px;">
            <div style="display: flex; align-items: center; gap: 20px;">
                ${getWeather3DMarkup(category, isDay, wCode)}
                <div>
                    <div style="font-size: 3.6rem; font-weight: 300; line-height: 1; letter-spacing: -0.03em; color: #fff;">
                        ${temp}<span style="font-size: 1.5rem; vertical-align: super; font-weight: 500; opacity: 0.85;">°c</span>
                    </div>
                    <div style="font-size: 0.95rem; color: rgba(255,255,255,0.85); font-weight: 600; margin-top: 4px;">
                        ${isVN ? 'Cảm giác như' : '体感'}: ${feelsLike}°C
                    </div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 4px;">
                    ${isVN ? (category === 'rain' ? 'Trời có mưa' : category === 'thunder' ? 'Giông bão sét' : category === 'snow' ? 'Tuyết rơi' : category === 'clouds' ? 'Nhiều mây râm' : 'Trời quang nắng đẹp') : (category === 'rain' ? '雨天' : category === 'thunder' ? '雷雨' : category === 'snow' ? '降雪' : category === 'clouds' ? '曇り' : '快晴')}
                </div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.65); font-weight: 500;">
                    ${isVN ? 'Nhiệt độ ngày' : '最高/最低'}: ${minTemp}°C - ${maxTemp}°C
                </div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-top: 4px;">
                    ${isVN ? 'Mây bao phủ' : '雲量'}: ${cloudPct}%
                </div>
            </div>
        </div>

        <!-- 4 Metrics Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px;">
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #bae6fd; margin-bottom: 4px;">
                    <i class="fas fa-tint" style="color: #38bdf8;"></i>
                    <span>${isVN ? 'Độ ẩm' : '湿度'}</span>
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #fff;">${humidity}%</div>
            </div>
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fed7aa; margin-bottom: 4px;">
                    <i class="fas fa-wind" style="color: #fb923c;"></i>
                    <span>${isVN ? 'Tốc độ gió' : '風速'}</span>
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #fff;">${windKmh} <span style="font-size: 0.75rem; font-weight: 500; opacity: 0.7;">km/h</span></div>
            </div>
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #fef08a; margin-bottom: 4px;">
                    <i class="fas fa-sun" style="color: #facc15;"></i>
                    <span>${isVN ? 'Tia UV' : 'UV指数'}</span>
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #fff;">UV ${uvIdx}</div>
            </div>
            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #e2e8f0; margin-bottom: 4px;">
                    <i class="fas fa-tachometer-alt" style="color: #cbd5e1;"></i>
                    <span>${isVN ? 'Áp suất' : '気圧'}</span>
                </div>
                <div style="font-size: 1.25rem; font-weight: 700; color: #fff;">${pressure} <span style="font-size: 0.75rem; font-weight: 500; opacity: 0.7;">hPa</span></div>
            </div>
        </div>

        <!-- 7-Day Forecast Section -->
        <div>
            <div style="font-size: 0.88rem; font-weight: 700; color: rgba(255,255,255,0.85); margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <i class="far fa-calendar-alt" style="color: #38bdf8;"></i>
                <span>${isVN ? 'Dự báo thời tiết 7 ngày tới' : '週間天気予報（7日間）'}</span>
            </div>
            <div class="weather-forecast-grid">
                ${forecastHtml}
            </div>
        </div>
    `;

    backdrop.classList.add('open');
};

window.closeWeatherForecastModal = function(e) {
    if (e) e.stopPropagation();
    const backdrop = document.getElementById('weather-forecast-modal-backdrop');
    if (backdrop) backdrop.classList.remove('open');
};

// Listen for Escape key to close weather modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.closeWeatherForecastModal();
    }
});

window.simulateWeatherEffect = function(mode) {
    userWeatherOverride = (mode === 'auto') ? null : mode;
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');

    // Update active style on simulation buttons
    document.querySelectorAll('.weather-sim-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === (userWeatherOverride || 'auto'));
    });

    if (mode === 'auto') {
        if (lastWeatherPayload) {
            renderWeatherUI(lastWeatherPayload, isVN, isVN ? "TP.HCM" : "Gifu");
        } else {
            fetchRealtimeWeather(true);
        }
    } else {
        const skyGradients = {
            sun: "radial-gradient(circle at 78% 25%, rgba(245, 158, 11, 0.22) 0%, rgba(251, 191, 36, 0.08) 35%, transparent 65%), linear-gradient(135deg, #0a1226 0%, #0f1c3f 50%, #151a30 100%)",
            clear: "radial-gradient(circle at 78% 25%, rgba(245, 158, 11, 0.22) 0%, rgba(251, 191, 36, 0.08) 35%, transparent 65%), linear-gradient(135deg, #0a1226 0%, #0f1c3f 50%, #151a30 100%)",
            rain: "linear-gradient(135deg, #090e17 0%, #0f1c2e 50%, #162438 100%)",
            thunder: "linear-gradient(135deg, #070711 0%, #0f1129 50%, #1e1135 100%)",
            snow: "linear-gradient(135deg, #081326 0%, #10233f 50%, #172d4d 100%)",
            clouds: "linear-gradient(135deg, #0a0f1d 0%, #162033 50%, #1c273c 100%)",
            fog: "linear-gradient(135deg, #0c1220 0%, #182234 50%, #1e2838 100%)",
            clear_night: "linear-gradient(135deg, #050814 0%, #0b1026 50%, #121338 100%)"
        };
        const bgEl = document.getElementById('hero-weather-bg');
        if (bgEl) {
            bgEl.style.backgroundImage = 'none';
            bgEl.style.background = skyGradients[mode] || skyGradients.sun;
        }
        if (window.applyWeatherEffect) {
            window.applyWeatherEffect(mode);
        }
    }
    if (window.showToast) {
        const labels = {
            auto: isVN ? '🔄 Trở về thời tiết tự động thực tế' : '🔄 自動リアルタイム天気に復帰',
            clouds: isVN ? '☁️ Kích hoạt: Mây bay lờ lững chân thực' : '☁️ 雲海浮遊エフェクト起動',
            rain: isVN ? '🌧️ Kích hoạt: Mưa rào & mặt kính Honor' : '🌧️ 雨天エフェクト起動',
            thunder: isVN ? '⚡ Kích hoạt: Bão sấm sét & mây chớp sáng' : '⚡ 雷雨エフェクト起動',
            sun: isVN ? '☀️ Kích hoạt: Nắng ấm & vạt mây vàng' : '☀️ 快晴エフェクト起動',
            snow: isVN ? '❄️ Kích hoạt: Tuyết rơi mùa đông' : '❄️ 降雪エフェクト起動'
        };
        showToast(labels[mode] || mode, 'info');
    }
};

// ==================== WEATHER 35MM CINEMA FILMSTRIP ALBUM ====================
window.weatherAlbumData = {
    photos: [],
    settings: { speed: 'normal', enabled: true }
};

window.initWeatherFilmstripAlbum = function() {
    fetch('/api/weather/album')
        .then(r => r.json())
        .then(data => {
            if (data && data.photos) {
                window.weatherAlbumData = data;
                renderHeroFilmstripTrack();
            }
        })
        .catch(e => console.warn('Filmstrip album fetch error:', e));

    // Bind dropzone events on modal once DOM ready
    setTimeout(() => {
        const dropzone = document.getElementById('filmstrip-dropzone');
        if (dropzone && !dropzone.dataset.bound) {
            dropzone.dataset.bound = 'true';
            ['dragenter', 'dragover'].forEach(name => {
                dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add('dragover');
                }, false);
            });
            ['dragleave', 'drop'].forEach(name => {
                dropzone.addEventListener(name, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove('dragover');
                }, false);
            });
            dropzone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length > 0) {
                    window.handleFilmstripUpload(dt.files);
                }
            }, false);
        }

        // Prevent wheel scrolling from bleeding through to dashboard background / Lenis
        const modalBackdrop = document.getElementById('filmstrip-modal-backdrop');
        if (modalBackdrop && !modalBackdrop.dataset.scrollBound) {
            modalBackdrop.dataset.scrollBound = 'true';
            modalBackdrop.addEventListener('wheel', (e) => {
                const bodyEl = e.target.closest('.filmstrip-modal-body');
                if (!bodyEl) {
                    e.preventDefault();
                }
                e.stopPropagation();
            }, { passive: false });
        }
    }, 500);
};

window.renderHeroFilmstripTrack = function() {
    const track = document.getElementById('hero-filmstrip-track');
    const container = document.getElementById('hero-filmstrip-layer');
    if (!track || !container) return;

    const data = window.weatherAlbumData || { photos: [], settings: { speed: 'normal', enabled: true } };
    const photos = data.photos || [];
    const settings = data.settings || { speed: 'normal', enabled: true };

    if (!settings.enabled || photos.length === 0) {
        container.classList.add('disabled');
        return;
    }
    container.classList.remove('disabled');

    // Update speed class
    track.className = 'hero-filmstrip-track';
    if (settings.speed === 'slow') track.classList.add('speed-slow');
    else if (settings.speed === 'fast') track.classList.add('speed-fast');
    else track.classList.add('speed-normal');

    // Ensure enough items for seamless marquee loop (at least 20 frames per cycle)
    let displayList = [...photos];
    while (displayList.length < 20) {
        displayList = displayList.concat(photos);
    }

    // Render 2 duplicate sets for infinite seamless 0% -> -50% translation
    let html = '';
    for (let set = 0; set < 2; set++) {
        displayList.forEach(p => {
            const displayName = p.name || p.caption || p.id || '';
            html += `
                <div class="hero-film-item" onclick="openFilmstripLightbox('${p.id}', event)" title="${displayName} (Click để xem ảnh lớn)">
                    <div class="film-sprocket-backlight"></div>
                    <img src="${p.src}" alt="${displayName}" class="hero-film-photo" loading="lazy">
                    <div class="hero-film-overlay-frame"></div>
                    <div class="hero-film-caption">${displayName}</div>
                </div>
            `;
        });
    }
    track.innerHTML = html;
};

// ================== FILMSTRIP LIGHTBOX (Xem ảnh kích thước lớn) ==================
let currentLightboxIndex = 0;

window.openFilmstripLightbox = function(photoId, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const data = window.weatherAlbumData || { photos: [] };
    const photos = data.photos || [];
    if (photos.length === 0) return;

    let idx = photos.findIndex(p => p.id === photoId);
    if (idx === -1) idx = 0;
    currentLightboxIndex = idx;

    updateLightboxView();

    const backdrop = document.getElementById('filmstrip-lightbox-backdrop');
    if (backdrop) {
        backdrop.style.display = 'flex';
        requestAnimationFrame(() => {
            backdrop.classList.add('active');
        });
    }

    window.removeEventListener('keydown', handleLightboxKeydown);
    window.addEventListener('keydown', handleLightboxKeydown);
};

window.closeFilmstripLightbox = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const backdrop = document.getElementById('filmstrip-lightbox-backdrop');
    if (backdrop) {
        backdrop.classList.remove('active');
        setTimeout(() => {
            backdrop.style.display = 'none';
        }, 220);
    }
    window.removeEventListener('keydown', handleLightboxKeydown);
};

function handleLightboxKeydown(e) {
    if (e.key === 'Escape') {
        closeFilmstripLightbox(e);
    } else if (e.key === 'ArrowLeft') {
        navigateFilmstripLightbox(-1, e);
    } else if (e.key === 'ArrowRight') {
        navigateFilmstripLightbox(1, e);
    }
}

window.navigateFilmstripLightbox = function(dir, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const data = window.weatherAlbumData || { photos: [] };
    const photos = data.photos || [];
    if (photos.length === 0) return;

    currentLightboxIndex = (currentLightboxIndex + dir + photos.length) % photos.length;
    updateLightboxView();
};

function updateLightboxView() {
    const data = window.weatherAlbumData || { photos: [] };
    const photos = data.photos || [];
    if (photos.length === 0) return;

    const photo = photos[currentLightboxIndex];
    if (!photo) return;

    const img = document.getElementById('filmstrip-lightbox-img');
    const title = document.getElementById('filmstrip-lightbox-title');
    const counter = document.getElementById('filmstrip-lightbox-counter');
    const caption = document.getElementById('filmstrip-lightbox-caption');
    const download = document.getElementById('filmstrip-lightbox-download');
    const newtab = document.getElementById('filmstrip-lightbox-newtab');

    const displayName = photo.name || photo.caption || photo.id || '';

    if (img) {
        img.src = photo.src;
        img.alt = displayName;
    }
    if (title) title.textContent = displayName;
    if (counter) counter.textContent = `${currentLightboxIndex + 1} / ${photos.length}`;
    if (caption) caption.textContent = displayName;
    if (download) {
        download.href = photo.src;
        download.setAttribute('download', displayName);
    }
    if (newtab) {
        newtab.href = photo.src;
    }
}

let _lastFilmstripRenderHash = '';

window.openFilmstripAlbumModal = function(e) {
    if (e) e.stopPropagation();
    const modal = document.getElementById('filmstrip-modal-backdrop');
    if (!modal) return;

    if (window.lenis) window.lenis.stop();
    document.body.style.overflow = 'hidden';

    // Pause hero background animation while album is open to save GPU frame budget
    const track = document.getElementById('hero-filmstrip-track');
    if (track) track.style.animationPlayState = 'paused';

    renderFilmstripModalContent();
    modal.classList.add('open');
};

window.closeFilmstripAlbumModal = function(e) {
    if (e) e.stopPropagation();
    const modal = document.getElementById('filmstrip-modal-backdrop');
    if (modal) modal.classList.remove('open');

    if (window.lenis) window.lenis.start();
    document.body.style.overflow = '';

    const track = document.getElementById('hero-filmstrip-track');
    if (track) track.style.animationPlayState = '';
};

window.renderFilmstripModalContent = function(force = false) {
    const data = window.weatherAlbumData || { photos: [], settings: { speed: 'normal', enabled: true } };
    const photos = data.photos || [];
    const settings = data.settings || { speed: 'normal', enabled: true };

    const speedSelect = document.getElementById('filmstrip-speed-select');
    if (speedSelect) speedSelect.value = settings.speed || 'normal';

    const enableToggle = document.getElementById('filmstrip-enable-toggle');
    if (enableToggle) enableToggle.checked = (settings.enabled !== false);

    const countLabel = document.getElementById('filmstrip-count-label');
    if (countLabel) {
        const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
        countLabel.textContent = isVN ? `${photos.length} ảnh trong cuộn phim` : `${photos.length} 枚の写真`;
    }

    const grid = document.getElementById('filmstrip-photos-grid');
    if (!grid) return;

    const currentHash = photos.map(p => p.id).join(',');
    if (!force && _lastFilmstripRenderHash === currentHash && grid.children.length > 0) {
        return; // Fast cache: avoid destroying & recreating thumbnail DOM elements
    }
    _lastFilmstripRenderHash = currentHash;

    if (photos.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.45); padding: 30px;">Chưa có ảnh nào trong cuộn phim</div>`;
        return;
    }

    grid.innerHTML = photos.map(p => {
        const displayName = p.name || p.caption || p.id || '';
        return `
            <div class="filmstrip-thumb-item" id="filmstrip-thumb-${p.id}" onclick="openFilmstripLightbox('${p.id}', event)" title="${displayName} (Click để xem ảnh lớn)" style="cursor: pointer;">
                <div class="film-sprocket-backlight"></div>
                <img src="${p.src}" alt="${displayName}" class="filmstrip-thumb-photo" loading="lazy" decoding="async">
                <div class="filmstrip-thumb-frame"></div>
                <button type="button" class="filmstrip-thumb-delete" onclick="deleteFilmstripPhoto('${p.id}', event)" title="Xóa ảnh này">
                    <i class="fas fa-trash"></i>
                </button>
                <div class="filmstrip-thumb-caption" title="${displayName}">
                    <i class="far fa-image" style="font-size: 9px; opacity: 0.7; margin-right: 3px;"></i>${displayName}
                </div>
            </div>
        `;
    }).join('');
};

window.handleFilmstripUpload = function(files) {
    if (!files || files.length === 0) return;
    
    const count = files.length;
    const fileNames = Array.from(files).map(f => f.name).join(', ');
    const isVN = (typeof CURRENT_LANG === 'undefined' || CURRENT_LANG === 'vi');

    // UI Progress elements
    const progressContainer = document.getElementById('filmstrip-upload-progress');
    const progressBar = document.getElementById('filmstrip-progress-bar-fill');
    const progressPercent = document.getElementById('filmstrip-progress-percent');
    const progressText = document.getElementById('filmstrip-progress-text');
    const progressFile = document.getElementById('filmstrip-progress-current-file');
    const progressIcon = document.getElementById('filmstrip-progress-icon');
    const dropzone = document.getElementById('filmstrip-dropzone');

    if (progressContainer) {
        progressContainer.style.display = 'block';
        if (progressBar) progressBar.style.width = '0%';
        if (progressPercent) progressPercent.textContent = '0%';
        if (progressText) progressText.textContent = isVN ? `Đang chuẩn bị tải ${count} ảnh lên...` : `${count}枚の写真を準備中...`;
        if (progressFile) progressFile.textContent = fileNames;
        if (progressIcon) progressIcon.className = 'fas fa-spinner fa-spin';
    }
    if (dropzone) {
        dropzone.style.pointerEvents = 'none';
        dropzone.style.opacity = '0.65';
    }

    if (window.showToast) {
        window.showToast('info', isVN ? `Đang tải ${count} ảnh lên Supabase...` : `${count}枚の写真をSupabaseにアップロード中...`);
    }

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append('photos', files[i]);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/weather/album/upload', true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            // 0% -> 85% during network byte transmission
            const percent = Math.min(85, Math.round((e.loaded / e.total) * 85));
            if (progressBar) progressBar.style.width = percent + '%';
            if (progressPercent) progressPercent.textContent = percent + '%';
            if (progressText) progressText.textContent = isVN ? `Đang tải lên (${percent}%)...` : `アップロード中 (${percent}%)...`;
        }
    };

    xhr.upload.onload = function() {
        // Bytes transferred, now server compresses and saves to Supabase Storage
        if (progressBar) progressBar.style.width = '90%';
        if (progressPercent) progressPercent.textContent = '90%';
        if (progressText) progressText.textContent = isVN ? 'Đang nén tối ưu hóa & lưu vào Supabase...' : '最適化・Supabase保存中...';
    };

    xhr.onload = function() {
        if (dropzone) {
            dropzone.style.pointerEvents = '';
            dropzone.style.opacity = '1';
        }
        const fileInput = document.getElementById('filmstrip-file-input');
        if (fileInput) fileInput.value = '';

        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.success && res.album) {
                    if (progressBar) progressBar.style.width = '100%';
                    if (progressPercent) progressPercent.textContent = '100%';
                    if (progressText) progressText.textContent = isVN ? 'Hoàn tất tải ảnh lên!' : 'アップロード完了！';
                    if (progressIcon) progressIcon.className = 'fas fa-check-circle';

                    window.weatherAlbumData = res.album;
                    renderHeroFilmstripTrack();
                    renderFilmstripModalContent();

                    const uploadedNames = (res.uploaded || []).map(p => p.name || p.caption).join(', ');
                    if (window.showToast) {
                        window.showToast('success', isVN ? `Đã lưu thành công ${res.uploaded ? res.uploaded.length : count} ảnh! ${uploadedNames ? '(' + uploadedNames + ')' : ''}` : `${res.uploaded ? res.uploaded.length : count}枚の写真を保存しました！`);
                    }

                    setTimeout(() => {
                        if (progressContainer) progressContainer.style.display = 'none';
                    }, 2200);
                    return;
                } else {
                    if (progressText) progressText.textContent = 'Lỗi: ' + (res.error || 'Không thể tải ảnh');
                    if (progressIcon) progressIcon.className = 'fas fa-exclamation-triangle';
                    if (window.showToast) window.showToast('error', res.error || 'Lỗi khi tải ảnh');
                }
            } catch (err) {
                if (progressText) progressText.textContent = 'Lỗi phân tích phản hồi máy chủ';
                if (progressIcon) progressIcon.className = 'fas fa-exclamation-triangle';
                if (window.showToast) window.showToast('error', 'Lỗi máy chủ');
            }
        } else {
            if (progressText) progressText.textContent = 'Lỗi máy chủ (' + xhr.status + ')';
            if (progressIcon) progressIcon.className = 'fas fa-exclamation-triangle';
            if (window.showToast) window.showToast('error', 'Lỗi máy chủ (' + xhr.status + ')');
        }

        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
        }, 3500);
    };

    xhr.onerror = function() {
        if (dropzone) {
            dropzone.style.pointerEvents = '';
            dropzone.style.opacity = '1';
        }
        const fileInput = document.getElementById('filmstrip-file-input');
        if (fileInput) fileInput.value = '';

        if (progressText) progressText.textContent = 'Lỗi kết nối máy chủ';
        if (progressIcon) progressIcon.className = 'fas fa-exclamation-triangle';
        if (window.showToast) window.showToast('error', 'Lỗi kết nối khi tải ảnh');

        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
        }, 3500);
    };

    xhr.send(formData);
};

window.deleteFilmstripPhoto = function(id, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!id) return;

    const isVN = (typeof CURRENT_LANG === 'undefined' || CURRENT_LANG === 'vi');
    const data = window.weatherAlbumData || { photos: [] };
    const targetPhoto = (data.photos || []).find(p => p.id === id);
    const photoName = targetPhoto ? (targetPhoto.name || targetPhoto.caption || id) : id;

    const thumbEl = document.getElementById(`filmstrip-thumb-${id}`) || (e && e.target ? e.target.closest('.filmstrip-thumb-item') : null);
    const deleteBtn = thumbEl ? thumbEl.querySelector('.filmstrip-thumb-delete') : null;

    if (thumbEl) {
        thumbEl.classList.add('deleting');
    }
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        deleteBtn.style.opacity = '1';
    }

    if (window.showToast) {
        window.showToast('info', isVN ? `Đang xóa ảnh "${photoName}" khỏi Supabase...` : `写真をSupabaseから削除中...`);
    }

    fetch('/api/weather/album/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    })
    .then(r => r.json())
    .then(res => {
        if (res.success && res.album) {
            window.weatherAlbumData = res.album;
            renderHeroFilmstripTrack();
            renderFilmstripModalContent();
            if (window.showToast) {
                window.showToast('success', isVN ? `Đã xóa ảnh "${photoName}" thành công!` : `写真を削除しました！`);
            }
        } else {
            if (thumbEl) thumbEl.classList.remove('deleting');
            if (deleteBtn) {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            }
            if (window.showToast) window.showToast('error', res.error || (isVN ? 'Lỗi khi xóa ảnh' : '削除エラー'));
        }
    })
    .catch(err => {
        console.error('Delete error:', err);
        if (thumbEl) thumbEl.classList.remove('deleting');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        }
        if (window.showToast) window.showToast('error', isVN ? 'Lỗi kết nối khi xóa ảnh' : '接続エラー');
    });
};

window.changeFilmstripSpeed = function(speed) {
    fetch('/api/weather/album/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed })
    })
    .then(r => r.json())
    .then(res => {
        if (res.success && res.settings) {
            if (window.weatherAlbumData) window.weatherAlbumData.settings = res.settings;
            renderHeroFilmstripTrack();
        }
    });
};

window.toggleFilmstripEnabled = function(enabled) {
    fetch('/api/weather/album/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
    })
    .then(r => r.json())
    .then(res => {
        if (res.success && res.settings) {
            if (window.weatherAlbumData) window.weatherAlbumData.settings = res.settings;
            renderHeroFilmstripTrack();
        }
    });
};

window.resetDefaultFilmstripPhotos = function() {
    fetch('/api/weather/album/reset', { method: 'POST' })
        .then(r => r.json())
        .then(res => {
            if (res && res.album) {
                window.weatherAlbumData = res.album;
                renderHeroFilmstripTrack();
                renderFilmstripModalContent();
                if (window.showToast) window.showToast('success', 'Đã khôi phục bộ ảnh mẫu!');
            }
        })
        .catch(err => console.error('Reset error:', err));
};

// ==================== AI INSIGHTS REALTIME ====================
async function fetchAiInsights() {
    if (!window.DASHBOARD_SUMMARY) return;
    try {
        const res = await fetch('/api/insights', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                lang: window.DASHBOARD_SUMMARY.lang,
                summary: window.DASHBOARD_SUMMARY
            })
        });
        const data = await res.json();
        
        const container = document.getElementById('aiInsightsScroll');
        if (container && data.status === 'success' && data.insights && data.insights.length > 0) {
            container.innerHTML = '';
            
            // Multiply the insights to ensure they easily overflow the screen width for seamless looping
            let itemsHtml = '';
            data.insights.forEach(insight => {
                // Strip all emojis and icons
                const cleanText = insight.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2600-\u27BF]/gu, '').trim();
                itemsHtml += `
                    <div class="ai-insight-item">
                        <span class="ai-insight-dot"></span>
                        ${cleanText}
                    </div>
                `;
            });
            
            // Repeat 10 times to form a massive seamless chain
            for (let i = 0; i < 10; i++) {
                container.innerHTML += itemsHtml;
            }
            
            // Recalculate duration based on half width (since animation translates -50%)
            requestAnimationFrame(() => {
                const halfWidth = container.scrollWidth / 2;
                const duration = Math.max(15, halfWidth / 60); // ~60px/s
                container.style.setProperty('--marquee-duration', duration + 's');
            });
        }
    } catch (e) {
        console.error("AI Insights fetch error:", e);
    }
}

// ==================== TASK HANDOVER & COMMENTS ====================
let isSendingTaskComment = false;

function getAvatarForUser(username) {
    if (typeof userProfilesDB !== 'undefined' && userProfilesDB[username] && userProfilesDB[username].avatar) {
        return userProfilesDB[username].avatar;
    }
    return '';
}

// Auto count PSD numbers from comment text
function countPsdPages(text) {
    if (!text) return 0;
    const matches = text.match(/\b\d+\b/g);
    return matches ? matches.length : 0;
}

// Auto format numbers by inserting commas between numbers separated by whitespace
function autoFormatNumberCommas(text) {
    if (!text) return '';
    let prev;
    let formatted = text;
    do {
        prev = formatted;
        formatted = formatted.replace(/(\b\d+)(?:[ \t\r\n]+)(\d+\b)/g, '$1, $2');
    } while (formatted !== prev);
    return formatted;
}

// Handle auto-grow and live counting on comment input
function handleCommentInput(textarea, index) {
    if (!textarea) return;
    // Auto-grow height based on content
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 130) + 'px';

    // Live count
    const count = countPsdPages(textarea.value);
    const box = textarea.closest('.task-handover-box') || document.getElementById(`handover_${index}`);
    const countBar = box ? box.querySelector('.handover-count-bar') : document.getElementById(`count_bar_${index}`);
    const countNum = box ? box.querySelector('.handover-count-bar strong') : document.getElementById(`count_num_${index}`);

    if (countBar && countNum) {
        if (count > 0) {
            countNum.textContent = count;
            countBar.style.display = 'flex';
        } else {
            countBar.style.display = 'none';
        }
    }
}

function handleCommentKeydown(event, index, volumeKey) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendTaskComment(index, volumeKey);
    }
}

// Mobile Sidebar Drawer Controller
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    const isOpen = sidebar.classList.toggle('mobile-open');
    if (backdrop) backdrop.classList.toggle('active', isOpen);
    document.body.classList.toggle('sidebar-locked', isOpen);
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-locked');
}

// Expose handlers to window explicitly
window.countPsdPages = countPsdPages;
window.autoFormatNumberCommas = autoFormatNumberCommas;
window.handleCommentInput = handleCommentInput;
window.handleCommentKeydown = handleCommentKeydown;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.sendTaskComment = sendTaskComment;
window.sendQuickHandover = sendQuickHandover;
window.deleteTaskComment = deleteTaskComment;
window.loadTaskComments = loadTaskComments;

function createCommentItemHtml(c, tpKey) {
    const avatar = getAvatarForUser(c.user);
    const initial = (c.user || 'U').charAt(0).toUpperCase();
    
    let tagBadge = '';
    if (c.tag === 'handover') {
        tagBadge = `<span class="comment-tag handover">Bàn giao</span>`;
    } else if (c.tag === 'progress') {
        tagBadge = `<span class="comment-tag progress">Tiến độ</span>`;
    } else if (c.tag === 'warning') {
        tagBadge = `<span class="comment-tag warning">Lưu ý</span>`;
    }

    const currentLoggedUser = typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : '';
    const canDelete = (c.user === currentLoggedUser || (typeof USER_ROLE !== 'undefined' && ['admin', 'manager', 'leader'].includes(USER_ROLE)));
    const deleteBtnHtml = canDelete 
        ? `<button type="button" class="btn-delete-comment" onclick="event.stopPropagation(); event.preventDefault(); deleteTaskComment('${c.id}', '${tpKey}', this)" title="Xóa"><i class="fas fa-trash-alt" style="pointer-events: none;"></i></button>`
        : '';

    const avatarHtml = avatar 
        ? `<img src="${avatar}" alt="${c.user}" class="comment-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="comment-avatar-fallback" style="display:none;">${initial}</div>`
        : `<div class="comment-avatar-fallback">${initial}</div>`;

    const psdCount = countPsdPages(c.message);
    const psdBadge = psdCount > 0 ? `<span class="comment-psd-badge" title="Đã đếm ${psdCount} trang PSD"><i class="fas fa-layer-group"></i> ${psdCount} PSD</span>` : '';

    return `
        <div class="handover-comment-item" id="comment_${c.id || Date.now()}" data-comment-id="${c.id || ''}">
            <div class="comment-avatar">${avatarHtml}</div>
            <div class="comment-content">
                <div class="comment-meta">
                    <span class="comment-user">${c.user || 'Thành viên'}</span>
                    ${tagBadge}
                    ${psdBadge}
                    <span class="comment-time">${c.time || ''}</span>
                    ${deleteBtnHtml}
                </div>
                <div class="comment-text">${c.message}</div>
            </div>
        </div>
    `;
}

async function loadTaskComments(index, tpKey) {
    const box = document.getElementById(`handover_${index}`) || document.querySelector(`.task-handover-box[data-tp-key="${tpKey}"]`);
    const list = box ? box.querySelector('.handover-comments-list') : document.getElementById(`comments_list_${index}`);
    if (!list) return;
    try {
        const res = await fetch(`/api/task_comments?tp_key=${encodeURIComponent(tpKey)}`);
        const data = await res.json();
        if (data.status === 'success' && data.comments && data.comments.length > 0) {
            list.innerHTML = '';
            data.comments.forEach(c => {
                list.insertAdjacentHTML('beforeend', createCommentItemHtml(c, tpKey));
            });
            list.scrollTop = list.scrollHeight;
        } else {
            const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
            list.innerHTML = `<div class="handover-empty">${isVN ? 'Chưa có ghi chú nào. Hãy để lại lời nhắn cho đồng đội!' : 'メッセージはまだありません。'}</div>`;
        }
    } catch (e) {
        console.error('Error loading task comments:', e);
    }
}

async function sendTaskComment(index, tpKey, messageOverride = null, tag = 'chat') {
    if (isSendingTaskComment) return;
    const box = document.getElementById(`handover_${index}`) || (tpKey ? document.querySelector(`.task-handover-box[data-tp-key="${tpKey}"]`) : null);
    const input = document.getElementById(`handover_input_${index}`) || (box ? box.querySelector('.handover-input') : null);
    const targetKey = tpKey || (box ? box.getAttribute('data-tp-key') : '');
    let rawMessage = messageOverride ? String(messageOverride).trim() : (input ? input.value.trim() : '');
    if (!rawMessage || !targetKey) return;

    // Auto format numbers with commas (e.g. "1 2 3 4" -> "1, 2, 3, 4")
    const message = (typeof autoFormatNumberCommas === 'function') ? autoFormatNumberCommas(rawMessage) : rawMessage;

    isSendingTaskComment = true;
    const sendBtn = document.getElementById(`btn_send_comment_${index}`) || (box ? box.querySelector('.btn-handover-send') : null);
    if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
    if (input && !messageOverride) {
        input.value = '';
        input.style.height = 'auto';
        if (typeof handleCommentInput === 'function') handleCommentInput(input, index);
    }

    try {
        const res = await fetch('/api/task_comments', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                tp_key: targetKey,
                message: message,
                tag: tag
            })
        });
        const data = await res.json();
        if (data.status === 'success' && data.comment) {
            // Append to ALL handover boxes in DOM matching this task/index immediately
            document.querySelectorAll('.task-handover-box').forEach(hBox => {
                const boxKey = hBox.getAttribute('data-tp-key');
                if (boxKey === targetKey || (boxKey && targetKey && (boxKey.includes(targetKey) || targetKey.includes(boxKey))) || hBox.id === `handover_${index}`) {
                    const list = hBox.querySelector('.handover-comments-list');
                    if (list) {
                        const empty = list.querySelector('.handover-empty');
                        if (empty) empty.remove();
                        if (!list.querySelector(`[data-comment-id="${data.comment.id}"]`) && !list.querySelector(`[id="comment_${data.comment.id}"]`)) {
                            list.insertAdjacentHTML('beforeend', createCommentItemHtml(data.comment, targetKey));
                            list.scrollTop = list.scrollHeight;
                        }
                    }
                }
            });
        } else {
            if (typeof showToast !== 'undefined') {
                showToast(data.message || 'Lỗi gửi tin nhắn', 'error');
            }
        }
    } catch (e) {
        console.error('Error sending task comment:', e);
        if (typeof showToast !== 'undefined') {
            showToast('Lỗi gửi comment: ' + (e.message || e), 'error');
        }
    } finally {
        isSendingTaskComment = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
    }
}

function sendQuickHandover(index, tpKey, text, tag = 'handover') {
    sendTaskComment(index, tpKey, text, tag);
}

async function deleteTaskComment(commentId, tpKey, btnEl) {
    if (!commentId || !tpKey) return;
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');

    // Instant 1-touch optimistic UI update across all matching boxes
    document.querySelectorAll(`[id="comment_${commentId}"], .handover-comment-item[data-comment-id="${commentId}"]`).forEach(el => {
        el.dataset.deleting = 'true';
        el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.9) translateY(-6px)';
        el.style.pointerEvents = 'none';

        setTimeout(() => {
            if (el && el.parentElement) {
                const list = el.parentElement;
                el.remove();
                if (list && list.querySelectorAll('.handover-comment-item').length === 0) {
                    list.innerHTML = `<div class="handover-empty">${isVN ? 'Chưa có ghi chú nào. Hãy để lại lời nhắn cho đồng đội!' : 'メッセージはまだありません。'}</div>`;
                }
            }
        }, 250);
    });

    try {
        const res = await fetch('/api/task_comments/delete', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: commentId, tp_key: tpKey })
        });
        const data = await res.json();
        if (data.status !== 'success') {
            showToast(data.message || (isVN ? 'Không thể xóa tin nhắn' : '削除できませんでした'), 'error');
            const box = document.querySelector(`.task-handover-box[data-tp-key="${tpKey}"]`);
            if (box) {
                const index = box.id.replace('handover_', '');
                loadTaskComments(index, tpKey);
            }
        }
    } catch (e) {
        console.error('Error deleting task comment:', e);
    }
}

// ==================== NOTIFICATION CENTER (TOP RIGHT ALARM) ====================
function getNotifStorageKey() {
    const user = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? CURRENT_USER.trim() : 'default';
    return `vn_tracking_notifications_${user}`;
}

function isTaskAssignedToMe(tpKey, assignees = []) {
    const currentLoggedUser = (typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : '').trim().toLowerCase();
    if (!currentLoggedUser) return false;

    // 1. Check server-provided assignees list first (most accurate)
    if (Array.isArray(assignees) && assignees.length > 0) {
        return assignees.some(w => {
            const wLower = String(w).trim().toLowerCase();
            return wLower === currentLoggedUser || wLower.includes(currentLoggedUser) || currentLoggedUser.includes(wLower);
        });
    }

    // 2. Check modalMap on this user's page (which only contains the user's tasks if member)
    const cleanKey = String(tpKey || '').trim().toLowerCase();
    if (cleanKey && typeof modalMap !== 'undefined') {
        for (const tab of ['nay', 'truoc', 'sau']) {
            if (!modalMap[tab]) continue;
            for (const [k, mId] of Object.entries(modalMap[tab])) {
                const kLower = k.toLowerCase();
                const kVol = kLower.includes(' - ') ? kLower.split(' - ')[1].trim() : kLower;
                const cVol = cleanKey.includes(' - ') ? cleanKey.split(' - ')[1].trim() : cleanKey;
                if (kVol === cVol || kLower === cleanKey || kLower.includes(cleanKey) || cleanKey.includes(kLower)) {
                    return true;
                }
            }
        }
    }

    return false;
}

function getStoredNotifications() {
    try {
        const data = localStorage.getItem(getNotifStorageKey());
        const list = data ? JSON.parse(data) : [];
        return list.filter(n => isTaskAssignedToMe(n.tpKey));
    } catch (e) {
        return [];
    }
}

function saveStoredNotifications(list) {
    try {
        localStorage.setItem(getNotifStorageKey(), JSON.stringify(list.slice(0, 50)));
    } catch (e) {}
    renderNotificationCenter();
}

function addNotification(item) {
    // Only add if the task is assigned to this user
    if (item.tpKey && !isTaskAssignedToMe(item.tpKey)) return;

    const list = getStoredNotifications();
    const notifId = item.id || `notif_${Date.now()}`;

    // Deduplicate: If exact same notification ID exists OR same message & tpKey within 15 seconds, don't duplicate
    const isDup = list.some(n => (item.id && n.id === item.id) || (n.message === item.message && n.tpKey === item.tpKey && (Date.now() - n.timestamp < 15000)));
    if (isDup) return;

    const now = new Date();
    const notif = {
        id: notifId,
        type: item.type || 'comment',
        user: item.user || 'Hệ thống',
        tpKey: item.tpKey || '',
        message: item.message || '',
        time: item.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`,
        timestamp: Date.now(),
        isRead: false
    };

    list.unshift(notif);
    saveStoredNotifications(list);

    // Animate bell
    const bellBtn = document.getElementById('notification-bell-btn');
    if (bellBtn) {
        bellBtn.classList.remove('ringing');
        void bellBtn.offsetWidth;
        bellBtn.classList.add('ringing');
        setTimeout(() => bellBtn.classList.remove('ringing'), 1000);
    }
}

function renderNotificationCenter() {
    const list = getStoredNotifications();
    const unreadCount = list.filter(n => !n.isRead).length;

    // Update bell badge
    const badge = document.getElementById('notification-unread-badge');
    const bellBtn = document.getElementById('notification-bell-btn');
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }
    if (bellBtn) {
        bellBtn.classList.toggle('has-unread', unreadCount > 0);
    }

    // Update summary count
    const summaryCount = document.getElementById('notification-summary-count');
    if (summaryCount) {
        const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
        summaryCount.textContent = `${list.length} ${isVN ? 'thông báo' : '件'}`;
    }

    // Render items list
    const container = document.getElementById('notification-items-list');
    if (!container) return;

    if (list.length === 0) {
        const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
        container.innerHTML = `
            <div class="notification-empty-state">
                <i class="far fa-bell-slash" style="font-size: 24px; color: var(--text-4); margin-bottom: 8px;"></i>
                <span>${isVN ? 'Không có thông báo nào' : '通知はありません'}</span>
            </div>
        `;
        return;
    }

    let html = '';
    list.forEach(n => {
        const avatar = getAvatarForUser(n.user);
        const initial = (n.user || 'U').charAt(0).toUpperCase();
        const avatarHtml = avatar 
            ? `<img src="${avatar}" class="notif-avatar" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="notif-avatar-fallback" style="display:none;">${initial}</div>`
            : `<div class="notif-avatar-fallback">${initial}</div>`;
        
        const shortTp = n.tpKey.includes(' - ') ? n.tpKey.split(' - ')[1] : n.tpKey;

        html += `
            <div class="notification-item ${n.isRead ? '' : 'unread'}" id="notif_item_${n.id}" onclick="handleNotificationClick('${n.id}', '${(n.tpKey || '').replace(/'/g, "\\'")}')">
                ${avatarHtml}
                <div class="notif-body">
                    <div class="notif-header-row">
                        <span class="notif-user-name">${n.user}</span>
                        <span class="notif-time">${n.time}</span>
                    </div>
                    ${shortTp ? `<div class="notif-task-title">📖 ${shortTp}</div>` : ''}
                    <div class="notif-message-text">${n.message}</div>
                </div>
                <button type="button" class="btn-notif-dismiss" onclick="event.stopPropagation(); dismissNotification('${n.id}')" title="Bỏ qua">&times;</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

function toggleNotificationPanel(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('notification-dropdown-panel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
        panel.style.display = 'none';
    } else {
        renderNotificationCenter();
        panel.style.display = 'flex';

        const closeHandler = function(e) {
            if (!panel.contains(e.target) && e.target !== document.getElementById('notification-bell-btn')) {
                panel.style.display = 'none';
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }
}

function navigateToTask(tpKey) {
    if (!tpKey) return;
    const cleanKey = String(tpKey).trim();
    
    // Close notification dropdown panel if open
    const panel = document.getElementById('notification-dropdown-panel');
    if (panel) panel.style.display = 'none';

    // Remove any existing toast
    document.querySelectorAll('.task-handover-toast').forEach(t => t.remove());

    const tabs = ['nay', 'truoc', 'sau'];
    let targetTab = null;
    let targetModalId = null;

    if (typeof modalMap !== 'undefined') {
        const activeTab = sessionStorage.getItem('activeTab') || 'nay';
        const searchTabs = [activeTab, ...tabs.filter(t => t !== activeTab)];

        for (const tab of searchTabs) {
            if (!modalMap[tab]) continue;

            // 1. Exact match
            if (modalMap[tab][cleanKey]) {
                targetTab = tab;
                targetModalId = modalMap[tab][cleanKey];
                break;
            }

            // 2. Volume match (e.g. key ends with cleanKey or contains cleanKey)
            for (const [k, mId] of Object.entries(modalMap[tab])) {
                const kVol = k.includes(' - ') ? k.split(' - ')[1].trim() : k.trim();
                const cVol = cleanKey.includes(' - ') ? cleanKey.split(' - ')[1].trim() : cleanKey;
                if (kVol === cVol || k === cleanKey || k.includes(cleanKey) || cleanKey.includes(k)) {
                    targetTab = tab;
                    targetModalId = mId;
                    break;
                }
            }
            if (targetModalId) break;
        }
    }

    if (targetTab && targetModalId) {
        // Switch tab if different
        const currentTab = sessionStorage.getItem('activeTab') || 'nay';
        if (currentTab !== targetTab && typeof switchTab === 'function') {
            switchTab(targetTab);
        }

        // Open modal
        const modal = document.getElementById(`modal-${targetModalId}`);
        if (modal) {
            modal.scrollTop = 0;
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
            if (typeof initChecklistInContainer === 'function') {
                initChecklistInContainer(modal.querySelector('.task-page-body') || modal.querySelector('.modal-body') || modal);
            }

            const handoverBox = modal.querySelector('.task-handover-box');
            if (handoverBox) {
                if (typeof setupTaskCommentsSocket === 'function') setupTaskCommentsSocket();
                const index = handoverBox.id.replace('handover_', '');
                const boxTpKey = handoverBox.getAttribute('data-tp-key');
                if (typeof loadTaskComments === 'function') loadTaskComments(index, boxTpKey);

                // Auto-scroll directly to the Comment box and highlight input
                setTimeout(() => {
                    handoverBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const input = document.getElementById(`handover_input_${index}`);
                    if (input) {
                        input.focus();
                        input.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.5)';
                        setTimeout(() => input.style.boxShadow = '', 2000);
                    }
                }, 250);
            }
            return;
        }
    }

    // Fallback: search card in DOM
    const card = document.querySelector(`.progress-card[data-tp-key*="${cleanKey}"]`) || 
                 document.querySelector(`.card-comment-alarm[data-alarm-key*="${cleanKey}"]`)?.closest('.progress-card');
    if (card) {
        card.click();
        setTimeout(() => {
            const openModalEl = document.querySelector('.modal-overlay.open');
            if (openModalEl) {
                const handoverBox = openModalEl.querySelector('.task-handover-box');
                if (handoverBox) {
                    handoverBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const index = handoverBox.id.replace('handover_', '');
                    const input = document.getElementById(`handover_input_${index}`);
                    if (input) {
                        input.focus();
                        input.style.boxShadow = '0 0 0 3px rgba(129, 140, 248, 0.5)';
                        setTimeout(() => input.style.boxShadow = '', 2000);
                    }
                }
            }
        }, 300);
    }
}

function handleNotificationClick(notifId, tpKey) {
    const list = getStoredNotifications();
    const item = list.find(n => n.id === notifId);
    if (item) {
        item.isRead = true;
        saveStoredNotifications(list);
    }
    navigateToTask(tpKey);
}

function dismissNotification(notifId) {
    const list = getStoredNotifications().filter(n => n.id !== notifId);
    saveStoredNotifications(list);
}

function markAllNotificationsRead() {
    const list = getStoredNotifications().map(n => ({ ...n, isRead: true }));
    saveStoredNotifications(list);
}

function clearAllNotifications() {
    saveStoredNotifications([]);
}

function showTaskToast(user, tpKey, message, id = null) {
    // Avoid duplicate toast on screen
    const existingToasts = document.querySelectorAll('.task-handover-toast');
    for (let t of existingToasts) {
        if ((id && t.dataset.toastId === String(id)) || (t.dataset.tpKey === tpKey && t.dataset.message === message)) {
            return;
        }
    }

    // Add to Notification Center
    addNotification({ id, user, tpKey, message });

    let container = document.getElementById('task-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'task-toast-container';
        container.style.cssText = 'position: fixed; top: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 10px; max-width: 360px; pointer-events: none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'task-handover-toast';
    if (id) toast.dataset.toastId = id;
    toast.dataset.tpKey = tpKey;
    toast.dataset.message = message;
    toast.style.cssText = 'pointer-events: auto; background: rgba(17, 24, 39, 0.96); border: 1px solid rgba(129, 140, 248, 0.4); backdrop-filter: blur(12px); border-radius: 10px; padding: 10px 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; gap: 10px; align-items: flex-start; color: #fff; animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); transition: all 0.3s ease; cursor: pointer;';
    
    const avatar = getAvatarForUser(user);
    const initial = (user || 'U').charAt(0).toUpperCase();
    const avatarHtml = avatar 
        ? `<img src="${avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border:1.5px solid #818cf8;">`
        : `<div style="width:32px; height:32px; border-radius:50%; background:#4f46e5; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#fff; font-size:12px;">${initial}</div>`;

    const shortTp = tpKey.includes(' - ') ? tpKey.split(' - ')[1] : tpKey;

    toast.onclick = function() {
        navigateToTask(tpKey);
    };

    toast.innerHTML = `
        <div style="flex-shrink: 0;">${avatarHtml}</div>
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-weight: 700; font-size: 0.82rem; color: #818cf8;">${user}</span>
                <span style="font-size: 0.7rem; color: var(--text-4);">Vừa xong</span>
            </div>
            <div style="font-size: 0.72rem; color: #fbbf24; font-weight: 600; margin-bottom: 3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📖 ${shortTp}</div>
            <div style="font-size: 0.82rem; color: var(--text); line-height: 1.3;">${message}</div>
        </div>
        <button onclick="event.stopPropagation(); this.parentElement.remove()" style="background:none; border:none; color:var(--text-4); cursor:pointer; font-size:16px; padding:0; line-height:1;">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-15px)';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function setupTaskCommentsSocket() {
    if (!window.socket) {
        setTimeout(setupTaskCommentsSocket, 300);
        return;
    }

    // Always unbind first to guarantee no duplicate event listeners
    window.socket.off('task_comment_new');
    window.socket.off('task_comment_deleted');

    window.socket.on('task_comment_new', function(data) {
        if (!data || !data.tp_key || !data.comment) return;
        
        // 1. Real-time update in open modal comment box (User B and User A)
        document.querySelectorAll('.task-handover-box').forEach(box => {
            const boxKey = box.getAttribute('data-tp-key');
            if (boxKey === data.tp_key || (boxKey && data.tp_key && (boxKey.includes(data.tp_key) || data.tp_key.includes(boxKey)))) {
                const list = box.querySelector('.handover-comments-list');
                if (list) {
                    const empty = list.querySelector('.handover-empty');
                    if (empty) empty.remove();
                    if (!list.querySelector(`[data-comment-id="${data.comment.id}"]`) && !list.querySelector(`[id="comment_${data.comment.id}"]`)) {
                        list.insertAdjacentHTML('beforeend', createCommentItemHtml(data.comment, data.tp_key));
                        list.scrollTop = list.scrollHeight;
                    }
                }
            }
        });

        // 2. Filter: ONLY users assigned to this task receive notifications & card alarm updates!
        const isMyTask = isTaskAssignedToMe(data.tp_key, data.assignees || []);
        if (!isMyTask) {
            return;
        }

        // 3. Update alarm bells on this user's Kanban cards
        const volKey = data.tp_key;
        document.querySelectorAll(`.card-comment-alarm[data-alarm-key="${volKey}"]`).forEach(alarm => {
            alarm.style.display = 'inline-flex';
            const countSpan = alarm.querySelector('.alarm-count-badge');
            if (countSpan) {
                const currentCount = parseInt(countSpan.textContent) || 1;
                countSpan.textContent = currentCount + 1;
            }
        });

        // 4. Show Toast and add to top-right Notification Center (if sent by another user)
        const currentLoggedUser = (typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : '').trim();
        if (data.comment.user !== currentLoggedUser) {
            showTaskToast(data.comment.user, data.tp_key, data.comment.message, data.comment.id);
        }
    });

    window.socket.on('task_comment_deleted', function(data) {
        if (!data || !data.id) return;
        
        // Real-time remove on User B's screen across all open modal boxes
        document.querySelectorAll(`[id="comment_${data.id}"], .handover-comment-item[data-comment-id="${data.id}"]`).forEach(el => {
            el.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.opacity = '0';
            el.style.transform = 'scale(0.85) translateY(-5px)';
            setTimeout(() => {
                const list = el.parentElement;
                el.remove();
                if (list && list.querySelectorAll('.handover-comment-item').length === 0) {
                    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
                    list.innerHTML = `<div class="handover-empty">${isVN ? 'Chưa có ghi chú nào. Hãy để lại lời nhắn cho đồng đội!' : 'メッセージはまだありません。'}</div>`;
                }
            }, 250);
        });

        // Update card alarms in real time on both User A and User B
        const volKey = data.tp_key;
        if (volKey) {
            document.querySelectorAll(`.card-comment-alarm[data-alarm-key="${volKey}"]`).forEach(alarm => {
                const countSpan = alarm.querySelector('.alarm-count-badge');
                if (countSpan) {
                    const currentCount = parseInt(countSpan.textContent) || 1;
                    if (currentCount <= 2) {
                        countSpan.remove();
                    } else {
                        countSpan.textContent = currentCount - 1;
                    }
                } else {
                    alarm.style.display = 'none';
                }
            });
        }
    });

    // Real-time synchronization of Task Resource Links across teammates
    window.socket.on('task_links_updated', function(data) {
        if (data && data.tp_key && data.links) {
            updateTaskLinksUI(data.tp_key, data.links);
        }
    });
}

// =====================================================================
// TASK RESOURCE LINKS (Mikan, Notion, Asana, Dropbox)
// =====================================================================
function openEditTaskLinksModal(tpKey, focusTool) {
    if (!tpKey) return;
    const modal = document.getElementById('edit-task-links-modal');
    if (!modal) return;

    document.getElementById('edit-task-links-key').value = tpKey;
    const subTitleEl = document.getElementById('edit-task-links-subtitle');
    if (subTitleEl) subTitleEl.textContent = tpKey;

    const tools = ['mikan', 'notion', 'asana', 'dropbox'];
    tools.forEach(tool => {
        const input = document.getElementById(`link_input_${tool}`);
        if (input) {
            input.value = '';
            const card = document.querySelector(`.task-links-box[data-tp-key="${tpKey}"] .task-link-card.${tool}`);
            if (card && card.getAttribute('data-url')) {
                input.value = card.getAttribute('data-url');
            }
        }
    });

    fetch(`/api/task_links?tp_key=${encodeURIComponent(tpKey)}`)
        .then(r => r.json())
        .then(data => {
            if (data && data.status === 'success' && data.links) {
                tools.forEach(tool => {
                    const input = document.getElementById(`link_input_${tool}`);
                    if (input && data.links[tool] !== undefined) {
                        input.value = data.links[tool] || '';
                    }
                });
            }
        })
        .catch(() => {});

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (focusTool) {
        setTimeout(() => {
            const targetInput = document.getElementById(`link_input_${focusTool}`);
            if (targetInput) {
                targetInput.focus();
                targetInput.select();
            }
        }, 120);
    }
}

function closeEditTaskLinksModal() {
    const modal = document.getElementById('edit-task-links-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function pasteClipboardToInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text) {
                input.value = text.trim();
                input.focus();
                return;
            }
        }
    } catch (err) {}
    input.focus();
    input.select();
}

async function submitSaveTaskLinks() {
    const tpKey = document.getElementById('edit-task-links-key').value;
    if (!tpKey) return;

    const btn = document.getElementById('btn-save-task-links');
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
    }

    const links = {
        mikan: (document.getElementById('link_input_mikan')?.value || '').trim(),
        notion: (document.getElementById('link_input_notion')?.value || '').trim(),
        asana: (document.getElementById('link_input_asana')?.value || '').trim(),
        dropbox: (document.getElementById('link_input_dropbox')?.value || '').trim()
    };

    try {
        const res = await fetch('/api/task_links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tp_key: tpKey, links: links })
        });
        const data = await res.json();
        if (data.status === 'success') {
            updateTaskLinksUI(tpKey, data.links || links);
            closeEditTaskLinksModal();
            showTaskToast('Hệ thống', tpKey, '✓ Đã cập nhật liên kết làm việc!', `link_${Date.now()}`);
        } else {
            alert('Lỗi lưu liên kết: ' + (data.message || 'Không xác định'));
        }
    } catch (e) {
        alert('Lỗi lưu liên kết: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    }
}

function updateTaskLinksUI(tpKey, links) {
    if (!tpKey || !links) return;
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const tools = ['mikan', 'notion', 'asana', 'dropbox'];

    document.querySelectorAll(`.task-links-box`).forEach(box => {
        const boxKey = box.getAttribute('data-tp-key');
        if (boxKey === tpKey) {
            tools.forEach(tool => {
                const card = box.querySelector(`.task-link-card.${tool}`);
                if (card) {
                    const url = (links[tool] || '').trim();
                    const hasUrl = Boolean(url);
                    
                    card.setAttribute('data-url', url);
                    if (hasUrl) {
                        card.classList.remove('empty');
                        card.classList.add('has-url');
                        card.href = url;
                        card.target = '_blank';
                        card.rel = 'noopener noreferrer';
                        card.onclick = null;
                        card.title = url;
                        const statusSpan = card.querySelector('.task-link-status');
                        if (statusSpan) statusSpan.textContent = isVN ? 'Mở link ↗' : '開く ↗';
                    } else {
                        card.classList.remove('has-url');
                        card.classList.add('empty');
                        card.href = 'javascript:void(0)';
                        card.target = '_self';
                        card.removeAttribute('rel');
                        card.onclick = function() { openEditTaskLinksModal(tpKey, tool); return false; };
                        card.title = isVN ? `Chưa có link ${tool.toUpperCase()}` : `リンクなし`;
                        const statusSpan = card.querySelector('.task-link-status');
                        if (statusSpan) statusSpan.textContent = isVN ? '+ Thêm link' : '+ リンク追加';
                    }
                }
            });
        }
    });
}

function openModal(tabKey, cardName) {
    if (typeof window.pauseWeatherEffect === 'function') window.pauseWeatherEffect();
    if (typeof modalMap === 'undefined') return;
    const modalId = modalMap[tabKey] && modalMap[tabKey][cardName];
    if (modalId) {
        const modal = document.getElementById(`modal-${modalId}`);
        if (modal) {
            if (window.lenis) window.lenis.stop();
            document.body.style.overflow = 'hidden';
            modal.scrollTop = 0;
            modal.classList.add('open');

            requestAnimationFrame(() => {
                initChecklistInContainer(modal.querySelector('.task-page-body') || modal.querySelector('.modal-body') || modal);

                // Load Task Handover Comments if combined task
                const handoverBox = modal.querySelector('.task-handover-box');
                if (handoverBox) {
                    setupTaskCommentsSocket();
                    const index = handoverBox.id.replace('handover_', '');
                    const tpKey = handoverBox.getAttribute('data-tp-key');
                    loadTaskComments(index, tpKey);
                }

                // Load Time Tracker History
                const trackerBox = modal.querySelector('.time-tracker-box');
                if (trackerBox) {
                    const tIndex = trackerBox.id.replace('tracker_', '');
                    const tTpKey = trackerBox.getAttribute('data-tp-key');
                    if (typeof loadTrackerHistory === 'function') {
                        loadTrackerHistory(tIndex, tTpKey);
                    }
                }
            });
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        if (window.lenis) window.lenis.start();
    }
    if (typeof window.resumeWeatherEffect === 'function') {
        window.resumeWeatherEffect();
    }
    if (window._taskFinishedPendingReload) {
        window._taskFinishedPendingReload = false;
        if (typeof window.triggerAutoReloadOnTaskDone === 'function') {
            window.triggerAutoReloadOnTaskDone();
        }
    }
}

// ===================== TOOLS FULL-PAGE DETAIL VIEWS =====================
function openToolPage(toolKey) {
    // Close other open modals/pages
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    document.querySelectorAll('#sidebar-tools .nav-item').forEach(n => n.classList.remove('active'));

    const pageId = `page-view-${toolKey}`;
    const pageEl = document.getElementById(pageId);
    if (!pageEl) return;

    if (toolKey === 'drive') {
        const iframe = document.getElementById('drive-page-iframe') || document.getElementById('drive-iframe');
        if (iframe) {
            let needsReset = false;
            try {
                const cur = iframe.contentWindow.location.pathname;
                if (!cur || !cur.startsWith('/drive')) needsReset = true;
            } catch (_) {
                needsReset = true;
            }
            if (needsReset || !iframe.src || iframe.src === window.location.href || iframe.src.endsWith('/')) {
                iframe.src = '/drive?modal=1';
            }
        }
    } else if (toolKey === 'calendar') {
        const iframe = document.getElementById('calendar-page-iframe') || document.getElementById('calendar-iframe');
        if (iframe && (!iframe.src || iframe.src === window.location.href || iframe.src.endsWith('/'))) {
            iframe.src = '/calendar';
        }
        if (typeof loadTeamLeaveSchedule === 'function') {
            loadTeamLeaveSchedule();
        }
    } else if (toolKey === 'psd') {
        const iframe = document.getElementById('psd-page-iframe');
        if (iframe && (!iframe.src || iframe.src === window.location.href || iframe.src.endsWith('/'))) {
            iframe.src = '/psd-tool';
        }
    }

    // Hide main menu highlight pill while tool page is open
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    const mainHl = document.getElementById('sidebar-hl');
    if (mainHl) mainHl.style.opacity = '0';

    // Highlight the active tool in sidebar-tools
    const navItem = document.getElementById(`nav-${toolKey}`);
    if (navItem) {
        navItem.classList.add('active');
        placeToolsHighlight(navItem);
    }

    if (window.lenis) window.lenis.stop();
    document.body.style.overflow = 'hidden';
    pageEl.scrollTop = 0;
    pageEl.classList.add('open');

    if (typeof window.pauseWeatherEffect === 'function') {
        window.pauseWeatherEffect();
    } else {
        const weatherCanvas = document.getElementById('weather-canvas') || document.getElementById('rain-canvas');
        if (weatherCanvas) weatherCanvas.style.display = 'none';
    }
}

function closeToolPage(toolKey) {
    const pageId = `page-view-${toolKey}`;
    const pageEl = document.getElementById(pageId);
    if (pageEl) {
        pageEl.classList.remove('open');
    }
    const navItem = document.getElementById(`nav-${toolKey}`);
    if (navItem) navItem.classList.remove('active');

    if (typeof window.resumeWeatherEffect === 'function') {
        window.resumeWeatherEffect();
    } else {
        const weatherCanvas = document.getElementById('weather-canvas') || document.getElementById('rain-canvas');
        if (weatherCanvas) weatherCanvas.style.display = '';
    }

    if (toolKey === 'drive') {
        const iframe = document.getElementById('drive-page-iframe') || document.getElementById('drive-iframe');
        if (iframe) {
            try {
                const cur = iframe.contentWindow.location.pathname;
                if (!cur || !cur.startsWith('/drive')) iframe.src = '/drive?modal=1';
            } catch (_) {
                iframe.src = '/drive?modal=1';
            }
        }
    }

    // Hide tools highlight pill
    const toolsHl = document.getElementById('sidebar-tools-hl');
    if (toolsHl) toolsHl.style.opacity = '0';

    // Restore main nav highlight (Dashboard or Data Table)
    const tableSection = document.querySelector('.table-section');
    let isTable = false;
    if (tableSection) {
        const rect = tableSection.getBoundingClientRect();
        isTable = rect.top < window.innerHeight * 0.5 && rect.bottom > 0;
    }
    updateSidebarActiveState(isTable);

    if (!document.querySelector('.modal-overlay.open')) {
        document.body.style.overflow = '';
        if (window.lenis) window.lenis.start();
    }
}

// Backward-compatible wrappers for tools
function openDriveModal() { openToolPage('drive'); }
function closeDriveModal() { 
    if (typeof closeDriveDialog === 'function') {
        closeDriveDialog();
    }
    const pageEl = document.getElementById('page-view-drive');
    if (pageEl) {
        closeToolPage('drive');
    }
}
function openCalendarModal() { openToolPage('calendar'); }
function closeCalendarModal() { closeToolPage('calendar'); }
function openPsdToolPage() { openToolPage('psd'); }
function closePsdToolPage() { closeToolPage('psd'); }

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => {
            m.classList.remove('open');
        });
        document.querySelectorAll('#sidebar-tools .nav-item').forEach(n => n.classList.remove('active'));
        const toolsHl = document.getElementById('sidebar-tools-hl');
        if (toolsHl) toolsHl.style.opacity = '0';
        updateSidebarActiveState(false);
        document.querySelectorAll('.cp-overlay.active, .cp-modal.active').forEach(m => {
            m.classList.remove('active');
        });
        document.body.style.overflow = '';
        if (window.lenis) window.lenis.start();
        const drawer = document.getElementById('filter-drawer');
        if (drawer && drawer.classList.contains('open')) toggleFilters();
    }
});

// Close modal when clicking overlay (skip if clicking inside a full-page task view)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && !e.target.classList.contains('task-detail-page-view')) {
        e.target.classList.remove('open');
        document.body.style.overflow = '';
        if (window.lenis) window.lenis.start();
    }
});

// ===================== CHECKLIST =====================
// ===================== CHECKLIST =====================
function getProgressCardsByTpKey(tpKey) {
    if (!tpKey) return [];
    const results = [];
    document.querySelectorAll('.progress-card').forEach(c => {
        if (c.dataset.tpKey === tpKey) results.push(c);
    });
    return results;
}

function initChecklistInContainer(container) {
    if (!container || container.dataset.checklistInit) return;
    container.dataset.checklistInit = 'true';

    const grids = container.querySelectorAll('.checklist-grid');
    grids.forEach(grid => {
        const tpKey = grid.dataset.tpKey || '';
        const checkboxes = grid.querySelectorAll('input[data-checklist]');

        checkboxes.forEach(cb => {
            const rawId = cb.dataset.checkId;

            cb.addEventListener('change', (e) => {
                cb.dataset.userModified = 'true';

                // Keep ALL matching cards across all tabs up to date
                const cards = getProgressCardsByTpKey(tpKey);
                cards.forEach(card => {
                    let checkedIds = (card.dataset.checkedIds || '').split(',').filter(Boolean);
                    if (e.target.checked) {
                        if (!checkedIds.includes(rawId)) checkedIds.push(rawId);
                    } else {
                        checkedIds = checkedIds.filter(id => id !== rawId);
                    }
                    card.dataset.checkedIds = checkedIds.join(',');
                });

                fetch('/api/checklist_sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tac_pham: tpKey, checkbox_id: rawId, status: e.target.checked })
                }).then(r => r.json()).then(data => {
                    if (typeof handlePetXPResponse === 'function') handlePetXPResponse(data);
                }).catch(() => {});

                if ((rawId === 't9' || rawId === 't8') && e.target.checked) {
                    window._taskFinishedPendingReload = true;
                }

                updateTaskProgressLocally(tpKey, container);
            });
        });

        // 1. FAST LOCAL RENDER FROM CARD DATA (Injected by Python)
        const matchedCards = getProgressCardsByTpKey(tpKey);
        if (matchedCards.length > 0) {
            const card = matchedCards[0];
            const checkedIds = (card.dataset.checkedIds || '').toLowerCase().split(',').filter(Boolean);
            checkboxes.forEach(cb => {
                const rawId = (cb.dataset.checkId || '').toLowerCase();
                cb.checked = checkedIds.includes(rawId);
            });
            updateTaskProgressLocally(tpKey, container);
        }

        // 2. BACKGROUND FETCH FOR FRESHNESS is removed because it conflicts with old_tp_key logic
        // We now rely entirely on Python's initial render (which merges old and new keys)
        // and Socket.IO for real-time synchronization between clients.
    });
}

function updateTaskProgressLocally(tpKey, modalBody) {
    const checkboxes = modalBody.querySelectorAll('input[data-checklist]');
    const total = checkboxes.length;
    if (total === 0) return;
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const progress = Math.round((checkedCount / total) * 100);

    // Update step phase counters & progress fills
    if (modalBody) {
        const s1Cbs = modalBody.querySelectorAll('input[data-check-id="t1"], input[data-check-id="t2"]');
        const s2Cbs = modalBody.querySelectorAll('input[data-check-id="t3"], input[data-check-id="t4"], input[data-check-id="t5"]');
        const s3Cbs = modalBody.querySelectorAll('input[data-check-id="t6"], input[data-check-id="t7"], input[data-check-id="t8"], input[data-check-id="t9"]');

        if (s1Cbs.length > 0) {
            const s1Done = Array.from(s1Cbs).filter(c => c.checked).length;
            const count1 = modalBody.querySelector('.step-col[data-step="1"] .step-count');
            if (count1) {
                count1.textContent = `${s1Done}/${s1Cbs.length}${s1Done === s1Cbs.length ? ' ✓' : ''}`;
                count1.classList.toggle('complete', s1Done === s1Cbs.length);
            }
            const fill1 = modalBody.querySelector('.step-col[data-step="1"] .step-progress-fill');
            if (fill1) fill1.style.width = `${(s1Done / s1Cbs.length) * 100}%`;
        }

        if (s2Cbs.length > 0) {
            const s2Done = Array.from(s2Cbs).filter(c => c.checked).length;
            const count2 = modalBody.querySelector('.step-col[data-step="2"] .step-count');
            if (count2) {
                count2.textContent = `${s2Done}/${s2Cbs.length}${s2Done === s2Cbs.length ? ' ✓' : ''}`;
                count2.classList.toggle('complete', s2Done === s2Cbs.length);
            }
            const fill2 = modalBody.querySelector('.step-col[data-step="2"] .step-progress-fill');
            if (fill2) fill2.style.width = `${(s2Done / s2Cbs.length) * 100}%`;
        }

        if (s3Cbs.length > 0) {
            const s3Done = Array.from(s3Cbs).filter(c => c.checked).length;
            const count3 = modalBody.querySelector('.step-col[data-step="3"] .step-count');
            if (count3) {
                count3.textContent = `${s3Done}/${s3Cbs.length}${s3Done === s3Cbs.length ? ' ✓' : ''}`;
                count3.classList.toggle('complete', s3Done === s3Cbs.length);
            }
            const fill3 = modalBody.querySelector('.step-col[data-step="3"] .step-progress-fill');
            if (fill3) fill3.style.width = `${(s3Done / s3Cbs.length) * 100}%`;
        }
    }

    // Find the card for this task across all tabs
    document.querySelectorAll('.progress-card').forEach(card => {
        if (card.dataset.tpKey === tpKey) {
            // Update progress text
            const infoSpans = card.querySelectorAll('.progress-info span');
            if (infoSpans.length > 1) {
                infoSpans[1].textContent = `${progress}%`;
            }
            // Update progress bar width
            const fill = card.querySelector('.progress-fill');
            if (fill) {
                fill.style.width = `${progress}%`;
            }

            // Sync external start toggle
            const externalToggle = card.querySelector('.t4-external-toggle > div');
            if (externalToggle) {
                const t4Checkbox = modalBody.querySelector('input[data-check-id="t4"]');
                if (t4Checkbox) {
                    const isChecked = t4Checkbox.checked;
                    const extCb = externalToggle.querySelector('input[type="checkbox"]');
                    const textSpan = externalToggle.querySelector('.t4-text');
                    
                    if (extCb) extCb.checked = isChecked;
                    if (textSpan) {
                        if (isChecked) {
                            externalToggle.style.color = 'var(--primary)';
                            externalToggle.style.background = 'rgba(16, 185, 129, 0.1)';
                            externalToggle.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                            textSpan.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'O: 開始 (Bắt đầu)' : 'O列：開始';
                        } else {
                            externalToggle.style.color = 'var(--text-3)';
                            externalToggle.style.background = 'var(--bg-page)';
                            externalToggle.style.borderColor = 'var(--border)';
                            textSpan.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Chưa bắt đầu' : '未着手';
                        }
                    }
                }
            }

            // Move card to correct column
            const newStatusClass = checkedCount === 0 ? 'not-started' : (checkedCount >= total ? 'delivered' : 'in-progress');
            const currentStatusClass = Array.from(card.classList).find(c => c.startsWith('status-'));

            if (currentStatusClass !== `status-${newStatusClass}`) {
                card.classList.remove(currentStatusClass);
                card.classList.add(`status-${newStatusClass}`);

                // Update status text
                const statusSpan = card.querySelector('.status-text');
                if (statusSpan) {
                    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
                    if (newStatusClass === 'not-started') statusSpan.textContent = isVN ? 'To Do' : '未着手';
                    else if (newStatusClass === 'delivered') statusSpan.textContent = isVN ? 'Completed' : '納品済み';
                    else statusSpan.textContent = isVN ? 'In Progress' : '進行中';
                }

                const tab = card.closest('.tab-content');
                if (tab) {
                    const targetCol = tab.querySelector(`.kanban-column[data-status="${newStatusClass}"] .kanban-cards`);
                    if (targetCol) {
                        moveCardToColumn(card, targetCol);
                    }

                    // Update column badges
                    tab.querySelectorAll('.kanban-column').forEach(col => {
                        const count = Array.from(col.querySelectorAll('.progress-card')).filter(c => c.style.display !== 'none').length;
                        const badge = col.querySelector('.kanban-col-count');
                        if (badge) badge.textContent = count;
                    });
                    updateKanbanGroups(tab);
                }
            }
        }
    });

    // Update partner progress spans in other cards that have this task as their partner
    document.querySelectorAll(`.partner-progress-text[data-partner-key="${tpKey}"]`).forEach(span => {
        span.textContent = `${progress}%`;
        if (progress >= 100) {
            span.style.color = '#34d399';
        } else if (progress > 0) {
            span.style.color = '#fbbf24';
        } else {
            span.style.color = 'var(--text-4)';
        }
    });
}


// ===================== CELEBRATION EFFECTS =====================
function triggerCelebration() {
    // 1. Play Duolingo Success sound effect
    try {
        const duoAudio = new Audio('/static/audio/duolingo_success.mp3?v=' + Date.now());
        duoAudio.volume = 0.9;
        const playPromise = duoAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(function(err) {
                console.warn("Audio autoplay blocked or failed:", err);
            });
        }
    } catch (e) {
        console.warn("Audio not supported or blocked:", e);
    }

    // 2. Fire Confetti
    if (typeof confetti === 'function') {
        const duration = 2000;
        const end = Date.now() + duration;
        (function frame() {
            confetti({
                particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, zIndex: 100005,
                colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
            });
            confetti({
                particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, zIndex: 100005,
                colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
            });
            if (Date.now() < end) { requestAnimationFrame(frame); }
        }());
    }
}

// ===================== LOGTIME SUCCESS MODAL =====================
function showSuccessModal() {
    triggerCelebration();

    let overlay = document.getElementById('success-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'success-modal-overlay';
        overlay.className = 'modal-overlay';

        // Use Japanese text if language is JA, else Vietnamese
        const isJa = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'ja');
        const titleText = isJa ? 'お疲れ様でした！' : 'お疲れ様でした！';
        const bodyText = isJa ? '進捗が正常に記録されました。' : 'Logtime của bạn đã được ghi nhận thành công.';

        overlay.innerHTML = `
            <div class="modal-content success-content" style="max-width: 400px; text-align: center; padding: 40px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div class="success-icon" style="font-size: 80px; color: var(--primary); margin-bottom: 20px;">
                    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" width="100" height="100" style="display: inline-block;">
                        <circle cx="50" cy="50" r="50" fill="currentColor"/>
                        <path d="M30 50L45 65L70 35" stroke="white" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray: 100; animation: drawCheck 0.5s ease-out forwards 0.2s; stroke-dashoffset: 100;"/>
                    </svg>
                </div>
                <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 12px; color: var(--text);">${titleText}</h2>
                <p style="color: var(--text-3); font-size: 0.95rem; margin-bottom: 30px; line-height: 1.5;">${bodyText}</p>
                <button onclick="document.getElementById('success-modal-overlay').classList.remove('open')" style="background: var(--primary); color: white; border: none; padding: 12px 32px; border-radius: 100px; font-weight: bold; cursor: pointer; transition: 0.2s; font-size: 1rem;">Continue</button>
            </div>
        `;
        document.body.appendChild(overlay);

        // Add animation styles if not present
        if (!document.getElementById('success-style')) {
            const style = document.createElement('style');
            style.id = 'success-style';
            style.innerHTML = `
                @keyframes popIn { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes drawCheck { to { stroke-dashoffset: 0; } }
                .success-content button:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(99,102,241,0.4); }
            `;
            document.head.appendChild(style);
        }
    }
    overlay.classList.add('open');
}

// ===================== CONFIRMATION MODAL =====================
function showConfirmDateModal(logDate, todayDate, onConfirm, onCancel) {
    let overlay = document.getElementById('confirm-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '100002'; // Above task modal
        document.body.appendChild(overlay);
    }

    const isVi = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const titleText = isVi ? 'Xác nhận ngày làm việc' : '作業日の確認';
    const subText = isVi 
        ? `Ngày bạn chọn (<strong style="color: #f59e0b;">${logDate}</strong>) không phải là hôm nay (<strong style="color: #10b981;">${todayDate}</strong>).`
        : `選択された日付 (<strong style="color: #f59e0b;">${logDate}</strong>) は本日 (<strong style="color: #10b981;">${todayDate}</strong>) と異なります。`;
    const promptText = isVi
        ? 'Bạn có chắc chắn muốn ghi nhận Logtime cho ngày này không?'
        : 'この日付でログタイムを保存してもよろしいですか？';
    const btnCancelText = isVi ? 'Hủy bỏ' : 'キャンセル';
    const btnConfirmText = isVi ? 'Đồng ý' : 'はい、保存します';

    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 440px; text-align: center; padding: 32px 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); color: #f59e0b; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 26px; border: 1px solid rgba(245, 158, 11, 0.3);">
                ⚠️
            </div>
            <h2 style="font-size: 1.3rem; font-weight: 800; margin-bottom: 10px; color: var(--text);">${titleText}</h2>
            <p style="color: var(--text-2); font-size: 0.92rem; margin-bottom: 8px; line-height: 1.5;">${subText}</p>
            <p style="color: var(--text-3); font-size: 0.88rem; margin-bottom: 24px;">${promptText}</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btn-confirm-modal-cancel" class="btn btn-outline" style="flex: 1; justify-content: center; padding: 10px 16px; border-radius: var(--radius-md); font-weight: 600;">${btnCancelText}</button>
                <button id="btn-confirm-modal-ok" class="btn btn-primary" style="flex: 1; justify-content: center; padding: 10px 16px; border-radius: var(--radius-md); font-weight: 600; background: linear-gradient(135deg, var(--primary), var(--primary-hover));">${btnConfirmText}</button>
            </div>
        </div>
    `;

    overlay.classList.add('open');

    document.getElementById('btn-confirm-modal-cancel').onclick = () => {
        overlay.classList.remove('open');
        if (typeof onCancel === 'function') onCancel();
    };

    document.getElementById('btn-confirm-modal-ok').onclick = () => {
        overlay.classList.remove('open');
        if (typeof onConfirm === 'function') onConfirm();
    };
}

// ===================== LOGTIME FORM =====================
var logtimeCooldowns = {};
var logtimeAvgTime = 1000; // Average save time in ms (starts at 1s, adapts over time)

// Mở sẵn kết nối Google Sheets ngay khi user bắt đầu nhập/chọn bất kỳ ô nào trong form logtime
var logtimeLastWarmup = 0;
function warmupLogtimeConnection() {
    const now = Date.now();
    if (now - logtimeLastWarmup < 10 * 60 * 1000) return;
    logtimeLastWarmup = now;
    fetch('/api/logtime/warmup', { method: 'POST' }).catch(function() { logtimeLastWarmup = 0; });
}
['input', 'change', 'focusin'].forEach(function(evt) {
    document.addEventListener(evt, function(e) {
        if (e.target && e.target.closest && e.target.closest('form[id^="logtime-"]')) warmupLogtimeConnection();
    }, true);
});

function handleLogtime(event, formId) {
    event.preventDefault();
    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    const form = document.getElementById(formId);
    if (!form) return;

    const now = Date.now();
    const lastTime = logtimeCooldowns[formId] || 0;
    const diff = (now - lastTime) / 1000;

    if (diff < 300) {
        const rem = 300 - Math.floor(diff);
        showToast(isVi ? `⏳ Vui lòng chờ ${Math.floor(rem / 60)}p ${rem % 60}s nữa!` : `⏳ あと ${Math.floor(rem / 60)}分 ${rem % 60}秒お待ちください！`, 'warning');
        return;
    }

    const data = Object.fromEntries(new FormData(form).entries());

    // Hàm tiện ích cảnh báo và highlight input vi phạm
    function markInvalidField(fieldName, msg) {
        const input = form.querySelector(`[name="${fieldName}"]`);
        if (input) {
            input.focus();
            input.style.borderColor = '#ef4444';
            input.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.25)';
            const clearHighlight = () => {
                input.style.borderColor = '';
                input.style.boxShadow = '';
                input.removeEventListener('input', clearHighlight);
                input.removeEventListener('change', clearHighlight);
            };
            input.addEventListener('input', clearHighlight);
            input.addEventListener('change', clearHighlight);
        }
        showToast(msg, 'warning');
    }

    // 1. Loại truyện (Category)
    if (!data.category || !data.category.trim()) {
        markInvalidField('category', isVi ? '⚠️ Vui lòng chọn Loại truyện!' : '⚠️ カテゴリを選択してください！');
        return;
    }

    // 2. Độ khó (Difficulty) - Không được để trống hoặc để mặc định '--'
    if (!data.difficulty || !data.difficulty.trim()) {
        markInvalidField('difficulty', isVi ? '⚠️ Vui lòng chọn Độ khó!' : '⚠️ 難易度を選択してください！');
        return;
    }

    // 3. Người làm (Worker)
    if (!data.nguoi_thuc_hien || !data.nguoi_thuc_hien.trim()) {
        markInvalidField('nguoi_thuc_hien', isVi ? '⚠️ Vui lòng chọn Người làm!' : '⚠️ 作業者を選択してください！');
        return;
    }

    // 4. Ngày làm việc (Log date)
    if (!data.ngay_log || !data.ngay_log.trim()) {
        markInvalidField('ngay_log', isVi ? '⚠️ Vui lòng chọn Ngày làm việc!' : '⚠️ 作業日を選択してください！');
        return;
    }

    // 5. Giờ làm hôm nay (Hours) - Bắt buộc nhập, không được để trống, > 0
    if (data.so_gio === undefined || data.so_gio === null || String(data.so_gio).trim() === '') {
        markInvalidField('so_gio', isVi ? '⚠️ Vui lòng nhập Giờ làm hôm nay!' : '⚠️ 今日の作業時間を入力してください！');
        return;
    }
    const hours = parseFloat(data.so_gio);
    if (isNaN(hours) || hours <= 0) {
        markInvalidField('so_gio', isVi ? '⚠️ Giờ làm hôm nay phải lớn hơn 0!' : '⚠️ 作業時間は0より大きい値を入力してください！');
        return;
    }

    // 6. Tổng số trang (Total pages) - Bắt buộc nhập, không được để trống
    if (data.so_trang_tong === undefined || data.so_trang_tong === null || String(data.so_trang_tong).trim() === '') {
        markInvalidField('so_trang_tong', isVi ? '⚠️ Vui lòng nhập Tổng số trang!' : '⚠️ 総ページ数を入力してください！');
        return;
    }
    const totalPages = parseInt(data.so_trang_tong);
    if (isNaN(totalPages) || totalPages < 0) {
        markInvalidField('so_trang_tong', isVi ? '⚠️ Tổng số trang không hợp lệ!' : '⚠️ 総ページ数が無効です！');
        return;
    }

    // 7. Số page HT (Completed pages) - Bắt buộc nhập, không được để trống
    if (data.so_page === undefined || data.so_page === null || String(data.so_page).trim() === '') {
        markInvalidField('so_page', isVi ? '⚠️ Vui lòng nhập Số page hoàn thành (Số page HT)!' : '⚠️ 完了ページ数を入力してください！');
        return;
    }
    const pages = parseInt(data.so_page);
    if (isNaN(pages) || pages < 0) {
        markInvalidField('so_page', isVi ? '⚠️ Số page hoàn thành không hợp lệ!' : '⚠️ 完了ページ数が無効です！');
        return;
    }

    // 8. Ghi chú thêm (ghi_chu) -> Ngoại lệ duy nhất được để trống!

    // Check if the log date is today
    if (data.ngay_log) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (data.ngay_log !== todayStr) {
            showConfirmDateModal(data.ngay_log, todayStr, () => {
                executeLogtimeSubmit(form, formId, data);
            });
            return;
        }
    }

    executeLogtimeSubmit(form, formId, data);
}

// Centered loading / success modal for logtime saving (themed with site CSS variables)
// Centered loading / success modal for logtime saving with Duolingo animation
function showLogtimeSaveModal(state, isVi) {
    const saEmail = 'logtime-sa@logtime-app-3366.iam.gserviceaccount.com';
    let overlay = document.getElementById('logtime-save-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'logtime-save-overlay';
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '100003';
        document.body.appendChild(overlay);
        if (!document.getElementById('logtime-save-style')) {
            const style = document.createElement('style');
            style.id = 'logtime-save-style';
            style.innerHTML = `
                @keyframes ltPop { 0% { transform: scale(0.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes ltSpin { to { transform: rotate(360deg); } }
                .lt-spinner { width: 46px; height: 46px; margin: 0 auto 18px; border-radius: 50%; border: 4px solid transparent; border-top-color: var(--primary); border-bottom-color: var(--primary); animation: ltSpin 0.9s linear infinite; }
                .duo-card {
                    background: var(--surface, #ffffff);
                    border: 2px solid #58cc02;
                    border-bottom: 6px solid #46a302;
                    border-radius: 28px;
                    padding: 20px 24px 24px;
                    max-width: 460px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 16px 36px rgba(0,0,0,0.22);
                    animation: ltPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    position: relative;
                }
                .duo-title {
                    font-family: 'Nunito', 'Plus Jakarta Sans', sans-serif;
                    font-size: 1.55rem;
                    font-weight: 900;
                    color: #58cc02;
                    text-shadow: 0 2px 0 rgba(70, 163, 2, 0.25);
                    letter-spacing: -0.3px;
                    margin: 4px 0 6px;
                }
                .duo-btn {
                    font-family: 'Nunito', sans-serif;
                    font-size: 1rem;
                    font-weight: 900;
                    text-transform: uppercase;
                    background: #58cc02;
                    color: #ffffff;
                    border: none;
                    border-bottom: 4px solid #46a302;
                    border-radius: 16px;
                    padding: 10px 32px;
                    cursor: pointer;
                    margin-top: 14px;
                    transition: all 0.1s ease;
                    box-shadow: 0 4px 14px rgba(88, 204, 2, 0.3);
                }
                .duo-btn:hover {
                    filter: brightness(1.05);
                }
                .duo-btn:active {
                    transform: translateY(2px);
                    border-bottom-width: 2px;
                }
            `;
            document.head.appendChild(style);
        }
    }

    const boxStyle = 'max-width: 400px; text-align: center; padding: 32px 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); animation: ltPop 0.25s ease-out;';
    if (state === 'loading') {
        overlay.onclick = null;
        overlay.innerHTML = `
            <div class="modal-content" style="${boxStyle}">
                <div class="lt-spinner"></div>
                <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 8px; color: var(--text);">${isVi ? 'Đang lưu logtime...' : 'Logtimeを保存中...'}</h3>
                <p style="color: var(--text-3); font-size: 0.85rem; line-height: 1.5; word-break: break-all;">${isVi ? 'Đang lưu logtime bằng tài khoản:' : 'アカウントで保存中:'}<br><strong style="color: var(--primary);">${saEmail}</strong></p>
            </div>`;
        overlay.classList.add('open');
    } else if (state === 'success') {
        if (typeof triggerCelebration === 'function') triggerCelebration();
        overlay.innerHTML = `
            <div class="modal-content duo-card">
                <div id="duolingo-lottie-anim" style="width: 290px; height: 290px; margin: -10px auto 4px; overflow: hidden;"></div>
                <div class="duo-title">Đã Logtime thành công !!!</div>
                <div style="font-family: 'Nunito', sans-serif; font-weight: 700; color: var(--text-3); font-size: 0.9rem;">
                    ${isVi ? 'Dữ liệu đã được lưu thành công vào Google Sheets!' : 'Googleスプレッドシートに保存しました！'}
                </div>
                <button type="button" class="duo-btn">${isVi ? 'TIẾP TỤC' : '続ける'}</button>
            </div>`;
        overlay.classList.add('open');

        const runAnim = function() {
            const container = document.getElementById('duolingo-lottie-anim');
            if (!container) return;
            if (window.lottie) {
                try {
                    if (window._duoAnim) {
                        window._duoAnim.destroy();
                    }
                    window._duoAnim = window.lottie.loadAnimation({
                        container: container,
                        renderer: 'svg',
                        loop: true,
                        autoplay: true,
                        path: '/static/duolingo_animation.json?v=' + Date.now()
                    });
                } catch (e) {
                    console.warn('Lottie loading error:', e);
                }
            }
        };

        if (window.lottie) {
            runAnim();
        } else {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js';
            s.onload = runAnim;
            document.head.appendChild(s);
        }

        const closeDuo = function() {
            overlay.classList.remove('open');
            if (window._duoAnim) {
                try { window._duoAnim.destroy(); } catch (e) {}
                window._duoAnim = null;
            }
            if (typeof window.triggerAutoReloadOnTaskDone === 'function') {
                window.triggerAutoReloadOnTaskDone();
            }
        };

        overlay.onclick = function(e) {
            if (e.target === overlay || (e.target && e.target.classList && e.target.classList.contains('duo-btn'))) {
                closeDuo();
            }
        };
        clearTimeout(overlay._closeTimer);
        overlay._closeTimer = setTimeout(closeDuo, 3800);
    } else {
        overlay.classList.remove('open');
        if (window._duoAnim) {
            try { window._duoAnim.destroy(); } catch (e) {}
            window._duoAnim = null;
        }
    }
}

function executeLogtimeSubmit(form, formId, data) {
    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.innerHTML; // Keep HTML if there are icons
    btn.disabled = true;
    btn.textContent = isVi ? '⏳ ĐANG LƯU...' : '⏳ 保存中...';

    showLogtimeSaveModal('loading', isVi);

    fetch('/api/logtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json())
        .then(result => {
            if (result.status === 'success') {
                logtimeCooldowns[formId] = Date.now();
                showLogtimeSaveModal('success', isVi);
                if (typeof handlePetXPResponse === 'function') handlePetXPResponse(result);
            } else {
                showLogtimeSaveModal('close', isVi);
                showToast('❌ ' + (result.message || (isVi ? 'Có lỗi xảy ra.' : 'エラーが発生しました。')), 'error');
            }
        })
        .catch(function() {
            showLogtimeSaveModal('close', isVi);
            showToast(isVi ? '❌ Lỗi kết nối!' : '❌ 接続エラー！', 'error');
        })
        .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}

// ===================== UTILS =====================
function changeLang(lang) { window.location.href = `/set-lang?lang=${lang}&next=${encodeURIComponent(window.location.pathname)}`; }
function refreshData() { window.location.reload(); }

function softRefreshChecklist(btn) {
    const icon = document.getElementById('refresh-icon');
    const text = document.getElementById('refresh-text');
    if (btn) btn.disabled = true;
    if (icon) icon.style.animation = 'spin 0.8s linear infinite';
    if (text) text.textContent = '...';

    // backgroundSyncChecklist returns void but uses fetch internally
    // We call it and set a timeout to restore UI
    backgroundSyncChecklist();

    setTimeout(() => {
        if (icon) icon.style.animation = '';
        if (text) text.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Refresh' : '更新';
        if (btn) btn.disabled = false;
        if (window.showToast) showToast(
            (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Đã tải lại checklist!' : 'チェックリストを更新しました！',
            'success'
        );
    }, 2000);
}

function copyText(btn, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        const oldHtml = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = '<i class="fas fa-check" style="color: #10b981;"></i> <span>' + ((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'ja') ? 'コピー完了' : 'Đã chép') + '</span>';
        setTimeout(() => {
            btn.innerHTML = oldHtml;
            btn.classList.remove('copied');
        }, 1800);
    }).catch(() => {
        if (window.showToast) showToast('Copy thất bại!', 'error');
    });
}

function toggleAskTask(el) {
    const accordion = el.closest('.ask-task-accordion');
    if (accordion) {
        accordion.classList.toggle('open');
    } else {
        const content = el.nextElementSibling;
        if (content) content.classList.toggle('open');
    }
}

// ===================== THEME TOGGLE =====================
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme');
    const isDark = body.classList.contains('dark-theme');
    localStorage.setItem('vn_tracking_theme', isDark ? 'dark' : 'light');

    // Redraw chart to apply new theme colors
    if (typeof updateAreaChart === 'function') {
        const activeBtn = document.querySelector('.chart-time-controls button.active');
        if (activeBtn) updateAreaChart(activeBtn.dataset.period);
    }
}

// ===================== BACKGROUND SYNC =====================
function backgroundSyncChecklist() {
    if (true) {
        const cacheBuster = `?_t=${Date.now()}`;
        fetch('/api/checklist_sync_get' + cacheBuster)
            .then(r => r.json())
            .then(data => {
                if (!Array.isArray(data)) return;

                // Group data by Tên Tác Phẩm
                const checkedMap = {};
                data.forEach(item => {
                    const tpKey = item['Tên Tác Phẩm'];
                    const cbId = item['Checkbox ID'];
                    const status = item['Trạng Thái'];
                    const isChecked = (status === true || status === 'true' || status === 'TRUE' || status === 1);

                    if (!checkedMap[tpKey]) checkedMap[tpKey] = {};
                    checkedMap[tpKey][cbId] = isChecked;
                });

                // Update all cards on the page
                document.querySelectorAll('.progress-card').forEach(card => {
                    const tpKey = card.dataset.tpKey;
                    if (!tpKey) return;

                    // Count how many are checked for this tpKey in the fetched data
                    let localCheckedCount = 0;
                    let freshCheckedIds = [];
                    for (let i = 1; i <= 9; i++) {
                        const checkId = `t${i}`;
                        const isCheckedNew = checkedMap[tpKey] && checkedMap[tpKey][checkId];
                        const finalChecked = Boolean(isCheckedNew);
                        if (finalChecked) {
                            localCheckedCount++;
                            freshCheckedIds.push(checkId);
                        }
                        
                        // Update checkboxes inside the modal safely without DOM query selector errors
                        document.querySelectorAll('.checklist-grid').forEach(g => {
                            if (g.dataset.tpKey === tpKey) {
                                const cb = g.querySelector(`input[data-check-id="${checkId}"]`);
                                if (cb && !cb.matches(':focus') && !cb.matches(':active')) {
                                    cb.checked = finalChecked;
                                }
                            }
                        });
                    }

                    // Keep card.dataset.checkedIds in sync so modal reads fresh data
                    card.dataset.checkedIds = freshCheckedIds.join(',');

                    const progress = Math.round((localCheckedCount / 9) * 100);

                    // Update progress UI
                    const infoSpans = card.querySelectorAll('.progress-info span');
                    if (infoSpans.length > 1) infoSpans[1].textContent = `${progress}%`;
                    const fill = card.querySelector('.progress-fill');
                    if (fill) fill.style.width = `${progress}%`;

                    // Update partner progress spans in other cards that have this task as their partner
                    document.querySelectorAll(`.partner-progress-text[data-partner-key="${tpKey}"]`).forEach(span => {
                        span.textContent = `${progress}%`;
                        if (progress >= 100) {
                            span.style.color = '#34d399';
                        } else if (progress > 0) {
                            span.style.color = '#fbbf24';
                        } else {
                            span.style.color = 'var(--text-4)';
                        }
                    });

                    // Move card to correct column
                    const newStatusClass = localCheckedCount === 0 ? 'not-started' : (localCheckedCount >= 9 ? 'delivered' : 'in-progress');
                    const currentStatusClass = Array.from(card.classList).find(c => c.startsWith('status-'));

                    if (currentStatusClass !== `status-${newStatusClass}`) {
                        card.classList.remove(currentStatusClass);
                        card.classList.add(`status-${newStatusClass}`);

                        // Update status text
                        const statusSpan = card.querySelector('.status-text');
                        if (statusSpan) {
                            const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
                            if (newStatusClass === 'not-started') statusSpan.textContent = isVN ? 'To Do' : '未着手';
                            else if (newStatusClass === 'delivered') statusSpan.textContent = isVN ? 'Completed' : '納品済み';
                            else statusSpan.textContent = isVN ? 'In Progress' : '進行中';
                        }

                        const tab = card.closest('.tab-content');
                        if (tab) {
                            const targetCol = tab.querySelector(`.kanban-column[data-status="${newStatusClass}"] .kanban-cards`);
                            if (targetCol) targetCol.appendChild(card);

                            // Update column badges
                            tab.querySelectorAll('.kanban-column').forEach(col => {
                                const count = Array.from(col.querySelectorAll('.progress-card')).filter(c => c.style.display !== 'none').length;
                                const badge = col.querySelector('.kanban-col-count');
                                if (badge) badge.textContent = count;
                            });
                        }
                    }
                });
            }).catch(() => { });
    }
}

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
    // Init Tab
    const lastTab = sessionStorage.getItem('activeTab') || 'nay';
    switchTab(lastTab);

    // Init Theme
    const savedTheme = localStorage.getItem('vn_tracking_theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // Init Weather & Time
    initWeatherTime();

    // Init AI Insights
    const scrollContainer = document.getElementById('aiInsightsScroll');
    if (scrollContainer) {
        fetchAiInsights();
        setInterval(fetchAiInsights, 600000);
    }

    // Init Task Comments Socket
    setupTaskCommentsSocket();

    // Background Sync for Server Truth
    backgroundSyncChecklist();

    // Init Area Chart
    const chartLoader = document.getElementById('chart-loader');
    fetch('/api/chart_data')
        .then(res => res.json())
        .then(data => {
            if (typeof vntaskDataList !== 'undefined') {
                vntaskDataList = data;
                if (chartLoader) chartLoader.style.display = 'none';
                setChartPeriod('week');
                
                // Sync chart with active tab
                const currentTab = sessionStorage.getItem('activeTab') || 'nay';
                const isVi = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
                if (currentTab === 'truoc') selectWeek(-1, isVi ? 'Tuần trước' : '先週', null, false);
                else if (currentTab === 'nay') selectWeek(0, isVi ? 'Tuần này' : '今週', null, false);
                else if (currentTab === 'sau') selectWeek(1, isVi ? 'Tuần sau' : '来週', null, false);
            }
        })
        .catch(err => {
            console.error('Error fetching chart data:', err);
            if (chartLoader) chartLoader.innerHTML = '<span style="color:#ef4444; font-weight: bold;">Lỗi tải dữ liệu</span>';
        });
});

// ===================== IDLE TIMEOUT (DISABLED) =====================
// Tính năng popup refresh khi không thao tác đã được tắt.
// let idleTimer;
// const IDLE_LIMIT = 30 * 60 * 1000; // 30 minutes
//
// function resetIdleTimer() {
//     clearTimeout(idleTimer);
//     idleTimer = setTimeout(() => {
//         const overlay = document.createElement('div');
//         overlay.style.position = 'fixed';
//         overlay.style.inset = '0';
//         overlay.style.background = 'rgba(15, 23, 42, 0.9)';
//         overlay.style.backdropFilter = 'blur(10px)';
//         overlay.style.zIndex = '99999';
//         overlay.style.display = 'flex';
//         overlay.style.alignItems = 'center';
//         overlay.style.justifyContent = 'center';
//         overlay.style.flexDirection = 'column';
//         overlay.style.color = 'white';
//         overlay.innerHTML = `
//             <svg>...</svg>
//             <h2>Phiên làm việc tạm dừng</h2>
//             <p>Trang đã không thao tác trong một thời gian dài.</p>
//             <button onclick="location.reload()">Tải lại trang (Refresh)</button>
//         `;
//         document.body.appendChild(overlay);
//     }, IDLE_LIMIT);
// }
//
// ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
//     window.addEventListener(evt, resetIdleTimer, { passive: true });
// });
// resetIdleTimer();

// ===================== PROFILE PANEL (FLYOUT POPOVER) =====================
function toggleProfilePanel() {
    const panel = document.getElementById('profile-panel');
    const backdrop = document.getElementById('profile-popover-backdrop');
    const chevron = document.getElementById('profile-chevron');
    if (!panel) return;

    const isOpen = panel.classList.toggle('open');
    if (backdrop) {
        backdrop.classList.toggle('open', isOpen);
    }
    if (chevron) {
        chevron.classList.toggle('rotated', isOpen);
    }
}

// Close profile panel when pressing Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const panel = document.getElementById('profile-panel');
        if (panel && panel.classList.contains('open')) {
            toggleProfilePanel();
        }
    }
});


// ===================== CHANGE PASSWORD MODAL =====================
function openChangePassModal() {
    const overlay = document.getElementById('changepass-overlay');
    const modal = document.getElementById('changepass-modal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }
}

function closeChangePassModal() {
    const overlay = document.getElementById('changepass-overlay');
    const modal = document.getElementById('changepass-modal');
    if (overlay && modal) {
        overlay.classList.remove('active');
        modal.classList.remove('active');
    }
}

function submitChangePass() {
    const oldPass = document.getElementById('old-pass').value.trim();
    const newPass = document.getElementById('new-pass').value.trim();
    const confirmPass = document.getElementById('confirm-pass').value.trim();

    if (!oldPass || !newPass || !confirmPass) {
        showToast('Vui lòng nhập đầy đủ thông tin!', 'error');
        return;
    }
    if (newPass !== confirmPass) {
        showToast('Mật khẩu mới không khớp!', 'error');
        return;
    }

    const btn = document.querySelector('.cp-modal .btn-primary');
    const origText = btn.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 8px; display: inline-block;"></span> Đang lưu...';
    }

    fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPass, new_password: newPass })
    })
        .then(r => r.json())
        .then(res => {
            if (res.status === 'success') {
                showToast('Đổi mật khẩu thành công!', 'success');
                closeChangePassModal();
                document.getElementById('old-pass').value = '';
                document.getElementById('new-pass').value = '';
                document.getElementById('confirm-pass').value = '';
            } else {
                showToast('Lỗi: ' + res.message, 'error');
            }
        })
        .catch(() => showToast('Lỗi kết nối!', 'error'))
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        });
}

// ===================== TASK AREA CHART =====================
let taskChartInstance = null;

function setChartPeriod(period) {
    document.querySelectorAll('.chart-time-controls button').forEach(btn => {
        if (btn.dataset.period === period) {
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline');
        } else {
            btn.classList.remove('active', 'btn-primary');
            btn.classList.add('btn-outline');
        }
    });

    const weekSelect = document.getElementById('custom-week-select');
    const monthSelect = document.getElementById('custom-month-select');
    if (weekSelect) weekSelect.style.display = period === 'week' ? 'block' : 'none';
    if (monthSelect) monthSelect.style.display = period === 'month' ? 'block' : 'none';

    updateAreaChart(period);
}

const avatarCache = {};
const avatarPlugin = {
    id: 'avatarPlugin',
    afterDatasetsDraw(chart, args, options) {
        if (!options.avatars) return;
        const ctx = chart.ctx;
        const xAxis = chart.scales.x;
        const yAxis = chart.scales.y;

        chart.data.labels.forEach((label, index) => {
            const avatarUrl = options.avatars[label];
            if (!avatarUrl) return;

            const x = xAxis.getPixelForTick(index);
            let maxYPixel = yAxis.bottom;

            for (let i = 0; i < chart.data.datasets.length; i++) {
                const meta = chart.getDatasetMeta(i);
                if (!meta.hidden && meta.data[index]) {
                    const yPixel = meta.data[index].y;
                    if (yPixel < maxYPixel) {
                        maxYPixel = yPixel;
                    }
                }
            }

            const imgSize = 28;
            const drawY = maxYPixel - imgSize / 2 - 8;
            if (drawY - imgSize / 2 < 0) return; // Only skip if it goes off the canvas

            let img = avatarCache[avatarUrl];
            if (!img) {
                img = new Image();
                img.src = avatarUrl;
                avatarCache[avatarUrl] = img;
                img.onload = () => chart.update('none');
            }

            if (img.complete && img.naturalHeight !== 0) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, drawY, imgSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, x - imgSize / 2, drawY - imgSize / 2, imgSize, imgSize);
                ctx.restore();

                ctx.beginPath();
                ctx.arc(x, drawY, imgSize / 2, 0, Math.PI * 2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }
        });
    }
};

Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function updateAreaChart(period) {
    if (typeof vntaskDataList === 'undefined' || !document.getElementById('monthlyTaskChart')) return;

    const customLegend = document.getElementById('custom-chart-legend');
    if (customLegend) {
        customLegend.style.display = period === 'week' ? 'flex' : 'none';
        const legendOther = document.getElementById('legend-other-text');
        if (legendOther) {
            legendOther.textContent = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi' ? 'Khác' : 'その他';
        }
    }

    const now = new Date();
    let groupedData = {};
    let labels = [];
    let isBarChart = false;
    let titleX = '';

    let chartDatasets = [];
    let chartDetailsMap = [];
    let chartAvatars = null;

    const getWeekNumber = (d) => {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    };

    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';

    if (period === 'week') {
        isBarChart = true;
        titleX = isVi ? 'Người thực hiện' : '担当者';
        const txtOtherWorker = isVi ? 'Khác' : 'その他';
        // Populate if empty
        const dropdownList = document.getElementById('week-dropdown-list');
        if (dropdownList && dropdownList.children.length === 0) {
            let optionsHtml = '';
            const weeksList = [
                { val: -1, text: isVi ? 'Tuần trước' : '先週' },
                { val: 0, text: isVi ? 'Tuần này' : '今週' },
                { val: 1, text: isVi ? 'Tuần sau' : '来週' }
            ];
            weeksList.forEach(item => {
                optionsHtml += `<div class="lang-option" onclick="selectWeek(${item.val}, '${item.text}', event)">${item.text}</div>`;
            });
            dropdownList.innerHTML = optionsHtml;
        }


        let targetWeek = getWeekNumber(now);
        let targetYear = now.getFullYear();
        const weekText = document.getElementById('week-text');
        if (weekText && weekText.dataset.weekOffset) {
            const offset = parseInt(weekText.dataset.weekOffset, 10);
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + (offset * 7));
            targetWeek = getWeekNumber(targetDate);
            targetYear = targetDate.getFullYear();
        }

        const currentWeekTasks = vntaskDataList.filter(item => {
            const d = new Date(item.date);
            return getWeekNumber(d) === targetWeek && d.getFullYear() === targetYear;
        });

        const workerTasks = {};
        currentWeekTasks.forEach(item => {
            if (item.worker) {
                const workers = item.worker.split(',').map(w => w.trim());
                const weight = 1.0 / workers.length;
                workers.forEach(w => {
                    if (!workerTasks[w]) workerTasks[w] = [];
                    workerTasks[w].push({ ...item, weight: weight });
                });
            } else {
                if (!workerTasks[txtOtherWorker]) workerTasks[txtOtherWorker] = [];
                workerTasks[txtOtherWorker].push({ ...item, weight: 1.0 });
            }
        });

        labels = Object.keys(workerTasks);

        let dataRetouch = [];
        let dataLettering = [];
        let dataOther = [];
        let detailRetouch = [];
        let detailLettering = [];
        let detailOther = [];

        labels.forEach(w => {
            const tasks = workerTasks[w];
            let rTasks = tasks.filter(t => t.jobType === 'Retouch');
            let lTasks = tasks.filter(t => t.jobType === 'Lettering');
            let oTasks = tasks.filter(t => t.jobType !== 'Retouch' && t.jobType !== 'Lettering');

            dataRetouch.push(rTasks.reduce((sum, t) => sum + t.weight, 0));
            dataLettering.push(lTasks.reduce((sum, t) => sum + t.weight, 0));
            dataOther.push(oTasks.reduce((sum, t) => sum + t.weight, 0));

            detailRetouch.push(rTasks);
            detailLettering.push(lTasks);
            detailOther.push(oTasks);
        });

        chartDatasets = [
            {
                label: 'Retouch',
                data: dataRetouch,
                backgroundColor: 'rgba(96, 165, 250, 0.85)', // Pastel Blue
                hoverBackgroundColor: 'rgba(59, 130, 246, 0.9)',
                borderRadius: 20,
                borderSkipped: false,
                maxBarThickness: 32,
                details: detailRetouch
            },
            {
                label: 'Lettering',
                data: dataLettering,
                backgroundColor: 'rgba(167, 243, 208, 0.85)', // Pastel Green
                hoverBackgroundColor: 'rgba(52, 211, 153, 0.9)',
                borderRadius: 20,
                borderSkipped: false,
                maxBarThickness: 32,
                details: detailLettering
            },
            {
                label: txtOtherWorker,
                data: dataOther,
                backgroundColor: 'rgba(209, 213, 219, 0.85)', // Pastel Gray
                hoverBackgroundColor: 'rgba(156, 163, 175, 0.9)',
                borderRadius: 20,
                borderSkipped: false,
                maxBarThickness: 32,
                details: detailOther
            }
        ].filter(d => d.data.some(v => v > 0));

        chartAvatars = {};
        if (typeof userProfilesDB !== 'undefined') {
            labels.forEach(w => {
                const dbKey = Object.keys(userProfilesDB).find(k => w.toLowerCase().includes(k.toLowerCase()));
                if (dbKey && userProfilesDB[dbKey]) {
                    chartAvatars[w] = userProfilesDB[dbKey].avatar || userProfilesDB[dbKey].profile_picture;
                }
            });
        }

    } else {
        // Month or Year Mode (Area Chart)
        if (period === 'month') {
            const monthDropdownList = document.getElementById('month-dropdown-list');
            if (monthDropdownList && monthDropdownList.children.length === 0) {
                let optionsHtml = '';
                for (let i = 1; i <= 12; i++) {
                    const text = isVi ? `Tháng ${i}` : `${i}月`;
                    optionsHtml += `<div class="lang-option" onclick="selectMonth(${i}, '${text}', event)">${text}</div>`;
                }
                monthDropdownList.innerHTML = optionsHtml;
            }

            labels = isVi ? ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4', 'Tuần 5'] : ['第1週', '第2週', '第3週', '第4週', '第5週'];
            labels.forEach(l => groupedData[l] = []);

            let targetMonth = now.getMonth();
            let targetYear = now.getFullYear();
            const monthText = document.getElementById('month-text');
            if (monthText && monthText.dataset.monthValue) {
                targetMonth = parseInt(monthText.dataset.monthValue, 10) - 1;
            }

            vntaskDataList.forEach(item => {
                const d = new Date(item.date);
                if (d.getMonth() === targetMonth && d.getFullYear() === targetYear) {
                    const firstDayOfMonth = new Date(targetYear, targetMonth, 1).getDay();
                    const adjustedDate = d.getDate() + (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
                    const weekIdx = Math.floor((adjustedDate - 1) / 7);
                    if (weekIdx < 5) {
                        groupedData[labels[weekIdx]].push(item);
                    } else {
                        groupedData[labels[4]].push(item);
                    }
                }
            });

        } else if (period === 'year') {
            labels = isVi ?
                ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'] :
                ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
            labels.forEach(l => groupedData[l] = []);

            let targetYear = now.getFullYear();

            vntaskDataList.forEach(item => {
                const d = new Date(item.date);
                if (d.getFullYear() === targetYear) {
                    groupedData[labels[d.getMonth()]].push(item);
                }
            });
        }

        const dataPoints = labels.map(l => groupedData[l].length);
        chartDetailsMap = labels.map(l => groupedData[l]);

        const ctx = document.getElementById('monthlyTaskChart').getContext('2d');
        let gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.6)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        chartDatasets = [{
            label: isVi ? 'Số Task' : 'タスク数',
            data: dataPoints,
            borderColor: '#10b981',
            backgroundColor: gradient,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#fff',
            pointHoverBorderColor: '#10b981',
            pointRadius: 4,
            pointHoverRadius: 6
        }];
    }

    if (taskChartInstance) {
        taskChartInstance.destroy();
    }

    const ctx = document.getElementById('monthlyTaskChart').getContext('2d');
    const isDark = document.body.classList.contains('dark-theme');
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    taskChartInstance = new Chart(ctx, {
        type: isBarChart ? 'bar' : 'line',
        data: {
            labels: labels,
            datasets: chartDatasets
        },
        plugins: isBarChart ? [avatarPlugin] : [],
        options: {
            animations: {
                y: {
                    from: (ctx) => {
                        if (ctx.type === 'data') {
                            return ctx.chart.scales.y ? ctx.chart.scales.y.bottom : 400;
                        }
                    },
                    duration: 1200,
                    easing: 'easeOutQuart'
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: isBarChart ? 40 : 10 // Leave extra space for avatars
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                avatarPlugin: {
                    avatars: chartAvatars
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    titleColor: isDark ? '#fff' : '#000',
                    bodyColor: isDark ? '#cbd5e1' : '#334155',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 4,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ' + context.parsed.y;
                            return label;
                        },
                        afterBody: function (context) {
                            if (isBarChart) {
                                // For Week mode
                                let lines = [isVi ? '\n--- Chi tiết ---' : '\n--- 詳細 ---'];
                                context.forEach(c => {
                                    const ds = c.chart.data.datasets[c.datasetIndex];
                                    const tasks = ds.details[c.dataIndex];
                                    if (tasks && tasks.length > 0) {
                                        lines.push(`${ds.label}:`);
                                        tasks.forEach(t => lines.push(`  • ${t.taskName}`));
                                    }
                                });
                                return lines;
                            } else {
                                // For Month/Year mode
                                const idx = context[0].dataIndex;
                                const tasks = chartDetailsMap[idx];
                                if (!tasks || tasks.length === 0) return '';

                                const txtOtherJob = isVi ? 'Khác' : 'その他';
                                let jobCounts = {};
                                tasks.forEach(t => {
                                    let jt = t.jobType || 'Khác';
                                    if (jt === 'Khác') jt = txtOtherJob;
                                    jobCounts[jt] = (jobCounts[jt] || 0) + 1;
                                });

                                let lines = [isVi ? '\n--- Phân loại ---' : '\n--- 分類 ---'];
                                for (let [job, count] of Object.entries(jobCounts)) {
                                    lines.push(`• ${job}: ${count}`);
                                }
                                return lines;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    stacked: isBarChart,
                    beginAtZero: true,
                    ticks: { color: textColor, stepSize: 1 },
                    grid: { color: gridColor, drawBorder: false }
                },
                x: {
                    stacked: isBarChart,
                    title: {
                        display: isBarChart,
                        text: titleX,
                        color: textColor,
                        font: {
                            weight: 'bold',
                            size: 14
                        }
                    },
                    ticks: { color: textColor },
                    grid: { display: false, drawBorder: false }
                }
            },
            interaction: {
                intersect: false,
                mode: isBarChart ? 'index' : 'index',
            },
        }
    });
}

// Calendar Popup logic
let calendarInstance = null;

function toggleCalendarPopup(deadlineText) {
    const popup = document.getElementById('calendar-popup');
    if (!popup) return;

    if (popup.style.display === 'block') {
        popup.style.display = 'none';
        return;
    }

    popup.style.display = 'block';

    let targetDate = new Date(deadlineText);
    if (isNaN(targetDate.getTime())) {
        targetDate = new Date(); // fallback
    }

    // Calculate countdown
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDateOnly = new Date(targetDate);
    targetDateOnly.setHours(0, 0, 0, 0);
    const diffDays = Math.round((targetDateOnly - today) / (1000 * 60 * 60 * 24));

    let isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    let countdownText = "";
    if (isVi) {
        if (diffDays > 0) countdownText = `Còn ${diffDays} ngày nữa tới deadline`;
        else if (diffDays === 0) countdownText = "Deadline là hôm nay!";
        else countdownText = `Đã quá hạn ${Math.abs(diffDays)} ngày`;
    } else {
        if (diffDays > 0) countdownText = `締め切りまであと${diffDays}日`;
        else if (diffDays === 0) countdownText = "今日が締め切りです！";
        else countdownText = `締め切りから${Math.abs(diffDays)}日経過`;
    }

    // Show TODAY on the left panel
    document.getElementById('cal-left-dow').textContent = isVi ? "HÔM NAY" : "今日";
    document.getElementById('cal-left-date').textContent = new Date().getDate();
    document.getElementById('cal-left-text').textContent = countdownText;

    if (typeof flatpickr !== 'undefined' && flatpickr.l10ns && flatpickr.l10ns.vn) {
        flatpickr.l10ns.vn.months.longhand = ["THÁNG 1", "THÁNG 2", "THÁNG 3", "THÁNG 4", "THÁNG 5", "THÁNG 6", "THÁNG 7", "THÁNG 8", "THÁNG 9", "THÁNG 10", "THÁNG 11", "THÁNG 12"];
        flatpickr.l10ns.vn.months.shorthand = ["THÁNG 1", "THÁNG 2", "THÁNG 3", "THÁNG 4", "THÁNG 5", "THÁNG 6", "THÁNG 7", "THÁNG 8", "THÁNG 9", "THÁNG 10", "THÁNG 11", "THÁNG 12"];
    }

    if (!calendarInstance) {
        calendarInstance = flatpickr("#inline-calendar", {
            inline: true,
            locale: isVi ? "vn" : "ja", // Automatically starts on Monday (t2)
            defaultDate: targetDate,
            onDayCreate: function (dObj, dStr, fp, dayElem) {
                if (dayElem.dateObj.getDate() === targetDate.getDate() &&
                    dayElem.dateObj.getMonth() === targetDate.getMonth() &&
                    dayElem.dateObj.getFullYear() === targetDate.getFullYear()) {
                    dayElem.classList.add('is-deadline');
                }
            }
        });
    } else {
        calendarInstance.setDate(targetDate);
        calendarInstance.redraw();
    }
}

document.addEventListener('click', function (e) {
    const popup = document.getElementById('calendar-popup');
    const badgeNay = document.getElementById('deadline-nay-badge');
    const badgeSau = document.getElementById('deadline-sau-badge');
    if (popup && popup.style.display === 'block') {
        const isClickBadge = (badgeNay && (badgeNay === e.target || badgeNay.contains(e.target))) ||
                             (badgeSau && (badgeSau === e.target || badgeSau.contains(e.target)));
        if (!popup.contains(e.target) && !isClickBadge) {
            popup.style.display = 'none';
        }
    }
});

// ======================================
// ROLE PAGE VIEW (Chi tiết Phân Quyền)
// ======================================
function openRoleModal() {
    openToolPage('role');
}

function closeRoleModal() {
    closeToolPage('role');
}

function updateRole(username, btn) {
    // Replace spaces and dots to match the ID logic
    const selectId = 'role-select-' + username.replace(/ /g, '_').replace(/\./g, '_');
    const selectElem = document.getElementById(selectId);
    if (!selectElem) {
        showToast('Không tìm thấy thông tin quyền!', 'error');
        return;
    }
    const newRole = selectElem.value;

    // Set loading state
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading-spinner" style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s linear infinite; display: inline-block;"></span>';
    btn.disabled = true;

    fetch('/api/roles', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username, role: newRole })
    })
        .then(response => response.json())
        .then(data => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            if (data.success) {
                showToast('Cập nhật thành công quyền cho: ' + username, 'success');
            } else {
                showToast('Lỗi: ' + (data.message || 'Không thể cập nhật quyền'), 'error');
            }
        })
        .catch(error => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            showToast('Lỗi kết nối!', 'error');
        });
}



// ======================================
// CHART DROPDOWN FUNCTIONS
// ======================================
function toggleWeekSelect(e) {
    if (e) e.stopPropagation();
    const select = document.getElementById('custom-week-select');
    if (select) {
        select.classList.toggle('open');
    }
}

function selectWeek(offset, text, e, syncTab = true) {
    if (e) e.stopPropagation();
    const textSpan = document.getElementById('week-text');
    if (textSpan) {
        textSpan.innerText = text;
        textSpan.dataset.weekOffset = offset;
    }
    const select = document.getElementById('custom-week-select');
    if (select) {
        select.classList.remove('open');
    }
    
    if (syncTab && typeof switchTab === 'function') {
        let tabId = 'nay';
        if (offset === -1) tabId = 'truoc';
        else if (offset === 1) tabId = 'sau';
        
        const currentActive = sessionStorage.getItem('activeTab');
        if (currentActive !== tabId) {
            switchTab(tabId, false);
        }
    }
    
    updateAreaChart('week');
}

function toggleMonthSelect(e) {
    if (e) e.stopPropagation();
    const select = document.getElementById('custom-month-select');
    if (select) {
        select.classList.toggle('open');
    }
}

function selectMonth(monthVal, text, e) {
    if (e) e.stopPropagation();
    const textSpan = document.getElementById('month-text');
    if (textSpan) {
        textSpan.innerText = text;
        textSpan.dataset.monthValue = monthVal;
    }
    const select = document.getElementById('custom-month-select');
    if (select) {
        select.classList.remove('open');
    }
    updateAreaChart('month');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('#custom-week-select')) {
        const dWeek = document.getElementById('custom-week-select');
        if (dWeek) dWeek.classList.remove('open');
    }
    if (!e.target.closest('#custom-month-select')) {
        const dMonth = document.getElementById('custom-month-select');
        if (dMonth) dMonth.classList.remove('open');
    }
});

// ======================================
// GLOBAL SOCKET LISTENERS
// ======================================
function renderOnlineUsers(users) {
    const container = document.getElementById('global-online-users');
    if (!container) return;

    const MAX_VISIBLE = 4;
    let html = '';

    users.forEach((u, idx) => {
        if (idx >= MAX_VISIBLE) return;
        const zIndex = 100 - idx;
        const initial = u.fullname ? u.fullname.charAt(0).toUpperCase() : 'U';

        html += `
            <span class="worker-avatar global-avatar" style="margin-left: ${idx > 0 ? '-8px' : '0'}; position: relative; z-index: ${zIndex}; border: 2px solid var(--bg-body);" title="${u.fullname}">
                ${u.avatar ? `<img src="${u.avatar}" alt="Avatar" class="avatar-img" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="avatar-fallback" style="display:none;">${initial}</span>` : initial}
            </span>
        `;
    });

    if (users.length > MAX_VISIBLE) {
        const extraCount = users.length - MAX_VISIBLE;
        html += `
            <span class="worker-avatar global-avatar" style="margin-left: -8px; position: relative; z-index: 90; background: var(--bg-card); color: var(--text-2); font-size: 12px; border: 2px solid var(--bg-body);" title="+${extraCount} người nữa">
                +${extraCount}
            </span>
        `;
    }

    container.innerHTML = html;
}

// ---- REST presence fallback (Vercel: không có Socket.IO) ----
let presencePingInterval = null;
let presenceListInterval = null;

async function presencePing() {
    try {
        await fetch('/api/presence/ping', { method: 'POST', credentials: 'same-origin' });
    } catch (e) { /* ignore */ }
}

async function presenceRefreshList() {
    try {
        const r = await fetch('/api/presence/list', { credentials: 'same-origin' });
        if (!r.ok) return;
        const data = await r.json();
        if (data && data.users) renderOnlineUsers(data.users);
    } catch (e) { /* ignore */ }
}

function startPresencePolling() {
    if (presencePingInterval) return;
    presencePing();
    presenceRefreshList();
    presencePingInterval = setInterval(presencePing, 10000);   // heartbeat 10s
    presenceListInterval = setInterval(presenceRefreshList, 5000); // refresh list 5s
    // Rời danh sách khi đóng tab (best effort)
    window.addEventListener('beforeunload', () => {
        try {
            navigator.sendBeacon('/api/presence/leave');
        } catch (e) { /* ignore */ }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof socket !== 'undefined' && socket) {
        socket.on('online_users_update', function (users) {
            console.log("Online users updated:", users);
            renderOnlineUsers(users);
        });

        // Request initial list
        socket.emit('request_online_users');
        socket.on('connect', () => {
            socket.emit('request_online_users');
        });
    }

    // Fallback: nếu sau 4s vẫn không có Socket.IO kết nối (Vercel serverless),
    // chuyển sang REST presence để danh sách người online hiển thị đầy đủ.
    setTimeout(() => {
        if (typeof socket === 'undefined' || !socket || !socket.connected) {
            console.log('[Presence] Socket.IO not available, using REST presence polling');
            startPresencePolling();
        }
    }, 4000);
});

// ======================================
// MINI CHAT BOX (Redesigned v1.3.28)
// ======================================
let unreadChatCount = 0;
let isChatOpen = false;
let currentChatFile = null;

// Messenger-style notification sound using Web Audio API
function playChatNotification() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        
        // First tone (higher pitch "ding")
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(830, ctx.currentTime);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.15);

        // Second tone (slightly higher, delayed)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1050, ctx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.01, ctx.currentTime);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.12);
        osc2.stop(ctx.currentTime + 0.3);

        // Cleanup
        setTimeout(() => ctx.close(), 500);
    } catch(e) {
        console.log('Notification sound failed:', e);
    }
}

window.toggleChat = function () {
    const panel = document.getElementById('chat-panel');
    const badge = document.getElementById('chat-badge');
    const bubbleBtn = document.getElementById('chat-bubble-btn');
    if (!panel) return;

    isChatOpen = panel.classList.contains('open');
    if (isChatOpen) {
        panel.classList.remove('open');
        isChatOpen = false;
        // Close emoji picker too
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker) emojiPicker.classList.remove('open');
    } else {
        panel.classList.add('open');
        isChatOpen = true;
        window.socket && window.socket.emit('chat_mark_read');
        unreadChatCount = 0;
        if (badge) badge.style.display = 'none';
        if (bubbleBtn) bubbleBtn.classList.remove('has-unread');
        const input = document.getElementById('chat-input');
        if (input) setTimeout(() => input.focus(), 100);
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
};

// ---- EMOJI PICKER ----
const EMOJI_DATA = {
    '😀': { cat: 'smileys', keywords: 'grinning happy smile vui cuoi' },
    '😂': { cat: 'smileys', keywords: 'joy tears laughing cuoi khoc' },
    '🤣': { cat: 'smileys', keywords: 'rofl rolling laugh' },
    '😊': { cat: 'smileys', keywords: 'blush shy smile' },
    '😍': { cat: 'smileys', keywords: 'heart eyes love yeu' },
    '🥰': { cat: 'smileys', keywords: 'smiling hearts love' },
    '😘': { cat: 'smileys', keywords: 'kiss wink hon' },
    '😜': { cat: 'smileys', keywords: 'wink tongue playful' },
    '😎': { cat: 'smileys', keywords: 'cool sunglasses' },
    '🤩': { cat: 'smileys', keywords: 'star struck excited' },
    '😢': { cat: 'smileys', keywords: 'cry sad buon' },
    '😭': { cat: 'smileys', keywords: 'sob crying khoc' },
    '😤': { cat: 'smileys', keywords: 'angry mad gian' },
    '😡': { cat: 'smileys', keywords: 'rage angry' },
    '🤔': { cat: 'smileys', keywords: 'thinking hmm suy nghi' },
    '😏': { cat: 'smileys', keywords: 'smirk sly' },
    '🙄': { cat: 'smileys', keywords: 'eye roll' },
    '😴': { cat: 'smileys', keywords: 'sleeping zzz ngu' },
    '🤗': { cat: 'smileys', keywords: 'hugging hug om' },
    '🤭': { cat: 'smileys', keywords: 'hand over mouth oops' },
    '😇': { cat: 'smileys', keywords: 'angel halo innocent' },
    '🥺': { cat: 'smileys', keywords: 'pleading puppy eyes xin' },
    '😱': { cat: 'smileys', keywords: 'scream shock so' },
    '🤯': { cat: 'smileys', keywords: 'exploding head mind blown' },
    '👍': { cat: 'hands', keywords: 'thumbs up ok good tot' },
    '👎': { cat: 'hands', keywords: 'thumbs down bad' },
    '👏': { cat: 'hands', keywords: 'clap bravo vo tay' },
    '🙏': { cat: 'hands', keywords: 'pray please thanks cam on' },
    '✌️': { cat: 'hands', keywords: 'peace victory' },
    '🤝': { cat: 'hands', keywords: 'handshake deal' },
    '💪': { cat: 'hands', keywords: 'muscle strong suc manh' },
    '👋': { cat: 'hands', keywords: 'wave hello hi chao' },
    '🫡': { cat: 'hands', keywords: 'salute respect' },
    '🫶': { cat: 'hands', keywords: 'heart hands love' },
    '❤️': { cat: 'symbols', keywords: 'red heart love tim' },
    '🔥': { cat: 'symbols', keywords: 'fire hot lit lua' },
    '⭐': { cat: 'symbols', keywords: 'star sao' },
    '✅': { cat: 'symbols', keywords: 'check done xong' },
    '❌': { cat: 'symbols', keywords: 'cross no wrong sai' },
    '⚡': { cat: 'symbols', keywords: 'lightning fast nhanh' },
    '💯': { cat: 'symbols', keywords: 'hundred perfect' },
    '💀': { cat: 'symbols', keywords: 'skull dead' },
    '🎯': { cat: 'symbols', keywords: 'target bullseye muc tieu' },
    '💡': { cat: 'symbols', keywords: 'light bulb idea y tuong' },
    '💬': { cat: 'symbols', keywords: 'speech bubble chat' },
    '🔔': { cat: 'symbols', keywords: 'bell notification thong bao' },
    '⏰': { cat: 'symbols', keywords: 'alarm clock time gio' },
    '🎉': { cat: 'activities', keywords: 'party celebration chuc mung' },
    '🎊': { cat: 'activities', keywords: 'confetti celebrate' },
    '🎁': { cat: 'activities', keywords: 'gift present qua' },
    '🏆': { cat: 'activities', keywords: 'trophy winner giai' },
    '🎮': { cat: 'activities', keywords: 'game controller choi game' },
    '🎵': { cat: 'activities', keywords: 'music note nhac' },
    '📸': { cat: 'activities', keywords: 'camera photo anh' },
    '☕': { cat: 'food', keywords: 'coffee cafe ca phe' },
    '🍕': { cat: 'food', keywords: 'pizza' },
    '🍜': { cat: 'food', keywords: 'noodle ramen pho' },
    '🍻': { cat: 'food', keywords: 'beer cheers bia' },
    '🧋': { cat: 'food', keywords: 'bubble tea tra sua' },
    '🍩': { cat: 'food', keywords: 'donut doughnut' },
    '🍰': { cat: 'food', keywords: 'cake shortcake banh' },
    '🌈': { cat: 'nature', keywords: 'rainbow cau vong' },
    '🌙': { cat: 'nature', keywords: 'moon night dem trang' },
    '☀️': { cat: 'nature', keywords: 'sun sunny nang' },
    '🌸': { cat: 'nature', keywords: 'cherry blossom flower hoa' },
    '🐱': { cat: 'nature', keywords: 'cat meo' },
    '🐶': { cat: 'nature', keywords: 'dog cho' },
    '🦊': { cat: 'nature', keywords: 'fox cao' },
    '💻': { cat: 'objects', keywords: 'laptop computer may tinh' },
    '📱': { cat: 'objects', keywords: 'phone dien thoai' },
    '📁': { cat: 'objects', keywords: 'folder file thu muc' },
    '✏️': { cat: 'objects', keywords: 'pencil edit viet' },
    '📝': { cat: 'objects', keywords: 'memo note ghi chu' },
    '🗂️': { cat: 'objects', keywords: 'card index files' },
    '📊': { cat: 'objects', keywords: 'chart graph bieu do' },
    '🚀': { cat: 'objects', keywords: 'rocket launch ship' },
};

const EMOJI_CATEGORIES = {
    'smileys': '😀',
    'hands': '👍',
    'symbols': '❤️',
    'activities': '🎉',
    'food': '☕',
    'nature': '🌸',
    'objects': '💻'
};

let currentEmojiCat = 'smileys';

function initEmojiPicker() {
    const tabsEl = document.getElementById('emoji-tabs');
    const gridEl = document.getElementById('emoji-grid');
    const searchEl = document.getElementById('emoji-search');
    if (!tabsEl || !gridEl) return;

    // Build tabs
    tabsEl.innerHTML = Object.entries(EMOJI_CATEGORIES).map(([cat, icon]) =>
        `<button class="emoji-tab ${cat === currentEmojiCat ? 'active' : ''}" data-cat="${cat}" onclick="selectEmojiCategory('${cat}')">${icon}</button>`
    ).join('');

    renderEmojiGrid();

    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            renderEmojiGrid(q);
        });
    }
}

function renderEmojiGrid(search) {
    const gridEl = document.getElementById('emoji-grid');
    if (!gridEl) return;

    let emojis = Object.entries(EMOJI_DATA);
    if (search) {
        emojis = emojis.filter(([_, data]) => data.keywords.includes(search));
    } else {
        emojis = emojis.filter(([_, data]) => data.cat === currentEmojiCat);
    }

    gridEl.innerHTML = emojis.map(([emoji]) =>
        `<button class="emoji-item" onclick="insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
}

window.selectEmojiCategory = function(cat) {
    currentEmojiCat = cat;
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    document.getElementById('emoji-search').value = '';
    renderEmojiGrid();
};

window.insertEmoji = function(emoji) {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
};

window.toggleEmojiPicker = function() {
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    const isOpen = picker.classList.contains('open');
    if (isOpen) {
        picker.classList.remove('open');
    } else {
        picker.classList.add('open');
        initEmojiPicker();
        const searchEl = document.getElementById('emoji-search');
        if (searchEl) setTimeout(() => searchEl.focus(), 50);
    }
};

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    const picker = document.getElementById('emoji-picker');
    const toggleBtn = document.getElementById('emoji-toggle-btn');
    if (picker && picker.classList.contains('open')) {
        if (!picker.contains(e.target) && !toggleBtn.contains(e.target)) {
            picker.classList.remove('open');
        }
    }
});

// ---- FILE HANDLING (Auto-send on attach) ----
window.handleChatFileSelect = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert("File quá lớn. Vui lòng chọn file dưới 5MB.");
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
        currentChatFile = {
            name: file.name,
            type: file.type,
            data: evt.target.result
        };
        // Auto-send immediately when file is selected
        sendChatMessage();
    };
    reader.readAsDataURL(file);
};

window.cancelChatFile = function() {
    currentChatFile = null;
    const fileInput = document.getElementById('chat-file-input');
    const preview = document.getElementById('chat-file-preview');
    if (fileInput) fileInput.value = '';
    if (preview) preview.classList.remove('active');
};

// ---- SEND MESSAGE ----
window.sendChatMessage = function () {
    const input = document.getElementById('chat-input');
    const fileInput = document.getElementById('chat-file-input');
    if (!input || !window.socket) return;
    
    const msg = input.value.trim();
    if (msg || currentChatFile) {
        let payload = { msg: msg };
        if (currentChatFile) {
            payload.file_name = currentChatFile.name;
            payload.file_type = currentChatFile.type;
            payload.file_data = currentChatFile.data;
        }
        window.socket.emit('chat_message', payload);
        window.socket.emit('chat_stop_typing');
        
        input.value = '';
        if (fileInput) fileInput.value = '';
        currentChatFile = null;
        const preview = document.getElementById('chat-file-preview');
        if (preview) preview.classList.remove('active');
        
        // Close emoji picker after send
        const emojiPicker = document.getElementById('emoji-picker');
        if (emojiPicker) emojiPicker.classList.remove('open');
    }
};

// ---- CHAT INIT & SOCKET EVENTS ----
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chat-input');
    if (input) {
        let typingTimeout;
        input.addEventListener('input', function(e) {
            if (!window.socket) return;
            if (this.value.trim() === '') {
                window.socket.emit('chat_stop_typing');
                clearTimeout(typingTimeout);
                return;
            }
            window.socket.emit('chat_typing');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                window.socket.emit('chat_stop_typing');
            }, 2000);
        });
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    if (typeof window.socket !== 'undefined' && window.socket) {
        
        window.socket.on('connect', () => {
            window.socket.emit('request_chat_history');
        });

        window.socket.on('chat_history', function (messages) {
            const msgs = document.getElementById('chat-messages');
            if (!msgs) return;
            
            const welcomeText = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi' 
                ? 'Chào mừng bạn đến với kênh chat chung! 💬' 
                : 'グループチャットへようこそ！💬';
            msgs.innerHTML = `<div class="chat-welcome">${welcomeText}</div>`;
            
            messages.forEach(data => appendChatMessage(msgs, data, false));
            msgs.scrollTop = msgs.scrollHeight;
            if (isChatOpen) {
                window.socket.emit('chat_mark_read');
            }
        });

        const typingUsers = new Map();
        window.socket.on('chat_typing', function(data) {
            if (typeof CURRENT_USER !== 'undefined' && data.username === CURRENT_USER) return;
            typingUsers.set(data.username, data.fullname || data.username);
            updateTypingIndicator();
        });
        window.socket.on('chat_stop_typing', function(data) {
            typingUsers.delete(data.username);
            updateTypingIndicator();
        });
        function updateTypingIndicator() {
            const ind = document.getElementById('chat-typing-indicator');
            const txt = document.getElementById('chat-typing-text');
            if (!ind || !txt) return;
            if (typingUsers.size > 0) {
                const names = Array.from(typingUsers.values()).join(', ');
                const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
                txt.textContent = names + (isVi ? ' đang soạn tin' : ' が入力中');
                ind.style.display = 'flex';
                const msgs = document.getElementById('chat-messages');
                if (msgs && msgs.scrollHeight - msgs.scrollTop <= msgs.clientHeight + 50) {
                    setTimeout(() => msgs.scrollTop = msgs.scrollHeight, 10);
                }
            } else {
                ind.style.display = 'none';
            }
        }
        
        window.socket.on('chat_read_update', function(data) {
            const { message_ids, user } = data;
            message_ids.forEach(id => {
                const container = document.getElementById(`read-avatars-${id}`);
                if (container) {
                    const existing = container.querySelector(`img[data-user="${user.username}"]`);
                    if (!existing) {
                        const img = document.createElement('img');
                        img.src = user.avatar;
                        img.title = user.username;
                        img.dataset.user = user.username;
                        img.onerror = function() { this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random&size=30`; };
                        container.appendChild(img);
                    }
                }
            });
        });

        window.socket.on('chat_message', function (data) {
            const msgs = document.getElementById('chat-messages');
            if (!msgs) return;

            const isMe = appendChatMessage(msgs, data, true);
            msgs.scrollTop = msgs.scrollHeight;

            if (!isChatOpen) {
                unreadChatCount++;
                const badge = document.getElementById('chat-badge');
                const bubbleBtn = document.getElementById('chat-bubble-btn');
                if (badge) {
                    badge.innerText = unreadChatCount;
                    badge.style.display = 'flex';
                }
                if (bubbleBtn) bubbleBtn.classList.add('has-unread');
            } else {
                window.socket.emit('chat_mark_read');
            }
            
            if (!isMe && !isChatOpen) {
                playChatNotification();
            }
        });

        // Update online count in chat header
        window.socket.on('online_users_update', (users) => {
            const countEl = document.getElementById('chat-online-count');
            if (countEl && users) {
                const count = Array.isArray(users) ? users.length : 0;
                const langStr = typeof CURRENT_LANG !== 'undefined' ? CURRENT_LANG : 'vi';
                countEl.textContent = langStr === 'vi' 
                    ? `🟢 ${count} người đang online` 
                    : `🟢 ${count}人がオンライン`;
            }
        });
        
        function appendChatMessage(container, data, animate) {
            const isMe = data.username === (typeof CURRENT_USER !== 'undefined' ? CURRENT_USER : '');
            let contentHtml = '';
            
            // File content
            if (data.file_data) {
                if (data.file_type && data.file_type.startsWith('image/')) {
                    contentHtml += `<div style="margin-bottom: 4px;"><img src="${data.file_data}" onclick="window.open('${data.file_data}', '_blank')" alt="image" /></div>`;
                } else {
                    contentHtml += `<div style="margin-bottom: 4px;"><a href="${data.file_data}" download="${data.file_name}" class="file-link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        ${data.file_name || 'Download file'}
                    </a></div>`;
                }
            }
            
            // Text content — check if it's emoji-only
            if (data.msg) {
                const escapedMsg = data.msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const emojiOnlyRegex = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;
                const isEmojiOnly = emojiOnlyRegex.test(data.msg) && data.msg.trim().length <= 8 && !data.file_data;
                if (isEmojiOnly) {
                    contentHtml += `<div class="msg-only-emoji">${escapedMsg}</div>`;
                } else {
                    let formattedMsg = escapedMsg.replace(/\n/g, '<br>');
                    formattedMsg = formattedMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    contentHtml += `<div>${formattedMsg}</div>`;
                }
            }
            
            const avatarUrl = data.avatar || `/static/img/pet/1.gif`;
            const senderName = isMe 
                ? (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi' ? 'Bạn' : 'あなた')
                : (data.fullname || data.username);

            let readAvatarsHtml = '';
            if (data.read_by && data.read_by.length > 0) {
                data.read_by.forEach(u => {
                    readAvatarsHtml += `<img src="${u.avatar}" title="${u.username}" data-user="${u.username}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.username)}&background=random&size=30'" />`;
                });
            }

            const row = document.createElement('div');
            row.className = `chat-msg-row ${isMe ? 'me' : ''}`;
            if (!animate) row.style.animation = 'none';
            
            row.innerHTML = `
                <img src="${avatarUrl}" class="chat-msg-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=random&size=30'" />
                <div class="chat-msg-content">
                    <div class="chat-msg-meta">
                        <span class="msg-sender">${senderName}</span> • ${data.time}
                    </div>
                    <div class="chat-msg-bubble ${isMe ? 'me' : 'other'}">
                        ${contentHtml}
                    </div>
                    <div class="chat-msg-read-avatars" id="read-avatars-${data.id || ''}">
                        ${readAvatarsHtml}
                    </div>
                </div>
            `;
            
            container.appendChild(row);
            return isMe;
        }
    }
});

// ======================================
// LIVE CURSORS
// ======================================
const cursors = {};
let lastMouseMove = 0;
const isDashboard = window.location.pathname === '/dashboard' || window.location.pathname === '/';


function getColorForUser(str) {
    let hash = 0;
    if (!str) return '#3b82f6';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 50%)`;
}

document.addEventListener('mousemove', (e) => {
    if (!isDashboard || !window.socket) return;
    const now = Date.now();
    if (now - lastMouseMove > 50) { // 20fps
        const x = (e.clientX / window.innerWidth) * 100;
        const y = (e.clientY / window.innerHeight) * 100;
        window.socket.emit('cursor_move', { x, y });
        lastMouseMove = now;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (window.socket) {
        window.socket.on('cursor_move', (data) => {
            if (!isDashboard) return;
            const uid = data.username; // Key by username to prevent duplicates
            if (typeof CURRENT_USER !== 'undefined' && uid === CURRENT_USER) return;
            let cursorEl = cursors[uid];
            if (!cursorEl) {
                const userColor = getColorForUser(data.username);
                cursorEl = document.createElement('div');
                cursorEl.dataset.username = data.username;
                cursorEl.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${userColor}" stroke="white" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>
                    <div style="background: ${userColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-top: 2px; font-weight: bold; white-space: nowrap;">
                        ${data.fullname || data.username}
                    </div>
                `;
                Object.assign(cursorEl.style, {
                    position: 'fixed',
                    pointerEvents: 'none',
                    zIndex: '100000',
                    transition: 'left 0.1s linear, top 0.1s linear',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start'
                });
                document.body.appendChild(cursorEl);
                cursors[uid] = cursorEl;
            }
            cursorEl.style.left = data.x + 'vw';
            cursorEl.style.top = data.y + 'vh';

            clearTimeout(cursorEl.timeoutId);
            cursorEl.timeoutId = setTimeout(() => {
                cursorEl.remove();
                delete cursors[uid];
            }, 180000); // 3 mins
        });

        window.socket.on('online_users_update', (users) => {
            // Remove offline cursors
            const onlineUsernames = users.map(u => u.username);
            for (let uid in cursors) {
                if (!onlineUsernames.includes(uid)) {
                    cursors[uid].remove();
                    delete cursors[uid];
                }
            }
        });

        // Realtime Checklist Sync via version polling
        // Only fetches full data when something actually changed
        if (isDashboard) {
            let _lastChecklistVersion = -1;
            setInterval(() => {
                fetch('/api/checklist_version?_t=' + Date.now())
                    .then(r => r.json())
                    .then(d => {
                        if (_lastChecklistVersion === -1) {
                            // First load, just store the version
                            _lastChecklistVersion = d.v;
                        } else if (d.v !== _lastChecklistVersion) {
                            _lastChecklistVersion = d.v;
                            backgroundSyncChecklist();
                        }
                    })
                    .catch(() => {});
            }, 3000);
        }

    }
});


// ======================================
// YOUTUBE RADIO SYNC
// ======================================
let ytPlayer = null;
let ytPlayer2 = null;
let isCrossfading = false;
let isRadioDJ = false;
let isListening = false;
let radioState = {
    is_playing: false,
    youtube_id: '4xDzrIxC4Dk', // Lofi Girl Synthwave
    current_time: 0,
    allow_requests: true,
    is_automix_enabled: false,
    queue: []
};
let targetCrossfadeVideoId = null;
let djSyncInterval = null;
let radioUpdateInterval = null;
let radioPollingInterval = null;
// Detect serverless: Socket.IO không khả dụng hoặc không thể kết nối
let useRadioPolling = false;
let lastSeekTime = 0;

// Dynamically load YouTube Iframe API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// ---- LSA Music Volume Management ----
let radioVolume = 80;
let radioMuted = false;

function initRadioVolume() {
    try {
        const savedVol = localStorage.getItem('lsa_music_volume');
        if (savedVol !== null && !isNaN(parseInt(savedVol, 10))) {
            radioVolume = Math.max(0, Math.min(100, parseInt(savedVol, 10)));
        }
        const savedMuted = localStorage.getItem('lsa_music_muted');
        if (savedMuted !== null) {
            radioMuted = (savedMuted === 'true');
        }
    } catch (e) {}
    updateRadioVolumeUI();
}

function getUserRadioVolume() {
    try {
        var sm = localStorage.getItem('lsa_music_muted');
        if (sm === 'true') return 0;
        var sv = localStorage.getItem('lsa_music_volume');
        if (sv !== null && !isNaN(parseInt(sv, 10))) return Math.max(0, Math.min(100, parseInt(sv, 10)));
    } catch (e) {}
    return typeof radioVolume !== 'undefined' ? radioVolume : 80;
}

function applyUserRadioVolume(player) {
    if (!player) return;
    try {
        var v = 80;
        var m = false;
        try {
            var sv = localStorage.getItem('lsa_music_volume');
            if (sv !== null && !isNaN(parseInt(sv, 10))) v = Math.max(0, Math.min(100, parseInt(sv, 10)));
            var sm = localStorage.getItem('lsa_music_muted');
            if (sm !== null) m = (sm === 'true');
        } catch (e) {}

        if (m) {
            if (typeof player.mute === 'function') player.mute();
        } else {
            if (typeof player.unMute === 'function') player.unMute();
            if (typeof player.setVolume === 'function') player.setVolume(v);
        }
    } catch (e) {}
}

window.getUserRadioVolume = getUserRadioVolume;
window.applyUserRadioVolume = applyUserRadioVolume;

window.setRadioVolume = function (val) {
    val = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    radioVolume = val;
    if (radioMuted && val > 0) {
        radioMuted = false;
        try { localStorage.setItem('lsa_music_muted', 'false'); } catch (e) {}
    }
    try { localStorage.setItem('lsa_music_volume', String(radioVolume)); } catch (e) {}

    if (!isCrossfading) {
        if (ytPlayer) applyUserRadioVolume(ytPlayer);
    } else {
        if (radioMuted) {
            if (ytPlayer && ytPlayer.mute) ytPlayer.mute();
            if (ytPlayer2 && ytPlayer2.mute) ytPlayer2.mute();
        } else {
            if (ytPlayer && ytPlayer.unMute) ytPlayer.unMute();
            if (ytPlayer2 && ytPlayer2.unMute) ytPlayer2.unMute();
        }
    }
    updateRadioVolumeUI();
};

window.toggleRadioMute = function () {
    radioMuted = !radioMuted;
    try { localStorage.setItem('lsa_music_muted', String(radioMuted)); } catch (e) {}

    if (ytPlayer) applyUserRadioVolume(ytPlayer);
    if (ytPlayer2) applyUserRadioVolume(ytPlayer2);

    updateRadioVolumeUI();
};

function updateRadioVolumeUI() {
    const sliders = document.querySelectorAll('#radio-volume-slider');
    const labels = document.querySelectorAll('#radio-volume-label');
    const highIcons = document.querySelectorAll('#radio-vol-icon-high');
    const lowIcons = document.querySelectorAll('#radio-vol-icon-low');
    const muteIcons = document.querySelectorAll('#radio-vol-icon-mute');
    const btns = document.querySelectorAll('#radio-volume-btn');

    const isMutedState = radioMuted || radioVolume === 0;

    sliders.forEach(slider => {
        slider.value = radioVolume;
        const pct = isMutedState ? 0 : radioVolume;
        slider.style.background = `linear-gradient(to right, rgba(99, 102, 241, 0.9) 0%, rgba(129, 140, 248, 0.9) ${pct}%, rgba(255, 255, 255, 0.2) ${pct}%, rgba(255, 255, 255, 0.2) 100%)`;
    });

    labels.forEach(lbl => {
        lbl.textContent = isMutedState ? (radioMuted ? 'Mute' : '0%') : `${radioVolume}%`;
        lbl.style.color = isMutedState ? 'rgba(239, 68, 68, 0.85)' : 'rgba(255, 255, 255, 0.65)';
    });

    highIcons.forEach(icon => {
        icon.style.display = (!isMutedState && radioVolume > 50) ? 'inline-block' : 'none';
    });
    lowIcons.forEach(icon => {
        icon.style.display = (!isMutedState && radioVolume <= 50) ? 'inline-block' : 'none';
    });
    muteIcons.forEach(icon => {
        icon.style.display = isMutedState ? 'inline-block' : 'none';
    });

    btns.forEach(btn => {
        btn.style.color = isMutedState ? '#ef4444' : 'rgba(255, 255, 255, 0.85)';
        btn.title = isMutedState ? ((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'ja') ? 'ミュート解除' : 'Bật âm thanh') : ((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'ja') ? 'ミュート' : 'Tắt tiếng');
    });
}
window.updateRadioVolumeUI = updateRadioVolumeUI;

try { initRadioVolume(); } catch (e) {}

window.onYouTubeIframeAPIReady = function () {
    const pVars = { 'autoplay': 0, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0 };
    ytPlayer = new YT.Player('lofi-youtube-player', {
        height: '0',
        width: '0',
        videoId: radioState.youtube_id,
        playerVars: pVars,
        events: {
            'onReady': function(event) {
                window.ytPlayer = ytPlayer;
                if(event.target.getIframe) {
                    event.target.getIframe().style.opacity = '1';
                    event.target.getIframe().style.zIndex = '2';
                }
                applyUserRadioVolume(event.target);
                onPlayerReady(event);
            },
            'onStateChange': function(event) {
                // Only process events from the active player, ignore during crossfade
                if (event.target !== ytPlayer || isCrossfading) return;
                onPlayerStateChange(event);
            }
        }
    });
    window.ytPlayer = ytPlayer;
    ytPlayer2 = new YT.Player('lofi-youtube-player-2', {
        height: '0',
        width: '0',
        playerVars: pVars,
        events: {
            'onReady': function(event) { 
                window.ytPlayer2 = ytPlayer2;
                if(event.target.getIframe) {
                    event.target.getIframe().style.opacity = '0';
                    event.target.getIframe().style.zIndex = '1';
                }
                applyUserRadioVolume(event.target);
            },
            'onStateChange': function(event) {
                if (event.target !== ytPlayer || isCrossfading) return;
                onPlayerStateChange(event);
            }
        }
    });
    window.ytPlayer2 = ytPlayer2;
};

// ---- Crossfade (Auto-Mix) ----
window.cancelCrossfade = function() {
    if (window.fadeInterval) {
        clearInterval(window.fadeInterval);
        window.fadeInterval = null;
    }
    isCrossfading = false;
    targetCrossfadeVideoId = null;
    var overlay = document.getElementById('radio-mixing-overlay');
    var label = document.getElementById('radio-mixing-label');
    if (overlay) overlay.style.display = 'none';
    if (label) label.style.display = 'none';
    if (ytPlayer2 && ytPlayer2.pauseVideo) {
        try { ytPlayer2.pauseVideo(); } catch(e) {}
    }
    if (ytPlayer) {
        applyUserRadioVolume(ytPlayer);
    }
    try {
        if (ytPlayer && ytPlayer.getIframe) {
            ytPlayer.getIframe().style.opacity = '1';
            ytPlayer.getIframe().style.zIndex = '2';
        }
        if (ytPlayer2 && ytPlayer2.getIframe) {
            ytPlayer2.getIframe().style.opacity = '0';
            ytPlayer2.getIframe().style.zIndex = '1';
        }
    } catch(e) {}
};

window.crossfadeTo = function(newVideoId, startTime, callback) {
    startTime = startTime || 0;
    if (isCrossfading || !ytPlayer2 || !ytPlayer2.loadVideoById) {
        // Fallback: load directly on main player
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(newVideoId, startTime);
            applyUserRadioVolume(ytPlayer);
            ytPlayer.playVideo();
        }
        if (callback) callback();
        return;
    }

    // Nếu DJ đã crossfade gần xong (đã qua 18s của 20s mix), chuyển thẳng luôn không crossfade
    if (startTime >= 18) {
        if (ytPlayer && ytPlayer.loadVideoById) {
            ytPlayer.loadVideoById(newVideoId, startTime);
            applyUserRadioVolume(ytPlayer);
            ytPlayer.playVideo();
        }
        if (callback) callback();
        return;
    }

    isCrossfading = true;
    targetCrossfadeVideoId = newVideoId;

    ytPlayer2.setVolume(0);
    ytPlayer2.loadVideoById(newVideoId, startTime);
    ytPlayer2.playVideo();

    // Tính thời gian mix còn lại tương ứng với DJ (tối đa 20s, tối thiểu 4s)
    var fadeTime = Math.max(4000, Math.min(20000, Math.round((20 - startTime) * 1000)));
    var intervalTime = 100;
    var steps = Math.max(1, Math.round(fadeTime / intervalTime));
    var currentStep = 0;
    var targetVol = getUserRadioVolume();
    var startVol = targetVol;
    try { 
        var v = ytPlayer.getVolume(); 
        if (v !== undefined && v !== null && !isNaN(v)) startVol = v; 
    } catch (e) {}

    window.fadeInterval = setInterval(function() {
        currentStep++;
        var ratio = currentStep / steps;
        var remainingSeconds = Math.ceil((steps - currentStep) * intervalTime / 1000);
        
        var overlay = document.getElementById('radio-mixing-overlay');
        var label = document.getElementById('radio-mixing-label');
        if (overlay) overlay.style.display = 'block';
        if (label) {
            label.style.display = 'block';
            var span = label.querySelector('span');
            if (span) span.innerText = (CURRENT_LANG === 'vi' ? 'Đang mix ' : 'Mixing ') + '(-0:' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds + ')';
        }

        try {
            if (radioMuted) {
                if (ytPlayer && ytPlayer.mute) ytPlayer.mute();
                if (ytPlayer2 && ytPlayer2.mute) ytPlayer2.mute();
            } else {
                if (ytPlayer && ytPlayer.unMute) ytPlayer.unMute();
                if (ytPlayer2 && ytPlayer2.unMute) ytPlayer2.unMute();
                if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(Math.max(0, Math.round(startVol * (1 - ratio))));
                if (ytPlayer2 && ytPlayer2.setVolume) ytPlayer2.setVolume(Math.min(targetVol, Math.round(targetVol * ratio)));
            }
            if (ytPlayer && ytPlayer.getIframe) {
                ytPlayer.getIframe().style.opacity = 1 - ratio;
                ytPlayer.getIframe().style.zIndex = '2';
            }
            if (ytPlayer2 && ytPlayer2.getIframe) {
                ytPlayer2.getIframe().style.opacity = ratio;
                ytPlayer2.getIframe().style.zIndex = '3';
            }
        } catch(e) {}

        if (currentStep >= steps) {
            clearInterval(window.fadeInterval);
            window.fadeInterval = null;
            var overlay = document.getElementById('radio-mixing-overlay');
            var label = document.getElementById('radio-mixing-label');
            if (overlay) overlay.style.display = 'none';
            if (label) label.style.display = 'none';

            try {
                if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
                applyUserRadioVolume(ytPlayer);
                if (ytPlayer && ytPlayer.getIframe) {
                    ytPlayer.getIframe().style.opacity = '0';
                    ytPlayer.getIframe().style.zIndex = '1';
                }
                if (ytPlayer2 && ytPlayer2.getIframe) {
                    ytPlayer2.getIframe().style.opacity = '1';
                    ytPlayer2.getIframe().style.zIndex = '2';
                }
            } catch(e) {}
            // Pointer swap: ytPlayer always points to the active player
            var temp = ytPlayer;
            ytPlayer = ytPlayer2;
            ytPlayer2 = temp;
            window.ytPlayer = ytPlayer;
            window.ytPlayer2 = ytPlayer2;
            applyUserRadioVolume(ytPlayer);
            isCrossfading = false;
            targetCrossfadeVideoId = null;
            if (callback) callback();
        }
    }, intervalTime);
};

// ---- Seek ±5s ----
window.radioSeek = function(delta) {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    try {
        var current = ytPlayer.getCurrentTime();
        var duration = ytPlayer.getDuration() || 0;
        var newTime = Math.max(0, Math.min(duration, current + delta));
        
        if (isCrossfading && window.cancelCrossfade) {
            window.cancelCrossfade();
        }
        
        ytPlayer.seekTo(newTime, true);
        if (isRadioDJ && window.syncRadioToServer) syncRadioToServer();
    } catch(e) {}
};

// ---- Skip Track (Prev / Next) ----
window.radioSkipPrev = function() {
    if (!ytPlayer || !ytPlayer.seekTo) return;
    if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
    // Restart current song from beginning
    try {
        ytPlayer.seekTo(0, true);
        if (isRadioDJ && window.syncRadioToServer) syncRadioToServer();
    } catch(e) {}
};

window.radioSkipNext = function() {
    if (!isRadioDJ) return; // Only DJ can skip tracks
    if (!radioState.queue || radioState.queue.length === 0) {
        if (window.showToast) showToast(CURRENT_LANG === 'vi' ? 'Hàng chờ trống!' : 'キューが空です！', 'info');
        return;
    }
    if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
    var nextItem = radioState.queue[0];
    if (window.socket) window.socket.emit('queue_pop');
    radioState.youtube_id = nextItem.youtube_id;
    radioState.current_time = 0;
    radioState.is_playing = true;
    
    // Hard skip (no crossfade on manual skip)
    window.manualSkipInProgress = true;
    if (ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(nextItem.youtube_id);
        ytPlayer.playVideo();
        if (window.updateRadioUI) updateRadioUI();
        if (window.syncRadioToServer) syncRadioToServer();
    }
    setTimeout(() => { window.manualSkipInProgress = false; }, 2000);
};

// ---- REST API helpers ----
async function radioApiGet(path) {
    try {
        const r = await fetch(path, { credentials: 'same-origin' });
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

async function radioApiPost(path, body) {
    try {
        const r = await fetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : '{}'
        });
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

// ---- Polling: xử lý radio_sync nhận từ REST ----
function handleRadioStateFromPolling(state) {
    if (!state) return;

    // Auto-reclaim DJ mode if server says we are the DJ
    if (state.you_are_dj && !isRadioDJ) {
        isRadioDJ = true;
        const toggle = document.getElementById('radio-dj-toggle');
        if (toggle) toggle.checked = true;

        const inputContainer = document.getElementById('radio-yt-input-container');
        if (inputContainer) inputContainer.style.display = 'block';

        const progressEl = document.getElementById('radio-progress');
        if (progressEl) progressEl.disabled = false;

        if (!djSyncInterval) {
            djSyncInterval = setInterval(() => {
                if (window.syncRadioToServer) window.syncRadioToServer();
            }, 3000);
        }

        if (ytPlayer && ytPlayer.loadVideoById) {
            const currentVideo = ytPlayer.getVideoData?.()?.video_id;
            if (currentVideo !== state.youtube_id) {
                if (!isCrossfading && currentVideo && window.crossfadeTo) {
                    window.crossfadeTo(state.youtube_id, state.current_time);
                } else {
                    ytPlayer.loadVideoById(state.youtube_id, state.current_time);
                }
            }
            if (state.is_playing) ytPlayer.playVideo();
        }
        radioState.youtube_id = state.youtube_id;
        radioState.is_playing = state.is_playing;
        radioState.current_time = state.current_time;
        if (state.next_title !== undefined) radioState.next_title = state.next_title;
        radioState.allow_requests = state.allow_requests === true || state.allow_requests === 'true';
        radioState.is_automix_enabled = state.is_automix_enabled === true || state.is_automix_enabled === 'true';
        radioState.video_active = !!state.video_active;
        if (state.queue) {
        radioState.queue = state.queue;
        if (window.syncQueueToLocalPlaylist) window.syncQueueToLocalPlaylist(state.queue);
    }

        if (window.updateRadioUI) window.updateRadioUI();
        if (window.renderRadioQueue) window.renderRadioQueue();
    }

    if (isRadioDJ) return;

    // Nếu DJ tắt, các máy đang nghe (listener) tự động bị văng khỏi chế độ nghe
    if (!state.dj_username) {
        const container = document.getElementById('radio-listeners-container');
        if (container) container.innerHTML = '';

        if (isListening) {
            isListening = false;
            if (ytPlayer && ytPlayer.pauseVideo) {
                ytPlayer.pauseVideo();
            }
            if (window.showToast) {
                showToast(CURRENT_LANG === 'vi' ? 'Host đã tắt DJ, bạn đã ngắt kết nối' : 'ホストがDJを終了したため、切断されました', 'info');
            }
        }
    }

    radioState.youtube_id = state.youtube_id;
    radioState.current_time = state.current_time;
    radioState.is_playing = state.is_playing;
    if (state.next_title !== undefined) radioState.next_title = state.next_title;

    if (isListening && ytPlayer && ytPlayer.loadVideoById) {
        const currentVideo = ytPlayer.getVideoData?.()?.video_id;
        const duration = ytPlayer.getDuration?.() || 0;
        const currentTime = ytPlayer.getCurrentTime?.() || 0;
        const isNearEnd = duration > 0 && (duration - currentTime) <= 25;

        if (currentVideo !== state.youtube_id) {
            if (isCrossfading && targetCrossfadeVideoId === state.youtube_id) {
                // Đang trong tiến trình crossfade mượt sang bài này - không ngắt hay reload!
            } else {
                const canCrossfade = !isCrossfading && currentVideo && window.crossfadeTo && (
                    state.is_crossfading === true ||
                    (radioState.is_automix_enabled && isNearEnd)
                );

                if (canCrossfade) {
                    window.crossfadeTo(state.youtube_id, state.current_time);
                } else {
                    if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
                    ytPlayer.loadVideoById(state.youtube_id, state.current_time);
                }
            }
        } else if (!isCrossfading && Math.abs(currentTime - state.current_time) > 3) {
            const now = Date.now();
            if (now - lastSeekTime > 5000) {
                ytPlayer.seekTo(state.current_time, true);
                lastSeekTime = now;
            }
        }

        const playerState = ytPlayer.getPlayerState?.();
        if (state.is_playing && playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
            ytPlayer.playVideo();
            if (isCrossfading && ytPlayer2 && ytPlayer2.playVideo) ytPlayer2.playVideo();
        } else if (!state.is_playing && playerState !== YT.PlayerState.PAUSED && playerState !== YT.PlayerState.CUED && playerState !== YT.PlayerState.UNSTARTED) {
            ytPlayer.pauseVideo();
            if (isCrossfading && ytPlayer2 && ytPlayer2.pauseVideo) ytPlayer2.pauseVideo();
        }
    }

    // Cập nhật listener avatars từ REST response
    if (state.listeners) {
        handleRadioListenersUpdate(state.listeners);
    }

    updateRadioUI();
    const statusText = document.getElementById('radio-status');
    if (statusText) statusText.innerHTML = `DJ: ${state.dj_username || 'Ai đó'}`;
}

let previousRadioListeners = [];
const radioJoinSound = new Audio('/static/audio/join.wav');
const radioLeaveSound = new Audio('/static/audio/leave.wav');
let radioLeaveTimeout = null;

function handleRadioListenersUpdate(listeners) {
    if (isListening || isRadioDJ) {
        if (previousRadioListeners.length > 0 || listeners.length > 0) {
            if (listeners.length > previousRadioListeners.length) {
                if (radioLeaveTimeout) {
                    clearTimeout(radioLeaveTimeout);
                    radioLeaveTimeout = null;
                } else {
                    radioJoinSound.play().catch(e => console.log('Audio play error:', e));
                }
            } else if (listeners.length < previousRadioListeners.length) {
                if (!radioLeaveTimeout) {
                    radioLeaveTimeout = setTimeout(() => {
                        radioLeaveSound.play().catch(e => console.log('Audio play error:', e));
                        radioLeaveTimeout = null;
                    }, 2000);
                }
            }
        }
    }
    previousRadioListeners = listeners;

    const container = document.getElementById('radio-listeners-container');
    if (!container) return;
    container.innerHTML = '';

    const MAX_SHOW = 5;
    listeners.forEach((user, index) => {
        if (index >= MAX_SHOW) return;
        const img = document.createElement('img');
        img.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullname)}&background=random&color=fff`;
        img.style.width = '18px';
        img.style.height = '18px';
        img.style.borderRadius = '50%';
        img.style.border = '1px solid rgba(255,255,255,0.2)';
        img.style.marginLeft = index === 0 ? '0' : '-6px';
        img.style.objectFit = 'cover';
        img.title = user.fullname;
        container.appendChild(img);
    });

    if (listeners.length > MAX_SHOW) {
        const extra = document.createElement('span');
        extra.textContent = `+${listeners.length - MAX_SHOW}`;
        Object.assign(extra.style, {
            width: '18px', height: '18px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)',
            fontSize: '9px', fontWeight: '700', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            marginLeft: '-6px', border: '1px solid rgba(255,255,255,0.2)',
            flexShrink: '0'
        });
        extra.title = listeners.slice(MAX_SHOW).map(u => u.fullname).join(', ');
        container.appendChild(extra);
    }

    // Update participants marquee
    const marqueeEl = document.getElementById('radio-participants-marquee');
    const marqueeTrack = document.getElementById('radio-participants-track');
    if (marqueeEl && marqueeTrack) {
        if (listeners.length > 0) {
            marqueeTrack.innerHTML = '';
            for (let copy = 0; copy < 2; copy++) {
                var containerItem = document.createElement('span');
                containerItem.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;';
                
                listeners.forEach(function(user, i) {
                    var img = document.createElement('img');
                    img.src = user.avatar || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullname) + '&background=random&color=fff&size=16');
                    img.style.cssText = 'width:16px;height:16px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid var(--border);';
                    if (i > 0) img.style.marginLeft = '-6px';
                    img.referrerPolicy = 'no-referrer';
                    img.onerror = function() { this.style.display='none'; };
                    containerItem.appendChild(img);
                });
                
                var desc = document.createElement('span');
                desc.style.cssText = 'font-size:10px;color:var(--text);font-weight:500;white-space:nowrap;margin-left:6px;';
                desc.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'đang tham gia phát nhạc 🎵' : 'が再生に参加しています 🎵';
                containerItem.appendChild(desc);
                marqueeTrack.appendChild(containerItem);
                
                if (copy === 0) {
                    var dot = document.createElement('span');
                    dot.style.cssText = 'color:var(--text-3);font-size:8px;flex-shrink:0;margin:0 12px;';
                    dot.textContent = '\u2022';
                    marqueeTrack.appendChild(dot);
                }
            }
            marqueeEl.style.display = 'flex';
            requestAnimationFrame(function() {
                var halfWidth = marqueeTrack.scrollWidth / 2;
                var duration = Math.max(8, halfWidth / 30);
                marqueeTrack.style.animation = 'radioMarquee ' + duration + 's linear infinite';
            });
        } else {
            marqueeEl.style.display = 'none';
        }
    }
}

// ---- Polling loop cho listener ----
function startRadioPolling() {
    stopRadioPolling();
    // Poll ngay lập tức
    pollRadioState();
    radioPollingInterval = setInterval(pollRadioState, 3000);
}

function stopRadioPolling() {
    if (radioPollingInterval) {
        clearInterval(radioPollingInterval);
        radioPollingInterval = null;
    }
}

async function pollRadioState() {
    const state = await radioApiGet('/api/radio/state');
    if (state) handleRadioStateFromPolling(state);
}

// ---- Listener heartbeat (chỉ khi polling) ----
let listenerHeartbeatInterval = null;
function startListenerHeartbeat() {
    stopListenerHeartbeat();
    radioApiPost('/api/radio/join');
    listenerHeartbeatInterval = setInterval(() => {
        radioApiPost('/api/radio/join');
    }, 10000); // heartbeat mỗi 10s
}
function stopListenerHeartbeat() {
    if (listenerHeartbeatInterval) {
        clearInterval(listenerHeartbeatInterval);
        listenerHeartbeatInterval = null;
    }
}

function onPlayerReady(event) {
    // Detect nếu Socket.IO không khả dụng → dùng REST polling
    const socketAvailable = window.socket && window.socket.connected;

    if (!socketAvailable) {
        // Chờ thêm 3s cho socket reconnect, nếu vẫn không có thì dùng polling
        setTimeout(() => {
            if (!window.socket || !window.socket.connected) {
                console.log('[Radio] Socket.IO not available, using REST polling');
                useRadioPolling = true;
                // Bắt đầu polling state
                startRadioPolling();
            } else {
                setupSocketRadio();
            }
        }, 3000);
    } else {
        setupSocketRadio();
    }
}

// ---- Socket.IO radio setup (local dev) ----
function setupSocketRadio() {
    if (!window.socket) return;
    useRadioPolling = false;
    window.socket.emit('request_radio_state');

    // Khi socket (re)connect lại: đồng bộ lại trạng thái radio.
    // - Nếu là DJ: server sẽ gán lại dj_sid mới (nếu không sẽ bị chặn ở handle_radio_sync -> user kẹt "Đang đồng bộ...")
    // - Nếu đang nghe: join_radio lại vì sid cũ đã bị xóa khỏi radio_listeners khi disconnect
    window.socket.on('connect', () => {
        // request_radio_state đã tự re-bind dj_sid theo username nếu ta là DJ.
        // Listener cần join_radio lại vì sid cũ đã bị xóa khỏi radio_listeners khi disconnect.
        window.socket.emit('request_radio_state');
        if (isListening && !isRadioDJ) {
            window.socket.emit('join_radio');
        }
    });

    window.socket.on('radio_sync', (state) => {
        // Auto-reclaim DJ mode if server says we are the DJ
        if (state.you_are_dj && !isRadioDJ) {
            isRadioDJ = true;
            const toggle = document.getElementById('radio-dj-toggle');
            if (toggle) toggle.checked = true;

            const inputContainer = document.getElementById('radio-yt-input-container');
            if (inputContainer) inputContainer.style.display = 'block';

            const progressEl = document.getElementById('radio-progress');
            if (progressEl) progressEl.disabled = false;

            if (!djSyncInterval) {
                djSyncInterval = setInterval(() => {
                    if (window.syncRadioToServer) window.syncRadioToServer();
                }, 3000);
            }

            if (ytPlayer && ytPlayer.loadVideoById) {
                ytPlayer.loadVideoById(state.youtube_id, state.current_time);
                if (state.is_playing) ytPlayer.playVideo();
            }
            radioState.youtube_id = state.youtube_id;
            radioState.is_playing = state.is_playing;
            radioState.current_time = state.current_time;
            if (state.next_title !== undefined) radioState.next_title = state.next_title;

            if (window.updateRadioUI) window.updateRadioUI();
        }

        if (isRadioDJ) return;

        // Nếu DJ tắt, các máy đang nghe (listener) tự động bị văng khỏi chế độ nghe
        if (!state.dj_username) {
            const container = document.getElementById('radio-listeners-container');
            if (container) container.innerHTML = '';

            if (isListening) {
                isListening = false;
                if (ytPlayer && ytPlayer.pauseVideo) {
                    ytPlayer.pauseVideo();
                }
                if (window.showToast) {
                    showToast(CURRENT_LANG === 'vi' ? 'Host đã tắt DJ, bạn đã ngắt kết nối' : 'ホストがDJを終了したため、切断されました', 'info');
                }
            }
        } else if (state.is_playing && state.dj_username !== window.currentUser && !isListening) {
            if (window._lastPetDjNotified !== state.dj_username) {
                window._lastPetDjNotified = state.dj_username;
                if (window.triggerPetMusicInvite) {
                    window.triggerPetMusicInvite(state.dj_username, state.youtube_id);
                }
            }
        }

        radioState.youtube_id = state.youtube_id;
        radioState.current_time = state.current_time;
        radioState.is_playing = state.is_playing;
        if (state.next_title !== undefined) radioState.next_title = state.next_title;
        radioState.allow_requests = state.allow_requests === true || state.allow_requests === 'true';
        radioState.is_automix_enabled = state.is_automix_enabled === true || state.is_automix_enabled === 'true';
        radioState.video_active = !!state.video_active;
        if (state.queue) {
        radioState.queue = state.queue;
        if (window.syncQueueToLocalPlaylist) window.syncQueueToLocalPlaylist(state.queue);
    }

        if (isListening && ytPlayer && ytPlayer.loadVideoById) {
            const currentVideo = ytPlayer.getVideoData?.()?.video_id;
            const duration = ytPlayer.getDuration?.() || 0;
            const currentTime = ytPlayer.getCurrentTime?.() || 0;
            const isNearEnd = duration > 0 && (duration - currentTime) <= 25;

            if (currentVideo !== state.youtube_id) {
                if (isCrossfading && targetCrossfadeVideoId === state.youtube_id) {
                    // Đang trong tiến trình crossfade mượt sang bài này - không ngắt hay reload!
                } else {
                    const canCrossfade = !isCrossfading && currentVideo && window.crossfadeTo && (
                        state.is_crossfading === true ||
                        (radioState.is_automix_enabled && isNearEnd)
                    );

                    if (canCrossfade) {
                        window.crossfadeTo(state.youtube_id, state.current_time);
                    } else {
                        if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
                        ytPlayer.loadVideoById(state.youtube_id, state.current_time);
                    }
                }
            } else if (!isCrossfading && Math.abs(currentTime - state.current_time) > 3) {
                const now = Date.now();
                if (now - lastSeekTime > 5000) {
                    ytPlayer.seekTo(state.current_time, true);
                    lastSeekTime = now;
                }
            }

            const playerState = ytPlayer.getPlayerState?.();
            if (state.is_playing && playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) {
                ytPlayer.playVideo();
                if (isCrossfading && ytPlayer2 && ytPlayer2.playVideo) ytPlayer2.playVideo();
            } else if (!state.is_playing && playerState !== YT.PlayerState.PAUSED && playerState !== YT.PlayerState.CUED && playerState !== YT.PlayerState.UNSTARTED) {
                ytPlayer.pauseVideo();
                if (isCrossfading && ytPlayer2 && ytPlayer2.pauseVideo) ytPlayer2.pauseVideo();
            }
        }

        updateRadioUI();
        const statusText = document.getElementById('radio-status');
        if (statusText) statusText.innerHTML = `DJ: ${state.dj_username || 'Ai đó'}`;
    });

    window.socket.on('radio_listeners_update', function (listeners) {
        handleRadioListenersUpdate(listeners);
    });

    window.socket.on('radio_queue_update', function (queue) {
        radioState.queue = queue;
        if (window.syncQueueToLocalPlaylist) window.syncQueueToLocalPlaylist(queue);
        if (window.updateRadioUI) window.updateRadioUI();
    });
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING && !isCrossfading) {
        applyUserRadioVolume(event.target);
    }
    if (isRadioDJ) {
        if (event.data === YT.PlayerState.PLAYING) {
            radioState.is_playing = true;
            updateRadioUI();
            syncRadioToServer();
        } else if (event.data === YT.PlayerState.PAUSED) {
            radioState.is_playing = false;
            updateRadioUI();
            syncRadioToServer();
        } else if (event.data === YT.PlayerState.ENDED) {
            if (radioState.queue && radioState.queue.length > 0) {
                const nextItem = radioState.queue[0];
                if (window.socket) window.socket.emit('queue_pop');
                ytPlayer.loadVideoById(nextItem.youtube_id);
                ytPlayer.playVideo();
                radioState.youtube_id = nextItem.youtube_id;
                radioState.is_playing = true;
                updateRadioUI();
                syncRadioToServer();
            } else {
                radioState.is_playing = false;
                updateRadioUI();
                syncRadioToServer();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const playIcon = document.getElementById('radio-icon-play');
    const pauseIcon = document.getElementById('radio-icon-pause');
    const trackName = document.getElementById('radio-track-name');
    const statusText = document.getElementById('radio-status');
    const djBadge = document.getElementById('radio-dj-badge');
    const ytInput = document.getElementById('radio-yt-input');
    const ytInputContainer = document.getElementById('radio-yt-input-container');

    window.radioTogglePlay = function () {
        if (!ytPlayer || !ytPlayer.getPlayerState) return;

        if (isRadioDJ) {
            const state = ytPlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                ytPlayer.pauseVideo();
                if (isCrossfading && ytPlayer2 && ytPlayer2.pauseVideo) ytPlayer2.pauseVideo();
                radioState.is_playing = false;
            } else {
                ytPlayer.playVideo();
                if (isCrossfading && ytPlayer2 && ytPlayer2.playVideo) ytPlayer2.playVideo();
                radioState.is_playing = true;
            }
            updateRadioUI();
            syncRadioToServer();
        } else {
            isListening = !isListening;
            if (isListening) {
                // Join radio
                if (useRadioPolling) {
                    radioApiPost('/api/radio/join');
                    startListenerHeartbeat();
                    startRadioPolling();
                } else if (window.socket) {
                    window.socket.emit('join_radio');
                }
                const currentVideo = ytPlayer.getVideoData()?.video_id;
                if (currentVideo !== radioState.youtube_id) {
                    ytPlayer.loadVideoById(radioState.youtube_id, radioState.current_time);
                } else {
                    ytPlayer.seekTo(radioState.current_time, true);
                }

                if (radioState.is_playing) ytPlayer.playVideo();
                else ytPlayer.pauseVideo();
            } else {
                // Leave radio
                if (useRadioPolling) {
                    radioApiPost('/api/radio/leave');
                    stopListenerHeartbeat();
                    stopRadioPolling();
                } else if (window.socket) {
                    window.socket.emit('leave_radio');
                }
                ytPlayer.pauseVideo();
            }
            updateRadioUI();
        }
    };

    // Hàm chuyên biệt để join radio từ Pet - sửa triệt để các trường hợp bị chặn/lag
    window.joinRadioFromPet = function (targetYoutubeId) {
        if (isRadioDJ) {
            if (typeof showToast === 'function') {
                showToast('Bạn đang là DJ phát nhạc!', 'info');
            }
            return;
        }

        // 1. Nếu có targetYoutubeId truyền vào, cập nhật trực tiếp cho radioState
        if (targetYoutubeId && typeof targetYoutubeId === 'string' && targetYoutubeId.trim().length > 0) {
            radioState.youtube_id = targetYoutubeId.trim();
        }

        // 2. Đánh dấu đang nghe
        isListening = true;

        // 3. Thông báo server tham gia phòng nghe
        if (useRadioPolling) {
            radioApiPost('/api/radio/join');
            startListenerHeartbeat();
            startRadioPolling();
        } else if (window.socket) {
            window.socket.emit('join_radio');
        }

        // 4. Kích hoạt phát video & xử lý browser autoplay restrictions
        const playTarget = function () {
            if (!ytPlayer) return;
            const currentVideoId = radioState.youtube_id || targetYoutubeId;
            if (!currentVideoId) return;

            try {
                applyUserRadioVolume(ytPlayer);

                const currentLoaded = ytPlayer.getVideoData?.()?.video_id;
                const startTime = radioState.current_time || 0;

                if (currentLoaded !== currentVideoId) {
                    if (ytPlayer.loadVideoById) {
                        ytPlayer.loadVideoById(currentVideoId, startTime);
                    }
                } else {
                    if (ytPlayer.seekTo) ytPlayer.seekTo(startTime, true);
                }

                if (ytPlayer.playVideo) ytPlayer.playVideo();
            } catch (err) {
                console.warn('[joinRadioFromPet] Play error:', err);
            }
        };

        if (ytPlayer && (ytPlayer.getPlayerState || ytPlayer.loadVideoById)) {
            playTarget();
        } else {
            // Retry linh hoạt trong 2 giây nếu YouTube Iframe đang load
            let retries = 0;
            const retryInterval = setInterval(() => {
                retries++;
                if (ytPlayer && (ytPlayer.getPlayerState || ytPlayer.loadVideoById)) {
                    clearInterval(retryInterval);
                    playTarget();
                } else if (retries >= 5) {
                    clearInterval(retryInterval);
                }
            }, 400);
        }

        // 5. Cập nhật UI Radio
        updateRadioUI();

        // 6. Kích hoạt hiệu ứng Pet Dancing nếu Pet Engine đang chạy
        if (window.PetRoamEngine && window.PetRoamEngine.setDancing) {
            window.PetRoamEngine.setDancing(true);
        }
        if (window.Pet3DEngine && window.Pet3DEngine.setDancing) {
            window.Pet3DEngine.setDancing(true);
        }

        // 7. Hiển thị Toast thông báo thành công cho người dùng
        if (typeof showToast === 'function') {
            const djText = radioState.dj_username ? `cùng DJ ${radioState.dj_username}` : '';
            showToast(`🎵 Đã kết nối tham gia nghe nhạc ${djText}!`, 'success');
        }
    };

    window.toggleDJMode = function () {
        const toggleEl = document.getElementById('radio-dj-toggle');
        const isChecked = toggleEl.checked;
        const progressEl = document.getElementById('radio-progress');

        if (isChecked) {
            // Attempt to claim DJ role
            if (useRadioPolling) {
                // REST API claim
                radioApiPost('/api/radio/claim').then(response => {
                    if (response && response.success) {
                        isRadioDJ = true;
                        isListening = true;
                        radioApiPost('/api/radio/join');
                        startListenerHeartbeat();
                        if (djBadge) djBadge.style.display = 'block';
                        if (statusText) statusText.innerHTML = `Bạn đang là DJ 🎧`;
                        if (ytInputContainer) ytInputContainer.style.display = 'block';
                        if (progressEl) progressEl.disabled = false;
                        djSyncInterval = setInterval(syncRadioToServer, 3000);
                        syncRadioToServer();
                        // Bắt đầu polling để nhận listener updates
                        startRadioPolling();
                        updateRadioUI();
                    } else {
                        const djName = (response && response.dj_name) ? response.dj_name : 'Ai đó';
                        showToast(`Đã có người làm DJ rồi! (${djName} đang host). Vui lòng đợi họ tắt DJ.`, 'error');
                        toggleEl.checked = false;
                        isRadioDJ = false;
                    }
                });
            } else if (window.socket) {
                // Socket.IO claim
                window.socket.emit('claim_dj', (response) => {
                    if (response && response.success) {
                        isRadioDJ = true;
                        isListening = true;
                        if (window.socket) window.socket.emit('join_radio');
                        if (djBadge) djBadge.style.display = 'block';
                        if (statusText) statusText.innerHTML = `Bạn đang là DJ 🎧`;
                        if (ytInputContainer) ytInputContainer.style.display = 'block';
                        if (progressEl) progressEl.disabled = false;
                        djSyncInterval = setInterval(syncRadioToServer, 3000);
                        syncRadioToServer();
                        updateRadioUI();
                    } else {
                        const djName = (response && response.dj_name) ? response.dj_name : 'Ai đó';
                        showToast(`Đã có người làm DJ rồi! (${djName} đang host). Vui lòng đợi họ tắt DJ.`, 'error');
                        toggleEl.checked = false;
                        isRadioDJ = false;
                    }
                });
            } else {
                toggleEl.checked = false;
            }
        } else {
            isRadioDJ = false;
            if (djBadge) djBadge.style.display = 'none';
            if (ytInputContainer) ytInputContainer.style.display = 'none';
            if (progressEl) progressEl.disabled = true;
            clearInterval(djSyncInterval);
            if (useRadioPolling) {
                radioApiPost('/api/radio/release');
                stopListenerHeartbeat();
                stopRadioPolling();
                // Poll state một lần cuối
                pollRadioState();
            } else if (window.socket) {
                window.socket.emit('release_dj');
                window.socket.emit('request_radio_state');
            }
            updateRadioUI();
        }
    };

    if (ytInput) {
        ytInput.addEventListener('change', function (e) {
            if (!isRadioDJ && !radioState.allow_requests) return;
            const url = e.target.value;
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            const videoId = (match && match[2].length === 11) ? match[2] : null;
            const listMatch = url.match(/[?&]list=([^#\&\?]+)/);
            const listId = listMatch ? listMatch[1] : null;

            if (videoId || listId) {
                if (isRadioDJ && !radioState.allow_requests) {
                    if (listId) {
                        radioState.youtube_id = videoId || 'playlist';
                        if (ytPlayer && ytPlayer.loadPlaylist) {
                            ytPlayer.loadPlaylist({list: listId, listType: 'playlist', index: 0});
                        }
                    } else if (videoId) {
                        radioState.youtube_id = videoId;
                        if (ytPlayer && ytPlayer.loadVideoById) {
                            ytPlayer.loadVideoById(videoId);
                            ytPlayer.playVideo();
                        }
                    }
                    radioState.is_playing = true;
                    updateRadioUI();
                    syncRadioToServer();
                    ytInput.value = '';
                    showToast(CURRENT_LANG === 'vi' ? 'Đang phát ngay!' : '再生中！', 'success');
                } else if (videoId) {
                    // Fetch title then add to queue
                    fetch(`/api/youtube_title?id=${videoId}`)
                        .then(r => r.json())
                        .then(d => {
                            const title = d.title || 'Unknown Video';
                            if (window.saveToLocalPlaylist) window.saveToLocalPlaylist(videoId, title);
                            if (window.socket) {
                                window.socket.emit('queue_add', { youtube_id: videoId, title: title });
                            }
                        })
                        .catch(() => {
                            if (window.saveToLocalPlaylist) window.saveToLocalPlaylist(videoId, 'Unknown Video');
                            if (window.socket) window.socket.emit('queue_add', { youtube_id: videoId, title: 'Unknown Video' });
                        });
                    ytInput.value = '';
                    showToast(CURRENT_LANG === 'vi' ? 'Đã thêm vào hàng chờ!' : 'キューに追加されました！', 'success');
                } else {
                     showToast(CURRENT_LANG === 'vi' ? 'Chỉ hỗ trợ link video đơn cho tính năng hàng chờ!' : 'キュー機能には単一のビデオリンクのみ対応しています！', 'error');
                }
            } else {
                showToast(CURRENT_LANG === 'vi' ? 'Link YouTube không hợp lệ!' : '無効なYouTubeリンクです！', 'error');
            }
        });
    }

    window.syncRadioToServer = function () {
        if (!isRadioDJ || !ytPlayer || !ytPlayer.getCurrentTime) return;
        let time = 0;
        let duration = 0;
        try {
            time = ytPlayer.getCurrentTime() || 0;
            duration = ytPlayer.getDuration() || 0;
        } catch (e) { }

        // --- Auto-Mix Crossfade Check ---
        if (!window.manualSkipInProgress && !!radioState.is_automix_enabled && !isCrossfading && duration > 0 && (duration - time) <= 20 && (duration - time) > 0 && radioState.queue && radioState.queue.length > 0) {
            const nextItem = radioState.queue[0];
            if (window.socket) window.socket.emit('queue_pop');
            radioState.youtube_id = nextItem.youtube_id;
            radioState.current_time = 0;
            radioState.is_playing = true;
            if (window.crossfadeTo) {
                window.crossfadeTo(nextItem.youtube_id, 0, function() {
                    if (window.updateRadioUI) updateRadioUI();
                    if (window.syncRadioToServer) syncRadioToServer();
                });
            }
            // Ngay lập tức emit radio_sync để tất cả listener bắt đầu crossfade cùng lúc với DJ
            if (window.socket) {
                window.socket.emit('radio_sync', {
                    is_playing: true,
                    youtube_id: nextItem.youtube_id,
                    current_time: 0,
                    next_title: radioState.next_title,
                    is_crossfading: true,
                    is_automix_enabled: true,
                    video_active: radioState.video_active
                });
            }
            return;
        }

        let activePlayer = isCrossfading && ytPlayer2 ? ytPlayer2 : ytPlayer;

        try {
            const ytData = activePlayer.getVideoData();
            if (ytData && ytData.video_id) {
                radioState.youtube_id = ytData.video_id; // Dynamically grab current playlist video
            }

            if (activePlayer.getPlaylist && activePlayer.getPlaylistIndex) {
                const playlist = activePlayer.getPlaylist();
                const index = activePlayer.getPlaylistIndex();
                if (playlist && playlist.length > index + 1) {
                    const nextVideoId = playlist[index + 1];
                    if (radioState.next_youtube_id !== nextVideoId) {
                        radioState.next_youtube_id = nextVideoId;
                        radioState.next_title = "Loading...";
                        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${nextVideoId}`)
                            .then(r => r.json())
                            .then(d => {
                                if(d && d.title) {
                                    radioState.next_title = d.title;
                                    updateRadioUI();
                                }
                            }).catch(()=>{});
                    }
                } else {
                    radioState.next_youtube_id = null;
                    radioState.next_title = null;
                }
            }
        } catch (e) { }

        if (useRadioPolling) {
            // REST API sync
            radioApiPost('/api/radio/sync', {
                is_playing: radioState.is_playing,
                youtube_id: radioState.youtube_id,
                current_time: isCrossfading && ytPlayer2 ? ytPlayer2.getCurrentTime() || 0 : time,
                next_title: radioState.next_title,
                is_crossfading: isCrossfading,
                is_automix_enabled: !!radioState.is_automix_enabled,
                video_active: radioState.video_active
            });
        } else if (window.socket) {
            // Socket.IO sync
            window.socket.emit('radio_sync', {
                is_playing: radioState.is_playing,
                youtube_id: radioState.youtube_id,
                current_time: isCrossfading && ytPlayer2 ? ytPlayer2.getCurrentTime() || 0 : time,
                next_title: radioState.next_title,
                is_crossfading: isCrossfading,
                is_automix_enabled: !!radioState.is_automix_enabled,
                video_active: radioState.video_active
            });
        }
    };

    window.toggleAutoMix = function (checkbox) {
        if (!isRadioDJ) return;
        radioState.is_automix_enabled = checkbox.checked;
        if (window.socket) {
            window.socket.emit('toggle_automix', { is_automix_enabled: checkbox.checked });
        }
    };

    let draggedQueueItem = null;
    window.toggleAllowRequests = function (checkbox) {
        if (!isRadioDJ) return;
        radioState.allow_requests = checkbox.checked;
        if (window.socket) {
            window.socket.emit('toggle_allow_requests', { allow_requests: checkbox.checked });
        }
        updateRadioUI();
    };

    window.renderRadioQueue = function () {
        const queueList = document.getElementById('radio-queue-list');
        if (!queueList) return;
        queueList.innerHTML = '';
        if (!radioState.queue || radioState.queue.length === 0) {
            queueList.innerHTML = `<div style="font-size: 10px; color: rgba(255,255,255,0.7); text-align: center; padding: 4px;">${CURRENT_LANG === 'vi' ? 'Danh sách trống' : '空のリスト'}</div>`;
            return;
        }
        
        radioState.queue.forEach((item, index) => {
            const el = document.createElement('div');
            el.dataset.queueId = item.queue_id;
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.gap = '6px';
            el.style.padding = '4px 6px';
            el.style.background = 'rgba(255,255,255,0.05)';
            el.style.borderRadius = '4px';
            
            let html = '';
            if (isRadioDJ) {
                html += `<div class="queue-drag-handle" style="cursor: grab; color: rgba(255,255,255,0.3);">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h16v2H4V8zm0 6h16v2H4v-2z"/></svg>
                         </div>`;
            }
            const avatarUrl = item.avatar ? (item.avatar.startsWith('http') || item.avatar.startsWith('/api') || item.avatar.startsWith('/static') ? item.avatar : '/static/avatars/' + item.avatar) : '/static/logo.png';
            html += `<img src="${avatarUrl}" onerror="this.src='/static/logo.png'" style="width: 16px; height: 16px; border-radius: 50%; object-fit: cover;" title="${item.added_by}">`;
            html += `<div style="flex: 1; min-width: 0; font-size: 10px; color: rgba(255,255,255,0.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title || 'Loading...'}</div>`;
            if (isRadioDJ) {
                html += `<button onclick="removeQueueItem('${item.queue_id}')" style="background: none; border: none; color: rgba(255,100,100,0.8); cursor: pointer; padding: 2px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                         </button>`;
            }
            el.innerHTML = html;
            queueList.appendChild(el);
            
            if (isRadioDJ) {
                el.setAttribute('draggable', true);
                el.addEventListener('dragstart', (e) => {
                    draggedQueueItem = el;
                    setTimeout(() => el.style.opacity = '0.5', 0);
                });
                el.addEventListener('dragend', () => {
                    draggedQueueItem = null;
                    el.style.opacity = '1';
                    const newQueueIds = [...queueList.children].map(child => child.dataset.queueId);
                    const newQueue = newQueueIds.map(id => radioState.queue.find(q => q.queue_id === id)).filter(Boolean);
                    if (window.socket) window.socket.emit('queue_reorder', { queue: newQueue });
                });
                el.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (!draggedQueueItem || draggedQueueItem === el) return;
                    const rect = el.getBoundingClientRect();
                    const next = (e.clientY - rect.top)/(rect.bottom - rect.top) > 0.5;
                    queueList.insertBefore(draggedQueueItem, next ? el.nextSibling : el);
                });
            }
        });
    };

    window.removeQueueItem = function(id) {
        if (window.socket) window.socket.emit('queue_remove', { queue_id: id });
    };

    window.updateRadioUI = function () {
        if (!playIcon || !pauseIcon || !trackName) return;

        const displayPlaying = isRadioDJ ? radioState.is_playing : (isListening && radioState.is_playing);

        // Sync 3D Pet Dancing mode with active music participation
        const shouldPetDance = Boolean(displayPlaying);
        if (window.Pet3DEngine && window.Pet3DEngine.setDancing) {
            window.Pet3DEngine.setDancing(shouldPetDance);
        }
        if (window.PetRoamEngine && window.PetRoamEngine.setDancing) {
            window.PetRoamEngine.setDancing(shouldPetDance);
        }

        if (displayPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }

        const wrapper = document.getElementById('radio-video-wrapper');
        const btn = document.getElementById('radio-video-toggle');
        const popoutIconBtn = document.getElementById('radio-video-popout-icon');
        if (btn) {
            if (window.isRadioPoppedOut && window.isRadioVideoVisible) {
                btn.style.color = '#34c759';
                if (popoutIconBtn) popoutIconBtn.style.color = '#6366f1';
            } else if (window.isRadioVideoVisible) {
                btn.style.color = '#34c759';
                if (popoutIconBtn) popoutIconBtn.style.color = 'rgba(255,255,255,0.45)';
            } else {
                btn.style.color = 'rgba(255,255,255,0.4)';
                if (popoutIconBtn) popoutIconBtn.style.color = 'rgba(255,255,255,0.45)';
            }
            btn.style.cursor = 'pointer';
            if (popoutIconBtn) popoutIconBtn.style.cursor = 'pointer';
        }

        if (isRadioDJ || isListening) {
            if (!radioUpdateInterval) radioUpdateInterval = setInterval(updateRadioProgress, 1000);

            const inputContainer = document.getElementById('radio-yt-input-container');
            const toggleContainer = document.getElementById('dj-requests-toggle');
            if (isRadioDJ) {
                if (inputContainer) inputContainer.style.display = 'block';
                if (toggleContainer) {
                    toggleContainer.style.display = 'flex';
                    const checkbox = document.getElementById('radio-allow-requests');
                    if (checkbox) checkbox.checked = radioState.allow_requests === true || radioState.allow_requests === 'true';
                }
                const automixCheckbox = document.getElementById('radio-automix-toggle');
                if (automixCheckbox) automixCheckbox.checked = radioState.is_automix_enabled === true || radioState.is_automix_enabled === 'true';
                const automixContainer = document.getElementById('dj-automix-toggle');
                if (automixContainer) automixContainer.style.display = 'flex';
            } else {
                if (toggleContainer) toggleContainer.style.display = 'none';
                const automixContainer = document.getElementById('dj-automix-toggle');
                if (automixContainer) automixContainer.style.display = 'none';
                if (inputContainer) {
                    inputContainer.style.display = (radioState.allow_requests && isListening) ? 'block' : 'none';
                }
            }
            renderRadioQueue();
        } else {
            if (radioUpdateInterval) {
                clearInterval(radioUpdateInterval);
                radioUpdateInterval = null;
            }
            const currentEl = document.getElementById('radio-time-current');
            const totalEl = document.getElementById('radio-time-total');
            const progressEl = document.getElementById('radio-progress');
            if (currentEl) currentEl.innerText = "0:00";
            if (totalEl) totalEl.innerText = "0:00";
            if (progressEl) progressEl.value = 0;
        }

        if (ytPlayer && ytPlayer.getVideoData) {
            const data = ytPlayer.getVideoData();
            if (data && data.title && (isListening || isRadioDJ)) {
                trackName.innerText = data.title;
            } else {
                trackName.innerText = (isListening || isRadioDJ)
                    ? (CURRENT_LANG === 'vi' ? "Chờ kết nối Youtube..." : "YouTube接続待ち...")
                    : (CURRENT_LANG === 'vi' ? "Nhấn Play để tham gia" : "再生して参加する");
            }
            
            const nextTrackEl = document.getElementById('radio-next-track');
            if (nextTrackEl) {
                const overrideNext = (radioState.allow_requests && radioState.queue && radioState.queue.length > 0) ? radioState.queue[0].title : radioState.next_title;
                if (overrideNext && (isListening || isRadioDJ)) {
                    nextTrackEl.innerText = (CURRENT_LANG === 'vi' ? 'Tiếp: ' : '次: ') + overrideNext;
                    nextTrackEl.style.display = 'block';
                } else {
                    nextTrackEl.style.display = 'none';
                }
            }

            const coverImg = document.getElementById('radio-cover');
            const bgBlur = document.getElementById('radio-bg-blur');

            if (data && data.video_id && (isListening || isRadioDJ)) {
                const coverUrl = `https://img.youtube.com/vi/${data.video_id}/hqdefault.jpg`;
                if (coverImg && coverImg.src !== coverUrl) coverImg.src = coverUrl;
                if (bgBlur) bgBlur.style.backgroundImage = `url('${coverUrl}')`;
            } else if (!isListening && !isRadioDJ) {
                const coverUrl = 'https://img.youtube.com/vi/4xDzrIxC4Dk/hqdefault.jpg';
                if (coverImg && !coverImg.src.includes('4xDzrIxC4Dk')) coverImg.src = coverUrl;
                if (bgBlur) bgBlur.style.backgroundImage = `url('${coverUrl}')`;
            }
        } else {
            trackName.innerText = (isListening || isRadioDJ)
                ? (CURRENT_LANG === 'vi' ? "Đang tải..." : "読み込み中...")
                : (CURRENT_LANG === 'vi' ? "Nhấn Play để tham gia" : "再生して参加する");
        }

        const coverImg = document.getElementById('radio-cover');
        if (coverImg) {
            if (displayPlaying) {
                coverImg.classList.add('apple-cover-playing');
                coverImg.classList.remove('apple-cover-paused');
            } else {
                coverImg.classList.add('apple-cover-paused');
                coverImg.classList.remove('apple-cover-playing');
            }
        }

        const djNameEl = document.getElementById('radio-dj-name');
        if (djNameEl) {
            if (isRadioDJ) {
                djNameEl.innerText = radioState.is_playing
                    ? (CURRENT_LANG === 'vi' ? "Bạn đang phát nhạc" : "再生中")
                    : (CURRENT_LANG === 'vi' ? "Bạn đang tạm dừng" : "一時停止中");
            } else {
                if (isListening) {
                    djNameEl.innerText = radioState.is_playing
                        ? (CURRENT_LANG === 'vi' ? "Đang đồng bộ..." : "同期中...")
                        : (CURRENT_LANG === 'vi' ? "DJ đang tạm dừng..." : "DJ一時停止中...");
                } else {
                    djNameEl.innerText = CURRENT_LANG === 'vi' ? "Chưa tham gia" : "未参加";
                }
            }
        }
    };

    function updateRadioProgress() {
        let activePlayer = isCrossfading && ytPlayer2 ? ytPlayer2 : ytPlayer;
        if (!activePlayer || !activePlayer.getCurrentTime) return;
        
        let current = 0;
        let duration = 0;
        try {
            current = activePlayer.getCurrentTime() || 0;
            duration = activePlayer.getDuration() || 0;
        } catch(e) {}

        const currentEl = document.getElementById('radio-time-current');
        const totalEl = document.getElementById('radio-time-total');
        const progressEl = document.getElementById('radio-progress');

        // If duration is extremely large (e.g. > 24 hours), it's likely a live stream
        const isLive = duration > 86400;

        if (currentEl) currentEl.innerText = isLive ? "LIVE" : formatTime(current);
        if (totalEl) totalEl.innerText = isLive ? "LIVE" : formatTime(duration);

        if (progressEl && duration > 0 && !progressEl.matches(':active')) {
            progressEl.value = isLive ? 100 : (current / duration) * 100;
            if (isLive) progressEl.disabled = true; // Disable seeking for live streams
        }

        // Auto-pop queue if it's about to end (handles playlists not firing ENDED)
        // Only do this if NOT crossfading, otherwise it conflicts with auto-mix
        if (isRadioDJ && !isLive && duration > 0 && (duration - current) <= 1.5 && !isCrossfading && !window.manualSkipInProgress) {
            if (radioState.queue && radioState.queue.length > 0) {
                const nextItem = radioState.queue[0];
                if (window.socket) window.socket.emit('queue_pop');
                if (activePlayer.loadVideoById) {
                    activePlayer.loadVideoById(nextItem.youtube_id);
                    activePlayer.playVideo();
                    radioState.youtube_id = nextItem.youtube_id;
                    radioState.is_playing = true;
                    if (window.updateRadioUI) window.updateRadioUI();
                    if (window.syncRadioToServer) window.syncRadioToServer();
                }
            }
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        if (seconds > 86400) return "LIVE"; // Fallback
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    const progressEl = document.getElementById('radio-progress');
    if (progressEl) {
        progressEl.addEventListener('input', function (e) {
            if (!isRadioDJ || !ytPlayer) return;
            const duration = ytPlayer.getDuration();
            if (duration > 0) {
                const seekTo = (e.target.value / 100) * duration;
                ytPlayer.seekTo(seekTo, true);
                const currentEl = document.getElementById('radio-time-current');
                if (currentEl) currentEl.innerText = formatTime(seekTo);
            }
        });
        progressEl.addEventListener('change', function (e) {
            if (!isRadioDJ || !ytPlayer) return;
            syncRadioToServer();
        });
    }

    initRadioVolume();
});

// Prepare PSD Modal logic
function openPreparePsdModal() {
    document.getElementById('prepare-psd-modal').classList.add('active');
    document.getElementById('prepare-psd-overlay').classList.add('active');
}

function closePreparePsdModal() {
    document.getElementById('prepare-psd-modal').classList.remove('active');
    document.getElementById('prepare-psd-overlay').classList.remove('active');
}

function setInputStatus(id, state) {
    const el = document.getElementById(id + '-status');
    if (!el) return;
    el.style.display = 'block';
        if (state === 'loading') {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>';
    } else if (state === 'success') {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (state === 'error') {
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    } else {
        el.style.display = 'none';
        el.innerHTML = '';
    }
}

    // Format Date helpers
    function formatDateVietnamese(date) {
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayName = days[date.getDay()];
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dayName}, ${dd}/${mm}/${yyyy}`;
    }

    function formatDateJapanese(date) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayName = days[date.getDay()];
        const yyyy = date.getFullYear();
        const mm = date.getMonth() + 1;
        const dd = date.getDate();
        return `${yyyy}年${mm}月${dd}日 (${dayName})`;
    }
    
    // =========================================================================
    // Realtime Cinematic Dynamic Weather Effects (Mưa, Tuyết, Nắng, Giông Bão)
    // =========================================================================
    let weatherCanvas = null;
    let weatherCtx = null;
    let weatherAnimId = null;
    let currentWeatherMode = null; // 'rain', 'thunder', 'snow', 'sun', null

    // Rain state
    let rainDrops = [];
    let rainSplashes = [];
    let thunderTimer = null;

    // Snow state
    let snowFlakes = [];

    // Sun state
    let sunMotes = [];

    let cachedChartRect = null;
    let lastRectUpdate = 0;

    function getChartCollisionRect() {
        const now = performance.now();
        if (!cachedChartRect || now - lastRectUpdate > 250) {
            const chartEl = document.getElementById('main-chart-section') || document.querySelector('.chart-section');
            if (chartEl) {
                const r = chartEl.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                    cachedChartRect = {
                        left: r.left,
                        right: r.right,
                        top: r.top,
                        bottom: r.bottom,
                        width: r.width,
                        height: r.height
                    };
                } else {
                    cachedChartRect = null;
                }
            } else {
                cachedChartRect = null;
            }
            lastRectUpdate = now;
        }
        return cachedChartRect;
    }

    function getChartRimSurfaceY(x, rect) {
        if (!rect) return 0;
        const radius = 24;
        if (x < rect.left + radius) {
            const dx = (rect.left + radius) - x;
            return rect.top + (radius - Math.sqrt(Math.max(0, radius * radius - dx * dx)));
        } else if (x > rect.right - radius) {
            const dx = x - (rect.right - radius);
            return rect.top + (radius - Math.sqrt(Math.max(0, radius * radius - dx * dx)));
        }
        return rect.top;
    }

    function initWeatherCanvas() {
        if (!weatherCanvas) {
            weatherCanvas = document.getElementById('rain-canvas') || document.getElementById('weather-canvas');
            if (!weatherCanvas) {
                weatherCanvas = document.createElement('canvas');
                weatherCanvas.id = 'weather-canvas';
            }
            if (weatherCanvas.parentElement !== document.documentElement) {
                document.documentElement.appendChild(weatherCanvas);
            }
            weatherCanvas.style.position = 'fixed';
            weatherCanvas.style.top = '0';
            weatherCanvas.style.left = '0';
            weatherCanvas.style.width = '100vw';
            weatherCanvas.style.height = '100vh';
            weatherCanvas.style.pointerEvents = 'none';
            weatherCanvas.style.zIndex = '9999';

            weatherCtx = weatherCanvas.getContext('2d');
            window.addEventListener('resize', handleWeatherResize);
            window.addEventListener('scroll', () => { lastRectUpdate = 0; }, { passive: true });
            document.addEventListener('scroll', () => { lastRectUpdate = 0; }, { passive: true });
        } else if (weatherCanvas.parentElement !== document.documentElement) {
            document.documentElement.appendChild(weatherCanvas);
        }
        handleWeatherResize();
    }

    function handleWeatherResize() {
        if (!weatherCanvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        weatherCanvas.width = window.innerWidth * dpr;
        weatherCanvas.height = window.innerHeight * dpr;
        if (weatherCtx) {
            weatherCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        lastRectUpdate = 0;
    }

    // --- RAIN LOGIC ---
    function createRainDrop(isInitial = false) {
        const rect = getChartCollisionRect();
        let x;
        if (rect && rect.width > 0 && Math.random() < 0.70) {
            x = rect.left + Math.random() * rect.width;
        } else {
            x = Math.random() * window.innerWidth;
        }
        const speed = 5.5 + Math.random() * 3.5;
        return {
            x: x,
            y: isInitial ? (Math.random() * (window.innerHeight * 0.8)) : (-15 - Math.random() * 60),
            speed: speed,
            length: 12 + Math.random() * 10,
            wind: 0.35 + Math.random() * 0.45,
            alpha: 0.25 + Math.random() * 0.42
        };
    }

    function triggerSplash(x, y, speed) {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const spread = (Math.random() - 0.5) * 3.4;
            const upVelocity = -(Math.random() * 2.0 + 0.8);
            rainSplashes.push({
                type: 'bead',
                x: x + (Math.random() - 0.5) * 3,
                y: y,
                vx: spread,
                vy: upVelocity,
                gravity: 0.13,
                radius: 0.7 + Math.random() * 1.1,
                alpha: 0.85,
                decay: 0.038 + Math.random() * 0.02
            });
        }
        rainSplashes.push({
            type: 'ripple',
            x: x,
            y: y,
            rx: 2,
            ry: 0.6,
            maxRx: 6 + Math.random() * 6,
            alpha: 0.8,
            decay: 0.04
        });
        if (Math.random() < 0.18) {
            rainSplashes.push({
                type: 'drip',
                x: x,
                y: y,
                speed: 0.3 + Math.random() * 0.4,
                maxDistance: 6 + Math.random() * 10,
                distance: 0,
                radius: 1.0 + Math.random() * 0.5,
                alpha: 0.75
            });
        }
    }

    // --- SNOW LOGIC ---
    function createSnowFlake(isInitial = false) {
        return {
            x: Math.random() * window.innerWidth,
            y: isInitial ? Math.random() * window.innerHeight : -10 - Math.random() * 40,
            radius: 1.4 + Math.random() * 2.8,
            speed: 0.9 + Math.random() * 1.4,
            wind: 0.2 + Math.random() * 0.35,
            swingAngle: Math.random() * Math.PI * 2,
            swingSpeed: 0.015 + Math.random() * 0.025,
            swingAmp: 0.8 + Math.random() * 1.5,
            alpha: 0.35 + Math.random() * 0.55
        };
    }

    // --- SUN LOGIC ---
    function createSunMote(isInitial = false) {
        return {
            x: Math.random() * window.innerWidth,
            y: isInitial ? Math.random() * (window.innerHeight * 0.75) : window.innerHeight * 0.75 + Math.random() * 50,
            radius: 1.0 + Math.random() * 2.2,
            vx: (Math.random() - 0.5) * 0.35 + 0.15,
            vy: -(0.3 + Math.random() * 0.45),
            alpha: 0.2 + Math.random() * 0.45,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: 0.025 + Math.random() * 0.03
        };
    }

    // MAIN ANIMATION LOOP
    function isAnyOverlayOrToolOpen() {
        return !!(
            document.querySelector('.tool-page-view.open') ||
            document.querySelector('.task-detail-page-view.open') ||
            document.querySelector('.modal-overlay.open') ||
            document.querySelector('.filter-drawer.open') ||
            document.querySelector('.drawer-overlay.open') ||
            (document.getElementById('changepass-modal') && document.getElementById('changepass-modal').style.display === 'block')
        );
    }

    let isWeatherSuspended = false;

    window.pauseWeatherEffect = function() {
        isWeatherSuspended = true;
        if (weatherAnimId) {
            cancelAnimationFrame(weatherAnimId);
            weatherAnimId = null;
        }
        if (weatherCanvas) {
            weatherCanvas.style.display = 'none';
        }
        if (weatherCtx && weatherCanvas) {
            weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
        }
    };

    window.resumeWeatherEffect = function() {
        isWeatherSuspended = false;
        if (!currentWeatherMode || isAnyOverlayOrToolOpen() || document.hidden) return;
        if (weatherCanvas) {
            weatherCanvas.style.display = 'block';
        }
        if (!weatherAnimId) {
            lastRectUpdate = 0;
            weatherAnimId = requestAnimationFrame(updateWeatherParticles);
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            if (typeof window.pauseWeatherEffect === 'function') window.pauseWeatherEffect();
        } else {
            if (typeof window.resumeWeatherEffect === 'function') window.resumeWeatherEffect();
        }
    });

    function updateWeatherParticles() {
        if (!currentWeatherMode || !weatherCtx || isWeatherSuspended || isAnyOverlayOrToolOpen() || document.hidden) {
            if (weatherCanvas) weatherCanvas.style.display = 'none';
            if (weatherCtx && weatherCanvas) {
                weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
            }
            weatherAnimId = null;
            return;
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        weatherCtx.clearRect(0, 0, w, h);

        const rect = getChartCollisionRect();
        const hasChart = rect && rect.top > 0 && rect.top < h && rect.width > 0;
        const chartEl = document.getElementById('main-chart-section') || document.querySelector('.chart-section');

        // 1. RAIN / THUNDER
        if (currentWeatherMode === 'rain' || currentWeatherMode === 'thunder') {
            if (chartEl && !chartEl.classList.contains('rain-wet-rim')) {
                chartEl.classList.remove('snow-frost-rim', 'sun-warm-rim');
                chartEl.classList.add('rain-wet-rim');
            }

            for (let i = 0; i < rainDrops.length; i++) {
                const drop = rainDrops[i];
                const prevY = drop.y;
                drop.x += drop.wind;
                drop.y += drop.speed;

                if (hasChart && drop.x >= rect.left && drop.x <= rect.right) {
                    const surfaceY = getChartRimSurfaceY(drop.x, rect) + 1;
                    if (prevY <= surfaceY && drop.y >= surfaceY) {
                        triggerSplash(drop.x, surfaceY, drop.speed);
                        rainDrops[i] = createRainDrop(false);
                        continue;
                    }
                }

                if (drop.y > h + 20 || drop.x > w + 40) {
                    if (drop.y > h && Math.random() < 0.10) {
                        triggerSplash(drop.x, h - 2, drop.speed);
                    }
                    rainDrops[i] = createRainDrop(false);
                    continue;
                }

                const tailX = drop.x - drop.wind * (drop.length / drop.speed);
                const tailY = drop.y - drop.length;
                weatherCtx.strokeStyle = `rgba(186, 230, 253, ${drop.alpha})`;
                weatherCtx.lineWidth = 1.15;
                weatherCtx.lineCap = 'round';
                weatherCtx.beginPath();
                weatherCtx.moveTo(drop.x, drop.y);
                weatherCtx.lineTo(tailX, tailY);
                weatherCtx.stroke();
            }

            for (let i = rainSplashes.length - 1; i >= 0; i--) {
                const sp = rainSplashes[i];
                if (sp.type === 'bead') {
                    sp.x += sp.vx;
                    sp.vy += sp.gravity;
                    sp.y += sp.vy;
                    sp.alpha -= sp.decay;
                    if (sp.alpha <= 0) { rainSplashes.splice(i, 1); continue; }
                    weatherCtx.fillStyle = `rgba(186, 230, 253, ${sp.alpha})`;
                    weatherCtx.beginPath();
                    weatherCtx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
                    weatherCtx.fill();
                } else if (sp.type === 'ripple') {
                    sp.rx += 0.38;
                    sp.ry += 0.12;
                    sp.alpha -= sp.decay;
                    if (sp.alpha <= 0 || sp.rx >= sp.maxRx) { rainSplashes.splice(i, 1); continue; }
                    weatherCtx.strokeStyle = `rgba(147, 197, 253, ${sp.alpha})`;
                    weatherCtx.lineWidth = 1.0;
                    weatherCtx.beginPath();
                    weatherCtx.ellipse(sp.x, sp.y, sp.rx, sp.ry, 0, 0, Math.PI * 2);
                    weatherCtx.stroke();
                } else if (sp.type === 'drip') {
                    sp.y += sp.speed;
                    sp.distance += sp.speed;
                    if (sp.distance >= sp.maxDistance) sp.alpha -= 0.04;
                    if (sp.alpha <= 0) { rainSplashes.splice(i, 1); continue; }
                    weatherCtx.fillStyle = `rgba(186, 230, 253, ${sp.alpha})`;
                    weatherCtx.beginPath();
                    weatherCtx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
                    weatherCtx.fill();
                }
            }
        }

        // 2. SNOW
        else if (currentWeatherMode === 'snow') {
            if (chartEl && !chartEl.classList.contains('snow-frost-rim')) {
                chartEl.classList.remove('rain-wet-rim', 'sun-warm-rim');
                chartEl.classList.add('snow-frost-rim');
            }

            for (let i = 0; i < snowFlakes.length; i++) {
                const flake = snowFlakes[i];
                flake.y += flake.speed;
                flake.x += Math.sin(flake.swingAngle) * flake.swingAmp + flake.wind;
                flake.swingAngle += flake.swingSpeed;

                if (flake.y > h + 15 || flake.x > w + 20 || flake.x < -20) {
                    snowFlakes[i] = createSnowFlake(false);
                    continue;
                }

                const grad = weatherCtx.createRadialGradient(flake.x, flake.y, 0, flake.x, flake.y, flake.radius);
                grad.addColorStop(0, `rgba(255, 255, 255, ${flake.alpha})`);
                grad.addColorStop(0.65, `rgba(224, 242, 254, ${flake.alpha * 0.75})`);
                grad.addColorStop(1, 'rgba(224, 242, 254, 0)');
                weatherCtx.fillStyle = grad;
                weatherCtx.beginPath();
                weatherCtx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
                weatherCtx.fill();
            }
        }

        // 3. SUN
        else if (currentWeatherMode === 'sun') {
            if (chartEl && !chartEl.classList.contains('sun-warm-rim')) {
                chartEl.classList.remove('rain-wet-rim', 'snow-frost-rim');
                chartEl.classList.add('sun-warm-rim');
            }

            for (let i = 0; i < sunMotes.length; i++) {
                const mote = sunMotes[i];
                mote.x += mote.vx;
                mote.y += mote.vy;
                mote.pulse += mote.pulseSpeed;
                const dynamicAlpha = Math.max(0.08, mote.alpha * (0.7 + 0.3 * Math.sin(mote.pulse)));

                if (mote.y < -10 || mote.x > w + 20 || mote.x < -20) {
                    sunMotes[i] = createSunMote(false);
                    continue;
                }

                const grad = weatherCtx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.radius);
                grad.addColorStop(0, `rgba(254, 240, 138, ${dynamicAlpha})`);
                grad.addColorStop(0.6, `rgba(251, 191, 36, ${dynamicAlpha * 0.7})`);
                grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
                weatherCtx.fillStyle = grad;
                weatherCtx.beginPath();
                weatherCtx.arc(mote.x, mote.y, mote.radius, 0, Math.PI * 2);
                weatherCtx.fill();
            }
        }

        weatherAnimId = requestAnimationFrame(updateWeatherParticles);
    }

    // Clouds disabled per user request to highlight film album
    function renderHonorAtmosphericClouds(mode) {
        const cloudsLayer = document.getElementById('hero-weather-clouds-layer');
        if (cloudsLayer) {
            cloudsLayer.style.display = 'none';
            cloudsLayer.innerHTML = '';
        }
    }

    // Weather particle effects across outer page, hero banner overlays kept clean for film album
    window.applyWeatherEffect = function(mode) {
        initWeatherCanvas();
        const fxLayer = document.getElementById('hero-weather-fx-layer');
        const chartEl = document.getElementById('main-chart-section') || document.querySelector('.chart-section');

        if (thunderTimer) {
            clearInterval(thunderTimer);
            thunderTimer = null;
        }

        // Keep hero banner atmospheric FX & clouds hidden to keep film album clear & prominent
        if (fxLayer) {
            fxLayer.className = '';
            fxLayer.innerHTML = '';
            fxLayer.style.display = 'none';
        }
        renderHonorAtmosphericClouds(mode);

        if (mode === 'clear' || !mode) {
            currentWeatherMode = null;
            if (weatherAnimId) {
                cancelAnimationFrame(weatherAnimId);
                weatherAnimId = null;
            }
            if (weatherCtx && weatherCanvas) {
                weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
                weatherCanvas.style.display = 'none';
            }
            if (chartEl) {
                chartEl.classList.remove('rain-wet-rim', 'snow-frost-rim', 'sun-warm-rim');
            }
            return;
        }

        currentWeatherMode = mode;
        if (isAnyOverlayOrToolOpen() || isWeatherSuspended || document.hidden) {
            if (weatherCanvas) weatherCanvas.style.display = 'none';
            if (weatherAnimId) {
                cancelAnimationFrame(weatherAnimId);
                weatherAnimId = null;
            }
            return;
        }
        if (weatherCanvas) weatherCanvas.style.display = 'block';

        if (mode === 'rain' || mode === 'thunder') {
            const totalDrops = Math.min(50, Math.floor(window.innerWidth / 24));
            rainDrops = [];
            rainSplashes = [];
            for (let i = 0; i < totalDrops; i++) {
                rainDrops.push(createRainDrop(true));
            }
        } else if (mode === 'snow') {
            const totalFlakes = Math.min(48, Math.floor(window.innerWidth / 26));
            snowFlakes = [];
            for (let i = 0; i < totalFlakes; i++) {
                snowFlakes.push(createSnowFlake(true));
            }
        } else {
            if (weatherAnimId) {
                cancelAnimationFrame(weatherAnimId);
                weatherAnimId = null;
            }
            if (weatherCtx && weatherCanvas) {
                weatherCtx.clearRect(0, 0, weatherCanvas.width, weatherCanvas.height);
                weatherCanvas.style.display = 'none';
            }
            if (chartEl) {
                chartEl.classList.remove('rain-wet-rim', 'snow-frost-rim', 'sun-warm-rim');
            }
            return;
        }

        lastRectUpdate = 0;
        if (weatherAnimId) cancelAnimationFrame(weatherAnimId);
        weatherAnimId = requestAnimationFrame(updateWeatherParticles);
    };

    // Backward compatibility aliases
    window.startRainEffect = function() { window.applyWeatherEffect('rain'); };
    window.stopRainEffect = function() { window.applyWeatherEffect('clear'); };
    window.startSnowEffect = function() { window.applyWeatherEffect('snow'); };
    window.stopSnowEffect = function() { window.applyWeatherEffect('clear'); };
    window.startSunEffect = function() { window.applyWeatherEffect('sun'); };
    window.stopSunEffect = function() { window.applyWeatherEffect('clear'); };

async function submitPreparePsd() {
    setInputStatus('psd-path', 'none');
    setInputStatus('psd-tap', 'none');

    const path = document.getElementById('psd-path').value.trim();
    const tap = document.getElementById('psd-tap').value.trim();

    if (!path || !tap) {
        showToast("Vui lòng nhập đầy đủ thông tin", "error");
        return;
    }

    setInputStatus('psd-path', 'loading');
    setInputStatus('psd-tap', 'loading');

    try {
        const res = await fetch('/api/prepare_psd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path, tap: tap })
        });
        const data = await res.json();

        if (data.success) {
            setInputStatus('psd-path', 'success');
            setInputStatus('psd-tap', 'success');
            showToast(data.message, "success");
            // Do not close modal so user can continue with Compare PSD
        } else {
            setInputStatus('psd-path', 'error');
            setInputStatus('psd-tap', 'error');
            showToast(data.error || "Có lỗi xảy ra", "error");
        }
    } catch (e) {
        setInputStatus('psd-path', 'error');
        setInputStatus('psd-tap', 'error');
        showToast("Lỗi mạng: " + e.message, "error");
    }
}

async function submitComparePsd() {
    setInputStatus('psd-source-path', 'none');

    const path = document.getElementById('psd-path').value.trim();
    const tap = document.getElementById('psd-tap').value.trim();
    const sourcePath = document.getElementById('psd-source-path').value.trim();

    if (!path || !tap || !sourcePath) {
        showToast("Vui lòng nhập đầy đủ đường dẫn gốc, số tập và đường dẫn tải về", "error");
        return;
    }

    setInputStatus('psd-source-path', 'loading');

    try {
        const res = await fetch('/api/compare_psd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path, tap: tap, source_path: sourcePath })
        });
        const data = await res.json();

        if (data.success) {
            setInputStatus('psd-source-path', 'success');
            showToast(data.message, "success");
            // Do not close modal automatically
        } else {
            setInputStatus('psd-source-path', 'error');
            showToast(data.error || "Có lỗi xảy ra", "error");
        }
    } catch (e) {
        setInputStatus('psd-source-path', 'error');
        showToast("Lỗi mạng: " + e.message, "error");
    }
}

function safelyMoveRadioWrapper(element, targetParent, beforeChild) {
    if (!element || !targetParent) return;
    try {
        if (typeof targetParent.moveBefore === 'function') {
            targetParent.moveBefore(element, beforeChild || null);
        } else {
            if (beforeChild) {
                targetParent.insertBefore(element, beforeChild);
            } else {
                targetParent.appendChild(element);
            }
        }
    } catch (err) {
        if (beforeChild) {
            targetParent.insertBefore(element, beforeChild);
        } else {
            targetParent.appendChild(element);
        }
    }
}

window.isRadioVideoVisible = false;
window.isRadioPoppedOut = false;

window.applyRadioVideoState = function() {
    const wrapper = document.getElementById('radio-video-wrapper');
    const innerContent = document.getElementById('lofi-inner-content');
    const anchor = document.getElementById('radio-video-anchor');
    if (!wrapper || !innerContent) return;

    if (!window.isRadioVideoVisible) {
        wrapper.style.display = 'none';
        wrapper.classList.remove('is-popped-out');
        if (wrapper.parentNode !== innerContent) {
            safelyMoveRadioWrapper(wrapper, innerContent, anchor ? anchor.nextSibling : innerContent.firstChild);
        }
        return;
    }

    if (window.isRadioPoppedOut) {
        // Pop out directly to document.body (floats on top of entire screen)
        if (wrapper.parentNode !== document.body) {
            safelyMoveRadioWrapper(wrapper, document.body);
        }
        wrapper.classList.add('is-popped-out');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.position = 'fixed';
        wrapper.style.zIndex = '100000';
        wrapper.style.borderRadius = '16px';
        wrapper.style.boxShadow = '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(99, 102, 241, 0.4)';
        wrapper.style.aspectRatio = 'unset';

        const header = document.getElementById('radio-popout-header');
        if (header) header.style.display = 'flex';
        const resizer = document.getElementById('radio-popout-resizer');
        if (resizer) resizer.style.display = 'flex';

        // Restore position & size from localStorage if valid
        const savedPos = JSON.parse(localStorage.getItem('lsa_popout_pos') || 'null');
        const savedSize = JSON.parse(localStorage.getItem('lsa_popout_size') || 'null');

        if (savedPos && savedPos.left >= 10 && savedPos.left < window.innerWidth - 80 && savedPos.top >= 10 && savedPos.top < window.innerHeight - 80) {
            wrapper.style.left = savedPos.left + 'px';
            wrapper.style.top = savedPos.top + 'px';
            wrapper.style.right = 'auto';
            wrapper.style.bottom = 'auto';
        } else {
            wrapper.style.left = 'auto';
            wrapper.style.top = 'auto';
            wrapper.style.bottom = '90px';
            wrapper.style.right = '40px';
        }

        if (savedSize && savedSize.width >= 260 && savedSize.height >= 180) {
            wrapper.style.width = savedSize.width + 'px';
            wrapper.style.height = savedSize.height + 'px';
        } else {
            wrapper.style.width = '480px';
            wrapper.style.height = '310px';
        }

        if (window.initPopoutDragAndResize) initPopoutDragAndResize();
    } else {
        // Natural Inline Mode inside sidebar LSA Music panel
        if (wrapper.parentNode !== innerContent) {
            safelyMoveRadioWrapper(wrapper, innerContent, anchor ? anchor.nextSibling : innerContent.firstChild);
        }
        wrapper.classList.remove('is-popped-out');
        wrapper.style.display = 'block';
        wrapper.style.position = 'relative';
        wrapper.style.left = '';
        wrapper.style.top = '';
        wrapper.style.right = '';
        wrapper.style.bottom = '';
        wrapper.style.width = '100%';
        wrapper.style.height = '';
        wrapper.style.aspectRatio = '16 / 9';
        wrapper.style.zIndex = '';
        wrapper.style.borderRadius = '8px';
        wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';

        const header = document.getElementById('radio-popout-header');
        if (header) header.style.display = 'none';
        const resizer = document.getElementById('radio-popout-resizer');
        if (resizer) resizer.style.display = 'none';
    }
};

window.toggleRadioVideo = function() {
    if (window.isRadioPoppedOut) {
        // If popped out, switch to inline
        window.isRadioPoppedOut = false;
        window.isRadioVideoVisible = true;
    } else {
        // Toggle visibility
        window.isRadioVideoVisible = !window.isRadioVideoVisible;
    }

    if (isRadioDJ) {
        radioState.video_active = window.isRadioVideoVisible;
        if (window.syncRadioToServer) syncRadioToServer();
    }

    window.applyRadioVideoState();
    if (window.updateRadioUI) updateRadioUI();
};

window.toggleRadioPopout = function(show) {
    if (show === undefined) {
        show = !window.isRadioPoppedOut;
    }

    if (show) {
        window.isRadioVideoVisible = true;
        window.isRadioPoppedOut = true;
    } else {
        // Dock back to sidebar
        window.isRadioPoppedOut = false;
        window.isRadioVideoVisible = true;
    }

    if (isRadioDJ) {
        radioState.video_active = window.isRadioVideoVisible;
        if (window.syncRadioToServer) syncRadioToServer();
    }

    window.applyRadioVideoState();
    if (window.updateRadioUI) updateRadioUI();
};

window.closeRadioPopout = function() {
    window.isRadioPoppedOut = false;
    window.isRadioVideoVisible = false;

    if (isRadioDJ) {
        radioState.video_active = false;
        if (window.syncRadioToServer) syncRadioToServer();
    }

    window.applyRadioVideoState();
    if (window.updateRadioUI) updateRadioUI();
};

let popoutDragInitialized = false;
window.initPopoutDragAndResize = function() {
    if (popoutDragInitialized) return;
    popoutDragInitialized = true;

    const wrapper = document.getElementById('radio-video-wrapper');
    const header = document.getElementById('radio-popout-header');
    const resizer = document.getElementById('radio-popout-resizer');
    if (!wrapper || !header || !resizer) return;

    // --- DRAG LOGIC ---
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', function(e) {
        if (e.target.closest('button')) return; // ignore clicks on buttons
        isDragging = true;
        const rect = wrapper.getBoundingClientRect();
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        wrapper.style.left = startLeft + 'px';
        wrapper.style.top = startTop + 'px';
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';

        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        e.preventDefault();
    });

    function onDragMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        const maxLeft = window.innerWidth - wrapper.offsetWidth - 10;
        const maxTop = window.innerHeight - wrapper.offsetHeight - 10;
        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(10, Math.min(newTop, maxTop));

        wrapper.style.left = newLeft + 'px';
        wrapper.style.top = newTop + 'px';
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        localStorage.setItem('lsa_popout_pos', JSON.stringify({
            left: parseInt(wrapper.style.left, 10),
            top: parseInt(wrapper.style.top, 10)
        }));
    }

    // Double-click header to center and resize to 640x400
    header.addEventListener('dblclick', function(e) {
        if (e.target.closest('button')) return;
        wrapper.style.width = '640px';
        wrapper.style.height = '400px';
        wrapper.style.left = Math.max(20, (window.innerWidth - 640) / 2) + 'px';
        wrapper.style.top = Math.max(20, (window.innerHeight - 400) / 2) + 'px';
        localStorage.setItem('lsa_popout_size', JSON.stringify({ width: 640, height: 400 }));
        localStorage.setItem('lsa_popout_pos', JSON.stringify({
            left: parseInt(wrapper.style.left, 10),
            top: parseInt(wrapper.style.top, 10)
        }));
    });

    // --- RESIZE LOGIC ---
    let isResizing = false;
    let resizeStartX = 0, resizeStartY = 0;
    let startWidth = 0, startHeight = 0;

    resizer.addEventListener('mousedown', function(e) {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        startWidth = wrapper.offsetWidth;
        startHeight = wrapper.offsetHeight;

        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('mouseup', onResizeEnd);
        e.preventDefault();
        e.stopPropagation();
    });

    function onResizeMove(e) {
        if (!isResizing) return;
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        let newW = startWidth + dx;
        let newH = startHeight + dy;

        newW = Math.max(260, Math.min(newW, window.innerWidth - 30));
        newH = Math.max(180, Math.min(newH, window.innerHeight - 30));

        wrapper.style.width = newW + 'px';
        wrapper.style.height = newH + 'px';
    }

    function onResizeEnd() {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('mouseup', onResizeEnd);
        localStorage.setItem('lsa_popout_size', JSON.stringify({
            width: wrapper.offsetWidth,
            height: wrapper.offsetHeight
        }));
    }
};

// ==========================================
// Local Playlist feature for LSA MUSIC
// ==========================================
window.getLocalPlaylist = function() {
    try {
        return JSON.parse(localStorage.getItem('lsa_music_history') || '[]');
    } catch (e) {
        return [];
    }
}

window.syncQueueToLocalPlaylist = function(queue) {
    if (!queue || !Array.isArray(queue)) return;
    for (let i = queue.length - 1; i >= 0; i--) {
        const item = queue[i];
        if (item.youtube_id && item.title && window.saveToLocalPlaylist) {
            window.saveToLocalPlaylist(item.youtube_id, item.title, true);
        }
    }
}

window.saveToLocalPlaylist = function(videoId, title, skipReorder = false) {
    let list = window.getLocalPlaylist();
    const existingIndex = list.findIndex(item => item.id === videoId);
    if (existingIndex !== -1) {
        if (skipReorder) return;
        list.splice(existingIndex, 1);
    }
    list.unshift({ id: videoId, title: title, time: Date.now() });
    if (list.length > 10) list = list.slice(0, 10);
    localStorage.setItem('lsa_music_history', JSON.stringify(list));
    if (window.renderLocalPlaylist) window.renderLocalPlaylist();
}

window.renderLocalPlaylist = function() {
    const container = document.getElementById('radio-local-playlist');
    if (!container) return;
    const list = window.getLocalPlaylist();
    if (list.length === 0) {
        container.innerHTML = `<div style="font-size: 10px; color: rgba(255,255,255,0.5); text-align: center; padding: 4px;">Chưa có bài hát nào được lưu.</div>`;
        return;
    }
    let html = '';
    if (list.length > 1) {
        html += `
            <div style="display: flex; justify-content: center; padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 4px;">
                <button onclick="addAllLocalToQueue()" style="background: rgba(99,102,241,0.5); border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 600; width: 100%; transition: background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.8)'" onmouseout="this.style.background='rgba(99,102,241,0.5)'">
                    Thêm tất cả vào hàng chờ
                </button>
            </div>
        `;
    }
    list.forEach(item => {
        const safeTitle = (item.title || 'Unknown').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                <div style="font-size: 10px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1;" onclick="addLocalToQueue('${item.id}', '${safeTitle}')">${item.title}</div>
                <button onclick="removeLocalPlaylist('${item.id}', event)" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 0 4px; display: flex; align-items: center;" title="Xóa">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.toggleLocalPlaylist = function() {
    const container = document.getElementById('radio-local-playlist');
    const dnaContainer = document.getElementById('radio-dna-suggestions');
    if (!container) return;
    if (container.style.display === 'none' || container.style.display === '') {
        if (dnaContainer) dnaContainer.style.display = 'none';
        window.renderLocalPlaylist();
        container.style.display = 'flex';
    } else {
        container.style.display = 'none';
    }
}

window.addLocalToQueue = function(videoId, title) {
    if (!isRadioDJ && (!radioState || !radioState.allow_requests)) {
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? 'Không có quyền thêm nhạc lúc này!' : '権限がありません！', 'error');
        return;
    }
    if (window.socket) {
        window.socket.emit('queue_add', { youtube_id: videoId, title: title });
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? 'Đã thêm vào hàng chờ!' : 'キューに追加されました！', 'success');
        const container = document.getElementById('radio-local-playlist');
        if (container) container.style.display = 'none';
        
        // Cập nhật lại playlist để đưa bài hát này lên đầu
        window.saveToLocalPlaylist(videoId, title);
    }
}

window.toggleDNASuggestions = function() {
    const container = document.getElementById('radio-dna-suggestions');
    const localContainer = document.getElementById('radio-local-playlist');
    if (!container) return;
    if (container.style.display === 'none' || container.style.display === '') {
        if (localContainer) localContainer.style.display = 'none';
        container.style.display = 'flex';
        container.innerHTML = `<div style="font-size: 10px; color: rgba(255,255,255,0.7); text-align: center; padding: 10px;">Đang phân tích DNA âm nhạc...</div>`;
        window.fetchDNASuggestions();
    } else {
        container.style.display = 'none';
    }
}

window.fetchDNASuggestions = function() {
    let keyword = "lofi chill việt nam";
    let vidId = "";
    
    // Prioritize currently playing track
    if (window.radioState && window.radioState.youtube_id && window.radioState.youtube_id !== 'playlist' && window.radioState.is_playing) {
        vidId = window.radioState.youtube_id;
        const trackNameEl = document.getElementById('radio-track-name');
        keyword = trackNameEl ? trackNameEl.innerText : "";
    } else {
        // Fallback to local playlist
        const list = window.getLocalPlaylist();
        if (list.length > 0) {
            const index = 0; // Most recently added
            const title = list[index].title || "";
            vidId = list[index].youtube_id || list[index].id || "";
            keyword = title;
        }
    }
    
    // Clean keyword for UI and fallback query
    keyword = keyword.replace(/\(Official.*?\)/gi, '').replace(/\[.*?\]/g, '').replace(/official.*(?:video|audio)/gi, '').split('-')[0].trim();
    if (keyword.length < 3 && vidId) keyword = "Video";
    if (keyword.length < 3) keyword = "lofi chill việt nam";

    const qStr = encodeURIComponent(keyword + " mix");
    let fetchUrl = `/api/music_dna?q=${qStr}`;
    if (vidId && vidId !== 'playlist' && vidId !== 'null') {
        fetchUrl += `&vid=${vidId}`;
    }
    fetchUrl += `&_t=${Date.now()}`;
        
    fetch(fetchUrl)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('radio-dna-suggestions');
            if (!container) return;
            if (data.results && data.results.length > 0) {
                let html = `
                    <div style="font-size: 10px; font-weight: 600; color: #818cf8; text-align: center; padding: 2px 0 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 4px;">
                        Gợi ý từ: ${keyword.substring(0,30)}${keyword.length > 30 ? '...' : ''}
                    </div>
                `;
                data.results.forEach(item => {
                    const safeTitle = (item.title || 'Unknown').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'" onclick="addDNAToQueue('${item.id}', '${safeTitle}')">
                            <div style="font-size: 10px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</div>
                        </div>
                    `;
                });
                container.innerHTML = html;
            } else {
                container.innerHTML = `<div style="font-size: 10px; color: rgba(255,255,255,0.5); text-align: center; padding: 10px;">Không tìm thấy gợi ý nào.</div>`;
            }
        })
        .catch(err => {
            console.error(err);
            const container = document.getElementById('radio-dna-suggestions');
            if (container) container.innerHTML = `<div style="font-size: 10px; color: #ff6b6b; text-align: center; padding: 10px;">Lỗi khi tải gợi ý.</div>`;
        });
}

window.addDNAToQueue = function(videoId, title) {
    if (!isRadioDJ && (!radioState || !radioState.allow_requests)) {
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? 'Không có quyền thêm nhạc lúc này!' : '権限がありません！', 'error');
        return;
    }
    if (window.socket) {
        window.socket.emit('queue_add', { youtube_id: videoId, title: title });
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? 'Đã thêm gợi ý vào hàng chờ!' : 'キューに追加されました！', 'success');
        const container = document.getElementById('radio-dna-suggestions');
        if (container) container.style.display = 'none';
        
        window.saveToLocalPlaylist(videoId, title);
    }
}

window.addAllLocalToQueue = function() {
    if (!isRadioDJ && (!radioState || !radioState.allow_requests)) {
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? 'Không có quyền thêm nhạc lúc này!' : '権限がありません！', 'error');
        return;
    }
    const list = window.getLocalPlaylist();
    if (list.length === 0) return;
    
    // Thêm ngược từ dưới lên để giữ đúng thứ tự playlist
    if (window.socket) {
        for (let i = list.length - 1; i >= 0; i--) {
            window.socket.emit('queue_add', { youtube_id: list[i].id, title: list[i].title });
        }
        if (window.showToast) window.showToast(CURRENT_LANG === 'vi' ? `Đã thêm ${list.length} bài vào hàng chờ!` : `${list.length}曲をキューに追加しました！`, 'success');
        const container = document.getElementById('radio-local-playlist');
        if (container) container.style.display = 'none';
    }
}

window.removeLocalPlaylist = function(videoId, e) {
    if (e) e.stopPropagation();
    let list = window.getLocalPlaylist();
    list = list.filter(item => item.id !== videoId);
    localStorage.setItem('lsa_music_history', JSON.stringify(list));
    window.renderLocalPlaylist();
};

// ===================== TIME TRACKER =====================
let trackerIntervals = {};

function startTracker(index) {
    const startTime = Date.now();
    localStorage.setItem(`tracker_start_${index}`, startTime);
    localStorage.removeItem(`tracker_end_${index}`);
    
    const startBtn = document.getElementById(`btn_start_${index}`);
    const endBtn = document.getElementById(`btn_end_${index}`);
    if (startBtn) startBtn.disabled = true;
    if (endBtn) endBtn.disabled = false;
    
    updateTrackerDisplay(index);
    trackerIntervals[index] = setInterval(() => updateTrackerDisplay(index), 1000);
}

function updateTrackerDisplay(index) {
    const startTime = localStorage.getItem(`tracker_start_${index}`);
    if (!startTime) return;
    
    const diff = Date.now() - parseInt(startTime);
    let h = Math.floor(diff / 3600000).toString().padStart(2, '0');
    let m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    let s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    
    const display = document.getElementById(`time_display_${index}`);
    if(display) display.textContent = `${h}:${m}:${s}`;
    
    updateCardBadge(index, true, h, m);
}

function endTracker(index) {
    const startTime = localStorage.getItem(`tracker_start_${index}`);
    if (!startTime) return;
    
    const endTime = Date.now();
    localStorage.setItem(`tracker_end_${index}`, endTime);
    
    clearInterval(trackerIntervals[index]);
    const startBtn = document.getElementById(`btn_start_${index}`);
    const endBtn = document.getElementById(`btn_end_${index}`);
    if (startBtn) startBtn.disabled = false;
    if (endBtn) endBtn.disabled = true;
    
    updateCardBadge(index, false);
}

function toggleManualTime(index) {
    const cb = document.getElementById(`manual_time_cb_${index}`);
    const autoControls = document.getElementById(`auto_controls_${index}`);
    const manualControls = document.getElementById(`manual_controls_${index}`);
    if (cb && cb.checked) {
        if(autoControls) autoControls.style.display = 'none';
        if(manualControls) {
            manualControls.style.display = 'flex';
            manualControls.style.alignItems = 'center';
            manualControls.style.gap = '8px';
            
            if (typeof flatpickr !== 'undefined') {
                const now = new Date();
                const sEl = document.getElementById(`manual_start_${index}`);
                const eEl = document.getElementById(`manual_end_${index}`);
                if (sEl && !sEl._flatpickr) {
                    flatpickr(`#manual_start_${index}`, {
                        enableTime: true,
                        time_24hr: true,
                        dateFormat: "Y-m-d H:i",
                        defaultDate: now,
                        onChange: function() { calcManualTime(index, 'start'); }
                    });
                }
                if (eEl && !eEl._flatpickr) {
                    flatpickr(`#manual_end_${index}`, {
                        enableTime: true,
                        time_24hr: true,
                        dateFormat: "Y-m-d H:i",
                        defaultDate: now,
                        onChange: function() { calcManualTime(index, 'end'); }
                    });
                }
            }
        }
    } else {
        if(autoControls) autoControls.style.display = 'flex';
        if(manualControls) manualControls.style.display = 'none';
    }
}

function calcManualTime(index, field) {
    const startEl = document.getElementById(`manual_start_${index}`);
    const endEl = document.getElementById(`manual_end_${index}`);
    const durEl = document.getElementById(`manual_duration_${index}`);
    
    if (!startEl || !startEl.value) return; 
    
    let sDate = new Date(startEl.value.replace(' ', 'T'));
    if (isNaN(sDate.getTime())) return;
    
    if (field === 'dur' || field === 'start') {
        if (durEl && durEl.value && parseFloat(durEl.value) > 0) {
            let durHours = parseFloat(durEl.value);
            let eDate = new Date(sDate.getTime() + durHours * 3600000);
            
            if (endEl) {
                if (endEl._flatpickr) {
                    endEl._flatpickr.setDate(eDate);
                } else {
                    let tzOffset = eDate.getTimezoneOffset() * 60000;
                    endEl.value = (new Date(eDate - tzOffset)).toISOString().slice(0, 16).replace('T', ' ');
                }
                endEl.disabled = true;
            }
        } else if (field === 'dur' && durEl && !durEl.value) {
            if (endEl) {
                endEl.disabled = false;
                if (endEl._flatpickr) endEl._flatpickr.clear();
                else endEl.value = ''; 
            }
        } else if (field === 'start') {
            if (durEl && durEl.value) {
                let durHours = parseFloat(durEl.value);
                let eDate = new Date(sDate.getTime() + durHours * 3600000);
                
                if (endEl) {
                    if (endEl._flatpickr) {
                        endEl._flatpickr.setDate(eDate);
                    } else {
                        let tzOffset = eDate.getTimezoneOffset() * 60000;
                        endEl.value = (new Date(eDate - tzOffset)).toISOString().slice(0, 16).replace('T', ' ');
                    }
                }
            } else if (endEl && endEl.value) {
                let eDate = new Date(endEl.value.replace(' ', 'T'));
                let diffHours = (eDate - sDate) / 3600000;
                if (diffHours < 0) diffHours += 24;
                if (durEl) durEl.value = parseFloat(diffHours.toFixed(2));
            }
        }
    }
    
    if (field === 'end') {
        if (endEl && endEl.value) {
            let eDate = new Date(endEl.value.replace(' ', 'T'));
            let diffHours = (eDate - sDate) / 3600000;
            if (diffHours < 0) diffHours += 24;
            if (durEl) durEl.value = parseFloat(diffHours.toFixed(2));
            endEl.disabled = false;
        } else if (durEl) {
            durEl.value = '';
        }
    }
}

function updateCardBadge(index, active, h='00', m='00') {
    const trackerBox = document.getElementById(`tracker_${index}`);
    if (!trackerBox) return;
    const tpKey = trackerBox.getAttribute('data-tp-key');
    document.querySelectorAll(`.progress-card[data-tp-key="${tpKey}"]`).forEach(card => {
        let badge = card.querySelector('.tracker-badge');
        if (!active) {
            if (badge) badge.style.display = 'none';
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'tracker-badge';
            badge.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; background: rgba(46, 213, 115, 0.2); color: #2ed573; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-family: monospace; font-weight: bold;';
            const tagsDiv = card.querySelector('.card-tags');
            if (tagsDiv) {
                tagsDiv.appendChild(badge);
            } else {
                card.prepend(badge);
            }
        }
        badge.style.display = 'inline-flex';
        badge.innerHTML = `<i class="far fa-clock" style="margin-right: 4px;"></i>${h}:${m}`;
    });
}

async function saveTracker(index, tpKey) {
    const btnSave = document.getElementById(`btn_save_${index}`);
    if (btnSave && btnSave.disabled) return;

    const isManual = document.getElementById(`manual_time_cb_${index}`)?.checked;
    
    let durationHours = 0;
    let finalStartTime = '';
    let finalEndTime = '';
    let finalStartDate = '';
    let finalEndDate = '';
    
    if (isManual) {
        const st = document.getElementById(`manual_start_${index}`)?.value;
        const et = document.getElementById(`manual_end_${index}`)?.value;
        const dur = document.getElementById(`manual_duration_${index}`)?.value;
        
        if (!st && !et && !dur) {
            showToast((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Vui lòng nhập Giờ Bắt Đầu & Kết Thúc HOẶC nhập số phút!' : '開始と終了の時間を入力するか、分を入力してください！', 'error');
            return;
        }

        let formatTimeOnly = (date) => date.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
        let formatDateOnly = (date) => date.toLocaleDateString('en-US'); // MM/DD/YYYY

        if (dur) {
            let durHours = parseFloat(dur);
            durationMinutes = Math.round(durHours * 60);
            let sD = st ? new Date(st.replace(' ', 'T')) : new Date();
            let eD = et ? new Date(et.replace(' ', 'T')) : new Date(sD.getTime() + durationMinutes * 60000);
            finalStartTime = formatTimeOnly(sD);
            finalEndTime = formatTimeOnly(eD);
            finalStartDate = formatDateOnly(sD);
            finalEndDate = formatDateOnly(eD);
        } else if (st && et) {
            let sDate = new Date(st.replace(' ', 'T'));
            let eDate = new Date(et.replace(' ', 'T'));
            if (eDate < sDate) {
                eDate.setDate(eDate.getDate() + 1);
            }
            let diffMs = Math.max(0, eDate - sDate);
            durationMinutes = Math.round(diffMs / 60000);
            if (diffMs > 0 && durationMinutes === 0) durationMinutes = 1;
            finalStartTime = formatTimeOnly(sDate);
            finalEndTime = formatTimeOnly(eDate);
            finalStartDate = formatDateOnly(sDate);
            finalEndDate = formatDateOnly(eDate);
        } else {
            showToast((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Vui lòng nhập đủ thời gian!' : '時間を入力してください！', 'error');
            return;
        }
    } else {
        const startTimeStr = localStorage.getItem(`tracker_start_${index}`);
        const endTimeStr = localStorage.getItem(`tracker_end_${index}`);
        if (!startTimeStr || !endTimeStr) {
            showToast((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Vui lòng bắt đầu và kết thúc trước khi lưu!' : '保存する前に開始と終了を行ってください！', 'error');
            return;
        }
        
        const startTime = parseInt(startTimeStr);
        const endTime = parseInt(endTimeStr);
        let diffMs = Math.max(0, endTime - startTime);
        durationMinutes = Math.round(diffMs / 60000);
        if (diffMs > 0 && durationMinutes === 0) {
            durationMinutes = 1;
        }
        
        let formatTimeOnly = (date) => date.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
        let formatDateOnly = (date) => date.toLocaleDateString('en-US');
        
        let sD = new Date(startTime);
        let eD = new Date(endTime);
        finalStartTime = formatTimeOnly(sD);
        finalEndTime = formatTimeOnly(eD);
        finalStartDate = formatDateOnly(sD);
        finalEndDate = formatDateOnly(eD);
    }
    
    // Check if the log date is today in manual tracker
    if (isManual && finalStartDate) {
        const today = new Date();
        const todayFormatted = today.toLocaleDateString('en-US'); // MM/DD/YYYY
        if (finalStartDate !== todayFormatted) {
            showConfirmDateModal(finalStartDate, todayFormatted, () => {
                executeSaveTracker(index, tpKey, durationMinutes, finalStartTime, finalEndTime, finalStartDate, finalEndDate, isManual);
            });
            return;
        }
    }

    executeSaveTracker(index, tpKey, durationMinutes, finalStartTime, finalEndTime, finalStartDate, finalEndDate, isManual);
}

function parseDurationToMinutes(val) {
    if (val === null || val === undefined) return 0;
    const s = String(val).trim().toLowerCase();
    if (!s) return 0;
    const hMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|giờ|時間)/);
    const mMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:p|m|phút|分)/);
    if (hMatch || mMatch) {
        const h = hMatch ? parseFloat(hMatch[1]) : 0;
        const m = mMatch ? parseFloat(mMatch[1]) : 0;
        return Math.round(h * 60 + m);
    }
    const num = parseFloat(s);
    if (!isNaN(num)) {
        return Math.round(num * 60);
    }
    return 0;
}

function formatMinutesToDisplay(minutes, isVi = true) {
    const mins = Math.max(0, Math.round(minutes || 0));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) {
        return isVi ? `${h}h ${m}p` : `${h}時間${m}分`;
    } else if (h > 0) {
        return isVi ? `${h}h` : `${h}時間`;
    } else {
        return isVi ? `${m}p` : `${m}分`;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderTrackerHistoryList(index, items, totalDuration) {
    const listEl = document.getElementById(`tracker_history_list_${index}`);
    const countEl = document.getElementById(`tracker_history_count_${index}`);
    const totalEl = document.getElementById(`tracker_history_total_${index}`);
    const deleteSessionBtn = document.getElementById(`btn_delete_session_${index}`);
    if (!listEl) return;

    const rawItems = Array.isArray(items) ? items : [];
    // Deduplicate identical items
    const seen = new Set();
    const uniqueItems = [];
    for (const it of rawItems) {
        const sig = `${it.duration}_${it.start_time}_${it.end_time}_${it.note}_${it.start_date}_${it.user}`;
        if (!seen.has(sig)) {
            seen.add(sig);
            uniqueItems.push(it);
        }
    }

    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    
    // Compute total duration with minutes
    let totalMins = 0;
    if (totalDuration !== undefined && totalDuration !== null && totalDuration !== '') {
        totalMins = parseDurationToMinutes(totalDuration);
    } else {
        totalMins = uniqueItems.reduce((acc, it) => acc + parseDurationToMinutes(it.duration), 0);
    }
    const totalDisplay = formatMinutesToDisplay(totalMins, isVi);

    if (totalEl) {
        totalEl.textContent = isVi ? `TỔNG: ${totalDisplay}` : `合計: ${totalDisplay}`;
        totalEl.style.display = uniqueItems.length ? 'inline-block' : 'none';
    }

    if (countEl) countEl.textContent = uniqueItems.length ? `${uniqueItems.length} LOG` : '';
    if (deleteSessionBtn) deleteSessionBtn.style.display = uniqueItems.length ? 'inline-flex' : 'none';

    if (!uniqueItems.length) {
        listEl.innerHTML = `<div class="tracker-history-empty">${isVi ? 'Chưa có lượt bấm giờ nào' : '履歴はありません'}</div>`;
        return;
    }

    listEl.innerHTML = uniqueItems.slice().reverse().map(item => {
        const rawNote = (item.note || '').trim();
        const hasNote = rawNote && rawNote !== 'Không có mô tả' && rawNote !== '備考なし';
        const noteHtml = hasNote 
            ? `<span class="tracker-history-note" style="font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(rawNote)}">${escapeHtml(rawNote)}</span>` 
            : '';
        const timeStr = (item.start_time && item.end_time) 
            ? `${item.start_time} - ${item.end_time}` 
            : (item.time || '');
        const dateStr = item.start_date || item.date || '';
        const itemMins = parseDurationToMinutes(item.duration);
        const durDisplay = formatMinutesToDisplay(itemMins, isVi);
        const user = item.user || '';
        const rIdx = item.row_index || 0;
        return `
            <div class="tracker-history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
                <div class="tracker-history-item-left" style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; max-width: 65%;">
                    ${noteHtml}
                    <span class="tracker-history-time" style="font-size: 0.75rem; color: var(--text-3);">${escapeHtml(timeStr)}${dateStr ? ' • ' + escapeHtml(dateStr) : ''}${user ? ' • ' + escapeHtml(user) : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="tracker-history-dur" style="font-family: monospace; font-weight: 700; color: #3b82f6; font-size: 0.85rem; background: rgba(59, 130, 246, 0.12); padding: 2px 7px; border-radius: 4px;">${escapeHtml(durDisplay)}</span>
                    <button type="button" class="btn-delete-tracker-item" onclick="deleteTrackerLogItem('${index}', ${rIdx}, '${escapeHtml(item.task_name || '')}')" style="background: none; border: none; color: var(--text-3); cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; transition: all 0.2s;" onmouseover="this.style.color='#ef4444'; this.style.background='rgba(239, 68, 68, 0.1)';" onmouseout="this.style.color='var(--text-3)'; this.style.background='none';" title="${isVi ? 'Xóa log này' : 'このログを削除'}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadTrackerHistory(index, tpKey) {
    const listEl = document.getElementById(`tracker_history_list_${index}`);
    if (!listEl) return;

    const trackerBox = document.getElementById(`tracker_${index}`);
    const sessionCode = trackerBox?.getAttribute('data-session') || '';

    try {
        const res = await fetch(`/api/tracker_history?session=${encodeURIComponent(sessionCode)}&task_name=${encodeURIComponent(tpKey || '')}`);
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.history)) {
            renderTrackerHistoryList(index, data.history, data.total_duration);
        }
    } catch (e) {
        console.error('Failed to load tracker history:', e);
    }
}

async function executeSaveTracker(index, tpKey, durationMinutes, finalStartTime, finalEndTime, finalStartDate, finalEndDate, isManual) {
    const trackerBox = document.getElementById(`tracker_${index}`);
    const sessionCode = trackerBox?.getAttribute('data-session') || '';
    const note = document.getElementById(`tracker_note_${index}`)?.value || '';
    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    const formattedDuration = formatMinutesToDisplay(durationMinutes, isVi);
    
    const payload = {
        action: 'log_member_time',
        task_name: tpKey,
        session: sessionCode,
        duration: formattedDuration,
        duration_minutes: durationMinutes,
        start_time: finalStartTime,
        end_time: finalEndTime,
        start_date: finalStartDate,
        end_date: finalEndDate,
        note: note
    };
    
    const btn = document.getElementById(`btn_save_${index}`);
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '...';
        btn.disabled = true;
    }
    
    try {
        const res = await fetch('/api/log_member_time', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast((typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Đã lưu thời gian!' : '時間を保存しました！', 'success');
            
            // Render history immediately returned from server
            if (Array.isArray(data.history)) {
                renderTrackerHistoryList(index, data.history, data.total_duration);
            } else {
                loadTrackerHistory(index, tpKey);
            }

            // Reset inputs
            if (!isManual) {
                localStorage.removeItem(`tracker_start_${index}`);
                localStorage.removeItem(`tracker_end_${index}`);
                const td = document.getElementById(`time_display_${index}`);
                if (td) td.textContent = '00:00:00';
                const sBtn = document.getElementById(`btn_start_${index}`);
                const eBtn = document.getElementById(`btn_end_${index}`);
                if (sBtn) sBtn.disabled = false;
                if (eBtn) eBtn.disabled = true;
                updateCardBadge(index, false);
            } else {
                const sIn = document.getElementById(`manual_start_${index}`);
                const eIn = document.getElementById(`manual_end_${index}`);
                const dIn = document.getElementById(`manual_duration_${index}`);
                if (sIn) sIn.value = '';
                if (eIn) { eIn.value = ''; eIn.disabled = false; }
                if (dIn) dIn.value = '';
            }
            const noteEl = document.getElementById(`tracker_note_${index}`);
            if (noteEl) noteEl.value = '';
        } else {
            showToast('Error: ' + (data.message || 'Server error'), 'error');
        }
    } catch (e) {
        console.error('Tracker save error:', e);
        showToast('Lỗi kết nối!', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }
}

async function deleteTrackerSession(index, tpKey) {
    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    const trackerBox = document.getElementById(`tracker_${index}`);
    const sessionCode = trackerBox?.getAttribute('data-session') || '';
    
    if (!confirm(isVi ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử bấm giờ này?' : 'このタスクのすべての計測履歴を削除してもよろしいですか？')) {
        return;
    }

    const btn = document.getElementById(`btn_delete_session_${index}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    }

    try {
        const res = await fetch('/api/delete_tracker_session', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ session: sessionCode, task_name: tpKey })
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast(isVi ? 'Đã xóa session thành công!' : 'セッションを削除しました！', 'success');
            renderTrackerHistoryList(index, [], 0);
        } else {
            showToast('Error: ' + (data.message || 'Lỗi khi xóa session'), 'error');
        }
    } catch (e) {
        showToast(isVi ? 'Lỗi kết nối khi xóa session!' : '接続エラー！', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-trash-alt" style="margin-right: 3px;"></i>${isVi ? 'Xóa session' : 'セッション削除'}`;
        }
    }
}

async function deleteTrackerLogItem(index, rowIndex, tpKey) {
    const isVi = typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi';
    const trackerBox = document.getElementById(`tracker_${index}`);
    const sessionCode = trackerBox?.getAttribute('data-session') || '';

    if (!confirm(isVi ? 'Bạn có chắc chắn muốn xóa lượt bấm giờ này?' : 'この計測履歴を削除してもよろしいですか？')) {
        return;
    }

    try {
        const res = await fetch('/api/delete_tracker_log', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ row_index: rowIndex, session: sessionCode, task_name: tpKey })
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast(isVi ? 'Đã xóa log thành công!' : 'ログを削除しました！', 'success');
            renderTrackerHistoryList(index, data.history || [], data.total_duration);
        } else {
            showToast('Error: ' + (data.message || 'Lỗi khi xóa log'), 'error');
        }
    } catch (e) {
        showToast(isVi ? 'Lỗi kết nối!' : '接続エラー！', 'error');
    }
}

function addTrackerHistoryItem(index, tpKey, duration, note, startTime, endTime, startDate) {
    loadTrackerHistory(index, tpKey);
}

// Khôi phục tracker đang chạy khi load lại trang
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.time-tracker-box').forEach(box => {
        const index = box.id.replace('tracker_', '');
        const tpKey = box.getAttribute('data-tp-key');
        loadTrackerHistory(index, tpKey);
        const startTime = localStorage.getItem(`tracker_start_${index}`);
        const endTime = localStorage.getItem(`tracker_end_${index}`);
        
        if (startTime && !endTime) {
            const sBtn = document.getElementById(`btn_start_${index}`);
            const eBtn = document.getElementById(`btn_end_${index}`);
            if (sBtn) sBtn.disabled = true;
            if (eBtn) eBtn.disabled = false;
            updateTrackerDisplay(index);
            trackerIntervals[index] = setInterval(() => updateTrackerDisplay(index), 1000);
        } else if (startTime && endTime) {
            const sBtn = document.getElementById(`btn_start_${index}`);
            const eBtn = document.getElementById(`btn_end_${index}`);
            if (sBtn) sBtn.disabled = false;
            if (eBtn) eBtn.disabled = true;
            const diff = parseInt(endTime) - parseInt(startTime);
            let h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            let m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            let s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            const td = document.getElementById(`time_display_${index}`);
            if (td) td.textContent = `${h}:${m}:${s}`;
        }
    });

    // Store original DOM order for default sort
    document.querySelectorAll('.kanban-cards').forEach(container => {
        Array.from(container.children).forEach((child, idx) => {
            child.dataset.defaultOrder = idx;
        });
    });
});

// --- Kanban Search & Sort Logic ---
window.filterKanban = function(input) {
    const clearBtn = input.nextElementSibling;
    if (clearBtn && clearBtn.classList.contains('clear-search')) {
        clearBtn.style.display = input.value ? 'block' : 'none';
    }
    const tabPane = input.closest('.tab-content');
    if (!tabPane) return;
    const query = input.value.toLowerCase();
    const cards = tabPane.querySelectorAll('.progress-card');
    
    cards.forEach(card => {
        const title = (card.querySelector('.card-title')?.textContent || '').toLowerCase();
        const worker = (card.querySelector('.worker-name')?.textContent || '').toLowerCase();
        const tag = (card.querySelector('.tag')?.textContent || '').toLowerCase();
        const qc = (card.querySelector('.qc-badge')?.textContent || '').toLowerCase();
        
        if (title.includes(query) || worker.includes(query) || tag.includes(query) || qc.includes(query)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
    
    updateKanbanCounts(tabPane);
    updateKanbanGroups(tabPane);
};

window.sortKanban = function(select) {
    const tabPane = select.closest('.tab-content');
    if (!tabPane) return;
    const sortValue = select.value;
    const columns = tabPane.querySelectorAll('.kanban-column');
    
    columns.forEach(col => {
        const container = col.querySelector('.kanban-cards');
        const children = Array.from(container.children);
        const headers = children.filter(c => c.classList.contains('job-group-header'));
        const cards = children.filter(c => c.classList.contains('progress-card'));
        
        // Group cards by their closest preceding header
        const groups = new Map();
        headers.forEach(h => groups.set(h, []));
        const unassigned = [];
        
        let currentHeader = null;
        children.forEach(c => {
            if (c.classList.contains('job-group-header')) {
                currentHeader = c;
            } else if (c.classList.contains('progress-card')) {
                if (currentHeader) {
                    groups.get(currentHeader).push(c);
                } else {
                    unassigned.push(c);
                }
            }
        });
        
        const sortCards = (cardArray) => {
            if (sortValue === 'default' || sortValue === 'job_asc') {
                cardArray.sort((a, b) => parseInt(a.dataset.defaultOrder) - parseInt(b.dataset.defaultOrder));
            } else {
                cardArray.sort((a, b) => {
                    if (sortValue === 'name_asc' || sortValue === 'name_desc') {
                        const nameA = (a.querySelector('.card-title')?.textContent || '').trim();
                        const nameB = (b.querySelector('.card-title')?.textContent || '').trim();
                        return sortValue === 'name_asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                    }
                    if (sortValue === 'date_asc' || sortValue === 'date_desc') {
                        const dateTextA = a.querySelector('.card-dates span')?.textContent || '';
                        const dateTextB = b.querySelector('.card-dates span')?.textContent || '';
                        const extractDate = (text) => {
                            const matches = text.match(/\d{2}\/\d{2}\/\d{4}/g);
                            const dateStr = matches && matches.length > 1 ? matches[1] : (matches ? matches[0] : null);
                            return dateStr ? new Date(dateStr).getTime() : (sortValue === 'date_asc' ? Infinity : -Infinity);
                        };
                        const dA = extractDate(dateTextA);
                        const dB = extractDate(dateTextB);
                        return sortValue === 'date_asc' ? dA - dB : dB - dA;
                    }
                    return 0;
                });
            }
        };

        container.innerHTML = '';
        
        if (unassigned.length > 0) {
            sortCards(unassigned);
            unassigned.forEach(c => container.appendChild(c));
        }
        
        headers.forEach(h => {
            container.appendChild(h);
            const cardArray = groups.get(h);
            sortCards(cardArray);
            cardArray.forEach(c => container.appendChild(c));
        });
    });
    
    updateKanbanGroups(tabPane);
};

function updateKanbanCounts(tabPane) {
    const columns = tabPane.querySelectorAll('.kanban-column');
    columns.forEach(col => {
        const visibleCards = Array.from(col.querySelectorAll('.progress-card')).filter(c => c.style.display !== 'none').length;
        const countSpan = col.querySelector('.kanban-col-count');
        if (countSpan) countSpan.textContent = visibleCards;
    });
}

function moveCardToColumn(card, targetCol) {
    const tagText = (card.querySelector('.tag')?.textContent || '').trim();
    let jobType = 'Prep';
    if (tagText.includes('写植/ﾚﾀｯﾁ') || tagText.includes('写植/レタッチ') || tagText.includes('Lettering/Retouch')) jobType = 'Lettering/Retouch';
    else if (tagText.includes('修正') || tagText.includes('Correction') || tagText.includes('Lettering QC')) jobType = 'Lettering QC';
    else if (tagText.includes('写植') || tagText.includes('Lettering')) jobType = 'Lettering';
    else if (tagText.includes('レタッチ') || tagText.includes('ﾚﾀｯﾁ') || tagText.includes('Retouch')) jobType = 'Retouch';
    else if (tagText.includes('Prep')) jobType = 'Prep';

    const jobOrder = ['Prep', 'Lettering', 'Lettering QC', 'Retouch', 'Lettering/Retouch'];
    
    let header = Array.from(targetCol.querySelectorAll('.job-group-header')).find(h => h.textContent.trim() === jobType);
    
    if (!header) {
        header = document.createElement('div');
        header.className = 'job-group-header';
        header.textContent = jobType;
        
        const headers = Array.from(targetCol.querySelectorAll('.job-group-header'));
        const myIndex = jobOrder.indexOf(jobType);
        let inserted = false;
        for (let h of headers) {
            const hIndex = jobOrder.indexOf(h.textContent.trim());
            if (hIndex > myIndex || hIndex === -1) {
                targetCol.insertBefore(header, h);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            targetCol.appendChild(header);
        }
    }
    
    let nextNode = header.nextElementSibling;
    let lastCardInGroup = header;
    while (nextNode && !nextNode.classList.contains('job-group-header')) {
        lastCardInGroup = nextNode;
        nextNode = nextNode.nextElementSibling;
    }
    
    if (lastCardInGroup.nextSibling) {
        targetCol.insertBefore(card, lastCardInGroup.nextSibling);
    } else {
        targetCol.appendChild(card);
    }
}

function updateKanbanGroups(tab) {
    tab.querySelectorAll('.kanban-column').forEach(col => {
        const container = col.querySelector('.kanban-cards');
        if (!container) return;
        const children = Array.from(container.children);
        const headers = children.filter(c => c.classList.contains('job-group-header'));
        
        headers.forEach(h => {
            let nextNode = h.nextElementSibling;
            let hasVisibleCard = false;
            while (nextNode && !nextNode.classList.contains('job-group-header')) {
                if (nextNode.classList.contains('progress-card') && nextNode.style.display !== 'none') {
                    hasVisibleCard = true;
                    break;
                }
                nextNode = nextNode.nextElementSibling;
            }
            h.style.display = hasVisibleCard ? '' : 'none';
        });
    });
}

window.toggleNotionDropdown = function(e, btn) {
    e.stopPropagation();
    document.querySelectorAll('.notion-dropdown-menu').forEach(menu => {
        if (menu !== btn.querySelector('.notion-dropdown-menu')) {
            menu.style.display = 'none';
        }
    });
    
    const menu = btn.querySelector('.notion-dropdown-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
};

document.addEventListener('click', function(e) {
    if (!e.target.closest('.notion-icon-btn.kanban-sort-btn')) {
        document.querySelectorAll('.notion-dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

window.handleSortOptionClick = function(e, item) {
    e.stopPropagation();
    const type = item.getAttribute('data-type');
    
    if (type === 'group') {
        item.classList.toggle('active');
    } else if (type === 'sort') {
        const isActive = item.classList.contains('active');
        const menu = item.closest('.notion-dropdown-menu');
        menu.querySelectorAll('.notion-dropdown-item[data-type="sort"]').forEach(i => i.classList.remove('active'));
        if (!isActive) {
            item.classList.add('active');
        }
    }
    
    const tabPane = item.closest('.tab-content');
    if (tabPane) {
        applyKanbanSort(tabPane, item.closest('.notion-dropdown-menu'));
    }
};

window.applyKanbanSort = function(tabPane, menu) {
    const isGrouped = menu.querySelector('.notion-dropdown-item[data-type="group"]')?.classList.contains('active');
    const activeSortItem = menu.querySelector('.notion-dropdown-item[data-type="sort"].active');
    const sortValue = activeSortItem ? activeSortItem.getAttribute('data-value') : 'default';
    
    const columns = tabPane.querySelectorAll('.kanban-column');
    columns.forEach(col => {
        const container = col.querySelector('.kanban-cards');
        const children = Array.from(container.children);
        const headers = children.filter(c => c.classList.contains('job-group-header'));
        
        const groups = new Map();
        headers.forEach(h => groups.set(h, []));
        const unassigned = [];
        
        children.forEach(c => {
            if (c.classList.contains('progress-card')) {
                const tagText = (c.querySelector('.tag')?.textContent || '').trim();
                let jobType = 'Prep';
                if (tagText.includes('写植/ﾚﾀｯﾁ') || tagText.includes('写植/レタッチ') || tagText.includes('Lettering/Retouch')) jobType = 'Lettering/Retouch';
                else if (tagText.includes('修正') || tagText.includes('Correction') || tagText.includes('Lettering QC')) jobType = 'Lettering QC';
                else if (tagText.includes('写植') || tagText.includes('Lettering')) jobType = 'Lettering';
                else if (tagText.includes('レタッチ') || tagText.includes('ﾚﾀｯﾁ') || tagText.includes('Retouch')) jobType = 'Retouch';
                else if (tagText.includes('Prep')) jobType = 'Prep';
                
                const matchingHeader = headers.find(h => h.textContent.trim().toUpperCase() === jobType.toUpperCase());
                
                if (matchingHeader) {
                    groups.get(matchingHeader).push(c);
                } else {
                    const fallbackHeader = headers.find(h => h.textContent.trim().toUpperCase() === tagText.toUpperCase());
                    if (fallbackHeader) {
                        groups.get(fallbackHeader).push(c);
                    } else {
                        unassigned.push(c);
                    }
                }
            }
        });
        
        const sortCards = (cardArray) => {
            if (sortValue === 'default') {
                cardArray.sort((a, b) => parseInt(a.dataset.defaultOrder || 0) - parseInt(b.dataset.defaultOrder || 0));
            } else {
                cardArray.sort((a, b) => {
                    if (sortValue === 'name_asc' || sortValue === 'name_desc') {
                        const nameA = (a.querySelector('.card-title')?.textContent || '').trim();
                        const nameB = (b.querySelector('.card-title')?.textContent || '').trim();
                        return sortValue === 'name_asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
                    }
                    if (sortValue === 'date_asc' || sortValue === 'date_desc') {
                        const dateTextA = a.querySelector('.card-dates span')?.textContent || '';
                        const dateTextB = b.querySelector('.card-dates span')?.textContent || '';
                        const extractDate = (text) => {
                            const matches = text.match(/\d{2}\/\d{2}\/\d{4}/g);
                            const dateStr = matches && matches.length > 1 ? matches[1] : (matches ? matches[0] : null);
                            return dateStr ? new Date(dateStr).getTime() : (sortValue === 'date_asc' ? Infinity : -Infinity);
                        };
                        const dA = extractDate(dateTextA);
                        const dB = extractDate(dateTextB);
                        return sortValue === 'date_asc' ? dA - dB : dB - dA;
                    }
                    return 0;
                });
            }
        };

        container.innerHTML = '';
        
        if (isGrouped) {
            if (unassigned.length > 0) {
                sortCards(unassigned);
                unassigned.forEach(c => container.appendChild(c));
            }
            headers.forEach(h => {
                container.appendChild(h);
                const cardArray = groups.get(h);
                sortCards(cardArray);
                cardArray.forEach(c => container.appendChild(c));
            });
        } else {
            headers.forEach(h => {
                h.style.display = 'none';
                container.appendChild(h);
            });
            const allCards = [...unassigned];
            headers.forEach(h => allCards.push(...groups.get(h)));
            sortCards(allCards);
            allCards.forEach(c => container.appendChild(c));
        }
    });
    
    tabPane.querySelectorAll('.kanban-column').forEach(col => {
        const container = col.querySelector('.kanban-cards');
        if (!container) return;
        const headers = Array.from(container.children).filter(c => c.classList.contains('job-group-header'));
        headers.forEach(h => {
            if (!isGrouped) {
                h.style.display = 'none';
                return;
            }
            let nextNode = h.nextElementSibling;
            let hasVisibleCard = false;
            while (nextNode && !nextNode.classList.contains('job-group-header')) {
                if (nextNode.classList.contains('progress-card') && nextNode.style.display !== 'none') {
                    hasVisibleCard = true;
                    break;
                }
                nextNode = nextNode.nextElementSibling;
            }
            h.style.display = hasVisibleCard ? '' : 'none';
        });
    });
};

window.toggleExternalStart = function(tpKey, element) {
    const checkbox = element.querySelector('input[type="checkbox"]');
    const textSpan = element.querySelector('.t4-text');
    const isChecked = !checkbox.checked;
    
    checkbox.checked = isChecked;
    
    // Update visuals
    if (isChecked) {
        element.style.color = 'var(--primary)';
        element.style.background = 'rgba(16, 185, 129, 0.1)';
        element.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        textSpan.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'O: 開始 (Bắt đầu)' : 'O列：開始';
    } else {
        element.style.color = 'var(--text-3)';
        element.style.background = 'var(--bg-page)';
        element.style.borderColor = 'var(--border)';
        textSpan.textContent = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi') ? 'Chưa bắt đầu' : '未着手';
    }
    
    // Update dataset on card
    const card = element.closest('.progress-card');
    if (card) {
        let checkedIds = (card.dataset.checkedIds || '').split(',').filter(Boolean);
        if (isChecked && !checkedIds.includes('t4')) {
            checkedIds.push('t4');
        } else if (!isChecked) {
            checkedIds = checkedIds.filter(id => id !== 't4');
        }
        card.dataset.checkedIds = checkedIds.join(',');
    }
    
    // Sync with server
    fetch(typeof CHECKLIST_API_POST !== 'undefined' && CHECKLIST_API_POST ? CHECKLIST_API_POST : '/api/checklist_sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tac_pham: tpKey, checkbox_id: 't4', status: isChecked })
    }).catch(console.error);
    
    // If modal for this task is open, sync it too safely
    let modalCb = null;
    document.querySelectorAll('.checklist-grid').forEach(g => {
        if (g.dataset.tpKey === tpKey) {
            const found = g.querySelector('input[data-check-id="t4"]');
            if (found) modalCb = found;
        }
    });
    if (modalCb) {
        modalCb.checked = isChecked;
        updateTaskProgressLocally(tpKey, modalCb.closest('.checklist-grid').parentElement);
    }
};

// Initialize Notification Center and Task Sockets on load
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            renderNotificationCenter();
            setTimeout(setupTaskCommentsSocket, 500);
        });
    } else {
        renderNotificationCenter();
        setTimeout(setupTaskCommentsSocket, 500);
    }
}

// =====================================================================
// AUTO RELOAD WHEN NEW CODE/BUILD IS DEPLOYED
// =====================================================================
(function initAutoReloadWatcher() {
    let clientVersion = (typeof window !== 'undefined' && window.APP_VERSION) 
        || (document.querySelector('.version-tag i') ? document.querySelector('.version-tag i').textContent.trim() : '');
    let clientBuildId = (typeof window !== 'undefined' && window.APP_BUILD_ID) || '';
    let isReloading = false;

    function isUserTyping() {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            if (active.value && active.value.trim().length > 0) return true;
        }
        return false;
    }

    function triggerAutoReload(newVersion) {
        // Triggered only when a task is explicitly finished
        if (isReloading) return;
        isReloading = true;
        setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.set('_bv', Date.now());
            window.location.href = url.toString();
        }, 500);
    }

    // Exposed helper: reload automatically when a task is finished
    window.triggerAutoReloadOnTaskDone = function() {
        triggerAutoReload();
    };

    function checkVersionData(data) {
        if (!data || isReloading) return;
        const sVer = data.version || data.app_version || '';
        const sBuild = data.build_id || '';

        if (!clientVersion && sVer) clientVersion = sVer;
        if (!clientBuildId && sBuild) clientBuildId = sBuild;

        // Silently record new version - DO NOT auto reload just because version changed!
        if ((clientVersion && sVer && sVer !== clientVersion) ||
            (clientBuildId && sBuild && sBuild !== clientBuildId)) {
            console.log(`[AutoReload] New build registered: ${sVer}. Reload will only occur when a task is done.`);
            clientVersion = sVer;
            clientBuildId = sBuild;
            window._pendingVersionUpdate = sVer;
            // Silently update version badge in UI
            document.querySelectorAll('.version-tag i').forEach(el => {
                el.textContent = sVer;
            });
        }
    }

    // 1. Socket.IO listener (runs immediately on connect or reconnect after server deploy)
    function attachSocketListener() {
        const s = window.socket || (typeof io !== 'undefined' ? (window.socket = io()) : null);
        if (s && typeof s.on === 'function') {
            s.on('app_version_info', checkVersionData);
        }
    }

    // 2. Poll /api/app_version every 4 seconds as a reliable backup
    setInterval(() => {
        if (isReloading) return;
        fetch('/api/app_version?_t=' + Date.now())
            .then(r => r.json())
            .then(checkVersionData)
            .catch(() => {});
    }, 4000);

    // Initial hook
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachSocketListener);
    } else {
        attachSocketListener();
    }
})();

// =====================================================================
// LEAVE REQUEST (TEAM CALENDAR) - 4-STEP WIZARD
// =====================================================================
let currentLeaveStep = 1;
let isSubmittingLeave = false;
let leaveStartPicker = null;
let leaveEndPicker = null;
let selectedLeaveFile = null;

// Configurable entry mapping for Google Form
window.GOOGLE_LEAVE_FORM_CONFIG = {
    formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdTN5OaUnud70UtSV9ygYJ8ob-nBk5VOFlfrJwaow9W-TcKJg/formResponse",
    entries: {
        fullname: "entry.1",
        staffCode: "entry.2",
        department: "entry.3",
        startDate: "entry.4",
        endDate: "entry.5",
        totalDays: "entry.6",
        leaveType: "entry.7"
    }
};

function initLeaveDatePickers() {
    const startInput = document.getElementById('leave-start-date');
    const endInput = document.getElementById('leave-end-date');
    const today = new Date().toISOString().split('T')[0];

    if (typeof flatpickr !== 'undefined') {
        if (!leaveStartPicker && startInput) {
            leaveStartPicker = flatpickr(startInput, {
                defaultDate: today,
                dateFormat: "Y-m-d",
                onChange: function(selectedDates, dateStr) {
                    if (leaveEndPicker && (!endInput.value || endInput.value < dateStr)) {
                        leaveEndPicker.setDate(dateStr);
                    }
                    calculateLeaveDuration();
                    updateLeaveFilenamePreview();
                }
            });
        }
        if (!leaveEndPicker && endInput) {
            leaveEndPicker = flatpickr(endInput, {
                defaultDate: today,
                dateFormat: "Y-m-d",
                onChange: function(selectedDates, dateStr) {
                    calculateLeaveDuration();
                    updateLeaveFilenamePreview();
                }
            });
        }
    } else {
        if (startInput && !startInput.value) startInput.value = today;
        if (endInput && !endInput.value) endInput.value = today;
    }

    calculateLeaveDuration();
    updateLeaveFilenamePreview();
}

function calculateLeaveDuration() {
    const startDateStr = (document.getElementById('leave-start-date')?.value || '').trim();
    const startTimeStr = (document.getElementById('leave-start-time')?.value || '08:00').trim();
    const endDateStr = (document.getElementById('leave-end-date')?.value || '').trim();
    const endTimeStr = (document.getElementById('leave-end-time')?.value || '17:00').trim();
    const totalDaysInput = document.getElementById('leave-total-days');

    if (!startDateStr || !endDateStr || !totalDaysInput) return;

    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T00:00:00');

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;
    if (endDate < startDate) {
        totalDaysInput.value = '0';
        return;
    }

    const parseTime = (tStr, defaultH) => {
        if (!tStr) return defaultH;
        const parts = tStr.split(':').map(Number);
        return (parts[0] || 0) + (parts[1] || 0) / 60;
    };

    const startH = parseTime(startTimeStr, 8);
    const endH = parseTime(endTimeStr, 17);

    // Giờ làm việc trong ngày (8h - 12h = 4h sáng, 13h - 17h = 4h chiều, tối đa 8h)
    const getWorkHoursInDay = (fromH, toH) => {
        const morning = Math.max(0, Math.min(12, toH) - Math.max(8, fromH));
        const afternoon = Math.max(0, Math.min(17, toH) - Math.max(13, fromH));
        return Math.min(8, morning + afternoon);
    };

    let totalLeaveDays = 0;
    let curr = new Date(startDate);

    while (curr <= endDate) {
        const dayOfWeek = curr.getDay(); // 0 là CN, 6 là T7
        // Chỉ tính ngày làm việc (Thứ 2 đến Thứ 6)
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const isStartDay = (curr.getTime() === startDate.getTime());
            const isEndDay = (curr.getTime() === endDate.getTime());

            if (isStartDay && isEndDay) {
                const hours = getWorkHoursInDay(startH, endH);
                if (hours >= 6.5) {
                    totalLeaveDays += 1;
                } else if (hours >= 3) {
                    totalLeaveDays += 0.5;
                } else if (hours > 0) {
                    totalLeaveDays += Math.round((hours / 4)) * 0.5 || 0.5;
                }
            } else if (isStartDay) {
                const hours = getWorkHoursInDay(startH, 17);
                if (hours >= 6.5) totalLeaveDays += 1;
                else if (hours >= 3) totalLeaveDays += 0.5;
                else if (hours > 0) totalLeaveDays += Math.round((hours / 4)) * 0.5 || 0.5;
            } else if (isEndDay) {
                const hours = getWorkHoursInDay(8, endH);
                if (hours >= 6.5) totalLeaveDays += 1;
                else if (hours >= 3) totalLeaveDays += 0.5;
                else if (hours > 0) totalLeaveDays += Math.round((hours / 4)) * 0.5 || 0.5;
            } else {
                totalLeaveDays += 1;
            }
        }
        curr.setDate(curr.getDate() + 1);
    }

    if (totalLeaveDays <= 0) totalLeaveDays = 1;
    totalDaysInput.value = (totalLeaveDays % 1 === 0) ? String(totalLeaveDays) : String(totalLeaveDays.toFixed(1)).replace('.0', '');
}
window.calculateLeaveDuration = calculateLeaveDuration;

let lastLeaveWarmupTime = 0;
function warmupLeaveConnections() {
    const now = Date.now();
    if (now - lastLeaveWarmupTime < 30000) return;
    lastLeaveWarmupTime = now;
    fetch('/api/leave/warmup', { method: 'POST' }).catch(() => {});
}
window.warmupLeaveConnections = warmupLeaveConnections;

function switchCalendarSubpage(subpage) {
    const isAttendance = (subpage === 'attendance');
    const mainView = document.getElementById('calendar-subview-main');
    const attView = document.getElementById('calendar-subview-attendance');
    const tabCal = document.getElementById('tab-btn-calendar');
    const tabAtt = document.getElementById('tab-btn-attendance');
    const crumbSep = document.getElementById('calendar-crumb-subpage-sep');
    const crumbTxt = document.getElementById('calendar-crumb-subpage-text');

    if (tabCal) tabCal.classList.toggle('active', !isAttendance);
    if (tabAtt) tabAtt.classList.toggle('active', isAttendance);

    if (crumbSep) crumbSep.style.display = isAttendance ? 'inline' : 'none';
    if (crumbTxt) crumbTxt.style.display = isAttendance ? 'inline' : 'none';

    if (mainView) mainView.style.display = isAttendance ? 'none' : 'flex';
    if (attView) attView.style.display = isAttendance ? 'block' : 'none';

    if (isAttendance) {
        currentLeaveStep = 1;
        updateLeaveStepUI();
        initLeaveDatePickers();
        warmupLeaveConnections();
    } else {
        if (typeof loadTeamLeaveSchedule === 'function') {
            loadTeamLeaveSchedule();
        }
    }
}
window.switchCalendarSubpage = switchCalendarSubpage;

function openLeaveModal() {
    warmupLeaveConnections();
    openToolPage('calendar');
    switchCalendarSubpage('attendance');
}

function closeLeaveModal() {
    switchCalendarSubpage('calendar');
}

window.openLeaveModal = openLeaveModal;
window.closeLeaveModal = closeLeaveModal;

function onLeaveAgreeChange() {
    const chk = document.getElementById('leave-agree-checkbox');
    const nextBtn = document.getElementById('leave-btn-next');
    if (chk && nextBtn && currentLeaveStep === 1) {
        if (chk.checked) {
            nextBtn.style.opacity = '1';
            nextBtn.disabled = false;
        } else {
            nextBtn.style.opacity = '0.5';
        }
    }
}
window.onLeaveAgreeChange = onLeaveAgreeChange;

function toggleLeaveTypeOther(isOther) {
    const otherInp = document.getElementById('leave-type-other-text');
    if (otherInp) {
        if (isOther) {
            otherInp.focus();
        } else {
            otherInp.value = '';
        }
    }
}
window.toggleLeaveTypeOther = toggleLeaveTypeOther;

function navigateLeaveStep(delta) {
    if (delta > 0) {
        // Validate current step before advancing
        if (currentLeaveStep === 1) {
            const agreed = document.getElementById('leave-agree-checkbox')?.checked;
            if (!agreed) {
                if (typeof showToast === 'function') {
                    showToast('Vui lòng đọc và tích xác nhận tuân thủ quy định nghỉ phép!', 'warning');
                } else {
                    alert('Vui lòng đọc và tích xác nhận tuân thủ quy định nghỉ phép!');
                }
                return;
            }
        } else if (currentLeaveStep === 2) {
            const fullname = (document.getElementById('leave-fullname')?.value || '').trim();
            const staffCode = (document.getElementById('leave-staff-code')?.value || '').trim();
            const dept = document.querySelector('input[name="leave_department"]:checked')?.value;

            if (!fullname) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập Họ và tên!', 'warning');
                else alert('Vui lòng nhập Họ và tên!');
                document.getElementById('leave-fullname')?.focus();
                return;
            }
            if (!staffCode || staffCode.length !== 10) {
                if (typeof showToast === 'function') showToast('Mã số nhân viên phải gồm đúng 10 số!', 'warning');
                else alert('Mã số nhân viên phải gồm đúng 10 số!');
                document.getElementById('leave-staff-code')?.focus();
                return;
            }
            if (!dept) {
                if (typeof showToast === 'function') showToast('Vui lòng chọn phòng ban!', 'warning');
                else alert('Vui lòng chọn phòng ban!');
                return;
            }
        } else if (currentLeaveStep === 3) {
            const startDate = (document.getElementById('leave-start-date')?.value || '').trim();
            const endDate = (document.getElementById('leave-end-date')?.value || '').trim();
            const totalDays = (document.getElementById('leave-total-days')?.value || '').trim();
            const typeChoice = document.querySelector('input[name="leave_type_choice"]:checked')?.value;
            const otherText = (document.getElementById('leave-type-other-text')?.value || '').trim();

            if (!startDate || !endDate) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập ngày bắt đầu và kết thúc nghỉ!', 'warning');
                else alert('Vui lòng nhập ngày bắt đầu và kết thúc nghỉ!');
                return;
            }
            if (!totalDays) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập tổng thời gian nghỉ phép (vd: 1 hoặc 1.5)!', 'warning');
                else alert('Vui lòng nhập tổng thời gian nghỉ phép (vd: 1 hoặc 1.5)!');
                document.getElementById('leave-total-days')?.focus();
                return;
            }
            if (typeChoice === 'OTHER' && !otherText) {
                if (typeof showToast === 'function') showToast('Vui lòng nhập loại nghỉ khác!', 'warning');
                else alert('Vui lòng nhập loại nghỉ khác!');
                document.getElementById('leave-type-other-text')?.focus();
                return;
            }
        }
    }

    currentLeaveStep = Math.max(1, Math.min(4, currentLeaveStep + delta));
    updateLeaveStepUI();
}
window.navigateLeaveStep = navigateLeaveStep;

function updateLeaveStepUI() {
    // 1. Panes
    for (let i = 1; i <= 4; i++) {
        const pane = document.getElementById(`leave-step-${i}`);
        if (pane) pane.classList.toggle('active', i === currentLeaveStep);

        const ind = document.getElementById(`step-indicator-${i}`);
        if (ind) {
            ind.classList.toggle('active', i === currentLeaveStep);
            ind.classList.toggle('completed', i < currentLeaveStep);
        }

        const sep = document.getElementById(`step-sep-${i}`);
        if (sep) {
            sep.classList.toggle('completed', i < currentLeaveStep);
        }
    }

    // 2. Buttons
    const prevBtn = document.getElementById('leave-btn-prev');
    const cancelBtn = document.getElementById('leave-btn-cancel');
    const nextBtn = document.getElementById('leave-btn-next');
    const submitBtn = document.getElementById('leave-btn-submit');

    if (currentLeaveStep === 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (submitBtn) submitBtn.style.display = 'none';
        onLeaveAgreeChange();
    } else if (currentLeaveStep === 4) {
        if (prevBtn) prevBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) {
            submitBtn.style.display = 'flex';
            updateLeaveSubmitButtonState();
        }
        updateLeaveFilenamePreview();
    } else {
        if (prevBtn) prevBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (nextBtn) {
            nextBtn.style.display = 'flex';
            nextBtn.style.opacity = '1';
            nextBtn.disabled = false;
        }
        if (submitBtn) submitBtn.style.display = 'none';
    }

    // Scroll top of modal body
    const body = document.querySelector('.leave-modal-body');
    if (body) body.scrollTop = 0;
}

function updateLeaveSubmitButtonState() {
    const submitBtn = document.getElementById('leave-btn-submit');
    const notice = document.getElementById('leave-upload-required-notice');
    if (!submitBtn) return;

    if (uploadedGDriveLink) {
        // Chỉ khi có uploadedGDriveLink từ Drive mới cho phép bấm gửi đơn
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.title = 'Nhấn để gửi đơn nghỉ phép';
        if (notice) {
            notice.style.background = 'rgba(16, 185, 129, 0.1)';
            notice.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            notice.style.color = '#34d399';
            notice.innerHTML = '<i class="fas fa-check-circle"></i> <span><strong>Ảnh xác nhận đã tải lên Google Drive thành công:</strong> Bạn có thể nhấn <strong>Gửi đơn</strong> ngay!</span>';
        }
    } else if (isUploadingGDrive) {
        // Đang tải ảnh lên Drive -> khóa nút gửi đơn và hiện trạng thái chờ
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.title = 'Đang tải ảnh lên Google Drive, vui lòng chờ trong giây lát...';
        if (notice) {
            notice.style.background = 'rgba(59, 130, 246, 0.1)';
            notice.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            notice.style.color = '#60a5fa';
            notice.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span><strong>Đang tải ảnh lên Google Drive...</strong> Nút gửi đơn sẽ tự động mở khi tải ảnh xong.</span>';
        }
    } else if (selectedLeaveFile) {
        // Đã chọn ảnh nhưng chưa có link Drive (hoặc upload bị lỗi)
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.title = 'Vui lòng nhấn Tải ảnh lên Google Drive trước khi gửi đơn';
        if (notice) {
            notice.style.background = 'rgba(245, 158, 11, 0.1)';
            notice.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            notice.style.color = '#fbbf24';
            notice.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span><strong>Bắt buộc:</strong> Bạn cần nhấn <strong>Tải ảnh lên Google Drive</strong> thành công mới có thể gửi đơn.</span>';
        }
    } else {
        // Chưa chọn ảnh
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.title = 'Vui lòng chọn ảnh xác nhận và tải lên Google Drive trước khi gửi đơn';
        if (notice) {
            notice.style.background = 'rgba(245, 158, 11, 0.1)';
            notice.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            notice.style.color = '#fbbf24';
            notice.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span><strong>Bắt buộc:</strong> Bạn cần chọn ảnh xác nhận của Quản lý và tải lên Google Drive trước khi gửi đơn.</span>';
        }
    }
}
window.updateLeaveSubmitButtonState = updateLeaveSubmitButtonState;

function getLeaveGeneratedFilename(extension = '') {
    const rawDate = (document.getElementById('leave-start-date')?.value || '').trim();
    const staffCode = (document.getElementById('leave-staff-code')?.value || '').trim() || 'MÃ_NV';
    const fullname = (document.getElementById('leave-fullname')?.value || '').trim().toUpperCase() || 'HỌ_VÀ_TÊN';

    let yymmdd = 'YYMMDD';
    if (rawDate) {
        const parts = rawDate.split('-');
        if (parts.length === 3) {
            const yy = parts[0].slice(-2);
            const mm = parts[1].padStart(2, '0');
            const dd = parts[2].padStart(2, '0');
            yymmdd = `${yy}${mm}${dd}`;
        }
    }

    let base = `HR - Leave Request - ${yymmdd} - ${staffCode} - ${fullname}`;
    if (extension) {
        if (!extension.startsWith('.')) extension = '.' + extension;
        return base + extension;
    }
    return base;
}
window.getLeaveGeneratedFilename = getLeaveGeneratedFilename;

function updateLeaveFilenamePreview() {
    const filename = getLeaveGeneratedFilename();
    const nameEl = document.getElementById('leave-suggested-filename');
    if (nameEl) nameEl.textContent = filename;

    if (selectedLeaveFile) {
        const ext = selectedLeaveFile.name.includes('.') ? selectedLeaveFile.name.split('.').pop() : 'png';
        const targetName = getLeaveGeneratedFilename(ext);
        const previewName = document.getElementById('leave-preview-name');
        if (previewName) previewName.textContent = targetName;
    }
}
window.updateLeaveFilenamePreview = updateLeaveFilenamePreview;

function copySuggestedFilename() {
    const nameEl = document.getElementById('leave-suggested-filename');
    if (!nameEl) return;
    const txt = nameEl.textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(() => {
            if (typeof showToast === 'function') showToast('Đã sao chép tên file mẫu!', 'success');
            else alert('Đã sao chép: ' + txt);
        });
    }
}
window.copySuggestedFilename = copySuggestedFilename;

let uploadedGDriveLink = '';

async function compressImageFile(file, maxWidth = 1400, quality = 0.82) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    if (file.size < 200 * 1024) return file; // Ảnh nhỏ hơn 200KB giữ nguyên

    return new Promise((resolve) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objUrl);
            let w = img.width;
            let h = img.height;
            if (w > maxWidth || h > maxWidth) {
                if (w > h) {
                    h = Math.round((h * maxWidth) / w);
                    w = maxWidth;
                } else {
                    w = Math.round((w * maxWidth) / h);
                    h = maxWidth;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
                if (blob && blob.size < file.size) {
                    const compressed = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(compressed);
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', quality);
        };
        img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            resolve(file);
        };
        img.src = objUrl;
    });
}

async function onLeaveFileSelected(e) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    if (rawFile.size > 15 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Kích thước ảnh vượt quá 15MB!', 'error');
        else alert('Kích thước ảnh vượt quá 15MB!');
        e.target.value = '';
        return;
    }

    // Tự động nén ảnh nhanh nếu dung lượng lớn
    const file = await compressImageFile(rawFile, 1400, 0.82);
    selectedLeaveFile = file;
    uploadedGDriveLink = '';
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
    const targetName = getLeaveGeneratedFilename(ext);

    const previewCard = document.getElementById('leave-file-preview-card');
    const previewImg = document.getElementById('leave-preview-img');
    const previewName = document.getElementById('leave-preview-name');
    const previewSize = document.getElementById('leave-preview-size');
    const gdriveBtn = document.getElementById('leave-btn-upload-gdrive');
    const gdriveBtnTxt = document.getElementById('leave-btn-upload-gdrive-text');
    const statusBox = document.getElementById('leave-gdrive-upload-status');

    if (previewCard && previewImg && previewName && previewSize) {
        previewImg.src = URL.createObjectURL(file);
        previewName.textContent = targetName;
        previewSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        previewCard.style.display = 'flex';
    }

    if (gdriveBtn && gdriveBtnTxt) {
        gdriveBtn.disabled = false;
        gdriveBtn.style.background = '#2563eb';
        gdriveBtn.style.borderColor = '#3b82f6';
        gdriveBtnTxt.textContent = 'Tải ảnh lên Google Drive';
    }
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.innerHTML = '';
    }
    // Khóa nút gửi đơn cho đến khi ảnh upload Drive xong
    updateLeaveSubmitButtonState();
    // Tự động tải ảnh lên Google Drive ngay khi chọn file
    setTimeout(() => {
        uploadAttachmentToGDriveDirectly();
    }, 80);
}
window.onLeaveFileSelected = onLeaveFileSelected;

function removeLeaveSelectedFile() {
    selectedLeaveFile = null;
    uploadedGDriveLink = '';
    isUploadingGDrive = false;
    const fileInp = document.getElementById('leave-attachment-input');
    if (fileInp) fileInp.value = '';
    const previewCard = document.getElementById('leave-file-preview-card');
    if (previewCard) previewCard.style.display = 'none';
    const statusBox = document.getElementById('leave-gdrive-upload-status');
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.innerHTML = '';
    }
    const gdriveBtn = document.getElementById('leave-btn-upload-gdrive');
    const gdriveBtnTxt = document.getElementById('leave-btn-upload-gdrive-text');
    if (gdriveBtn && gdriveBtnTxt) {
        gdriveBtn.disabled = false;
        gdriveBtn.style.background = '#2563eb';
        gdriveBtn.style.borderColor = '#3b82f6';
        gdriveBtnTxt.textContent = 'Tải ảnh lên Google Drive';
    }
    updateLeaveSubmitButtonState();
}
window.removeLeaveSelectedFile = removeLeaveSelectedFile;

let isUploadingGDrive = false;
async function uploadAttachmentToGDriveDirectly() {
    if (isUploadingGDrive) return;
    if (!selectedLeaveFile) {
        if (typeof showToast === 'function') showToast('Vui lòng chọn ảnh trước!', 'warning');
        else alert('Vui lòng chọn ảnh trước!');
        return;
    }

    isUploadingGDrive = true;
    updateLeaveSubmitButtonState();

    const btn = document.getElementById('leave-btn-upload-gdrive');
    const btnTxt = document.getElementById('leave-btn-upload-gdrive-text');
    const statusBox = document.getElementById('leave-gdrive-upload-status');

    const ext = selectedLeaveFile.name.includes('.') ? selectedLeaveFile.name.split('.').pop() : 'png';
    const targetFilename = getLeaveGeneratedFilename(ext);

    if (btn) btn.disabled = true;
    if (btnTxt) btnTxt.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải lên Drive...';
    if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = '<span style="color: #94a3b8;"><i class="fas fa-spinner fa-spin"></i> Đang kết nối Google Drive...</span>';
    }

    try {
        const formData = new FormData();
        formData.append('attachment', selectedLeaveFile, targetFilename);
        formData.append('target_filename', targetFilename);

        const res = await fetch('/api/upload_leave_attachment', {
            method: 'POST',
            body: formData
        });
        const data = await res.json().catch(() => ({}));

        if (data && data.gdrive_uploaded && data.gdrive_link) {
            uploadedGDriveLink = data.gdrive_link;
            if (btnTxt) btnTxt.innerHTML = '<i class="fas fa-check"></i> Đã tải lên';
            if (btn) {
                btn.style.background = '#10b981';
                btn.style.borderColor = '#10b981';
                btn.disabled = true;
            }
            if (statusBox) {
                statusBox.innerHTML = `<span style="color: #34d399; font-weight: 600;"><i class="fas fa-check-circle"></i> Đã lưu vào Drive</span> <a href="${data.gdrive_link}" target="_blank" style="color: #60a5fa; text-decoration: underline; margin-left: 8px; font-weight: 500;">Mở xem trên Drive <i class="fas fa-external-link-alt" style="font-size: 0.72rem;"></i></a>`;
            }
            updateLeaveSubmitButtonState();
            if (typeof showToast === 'function') showToast('✅ Tải ảnh lên Google Drive thành công!', 'success');
        } else {
            uploadedGDriveLink = '';
            if (btn) btn.disabled = false;
            if (btnTxt) btnTxt.innerHTML = '<i class="fas fa-redo"></i> Thử lại tải lên Drive';
            const note = data.gdrive_error || 'Thư mục Drive chưa cấp quyền cho bot';
            if (statusBox) {
                statusBox.innerHTML = `<span style="color: #f87171;"><i class="fas fa-exclamation-triangle"></i> ${note}</span>`;
            }
            updateLeaveSubmitButtonState();
            if (typeof showToast === 'function') showToast(`⚠️ ${note}`, 'warning');
        }
    } catch (err) {
        uploadedGDriveLink = '';
        if (btn) btn.disabled = false;
        if (btnTxt) btnTxt.innerHTML = '<i class="fas fa-redo"></i> Thử lại tải lên Drive';
        if (statusBox) {
            statusBox.innerHTML = `<span style="color: #f87171;">Lỗi kết nối: ${err.message}</span>`;
        }
        updateLeaveSubmitButtonState();
    } finally {
        isUploadingGDrive = false;
        updateLeaveSubmitButtonState();
    }
}
window.uploadAttachmentToGDriveDirectly = uploadAttachmentToGDriveDirectly;

function onLeaveIframeLoad() {
    if (isSubmittingLeave) {
        finishLeaveSubmission(true);
    }
}

function resetLeaveForm() {
    selectedLeaveFile = null;
    uploadedGDriveLink = '';
    isUploadingGDrive = false;
    isSubmittingLeave = false;

    // Reset file input & preview
    const fileInp = document.getElementById('leave-attachment-input');
    if (fileInp) fileInp.value = '';
    const previewCard = document.getElementById('leave-file-preview-card');
    if (previewCard) previewCard.style.display = 'none';
    const previewImg = document.getElementById('leave-preview-img');
    if (previewImg) previewImg.src = '';
    const statusBox = document.getElementById('leave-gdrive-upload-status');
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.innerHTML = '';
    }
    const gdriveBtn = document.getElementById('leave-btn-upload-gdrive');
    const gdriveBtnTxt = document.getElementById('leave-btn-upload-gdrive-text');
    if (gdriveBtn && gdriveBtnTxt) {
        gdriveBtn.disabled = false;
        gdriveBtn.style.background = '#2563eb';
        gdriveBtn.style.borderColor = '#3b82f6';
        gdriveBtnTxt.textContent = 'Tải ảnh lên Google Drive';
    }

    // Reset form fields (tránh lưu cache từ session trước)
    const startDateInp = document.getElementById('leave-start-date');
    const startTimeInp = document.getElementById('leave-start-time');
    const endDateInp = document.getElementById('leave-end-date');
    const endTimeInp = document.getElementById('leave-end-time');
    const totalDaysInp = document.getElementById('leave-total-days');
    const reasonInp = document.getElementById('leave-reason');
    const otherInp = document.getElementById('leave-type-other-text');
    if (startDateInp) startDateInp.value = '';
    if (startTimeInp) startTimeInp.value = '08:00';
    if (endDateInp) endDateInp.value = '';
    if (endTimeInp) endTimeInp.value = '17:00';
    if (totalDaysInp) totalDaysInp.value = '';
    if (reasonInp) reasonInp.value = '';
    if (otherInp) otherInp.value = '';

    // Reset loại nghỉ về mặc định
    const firstRadio = document.querySelector('input[name="leave_type_choice"][value="NGHỈ PHÉP - ANNUAL LEAVE"]');
    if (firstRadio) firstRadio.checked = true;

    // Reset xác nhận quy định
    const agreeChk = document.getElementById('leave-agree-checkbox');
    if (agreeChk) agreeChk.checked = false;

    // Đưa stepper về Bước 1
    currentLeaveStep = 1;
    updateLeaveStepUI();
    updateLeaveSubmitButtonState();
}
window.resetLeaveForm = resetLeaveForm;

function finishLeaveSubmission(success, msg) {
    isSubmittingLeave = false;
    const btn = document.getElementById('leave-btn-submit');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Gửi đơn nghỉ phép</span>';
    }
    closeLeaveModal();
    if (success) {
        resetLeaveForm(); // Reset toàn bộ form và cache để tránh double đơn hoặc sót ảnh phiên trước
        const text = msg || '✅ Đã gửi đơn đăng ký nghỉ phép thành công!';
        if (typeof showToast === 'function') {
            showToast(text, 'success');
        } else {
            alert(text);
        }
    }
}

async function submitMultiStepLeave(e) {
    if (e) e.preventDefault();
    if (isSubmittingLeave) return;

    const fullname = (document.getElementById('leave-fullname')?.value || '').trim();
    const staffCode = (document.getElementById('leave-staff-code')?.value || '').trim();
    const gmail = (document.getElementById('leave-gmail')?.value || '').trim();
    const dept = document.querySelector('input[name="leave_department"]:checked')?.value || 'DESIGN';
    const startDate = (document.getElementById('leave-start-date')?.value || '').trim();
    const startTime = (document.getElementById('leave-start-time')?.value || '08:00').trim();
    const endDate = (document.getElementById('leave-end-date')?.value || '').trim();
    const endTime = (document.getElementById('leave-end-time')?.value || '17:00').trim();
    const totalDays = (document.getElementById('leave-total-days')?.value || '').trim();
    
    let leaveType = document.querySelector('input[name="leave_type_choice"]:checked')?.value || 'NGHỈ PHÉP - ANNUAL LEAVE';
    if (leaveType === 'OTHER') {
        leaveType = (document.getElementById('leave-type-other-text')?.value || '').trim() || 'Mục khác';
    }

    if (!fullname || !staffCode || !startDate || !endDate || !totalDays) {
        if (typeof showToast === 'function') {
            showToast('Vui lòng điền đầy đủ thông tin bắt buộc!', 'error');
        } else {
            alert('Vui lòng điền đầy đủ thông tin bắt buộc!');
        }
        return;
    }

    if (!uploadedGDriveLink) {
        const msg = '⚠️ Bạn cần chờ ảnh tải lên Google Drive thành công trước khi gửi đơn!';
        if (typeof showToast === 'function') {
            showToast(msg, 'warning');
        } else {
            alert(msg);
        }
        return;
    }

    isSubmittingLeave = true;
    const btn = document.getElementById('leave-btn-submit');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Đang gửi đơn...</span>';
    }

    // 1. Post to local API with FormData (supporting attachment file and Google Drive upload)
    let submitSuccessMsg = '✅ Đã gửi đơn nghỉ phép thành công!';
    try {
        const formData = new FormData();
        formData.append('fullname', fullname);
        formData.append('staff_code', staffCode);
        formData.append('gmail', gmail);
        formData.append('department', dept);
        formData.append('start_date', startDate);
        formData.append('start_time', startTime);
        formData.append('end_date', endDate);
        formData.append('end_time', endTime);
        formData.append('total_days', totalDays);
        formData.append('leave_type', leaveType);
        const reason = (document.getElementById('leave-reason')?.value || '').trim();
        formData.append('reason', reason);
        if (uploadedGDriveLink) {
            formData.append('gdrive_link', uploadedGDriveLink);
        }
        const ext = selectedLeaveFile?.name?.includes('.') ? selectedLeaveFile.name.split('.').pop() : 'png';
        const targetFilename = getLeaveGeneratedFilename(ext);
        formData.append('target_filename', targetFilename);
        // KHÔNG gửi lại binary raw attachment nếu đã có uploadedGDriveLink để tránh double upload trên Drive!

        const res = await fetch('/api/submit_leave_request', {
            method: 'POST',
            body: formData
        });
        const resJson = await res.json().catch(() => ({}));
        if (resJson && resJson.sheet_appended) {
            submitSuccessMsg = '✅ Đã gửi đơn nghỉ phép & ghi vào Google Sheet thành công!';
        }
        if (resJson && resJson.gdrive_uploaded) {
            console.log('[Leave] Uploaded to GDrive:', resJson.gdrive_link);
        } else if (resJson && resJson.gdrive_error) {
            console.warn('[Leave] GDrive note:', resJson.gdrive_error);
        }

        // Submit to Google Form via hidden form in background (fire-and-forget)
        try {
            const hiddenForm = document.getElementById('google-hidden-leave-form');
            if (hiddenForm) {
                hiddenForm.innerHTML = '';
                const cfg = window.GOOGLE_LEAVE_FORM_CONFIG.entries;
                const appendField = (name, val) => {
                    if (!name) return;
                    const inp = document.createElement('input');
                    inp.type = 'hidden';
                    inp.name = name;
                    inp.value = val;
                    hiddenForm.appendChild(inp);
                };
                appendField(cfg.fullname, fullname);
                appendField(cfg.staffCode, staffCode);
                appendField(cfg.department, dept);
                appendField(cfg.startDate, `${startDate} ${startTime}`);
                appendField(cfg.endDate, `${endDate} ${endTime}`);
                appendField(cfg.totalDays, totalDays);
                appendField(cfg.leaveType, leaveType);
                hiddenForm.submit();
            }
        } catch (_) {}

        // Hoàn tất lưu và tải lại lịch ngay
        if (res.ok && resJson && resJson.ok) {
            finishLeaveSubmission(true, submitSuccessMsg);
            const reloadCalendar = () => {
                const calIframe = document.getElementById('calendar-page-iframe') || document.getElementById('calendar-iframe');
                if (calIframe) {
                    const currentSrc = calIframe.src || '/calendar';
                    const base = currentSrc.split(/[?#]/)[0];
                    const search = currentSrc.includes('?') ? currentSrc.split('?')[1].split('#')[0] : '';
                    const params = new URLSearchParams(search);
                    params.set('_t', Date.now());
                    calIframe.src = base + '?' + params.toString();
                }
            };
            reloadCalendar();
            setTimeout(reloadCalendar, 1800);
            return;
        } else {
            finishLeaveSubmission(false, (resJson && resJson.error) || 'Lỗi gửi đơn');
            return;
        }
    } catch (err) {
        console.warn('Submit error:', err);
        finishLeaveSubmission(false, err.message || 'Lỗi kết nối khi gửi đơn');
    }
}
window.submitMultiStepLeave = submitMultiStepLeave;

let teamLeaveData = [];
let isLeaveDrawerOpen = false;

function toggleLeaveDrawer(force) {
    const drawer = document.getElementById('team-leave-drawer');
    if (!drawer) return;
    if (typeof force === 'boolean') {
        isLeaveDrawerOpen = force;
    } else {
        isLeaveDrawerOpen = !isLeaveDrawerOpen;
    }
    drawer.style.transform = isLeaveDrawerOpen ? 'translateX(0)' : 'translateX(100%)';
}
window.toggleLeaveDrawer = toggleLeaveDrawer;

async function loadTeamLeaveSchedule() {
    try {
        const res = await fetch('/api/leave_requests');
        const data = await res.json().catch(() => ({}));
        if (!data || !data.ok || !data.leaves) return;

        teamLeaveData = data.leaves;
        const totalCountEl = document.getElementById('leave-total-count');
        if (totalCountEl) totalCountEl.textContent = teamLeaveData.length;

        // Render Top Strip Pills
        const pillsContainer = document.getElementById('team-leave-pills-container');
        if (pillsContainer) {
            if (teamLeaveData.length === 0) {
                pillsContainer.innerHTML = '<span style="font-size: 0.78rem; color: #94a3b8;">Chưa có đơn nghỉ phép</span>';
            } else {
                pillsContainer.innerHTML = teamLeaveData.slice(0, 8).map(item => {
                    const avatar = item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.fullname || 'NV')}&background=6366f1&color=fff&bold=true`;
                    const reason = item.reason ? item.reason : (item.leave_type || 'Nghỉ phép');
                    const shortName = (item.fullname || 'Thành viên').split(' ').slice(-2).join(' ');
                    const dateStr = item.start_date ? item.start_date.split('-').slice(1).reverse().join('/') : '';

                    return `
                        <div class="team-leave-pill" onclick="toggleLeaveDrawer(true)" title="${escapeHtml(item.fullname)}: ${escapeHtml(reason)} (${item.start_date || ''} - ${item.total_days || 1} ngày)" style="display: flex; align-items: center; gap: 7px; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 20px; padding: 3px 10px 3px 4px; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;">
                            <img src="${avatar}" alt="${escapeHtml(item.fullname)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(shortName)}&background=6366f1&color=fff';" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1.5px solid #818cf8;">
                            <span style="font-size: 0.8rem; font-weight: 600; color: #f8fafc;">${escapeHtml(shortName)}</span>
                            <span style="font-size: 0.72rem; color: #cbd5e1; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(reason)}</span>
                            ${dateStr ? `<span style="font-size: 0.7rem; color: #93c5fd; background: rgba(59, 130, 246, 0.18); padding: 1px 6px; border-radius: 6px; font-weight: 500;">${dateStr}</span>` : ''}
                        </div>
                    `;
                }).join('');
            }
        }

        // Render Drawer Cards List
        const listContainer = document.getElementById('team-leave-drawer-list');
        if (listContainer) {
            if (teamLeaveData.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 30px 0;">Chưa có đơn nghỉ phép nào được ghi nhận.</div>';
            } else {
                listContainer.innerHTML = teamLeaveData.map(item => {
                    const avatar = item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.fullname || 'NV')}&background=6366f1&color=fff&bold=true`;
                    const reason = item.reason || 'Không ghi chú';
                    const dept = item.department || 'DESIGN';
                    const startStr = `${item.start_date || ''} ${item.start_time || ''}`.trim();
                    const endStr = `${item.end_date || ''} ${item.end_time || ''}`.trim();

                    return `
                        <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.2s;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <img src="${avatar}" alt="${escapeHtml(item.fullname)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(item.fullname || 'NV')}&background=6366f1&color=fff';" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(99, 102, 241, 0.4);">
                                    <div>
                                        <div style="font-size: 0.88rem; font-weight: 700; color: #f8fafc;">${escapeHtml(item.fullname)}</div>
                                        <div style="font-size: 0.74rem; color: #94a3b8;">${escapeHtml(item.staff_code || '')} • <span style="color: #818cf8; font-weight: 600;">${escapeHtml(dept)}</span></div>
                                    </div>
                                </div>
                                <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 0.74rem; font-weight: 600; padding: 2px 8px; border-radius: 6px;">${item.total_days || '1'} ngày</span>
                            </div>

                            <div style="background: rgba(15, 23, 42, 0.5); padding: 8px 10px; border-radius: 8px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px;">
                                <div style="color: #cbd5e1;"><strong style="color: #94a3b8;">Loại nghỉ:</strong> ${escapeHtml(item.leave_type || 'Nghỉ phép')}</div>
                                <div style="color: #fbbf24;"><strong style="color: #94a3b8;">Lý do:</strong> ${escapeHtml(reason)}</div>
                                <div style="color: #93c5fd; font-size: 0.76rem;"><i class="far fa-clock" style="margin-right: 4px;"></i>${escapeHtml(startStr)} → ${escapeHtml(endStr)}</div>
                            </div>

                            ${item.gdrive_link ? `
                                <div style="display: flex; justify-content: flex-end;">
                                    <a href="${item.gdrive_link}" target="_blank" style="font-size: 0.76rem; color: #60a5fa; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">
                                        <span>Xem ảnh xác nhận Drive</span>
                                        <i class="fas fa-external-link-alt" style="font-size: 0.65rem;"></i>
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('');
            }
        }
    } catch (e) {
        console.warn('Load team leave schedule error:', e);
    }
}
window.loadTeamLeaveSchedule = loadTeamLeaveSchedule;

// =========================================================================
// ADMIN LEAVE EMAIL NOTIFICATION SETTINGS (MULTI-EMAIL SUPPORT)
// =========================================================================
function parseAdminEmailList(raw) {
    if (!raw) return [];
    const tokens = String(raw).split(/[,;\s\n\r\t]+/);
    const valid = [];
    tokens.forEach(t => {
        const clean = t.trim();
        if (clean && clean.includes('@') && clean.includes('.')) {
            if (!valid.includes(clean)) valid.push(clean);
        }
    });
    return valid;
}
window.parseAdminEmailList = parseAdminEmailList;

function renderAdminLeaveEmailTags() {
    const input = document.getElementById('admin-leave-email-input');
    const tagsContainer = document.getElementById('admin-leave-email-tags');
    const countEl = document.getElementById('admin-leave-email-count');
    if (!input || !tagsContainer) return;

    const emails = parseAdminEmailList(input.value);
    if (countEl) {
        countEl.textContent = `${emails.length} email`;
        countEl.style.background = emails.length > 0 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(239, 68, 68, 0.15)';
        countEl.style.color = emails.length > 0 ? '#c7d2fe' : '#fca5a5';
    }

    if (emails.length === 0) {
        tagsContainer.innerHTML = '';
        return;
    }

    tagsContainer.innerHTML = emails.map(em => `
        <span style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; background: rgba(99, 102, 241, 0.18); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 6px; font-size: 0.76rem; color: #e0e7ff; font-weight: 500;">
            <i class="far fa-envelope" style="font-size: 0.7rem; color: #818cf8;"></i>
            <span>${escapeHtml(em)}</span>
        </span>
    `).join('');
}
window.renderAdminLeaveEmailTags = renderAdminLeaveEmailTags;

function openAdminLeaveEmailModal() {
    const overlay = document.getElementById('admin-leave-email-overlay');
    const modal = document.getElementById('admin-leave-email-modal');
    if (!modal || !overlay) {
        console.warn('Admin email modal elements not found');
        return;
    }
    overlay.style.display = 'block';
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
    modal.style.display = 'block';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';

    fetch('/api/admin/leave_email_config')
        .then(res => res.json())
        .then(data => {
            if (data && data.ok) {
                const input = document.getElementById('admin-leave-email-input');
                const chk = document.getElementById('admin-leave-email-enabled');
                if (input) {
                    if (data.notify_emails && Array.isArray(data.notify_emails) && data.notify_emails.length > 0) {
                        input.value = data.notify_emails.join(', ');
                    } else if (data.notify_email) {
                        input.value = data.notify_email;
                    }
                    renderAdminLeaveEmailTags();
                }
                if (chk) chk.checked = !!data.enabled;
            }
        })
        .catch(e => console.warn('Load admin email config error:', e));
}
window.openAdminLeaveEmailModal = openAdminLeaveEmailModal;

function closeAdminLeaveEmailModal() {
    const overlay = document.getElementById('admin-leave-email-overlay');
    const modal = document.getElementById('admin-leave-email-modal');
    if (overlay) overlay.style.display = 'none';
    if (modal) modal.style.display = 'none';
}
window.closeAdminLeaveEmailModal = closeAdminLeaveEmailModal;

async function saveAdminLeaveEmailConfig() {
    const input = document.getElementById('admin-leave-email-input');
    const chk = document.getElementById('admin-leave-email-enabled');
    const btn = document.getElementById('btn-save-admin-leave-email');
    const emails = parseAdminEmailList(input?.value || '');
    const enabled = chk ? chk.checked : true;

    if (emails.length === 0) {
        const msg = 'Vui lòng nhập ít nhất 1 email hợp lệ (VD: tanphanduy8@gmail.com)!';
        if (typeof showToast === 'function') showToast(msg, 'warning');
        else alert(msg);
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Đang lưu...</span>';
    }

    try {
        const res = await fetch('/api/admin/leave_email_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                notify_email: emails.join(', '),
                notify_emails: emails,
                enabled: enabled
            })
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) {
            if (typeof showToast === 'function') showToast(`✅ Đã lưu ${emails.length} email nhận đơn nghỉ phép!`, 'success');
            else alert(`Đã lưu ${emails.length} email nhận đơn nghỉ phép!`);
            closeAdminLeaveEmailModal();
        } else {
            const err = data.error || 'Lỗi lưu cấu hình';
            if (typeof showToast === 'function') showToast('⚠️ ' + err, 'error');
            else alert(err);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Lỗi kết nối: ' + e.message, 'error');
        else alert('Lỗi kết nối: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> <span>Lưu cài đặt</span>';
        }
    }
}
window.saveAdminLeaveEmailConfig = saveAdminLeaveEmailConfig;

async function testAdminLeaveEmail() {
    const input = document.getElementById('admin-leave-email-input');
    const btn = document.getElementById('btn-admin-leave-email-test');
    const emails = parseAdminEmailList(input?.value || '');

    if (emails.length === 0) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập ít nhất 1 email trước khi gửi thử!', 'warning');
        else alert('Vui lòng nhập ít nhất 1 email trước khi gửi thử!');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Đang gửi thử...</span>';
    }

    try {
        const res = await fetch('/api/admin/leave_email_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                notify_email: emails.join(', '),
                notify_emails: emails
            })
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.ok) {
            if (typeof showToast === 'function') showToast('✅ ' + (data.message || `Đã gửi thử thành công đến ${emails.length} email!`), 'success');
            else alert(data.message || `Đã gửi thử thành công đến ${emails.length} email!`);
        } else {
            const err = data.error || 'Lỗi gửi mail thử';
            if (typeof showToast === 'function') showToast('⚠️ ' + err, 'warning');
            else alert(err);
        }
    } catch (e) {
        if (typeof showToast === 'function') showToast('Lỗi: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="far fa-paper-plane"></i> <span>Gửi thử (Test)</span>';
        }
    }
}
window.testAdminLeaveEmail = testAdminLeaveEmail;



