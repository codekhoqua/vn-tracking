/* ================================================================
   VN-TRACKING DASHBOARD — FRONTEND LOGIC v3 (Kanban)
   ================================================================ */

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
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
    document.querySelectorAll('.info-banner').forEach(b => b.style.display = b.id === `banner-${tabId}` ? 'flex' : 'none');

    // Show only table rows for active tab
    document.querySelectorAll('.table-row').forEach(row => {
        row.style.display = row.classList.contains(`table-${tabId}`) ? '' : 'none';
    });

    sessionStorage.setItem('activeTab', tabId);
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

// ===================== NAVIGATION & SCROLLING =====================
function updateSidebarActiveState(isTableVisible) {
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    if (navItems.length < 2) return;

    navItems.forEach(item => item.classList.remove('active'));
    if (isTableVisible) {
        navItems[1].classList.add('active'); // Data Table
    } else {
        navItems[0].classList.add('active'); // Dashboard
    }
}

function scrollToTable() {
    const tableWrapper = document.getElementById('table-wrapper');
    const tableSection = document.querySelector('.table-section');
    if (tableWrapper && tableSection) {
        if (!tableWrapper.classList.contains('open')) {
            toggleTable();
        }
        tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Fallback for Dashboard click
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    if (navItems.length > 0) {
        navItems[0].addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            updateSidebarActiveState(false);
        });
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
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ===================== WEATHER & TIME =====================
function initWeatherTime() {
    const el = document.getElementById('main-hero-banner');
    if (!el) return;
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const locQuery = isVN ? "Ho+Chi+Minh" : "Gifu";
    const locName = isVN ? "TP.HCM" : "Gifu";

    fetch(`/api/weather?loc=${locQuery}`)
        .then(r => r.json())
        .then(data => {
            const cc = data.current_condition[0];
            const weather = data.weather[0];
            const temp = cc.temp_C;
            const feelsLike = cc.FeelsLikeC;
            const maxTemp = weather.maxtempC;
            const minTemp = weather.mintempC;
            const wCode = parseInt(cc.weatherCode);

            let desc = isVN ? "Nhiều mây" : "曇り";
            let bgUrl = "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?q=80&w=1200";
            let iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19A4.5 4.5 0 0 0 18 10c-1-5-8.5-5-10-1.5A5 5 0 1 0 8 19h9.5z"></path></svg>`; // Cloud
            let iconColor = "#94a3b8";

            if (wCode === 113) {
                desc = isVN ? "Nắng đẹp" : "晴れ";
                bgUrl = "https://images.unsplash.com/photo-1601297183305-6df142704ea2?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
                iconColor = "#fbbf24";
            } else if ([116, 119, 122].includes(wCode)) {
                desc = isVN ? "Nhiều mây" : "曇り";
                bgUrl = "https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19A4.5 4.5 0 0 0 18 10c-1-5-8.5-5-10-1.5A5 5 0 1 0 8 19h9.5z"></path></svg>`;
                iconColor = "#94a3b8";
            } else if ([143, 248, 260].includes(wCode)) {
                desc = isVN ? "Sương mù" : "霧";
                bgUrl = "https://images.unsplash.com/photo-1487621167305-5d248087c724?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19A4.5 4.5 0 0 0 18 10c-1-5-8.5-5-10-1.5A5 5 0 1 0 8 19h9.5z"></path></svg>`;
                iconColor = "#cbd5e1";
            } else if ([227, 230, 323, 326, 329, 332, 335, 338, 350, 371].includes(wCode)) {
                desc = isVN ? "Tuyết rơi" : "雪";
                bgUrl = "https://images.unsplash.com/photo-1542601098-3adb3baeb1ec?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path><line x1="8" y1="16" x2="8.01" y2="16"></line><line x1="8" y1="20" x2="8.01" y2="20"></line><line x1="12" y1="18" x2="12.01" y2="18"></line><line x1="12" y1="22" x2="12.01" y2="22"></line><line x1="16" y1="16" x2="16.01" y2="16"></line><line x1="16" y1="20" x2="16.01" y2="20"></line></svg>`;
                iconColor = "#e0f2fe";
            } else if ((wCode >= 263 && wCode <= 314) || [353, 356, 359].includes(wCode)) {
                desc = isVN ? "Có mưa" : "雨";
                bgUrl = "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16" y1="13" x2="16" y2="21"></line><line x1="8" y1="13" x2="8" y2="21"></line><line x1="12" y1="15" x2="12" y2="23"></line><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path></svg>`;
                iconColor = "#60a5fa";
            } else if ([200, 386, 389, 392, 395].includes(wCode)) {
                desc = isVN ? "Giông bão" : "雷雨";
                bgUrl = "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?q=80&w=1200";
                iconSvg = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline></svg>`;
                iconColor = "#fcd34d";
            }
            
            // Realtime Rain Effect
            const isRainy = ((wCode >= 263 && wCode <= 314) || [353, 356, 359, 200, 386, 389, 392, 395].includes(wCode));
            if (isRainy) {
                if (window.startRainEffect) window.startRainEffect();
            } else {
                if (window.stopRainEffect) window.stopRainEffect();
            }

            const bgEl = document.getElementById('hero-weather-bg');
            if (bgEl) {
                bgEl.style.backgroundImage = `url('${bgUrl}')`;
            }

            const inlineContainer = document.getElementById('inline-weather-container');
            if (inlineContainer) {
                inlineContainer.innerHTML = `
                    <div style="color: ${iconColor}; display: flex; align-items: center; justify-content: center; margin-right: 4px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        ${iconSvg}
                    </div>
                    <div style="font-size: 3.2rem; font-weight: 300; color: #fff; line-height: 1; text-shadow: 0 2px 8px rgba(0,0,0,0.4); margin-right: 12px; font-variant-numeric: tabular-nums;">
                        ${temp}<span style="font-size: 1.2rem; vertical-align: super; font-weight: 500; opacity: 0.9;">°c</span>
                    </div>
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-size: 1rem; font-weight: 700; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.4); margin-bottom: 2px;">${locName}</div>
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); font-weight: 500; text-shadow: 0 1px 4px rgba(0,0,0,0.4); margin-bottom: 2px;">${desc}</div>
                        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); font-weight: 500; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">H: ${maxTemp}° L: ${minTemp}°</div>
                    </div>
                `;
            }
        }).catch(err => {
            console.error("Weather err:", err);
            const inlineContainer = document.getElementById('inline-weather-container');
            if (inlineContainer) {
                inlineContainer.innerHTML = '';
                inlineContainer.style.display = 'none';
            }
        });
}

// ===================== MODAL =====================
function openModal(tabKey, cardName) {
    if (typeof modalMap === 'undefined') return;
    const modalId = modalMap[tabKey] && modalMap[tabKey][cardName];
    if (modalId) {
        const modal = document.getElementById(`modal-${modalId}`);
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
            initChecklistInContainer(modal.querySelector('.modal-body'));
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(`modal-${modalId}`);
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
}

// CALENDAR
function openCalendarModal() {
    const overlay = document.getElementById('calendar-modal-overlay');
    const modal = document.getElementById('calendar-modal');
    const iframe = document.getElementById('calendar-iframe');

    if (iframe && (!iframe.src || iframe.src === window.location.href)) {
        iframe.src = '/calendar';
    }

    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeCalendarModal() {
    const overlay = document.getElementById('calendar-modal-overlay');
    const modal = document.getElementById('calendar-modal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

// DRIVES
function closeDriveModal() {
    const overlay = document.getElementById('drive-modal-overlay');
    const modal = document.getElementById('drive-modal');
    if (overlay) overlay.classList.remove('active');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
}

function openDriveModal() {
    const overlay = document.getElementById('drive-modal-overlay');
    const modal = document.getElementById('drive-modal');
    const iframe = document.getElementById('drive-iframe');

    if (iframe && (!iframe.src || iframe.src === window.location.href)) {
        iframe.src = '/drive?modal=1';
    }

    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.cp-overlay.active, .cp-modal.active').forEach(m => {
            m.classList.remove('active');
            document.body.style.overflow = '';
        });
        const drawer = document.getElementById('filter-drawer');
        if (drawer && drawer.classList.contains('open')) toggleFilters();
    }
});

// Close modal when clicking overlay
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
        document.body.style.overflow = '';
    }
});

// ===================== CHECKLIST =====================
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

                // Keep the card's local checked_ids up to date
                const card = document.querySelector(`.progress-card[data-tp-key="${tpKey}"]`);
                if (card) {
                    let checkedIds = (card.dataset.checkedIds || '').split(',').filter(Boolean);
                    if (e.target.checked) {
                        if (!checkedIds.includes(rawId)) checkedIds.push(rawId);
                    } else {
                        checkedIds = checkedIds.filter(id => id !== rawId);
                    }
                    card.dataset.checkedIds = checkedIds.join(',');
                }

                if (true) {
                    fetch('/api/checklist_sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tac_pham: tpKey, checkbox_id: rawId, status: e.target.checked })
                    }).then(r => r.json()).then(data => {
                        if (typeof handlePetXPResponse === 'function') handlePetXPResponse(data);
                    }).catch(() => {});
                }
                updateTaskProgressLocally(tpKey, container);
            });
        });

        // 1. FAST LOCAL RENDER FROM CARD DATA (Injected by Python)
        const card = document.querySelector(`.progress-card[data-tp-key="${tpKey}"]`);
        if (card) {
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
                        targetCol.appendChild(card);
                    }

                    // Update column badges
                    tab.querySelectorAll('.kanban-column').forEach(col => {
                        const count = Array.from(col.querySelectorAll('.progress-card')).filter(c => c.style.display !== 'none').length;
                        const badge = col.querySelector('.kanban-col-count');
                        if (badge) badge.textContent = count;
                    });
                }
            }
        }
    });
}


// ===================== CELEBRATION EFFECTS =====================
function triggerCelebration() {
    // 1. Play "Ting" sound using Web Audio API
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const playNote = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
                gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
                gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
                osc.start(ctx.currentTime + startTime);
                osc.stop(ctx.currentTime + startTime + duration);
            };
            playNote(880, 0, 0.4);      // A5 note
            playNote(1108.73, 0.1, 0.6); // C#6 note
        }
    } catch (e) {
        console.log("Audio not supported or blocked");
    }

    // 2. Fire Confetti
    if (typeof confetti === 'function') {
        const duration = 2000;
        const end = Date.now() + duration;
        (function frame() {
            confetti({
                particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, zIndex: 9999,
                colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff']
            });
            confetti({
                particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, zIndex: 9999,
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

// ===================== LOGTIME FORM =====================
const logtimeCooldowns = {};

function handleLogtime(event, formId) {
    event.preventDefault();
    const form = document.getElementById(formId);
    if (!form) return;

    const now = Date.now();
    const lastTime = logtimeCooldowns[formId] || 0;
    const diff = (now - lastTime) / 1000;

    if (diff < 300) {
        const rem = 300 - Math.floor(diff);
        showToast(`⏳ Vui lòng chờ ${Math.floor(rem / 60)}p ${rem % 60}s nữa!`, 'warning');
        return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    const hours = parseFloat(data.so_gio) || 0;
    const pages = parseInt(data.so_page) || 0;

    if (hours === 0 && pages === 0) { showToast('⚠️ Vui lòng nhập số giờ hoặc số trang!', 'warning'); return; }

    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner" style="width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: #fff; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px;"></span>ĐANG LƯU...';

    fetch('/api/logtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json())
        .then(result => {
            if (result.status === 'success') {
                logtimeCooldowns[formId] = Date.now();
                showSuccessModal();
                if (typeof handlePetXPResponse === 'function') handlePetXPResponse(result);
            } else {
                showToast('❌ ' + (result.message || 'Có lỗi xảy ra.'), 'error');
            }
        })
        .catch(() => showToast('❌ Lỗi kết nối!', 'error'))
        .finally(() => { btn.disabled = false; btn.textContent = orig; });
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
        const old = btn.innerHTML;
        btn.innerHTML = '✅ Đã Copy';
        setTimeout(() => { btn.innerHTML = old; }, 2000);
    }).catch(() => showToast('Copy thất bại!', 'error'));
}

function toggleAskTask(el) {
    const content = el.nextElementSibling;
    if (content) content.classList.toggle('open');
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

                    const tpKeyParts = tpKey.split(' - ');
                    const oldTpKey = tpKeyParts.length > 1 ? tpKeyParts.slice(1).join(' - ') : tpKey;

                    // Count how many are checked for this tpKey in the fetched data
                    let localCheckedCount = 0;
                    let freshCheckedIds = [];
                    for (let i = 1; i <= 9; i++) {
                        const checkId = `t${i}`;
                        const isCheckedNew = checkedMap[tpKey] && checkedMap[tpKey][checkId];
                        const isCheckedOld = checkedMap[oldTpKey] && checkedMap[oldTpKey][checkId];
                        const finalChecked = Boolean(isCheckedNew || isCheckedOld);
                        if (finalChecked) {
                            localCheckedCount++;
                            freshCheckedIds.push(checkId);
                        }
                        
                        // Update checkboxes inside the modal
                        const escapedTpKey = tpKey.replace(/"/g, '\\"');
                        const checkboxes = document.querySelectorAll(`.checklist-grid[data-tp-key="${escapedTpKey}"] input[data-check-id="${checkId}"]`);
                        checkboxes.forEach(cb => {
                            cb.checked = finalChecked;
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

// ===================== PROFILE PANEL (SLIDE-UP) =====================
function toggleProfilePanel() {
    const panel = document.getElementById('profile-panel');
    const chevron = document.getElementById('profile-chevron');
    const lofi = document.getElementById('lofi-radio-widget');
    if (panel) {
        panel.classList.toggle('open');
    }
    if (chevron) {
        chevron.classList.toggle('rotated');
    }
    if (lofi) {
        // Toggle a compact mode when the profile panel opens to save space
        if (panel.classList.contains('open')) {
            lofi.classList.add('compact-mode');
        } else {
            lofi.classList.remove('compact-mode');
        }
    }
}

// Close profile panel when clicking outside sidebar
document.addEventListener('click', function (e) {
    const panel = document.getElementById('profile-panel');
    const sidebar = document.querySelector('.sidebar');
    if (panel && panel.classList.contains('open') && sidebar && !sidebar.contains(e.target)) {
        panel.classList.remove('open');
        const chevron = document.getElementById('profile-chevron');
        if (chevron) chevron.classList.remove('rotated');
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
    const badge = document.getElementById('deadline-nay-badge');
    if (popup && popup.style.display === 'block') {
        if (!popup.contains(e.target) && e.target !== badge) {
            popup.style.display = 'none';
        }
    }
});

// ======================================
// ROLE MODAL (Popup Phân Quyền)
// ======================================
function openRoleModal() {
    const overlay = document.getElementById('role-overlay');
    const modal = document.getElementById('role-modal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }
}

function closeRoleModal() {
    const overlay = document.getElementById('role-overlay');
    const modal = document.getElementById('role-modal');
    if (overlay && modal) {
        overlay.classList.remove('active');
        modal.classList.remove('active');
    }
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

function selectWeek(offset, text, e) {
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
// MINI CHAT BOX
// ======================================
let unreadChatCount = 0;
let isChatOpen = false;

window.toggleChat = function () {
    const win = document.getElementById('chat-window');
    const badge = document.getElementById('chat-badge');
    if (!win) return;

    isChatOpen = win.style.display === 'flex';
    if (isChatOpen) {
        win.style.display = 'none';
        isChatOpen = false;
    } else {
        win.style.display = 'flex';
        isChatOpen = true;
        unreadChatCount = 0;
        if (badge) badge.style.display = 'none';
        const input = document.getElementById('chat-input');
        if (input) input.focus();

        // Scroll to bottom
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
};

window.sendChatMessage = function () {
    const input = document.getElementById('chat-input');
    if (!input || !window.socket) return;
    const msg = input.value.trim();
    if (msg) {
        window.socket.emit('chat_message', { msg: msg });
        input.value = '';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('chat-input');
    if (input) {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    if (typeof window.socket !== 'undefined' && window.socket) {
        window.socket.on('chat_message', function (data) {
            const msgs = document.getElementById('chat-messages');
            if (!msgs) return;

            const isMe = data.username === (document.querySelector('.user-name')?.innerText || '');

            let html = `
                <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 4px;">
                    <span style="font-size: 10px; color: var(--text-3); margin-bottom: 2px;">${isMe ? 'Bạn' : data.fullname} - ${data.time}</span>
                    <div style="background: ${isMe ? 'var(--primary)' : 'var(--bg-body)'}; color: ${isMe ? 'white' : 'var(--text)'}; padding: 8px 12px; border-radius: 12px; max-width: 85%; word-wrap: break-word;">
                        ${data.msg}
                    </div>
                </div>
            `;

            msgs.innerHTML += html;
            msgs.scrollTop = msgs.scrollHeight;

            if (!isChatOpen) {
                unreadChatCount++;
                const badge = document.getElementById('chat-badge');
                if (badge) {
                    badge.innerText = unreadChatCount;
                    badge.style.display = 'flex';
                }
            }
        });
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
    allow_requests: false,
    queue: []
};
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

window.onYouTubeIframeAPIReady = function () {
    const pVars = { 'autoplay': 0, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0 };
    ytPlayer = new YT.Player('lofi-youtube-player', {
        height: '0',
        width: '0',
        videoId: radioState.youtube_id,
        playerVars: pVars,
        events: {
            'onReady': function(event) {
                if(event.target.getIframe) {
                    event.target.getIframe().style.opacity = '1';
                    event.target.getIframe().style.zIndex = '2';
                }
                onPlayerReady(event);
            },
            'onStateChange': function(event) {
                // Only process events from the active player, ignore during crossfade
                if (event.target !== ytPlayer || isCrossfading) return;
                onPlayerStateChange(event);
            }
        }
    });
    ytPlayer2 = new YT.Player('lofi-youtube-player-2', {
        height: '0',
        width: '0',
        playerVars: pVars,
        events: {
            'onReady': function(event) { 
                if(event.target.getIframe) {
                    event.target.getIframe().style.opacity = '0';
                    event.target.getIframe().style.zIndex = '1';
                }
            },
            'onStateChange': function(event) {
                if (event.target !== ytPlayer || isCrossfading) return;
                onPlayerStateChange(event);
            }
        }
    });
};

// ---- Crossfade (Auto-Mix) ----
window.cancelCrossfade = function() {
    if (window.fadeInterval) {
        clearInterval(window.fadeInterval);
        window.fadeInterval = null;
    }
    isCrossfading = false;
    var overlay = document.getElementById('radio-mixing-overlay');
    var label = document.getElementById('radio-mixing-label');
    if (overlay) overlay.style.display = 'none';
    if (label) label.style.display = 'none';
    if (ytPlayer2 && ytPlayer2.pauseVideo) {
        try { ytPlayer2.pauseVideo(); } catch(e) {}
    }
    if (ytPlayer && ytPlayer.setVolume) {
        try { ytPlayer.setVolume(100); } catch(e) {}
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
            ytPlayer.playVideo();
        }
        if (callback) callback();
        return;
    }
    isCrossfading = true;

    ytPlayer2.setVolume(0);
    ytPlayer2.loadVideoById(newVideoId, startTime);
    ytPlayer2.playVideo();

    var fadeTime = 20000; // 20 seconds crossfade (Apple Music style)
    var intervalTime = 100;
    var steps = fadeTime / intervalTime;
    var currentStep = 0;
    var startVol = 100;
    try { startVol = ytPlayer.getVolume() || 100; } catch (e) {}

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
            if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(Math.max(0, Math.round(startVol * (1 - ratio))));
            if (ytPlayer2 && ytPlayer2.setVolume) ytPlayer2.setVolume(Math.min(100, Math.round(startVol * ratio)));
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
                if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(100);
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
            isCrossfading = false;
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
        radioState.is_automix_enabled = state.is_automix_enabled !== false;
        radioState.video_active = !!state.video_active;
        if (state.queue) radioState.queue = state.queue;

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
        const isNearEnd = duration > 0 && (duration - currentTime) <= 22;

        if (currentVideo !== state.youtube_id) {
            if (!isCrossfading && currentVideo && window.crossfadeTo && isNearEnd) {
                window.crossfadeTo(state.youtube_id, state.current_time);
            } else {
                if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
                ytPlayer.loadVideoById(state.youtube_id, state.current_time);
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
        radioState.is_automix_enabled = state.is_automix_enabled !== false;
        radioState.video_active = !!state.video_active;
        if (state.queue) radioState.queue = state.queue;

        if (isListening && ytPlayer && ytPlayer.loadVideoById) {
            const currentVideo = ytPlayer.getVideoData?.()?.video_id;
            const duration = ytPlayer.getDuration?.() || 0;
            const currentTime = ytPlayer.getCurrentTime?.() || 0;
            const isNearEnd = duration > 0 && (duration - currentTime) <= 22;

            if (currentVideo !== state.youtube_id) {
                if (!isCrossfading && currentVideo && window.crossfadeTo && isNearEnd) {
                    window.crossfadeTo(state.youtube_id, state.current_time);
                } else {
                    if (isCrossfading && window.cancelCrossfade) window.cancelCrossfade();
                    ytPlayer.loadVideoById(state.youtube_id, state.current_time);
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
        if (window.updateRadioUI) window.updateRadioUI();
    });
}

function onPlayerStateChange(event) {
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

    // Hàm chuyên biệt để join radio từ Pet - không bị chặn bởi ytPlayer check
    window.joinRadioFromPet = function () {
        if (isRadioDJ || isListening) return; // Đã là DJ hoặc đang nghe rồi thì bỏ qua

        // 1. Đánh dấu đang nghe
        isListening = true;

        // 2. Thông báo server
        if (useRadioPolling) {
            radioApiPost('/api/radio/join');
            startListenerHeartbeat();
            startRadioPolling();
        } else if (window.socket) {
            window.socket.emit('join_radio');
        }

        // 3. Load & play video nếu YT Player sẵn sàng
        if (ytPlayer && ytPlayer.getPlayerState) {
            const currentVideo = ytPlayer.getVideoData?.()?.video_id;
            if (currentVideo !== radioState.youtube_id) {
                ytPlayer.loadVideoById(radioState.youtube_id, radioState.current_time);
            } else {
                ytPlayer.seekTo(radioState.current_time, true);
            }
            if (radioState.is_playing) ytPlayer.playVideo();
        } else {
            // YT Player chưa sẵn sàng → retry sau 1 giây
            setTimeout(() => {
                if (ytPlayer && ytPlayer.loadVideoById) {
                    ytPlayer.loadVideoById(radioState.youtube_id, radioState.current_time);
                    if (radioState.is_playing) ytPlayer.playVideo();
                }
            }, 1000);
        }

        // 4. Cập nhật UI
        updateRadioUI();
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
                            if (window.socket) {
                                window.socket.emit('queue_add', { youtube_id: videoId, title: title });
                            }
                        })
                        .catch(() => {
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
        if (!window.manualSkipInProgress && radioState.is_automix_enabled !== false && !isCrossfading && duration > 0 && (duration - time) <= 20 && (duration - time) > 0 && radioState.queue && radioState.queue.length > 0) {
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
                current_time: time,
                next_title: radioState.next_title,
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
                is_automix_enabled: radioState.is_automix_enabled !== false,
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

        const displayPlaying = isRadioDJ ? radioState.is_playing : isListening;

        if (displayPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }

        const wrapper = document.getElementById('radio-video-wrapper');
        const btn = document.getElementById('radio-video-toggle');
        if (wrapper && btn) {
            if (radioState.video_active) {
                wrapper.style.display = 'block';
                btn.style.color = '#34c759';
            } else {
                wrapper.style.display = 'none';
                btn.style.color = 'rgba(255,255,255,0.4)';
            }
            if (!isRadioDJ) {
                btn.style.cursor = 'default';
            } else {
                btn.style.cursor = 'pointer';
            }
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
                if (automixCheckbox) automixCheckbox.checked = radioState.is_automix_enabled !== false;
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
    
    // Realtime Rain Effect Global Functions
    let rainInterval = null;

    window.startRainEffect = function() {
        let overlay = document.getElementById('rain-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rain-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '9999';
            overlay.style.overflow = 'hidden';
            document.body.appendChild(overlay);
            
            if (!document.getElementById('rain-css')) {
                const style = document.createElement('style');
                style.id = 'rain-css';
                style.innerHTML = `
                    .raindrop {
                        position: absolute;
                        background: linear-gradient(transparent, rgba(255, 255, 255, 0.4));
                        width: 1px;
                        height: 50px;
                        bottom: 100%;
                        animation: fall linear infinite;
                    }
                    @keyframes fall {
                        to { transform: translateY(100vh); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        if (rainInterval) return;
        overlay.style.display = 'block';
        
        rainInterval = setInterval(() => {
            const drop = document.createElement('div');
            drop.className = 'raindrop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
            drop.style.opacity = Math.random() * 0.5 + 0.2;
            overlay.appendChild(drop);
            
            setTimeout(() => {
                if (drop.parentNode) drop.parentNode.removeChild(drop);
            }, 1000);
        }, 50);
    };

    window.stopRainEffect = function() {
        const overlay = document.getElementById('rain-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }
        if (rainInterval) {
            clearInterval(rainInterval);
            rainInterval = null;
        }
    };

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

window.toggleRadioVideo = function() {
    if (!isRadioDJ) {
        showToast(CURRENT_LANG === 'vi' ? 'Chỉ DJ mới có thể chuyển đổi hiển thị video' : 'DJのみがビデオ表示を切り替えることができます', 'info');
        return;
    }
    radioState.video_active = !radioState.video_active;
    if (window.updateRadioUI) updateRadioUI();
    if (window.syncRadioToServer) syncRadioToServer();
};
