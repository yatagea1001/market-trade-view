// ============================================================
// context-menu.js — Context Menu Handler
// ------------------------------------------------------------
// Menampilkan popup "Sembunyikan/Tampilkan Title Bar" + "Tutup Frame"
// saat user klik kanan (desktop) atau tap-hold (mobile).
// ============================================================

window.JT = window.JT || {};

JT.ContextMenu = {

    // Mapping toolbar ID → frameId + nama
    FRAME_MAP: {
        'jt-drawing-toolbar': { id: 0, name: 'Tools' },
        'jt-right-toolbar':   { id: 1, name: 'Panel' },
        'jt-nav-toolbar':     { id: 3, name: 'Navigasi' }
    },

    /**
     * Bind context menu ke semua toolbar.
     */
    bind() {
        const overlay = JT.State.overlay;
        const menu = overlay ? overlay.querySelector('#jt-context-menu') : null;
        if (!overlay || !menu) return;

        const W = JT.WasmBridge;
        const C = JT.Config;

        // ── Show menu ──
        const showMenu = (x, y, toolbarId) => {
            const info = this.FRAME_MAP[toolbarId];
            if (!info) return;
            JT.State.contextMenuTarget = { toolbarId, frameId: info.id, frameName: info.name };

            // Update header + label sesuai state title bar sekarang
            const titleBarVisible = W.call('wasm_jt_get_title_bar_visible', 'number', ['number'], [info.id]);
            const titleLabel = overlay.querySelector('#jt-ctx-title-label');
            const titleIcon  = overlay.querySelector('#jt-ctx-title-icon');
            const header     = overlay.querySelector('#jt-ctx-header');
            if (header) header.textContent = info.name;
            if (titleLabel) {
                titleLabel.textContent = (titleBarVisible === 1)
                    ? 'Sembunyikan Title Bar'
                    : 'Tampilkan Title Bar';
            }
            if (titleIcon) {
                titleIcon.textContent = (titleBarVisible === 1) ? '👁️' : '🙈';
            }

            // Posisi menu — clamp supaya tidak keluar viewport
            const menuW = 200, menuH = 130;
            let mx = x, my = y;
            if (mx + menuW > window.innerWidth)  mx = window.innerWidth - menuW - 4;
            if (my + menuH > window.innerHeight) my = window.innerHeight - menuH - 4;
            menu.style.left = mx + 'px';
            menu.style.top  = my + 'px';
            menu.classList.add('jt-visible');
        };

        // ── Hide menu ──
        const hideMenu = () => {
            menu.classList.remove('jt-visible');
            JT.State.contextMenuTarget = null;
        };

        // ── 1. Klik kanan (desktop) ──
        overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
            toolbar.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showMenu(e.clientX, e.clientY, toolbar.id);
            });
        });

        // ── 2. Long-press (mobile) ──
        overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
            toolbar.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                const touch = e.touches[0];
                const startX = touch.clientX, startY = touch.clientY;
                const tbId = toolbar.id;
                JT.State.longPressTimer = setTimeout(() => {
                    showMenu(startX, startY, tbId);
                }, C.LONG_PRESS_DELAY);
            }, { passive: true });

            toolbar.addEventListener('touchmove', () => {
                clearTimeout(JT.State.longPressTimer);
            }, { passive: true });
            toolbar.addEventListener('touchend', () => {
                clearTimeout(JT.State.longPressTimer);
            }, { passive: true });
            toolbar.addEventListener('touchcancel', () => {
                clearTimeout(JT.State.longPressTimer);
            }, { passive: true });
        });

        // ── 3. Klik item menu ──
        overlay.querySelectorAll('.jt-context-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                if (!JT.State.contextMenuTarget) return;
                const action = item.dataset.action;
                const { frameId, frameName, toolbarId } = JT.State.contextMenuTarget;

                if (action === 'toggle-title') {
                    W.call('wasm_jt_toggle_title_bar', 'number', ['number'], [frameId]);
                    console.log('[JT.ContextMenu] Title bar toggled for', frameName);
                } else if (action === 'close-frame') {
                    const toggleFn = {
                        0: 'wasm_jt_toggle_tools',
                        1: 'wasm_jt_toggle_panel',
                        3: 'wasm_jt_toggle_nav'
                    }[frameId];
                    if (toggleFn) W.toggle(toggleFn);
                    console.log('[JT.ContextMenu] Frame closed:', frameName);
                }

                hideMenu();
            });
        });

        // ── 4. Klik di luar menu → tutup ──
        document.addEventListener('click', (e) => {
            if (!menu.classList.contains('jt-visible')) return;
            if (menu.contains(e.target)) return;
            hideMenu();
        });
        document.addEventListener('contextmenu', (e) => {
            if (!menu.contains(e.target) && !e.target.closest('.jt-toolbar')) {
                hideMenu();
            }
        });

        // ── 5. Escape → tutup ──
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideMenu();
        });
    }
};
