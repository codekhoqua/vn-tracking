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
    const el = document.getElementById('weather-time');
    if (!el) return;
    const isVN = (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'vi');
    const locQuery = isVN ? "Ho+Chi+Minh" : "Gifu";
    const locName = isVN ? "TP. Hồ Chí Minh" : "Gifu, Japan";

    const updateTime = () => {
        const now = new Date();
        const timeZone = isVN ? 'Asia/Ho_Chi_Minh' : 'Asia/Tokyo';
        const timeStr = now.toLocaleTimeString(isVN ? 'vi-VN' : 'ja-JP', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = now.toLocaleDateString(isVN ? 'vi-VN' : 'ja-JP', { timeZone, weekday: 'short', month: 'short', day: 'numeric' });

        const timeSpan = document.getElementById('wt-time');
        if (timeSpan) timeSpan.innerHTML = `${dateStr} - ${timeStr}`;
    };

    setInterval(updateTime, 1000);

    fetch(`https://wttr.in/${locQuery}?format=j1`)
        .then(r => r.json())
        .then(data => {
            const temp = data.current_condition[0].temp_C;
            el.innerHTML = `
                <span id="wt-loc" style="font-weight: 500;">📍 ${locName}</span>
                <span id="wt-temp" style="margin-left: 12px; font-weight: bold; color: var(--primary);"> 🌥️${temp}°C</span>
                <span id="wt-time" style="margin-left: 12px; font-variant-numeric: tabular-nums;"></span>
            `;
            updateTime();
        }).catch(err => {
            console.error("Weather err:", err);
            el.innerHTML = `<span id="wt-time"></span>`;
            updateTime();
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => {
            m.classList.remove('open');
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

                if (typeof CHECKLIST_API !== 'undefined' && CHECKLIST_API.startsWith('http')) {
                    fetch(CHECKLIST_API, {
                        method: 'POST', mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({ tac_pham: tpKey, checkbox_id: rawId, status: e.target.checked })
                    }).catch(() => { });
                }
                updateTaskProgressLocally(tpKey, container);
            });
        });

        // 1. FAST LOCAL RENDER FROM CARD DATA (Injected by Python)
        const card = document.querySelector(`.progress-card[data-tp-key="${tpKey}"]`);
        if (card) {
            const checkedIds = (card.dataset.checkedIds || '').split(',').filter(Boolean);
            checkboxes.forEach(cb => {
                const rawId = cb.dataset.checkId;
                cb.checked = checkedIds.includes(rawId);
            });
            updateTaskProgressLocally(tpKey, container);
        }

        // 2. BACKGROUND FETCH FOR FRESHNESS (Optional but good for multi-device sync)
        if (tpKey && typeof CHECKLIST_API !== 'undefined' && CHECKLIST_API.startsWith('http')) {
            fetch(`${CHECKLIST_API}?tac_pham=${encodeURIComponent(tpKey)}&_t=${Date.now()}`)
                .then(r => r.json())
                .then(data => {
                    checkboxes.forEach(cb => {
                        if (cb.dataset.userModified !== 'true') {
                            const rawId = cb.dataset.checkId;
                            cb.checked = (data[rawId] === true || data[rawId] === 'true');
                        }
                    });
                    updateTaskProgressLocally(tpKey, container);
                }).catch(() => { });
        }
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


// ===================== LOGTIME SUCCESS MODAL =====================
function showSuccessModal() {
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
    btn.textContent = 'Đang lưu...';

    fetch('/api/logtime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => r.json())
        .then(result => {
            if (result.status === 'success') {
                logtimeCooldowns[formId] = Date.now();
                showSuccessModal();
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
}

// ===================== BACKGROUND SYNC =====================
function backgroundSyncChecklist() {
    if (typeof CHECKLIST_API !== 'undefined' && CHECKLIST_API.startsWith('http')) {
        const cacheBuster = CHECKLIST_API.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`;
        fetch(CHECKLIST_API + cacheBuster)
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
                    for (let i = 1; i <= 9; i++) {
                        if (checkedMap[tpKey] && checkedMap[tpKey][`t${i}`]) {
                            localCheckedCount++;
                        }
                    }

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
});

// ===================== IDLE TIMEOUT =====================
let idleTimer;
const IDLE_LIMIT = 30 * 60 * 1000; // 30 minutes

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(15, 23, 42, 0.9)';
        overlay.style.backdropFilter = 'blur(10px)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.flexDirection = 'column';
        overlay.style.color = 'white';
        overlay.innerHTML = `
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 24px; color: #cbd5e1;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <h2 style="margin-bottom: 12px; font-weight: 800; font-size: 1.5rem;">Phiên làm việc tạm dừng</h2>
            <p style="margin-bottom: 24px; color: #94a3b8; text-align: center;">Trang đã không thao tác trong một thời gian dài.<br>Để đảm bảo dữ liệu mới nhất (không bị lỗi đồng bộ), vui lòng tải lại trang.</p>
            <button onclick="location.reload()" style="padding: 12px 24px; border-radius: 8px; border: none; background: #6366f1; color: white; cursor: pointer; font-weight: bold; font-size: 1rem;">Tải lại trang (Refresh)</button>
        `;
        document.body.appendChild(overlay);
    }, IDLE_LIMIT);
}

// Reset timer on user interaction
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
});
resetIdleTimer();

// ===================== PROFILE PANEL (SLIDE-UP) =====================
function toggleProfilePanel() {
    const panel = document.getElementById('profile-panel');
    const chevron = document.getElementById('profile-chevron');
    if (panel) {
        panel.classList.toggle('open');
    }
    if (chevron) {
        chevron.classList.toggle('rotated');
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

