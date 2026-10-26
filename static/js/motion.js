/* ================================================================
   VN-TRACKING — MOTION LAYER
   GSAP (animation) + IntersectionObserver (trigger)
   ----------------------------------------------------------------
   Opt-in bằng data-attribute, không tự ý sửa layout của component:

   [data-reveal]                     hiện dần khi vào viewport
   [data-reveal="up|left|right|zoom|fade"]
   [data-reveal-delay="0.15"]        delay riêng (giây)
   [data-reveal-group="0.06"]        stagger các con trực tiếp
   [data-reveal-ignore]              con không tham gia group
   [data-motion="page"]              root của page entrance
   [data-motion-item]                từng item trong page entrance
   [data-countup]                    đếm số khi vào viewport
   [data-countup="1234"]             giá trị đích (mặc định đọc text)
   [data-countup-format="vi"]        format theo vi-VN
   [data-countup-suffix="%"]         hậu tố
   [data-bg="url"]                   lazy background-image
   [data-magnetic]                   magnetic hover cho nút
   [data-pause-offscreen]            pause CSS animation khi ra khỏi viewport

   API: window.VNMotion.refresh(scope?) / .reveal(el) / .taskOpen(modal, card?)
        / .taskReset(modal) / .tabEnter(tabId) / .reduced()
   ================================================================ */
(function () {
    'use strict';

    var docEl = document.documentElement;
    var gsap = window.gsap;
    var hasIO = typeof window.IntersectionObserver === 'function';
    var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var finePointerQuery = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;

    var config = {
        distance: window.innerWidth < 768 ? 14 : 22,
        duration: 0.62,
        ease: 'power3.out',
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.01
    };

    var REVEAL_SELECTOR = '[data-reveal], [data-reveal-group]';
    var COUNT_SELECTOR = '[data-countup]';
    var BG_SELECTOR = '[data-bg]';
    var MAGNET_SELECTOR = '[data-magnetic]';
    var PAGE_SELECTOR = '[data-motion="page"]';
    var PAUSE_SELECTOR = '[data-pause-offscreen]';

    var revealObserver = null;
    var countObserver = null;
    var bgObserver = null;
    var pauseObserver = null;

    var seenReveal = new WeakSet();
    var seenCount = new WeakSet();
    var seenBg = new WeakSet();
    var seenMagnet = new WeakSet();
    var seenPause = new WeakSet();

    var revealTimelines = [];
    var countTweens = [];
    var pausedNodes = new WeakSet();
    var taskTimelines = typeof WeakMap === 'function' ? new WeakMap() : null;
    var booted = false;
    var mutationObserver = null;

    function prefersReduced() {
        return !!(reduceQuery && reduceQuery.matches);
    }

    function asElements(list) {
        return Array.prototype.slice.call(list || []);
    }

    function parseNumber(value, fallback) {
        var n = parseFloat(value);
        return isFinite(n) ? n : fallback;
    }

    /* -------------------------------------------------------------
       REVEAL — IntersectionObserver quyết định thời điểm,
       GSAP đảm nhiệm animation (transform + opacity).
       ------------------------------------------------------------- */
    function fromVarsFor(direction) {
        var d = config.distance;
        switch (direction) {
            case 'left': return { autoAlpha: 0, x: -d };
            case 'right': return { autoAlpha: 0, x: d };
            case 'zoom': return { autoAlpha: 0, scale: 0.96 };
            case 'fade': return { autoAlpha: 0 };
            default: return { autoAlpha: 0, y: d };
        }
    }

    function toVars() {
        return {
            autoAlpha: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: config.duration,
            ease: config.ease,
            overwrite: 'auto'
        };
    }

    function settleReveal(nodes) {
        nodes.forEach(function (el) {
            if (el && el.isConnected) el.classList.add('is-revealed');
        });
        if (gsap) gsap.set(nodes, { clearProps: 'opacity,visibility,transform' });
    }

    function groupChildren(group) {
        return asElements(group.children).filter(function (el) {
            return el.nodeType === 1 && !el.hasAttribute('data-reveal-ignore');
        });
    }

    function animateGroup(group) {
        var children = groupChildren(group);
        if (!children.length) {
            group.classList.add('is-revealed');
            return;
        }
        if (!gsap) {
            // Fallback: CSS transition lo phần animation.
            group.classList.add('is-revealed');
            return;
        }

        var groupDir = group.getAttribute('data-reveal') || 'up';
        var stagger = Math.max(0.02, parseNumber(group.getAttribute('data-reveal-group'), 0.06));

        var tl = gsap.timeline({
            onComplete: function () {
                settleReveal(children);
                group.classList.add('is-revealed');
            }
        });
        children.forEach(function (child, i) {
            var direction = child.getAttribute('data-reveal') || groupDir;
            tl.fromTo(child, fromVarsFor(direction), toVars(), i * stagger);
        });
        revealTimelines.push(tl);
    }

    function animateSingles(nodes) {
        if (!gsap) {
            nodes.forEach(function (el) { el.classList.add('is-revealed'); });
            return;
        }
        var tl = gsap.timeline({
            onComplete: function () { settleReveal(nodes); }
        });
        nodes.forEach(function (el, i) {
            var delay = Math.max(0, parseNumber(el.getAttribute('data-reveal-delay'), 0));
            var direction = el.getAttribute('data-reveal') || 'up';
            // Card list dài: giới hạn stagger để không bắt người dùng chờ.
            var startAt = delay + Math.min(i, 8) * 0.035;
            tl.fromTo(el, fromVarsFor(direction), toVars(), startAt);
        });
        revealTimelines.push(tl);
    }

    function onRevealIntersect(entries, observer) {
        var singles = [];
        var groups = [];

        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            if (entry.target.hasAttribute('data-reveal-group')) groups.push(entry.target);
            else singles.push(entry.target);
        });

        if (singles.length) animateSingles(singles);
        groups.forEach(animateGroup);
    }

    /* -------------------------------------------------------------
       COUNT-UP
       ------------------------------------------------------------- */
    function parseCountTarget(el) {
        var raw = el.getAttribute('data-countup');
        if (raw && raw !== 'true') {
            var explicit = parseFloat(raw);
            if (isFinite(explicit)) return explicit;
        }
        var text = (el.textContent || '').replace(/\s/g, '');
        var cleaned = text.replace(/[^\d.,-]/g, '');
        if (!cleaned) return 0;
        // "1.234" / "1,234" -> 1234; "12.5" -> 12.5
        var lastComma = cleaned.lastIndexOf(',');
        var lastDot = cleaned.lastIndexOf('.');
        if (lastComma > -1 && lastDot > -1) {
            var decimalSep = lastComma > lastDot ? ',' : '.';
            var thousandSep = decimalSep === ',' ? '.' : ',';
            cleaned = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
        } else if (lastDot > -1 && cleaned.length - lastDot - 1 === 3) {
            cleaned = cleaned.split('.').join('');
        } else if (lastComma > -1 && cleaned.length - lastComma - 1 === 3) {
            cleaned = cleaned.split(',').join('');
        } else {
            cleaned = cleaned.replace(',', '.');
        }
        var value = parseFloat(cleaned);
        return isFinite(value) ? value : 0;
    }

    function formatCount(el, value) {
        var suffix = el.getAttribute('data-countup-suffix') || '';
        var prefix = el.getAttribute('data-countup-prefix') || '';
        var formatted;
        if (el.getAttribute('data-countup-format') === 'vi') {
            formatted = Math.round(value).toLocaleString('vi-VN');
        } else {
            formatted = String(Math.round(value));
        }
        return prefix + formatted + suffix;
    }

    function runCountUp(el) {
        var target = parseCountTarget(el);
        if (!gsap || prefersReduced() || target === 0) {
            el.textContent = formatCount(el, target);
            return;
        }
        var state = { value: 0 };
        el.style.fontVariantNumeric = 'tabular-nums';
        var tween = gsap.to(state, {
            value: target,
            duration: 1.1,
            ease: 'power2.out',
            snap: { value: 1 },
            onUpdate: function () { el.textContent = formatCount(el, state.value); },
            onComplete: function () {
                el.textContent = formatCount(el, target);
                el.style.fontVariantNumeric = '';
            }
        });
        countTweens.push(tween);
    }

    function onCountIntersect(entries, observer) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            runCountUp(entry.target);
        });
    }

    /* -------------------------------------------------------------
       LAZY BACKGROUND
       ------------------------------------------------------------- */
    function loadBackground(el) {
        var src = el.getAttribute('data-bg');
        if (!src) return;
        if (el.tagName === 'IMG') {
            el.src = src;
        } else {
            el.style.backgroundImage = 'url("' + src.replace(/"/g, '\\"') + '")';
        }
        el.classList.add('is-bg-loaded');
    }

    function onBgIntersect(entries, observer) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            loadBackground(entry.target);
        });
    }

    /* -------------------------------------------------------------
       PAUSE CSS ANIMATION OFF-SCREEN
       ------------------------------------------------------------- */
    function onPauseIntersect(entries) {
        entries.forEach(function (entry) {
            var el = entry.target;
            if (entry.isIntersecting) {
                el.classList.remove('motion-paused');
                pausedNodes.delete(el);
            } else if (!pausedNodes.has(el)) {
                el.classList.add('motion-paused');
                pausedNodes.add(el);
            }
        });
    }

    /* -------------------------------------------------------------
       MAGNETIC HOVER (gsap.quickTo)
       ------------------------------------------------------------- */
    function initMagnetic(scope) {
        if (!gsap || prefersReduced() || !finePointerQuery || !finePointerQuery.matches) return;

        var nodes = [];
        var root = scope && scope.nodeType === 1 ? scope : document;
        if (root.matches && root.matches(MAGNET_SELECTOR)) nodes.push(root);
        nodes = nodes.concat(asElements(root.querySelectorAll(MAGNET_SELECTOR)));

        nodes.forEach(function (el) {
            if (seenMagnet.has(el)) return;
            seenMagnet.add(el);

            var strength = parseNumber(el.getAttribute('data-magnetic'), 0.25);
            var rect = null;
            var xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
            var yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });

            function onEnter() { rect = el.getBoundingClientRect(); }
            function onMove(e) {
                if (!rect) rect = el.getBoundingClientRect();
                var dx = e.clientX - (rect.left + rect.width / 2);
                var dy = e.clientY - (rect.top + rect.height / 2);
                xTo(Math.max(-8, Math.min(8, dx * strength)));
                yTo(Math.max(-8, Math.min(8, dy * strength)));
            }
            function onLeave() {
                rect = null;
                gsap.to(el, {
                    x: 0,
                    y: 0,
                    duration: 0.45,
                    ease: 'power3.out',
                    overwrite: 'auto',
                    onComplete: function () { gsap.set(el, { clearProps: 'transform' }); }
                });
            }

            el.addEventListener('pointerenter', onEnter);
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerleave', onLeave);
        });
    }

    /* -------------------------------------------------------------
       PAGE ENTRANCE — chạy 1 lần khi load, không phụ thuộc scroll.
       ------------------------------------------------------------- */
    function initPageMotion() {
        var roots = asElements(document.querySelectorAll(PAGE_SELECTOR));
        roots.forEach(function (root) {
            var items = asElements(root.querySelectorAll('[data-motion-item]'));
            if (!items.length) return;
            if (!gsap || prefersReduced()) {
                root.classList.add('is-motion-done');
                items.forEach(function (el) { el.classList.add('is-revealed'); });
                return;
            }
            // Bỏ trạng thái ẩn bằng CSS ngay khi GSAP nắm quyền điều khiển.
            root.classList.add('is-motion-done');
            var tl = gsap.timeline({
                defaults: { duration: 0.7, ease: config.ease },
                delay: 0.05
            });
            tl.fromTo(items,
                { autoAlpha: 0, y: 14 },
                { autoAlpha: 1, y: 0, stagger: 0.09, clearProps: 'opacity,visibility,transform' }
            );
            revealTimelines.push(tl);
        });
    }

    /* -------------------------------------------------------------
       TASK DETAIL — timeline khi click card Kanban
       Chỉ animate transform/opacity, không đụng layout.
       ------------------------------------------------------------- */
    function taskMotionParts(modal) {
        if (!modal) return null;
        var container = modal.querySelector('.task-page-container');
        if (!container) return null;
        return {
            container: container,
            nav: container.querySelector('.task-page-nav-bar'),
            header: container.querySelector('.task-page-header'),
            lock: container.querySelector('.hist-lock-banner'),
            avatars: asElements(container.querySelectorAll(
                '.task-page-header .worker-avatar, .task-page-header .ghost-avatars'
            )),
            main: asElements(container.querySelectorAll('.task-main-col > *')),
            side: asElements(container.querySelectorAll('.task-side-col > *'))
        };
    }

    function taskMotionTargets(parts) {
        return [parts.container, parts.nav, parts.header, parts.lock]
            .concat(parts.avatars, parts.main, parts.side)
            .filter(function (el) { return !!el; });
    }

    function settleTaskMotion(modal) {
        if (!modal) return;
        if (taskTimelines) taskTimelines.delete(modal);
        var parts = taskMotionParts(modal);
        if (!parts || !gsap) return;
        gsap.set(taskMotionTargets(parts), {
            clearProps: 'opacity,visibility,transform'
        });
    }

    function resetTaskMotion(modal) {
        if (!modal) return;
        if (taskTimelines) {
            var old = taskTimelines.get(modal);
            taskTimelines.delete(modal);
            if (old) old.kill();
        }
        settleTaskMotion(modal);
    }

    function openTaskMotion(modal, source) {
        if (!modal) return;
        if (!gsap || prefersReduced()) {
            resetTaskMotion(modal);
            return;
        }

        var parts = taskMotionParts(modal);
        if (!parts) return;

        var old = taskTimelines ? taskTimelines.get(modal) : null;
        if (old) old.kill();
        if (taskTimelines) taskTimelines.delete(modal);

        var targets = taskMotionTargets(parts).filter(function (el) {
            return el !== parts.container;
        });
        if (!targets.length) return;

        try {
            gsap.set(parts.container, { autoAlpha: 1 });
            gsap.set(targets, { autoAlpha: 0 });
            if (parts.nav) gsap.set(parts.nav, { y: -10 });
            if (parts.header) gsap.set(parts.header, { y: 16 });
            if (parts.lock) gsap.set(parts.lock, { y: 10 });
            if (parts.avatars.length) gsap.set(parts.avatars, { scale: 0.82 });
            if (parts.main.length) gsap.set(parts.main, { y: 20 });
            if (parts.side.length) gsap.set(parts.side, { x: 18 });

            var tl = gsap.timeline({
                defaults: { ease: 'power3.out' },
                onComplete: function () { settleTaskMotion(modal); },
                onInterrupt: function () { resetTaskMotion(modal); }
            });

            tl.fromTo(parts.container,
                { y: 26, scale: 0.988, autoAlpha: 0 },
                { y: 0, scale: 1, autoAlpha: 1, duration: 0.5 },
                0
            );
            if (parts.nav) {
                tl.to(parts.nav, { y: 0, autoAlpha: 1, duration: 0.34 }, 0.06);
            }
            if (parts.header) {
                tl.to(parts.header, { y: 0, autoAlpha: 1, duration: 0.42 }, 0.1);
            }
            if (parts.lock) {
                tl.to(parts.lock, { y: 0, autoAlpha: 1, duration: 0.3 }, 0.16);
            }
            if (parts.avatars.length) {
                tl.to(parts.avatars, {
                    scale: 1,
                    autoAlpha: 1,
                    duration: 0.34,
                    stagger: 0.04,
                    ease: 'back.out(1.7)'
                }, 0.2);
            }
            if (parts.main.length) {
                tl.to(parts.main, {
                    y: 0,
                    autoAlpha: 1,
                    duration: 0.44,
                    stagger: 0.06
                }, 0.16);
            }
            if (parts.side.length) {
                tl.to(parts.side, {
                    x: 0,
                    autoAlpha: 1,
                    duration: 0.4,
                    stagger: 0.07
                }, 0.26);
            }
            if (source) {
                tl.fromTo(source, { scale: 0.985 }, {
                    scale: 1,
                    duration: 0.34,
                    ease: 'back.out(1.7)',
                    clearProps: 'transform'
                }, 0);
            }

            if (taskTimelines) taskTimelines.set(modal, tl);
        } catch (err) {
            resetTaskMotion(modal);
        }
    }

    /* Đổi tab tuần: cột Kanban trượt nhẹ vào, tránh cảm giác "bụp" tức thì. */
    function animateTabEnter(tabId) {
        if (!gsap || prefersReduced() || !tabId) return;
        var tab = document.getElementById('tab-' + tabId);
        if (!tab) return;
        var columns = asElements(tab.querySelectorAll('.kanban-column'));
        if (!columns.length) return;
        gsap.killTweensOf(columns);
        gsap.fromTo(columns,
            { autoAlpha: 0.55, y: 12 },
            {
                autoAlpha: 1,
                y: 0,
                duration: 0.42,
                stagger: 0.06,
                ease: 'power3.out',
                overwrite: 'auto',
                clearProps: 'opacity,visibility,transform'
            }
        );
    }

    /* -------------------------------------------------------------
       SCAN / OBSERVE
       ------------------------------------------------------------- */
    function addObserver(observer, el) {
        if (observer && el && el.isConnected) observer.observe(el);
    }

    function collect(root, selector) {
        var nodes = [];
        if (root.matches && root.matches(selector)) nodes.push(root);
        return nodes.concat(asElements(root.querySelectorAll(selector)));
    }

    function scan(scope) {
        if (!document.body) return;
        var root = scope && scope.nodeType === 1 ? scope : document;

        // Reveal: con trực tiếp của group do group quản lý, không observe trùng.
        collect(root, REVEAL_SELECTOR).forEach(function (el) {
            if (seenReveal.has(el)) return;
            if (
                el.parentElement &&
                el.parentElement.hasAttribute('data-reveal-group') &&
                !el.hasAttribute('data-reveal-group')
            ) {
                seenReveal.add(el); // group tự animate con, đánh dấu để khỏi quét lại.
                return;
            }
            seenReveal.add(el);
            if (!hasIO || prefersReduced()) {
                el.classList.add('is-revealed');
                return;
            }
            addObserver(revealObserver, el);
        });

        collect(root, COUNT_SELECTOR).forEach(function (el) {
            if (seenCount.has(el)) return;
            seenCount.add(el);
            if (!hasIO || prefersReduced()) {
                el.textContent = formatCount(el, parseCountTarget(el));
                return;
            }
            addObserver(countObserver, el);
        });

        collect(root, BG_SELECTOR).forEach(function (el) {
            if (seenBg.has(el)) return;
            seenBg.add(el);
            if (!hasIO) {
                loadBackground(el);
                return;
            }
            addObserver(bgObserver, el);
        });

        collect(root, PAUSE_SELECTOR).forEach(function (el) {
            if (seenPause.has(el)) return;
            seenPause.add(el);
            addObserver(pauseObserver, el);
        });

        initMagnetic(root);
    }

    /* -------------------------------------------------------------
       DYNAMIC CONTENT — chỉ quét subtree vừa được thêm vào.
       ------------------------------------------------------------- */
    function initMutationScan() {
        if (!window.MutationObserver || !document.body) return;

        var pending = [];
        var scheduled = false;

        function flush() {
            scheduled = false;
            var roots = pending;
            pending = [];
            roots.forEach(function (node) {
                if (node && node.isConnected && node.nodeType === 1) scan(node);
            });
        }

        function schedule(node) {
            pending.push(node);
            if (scheduled) return;
            scheduled = true;
            window.setTimeout(flush, 140);
        }

        mutationObserver = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    // Chỉ quan tâm subtree có khả năng chứa motion hooks.
                    if (node.matches && node.matches(REVEAL_SELECTOR + ',' + COUNT_SELECTOR + ',' + BG_SELECTOR + ',' + PAUSE_SELECTOR + ',' + MAGNET_SELECTOR)) {
                        schedule(node);
                    } else if (node.querySelector && node.querySelector(REVEAL_SELECTOR + ',' + COUNT_SELECTOR + ',' + BG_SELECTOR + ',' + PAUSE_SELECTOR + ',' + MAGNET_SELECTOR)) {
                        schedule(node);
                    }
                });
            });
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    /* -------------------------------------------------------------
       REDUCED MOTION / CLEANUP
       ------------------------------------------------------------- */
    function showEverything() {
        asElements(document.querySelectorAll(REVEAL_SELECTOR)).forEach(function (el) {
            el.classList.add('is-revealed');
        });
        asElements(document.querySelectorAll(PAGE_SELECTOR)).forEach(function (el) {
            el.classList.add('is-motion-done');
        });
        asElements(document.querySelectorAll(COUNT_SELECTOR)).forEach(function (el) {
            el.textContent = formatCount(el, parseCountTarget(el));
        });
        asElements(document.querySelectorAll(BG_SELECTOR)).forEach(loadBackground);
        asElements(document.querySelectorAll(PAUSE_SELECTOR)).forEach(function (el) {
            el.classList.remove('motion-paused');
        });

        revealTimelines.forEach(function (tl) { tl.kill(); });
        countTweens.forEach(function (t) { t.kill(); });
        revealTimelines = [];
        countTweens = [];

        [revealObserver, countObserver, bgObserver, pauseObserver].forEach(function (observer) {
            if (observer) observer.disconnect();
        });

        if (gsap) {
            gsap.set(asElements(document.querySelectorAll(REVEAL_SELECTOR)), {
                clearProps: 'opacity,visibility,transform'
            });
        }
    }

    function onReducedMotionChange() {
        if (prefersReduced()) showEverything();
    }

    function boot() {
        if (booted) return;
        booted = true;

        if (prefersReduced()) {
            showEverything();
            return;
        }

        if (hasIO) {
            revealObserver = new IntersectionObserver(onRevealIntersect, {
                threshold: config.threshold,
                rootMargin: config.rootMargin
            });
            countObserver = new IntersectionObserver(onCountIntersect, { threshold: 0.5 });
            bgObserver = new IntersectionObserver(onBgIntersect, { rootMargin: '300px' });
            pauseObserver = new IntersectionObserver(onPauseIntersect, { threshold: 0.01 });
        }

        initPageMotion();
        scan(document);
        initMutationScan();
    }

    /* -------------------------------------------------------------
       CLASSES + PUBLIC API
       ------------------------------------------------------------- */
    if (!prefersReduced()) {
        docEl.classList.add('motion-ready');
        docEl.classList.add(gsap ? 'motion-gsap' : 'motion-css');
    }

    if (gsap) {
        gsap.defaults({ ease: config.ease, duration: config.duration });
    }

    if (reduceQuery) {
        if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onReducedMotionChange);
        else if (reduceQuery.addListener) reduceQuery.addListener(onReducedMotionChange);
    }

    if (document.readyState === 'complete') boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });

    window.VNMotion = {
        version: '1.0.0',
        refresh: function (scope) { scan(scope || document); },
        reveal: function (target) {
            var el = typeof target === 'string' ? document.querySelector(target) : target;
            if (!el) return;
            el.classList.add('is-revealed');
            if (gsap) gsap.set(el, { clearProps: 'opacity,visibility,transform' });
        },
        countUp: function (target) {
            var els = typeof target === 'string'
                ? asElements(document.querySelectorAll(target))
                : [target];
            els.forEach(function (el) { if (el) runCountUp(el); });
        },
        taskOpen: openTaskMotion,
        taskReset: resetTaskMotion,
        tabEnter: animateTabEnter,
        reduced: prefersReduced
    };
})();
