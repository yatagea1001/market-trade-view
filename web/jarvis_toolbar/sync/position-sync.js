// ============================================================
// position-sync.js — Position Sync (60fps)
// ------------------------------------------------------------
// Baca rect content area ImGui dari C++ setiap frame,
// posisikan HTML overlay tepat di atas content area.
// Pattern sama kayak jarvis_chat.js syncPosition().
//
// CARA TAMBAH FRAME BARU:
// 1. Tambah syncOneFrame() call di syncPosition()
// 2. Selesai — tidak perlu edit file lain
// ============================================================

window.JT = window.JT || {};

JT.PositionSync = {

    _rafId: null,  // requestAnimationFrame ID

    /**
     * Mulai sync loop (60fps).
     */
    start() {
        if (this._rafId) return;  // sudah jalan
        this._rafId = requestAnimationFrame(() => this.syncPosition());
    },

    /**
     * Stop sync loop.
     */
    stop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    },

    /**
     * Main sync loop — dipanggil setiap frame via requestAnimationFrame.
     */
    syncPosition() {
        if (!JT.WasmBridge.isReady()) {
            this._rafId = requestAnimationFrame(() => this.syncPosition());
            return;
        }

        // Baca canvas rect supaya JS overlay ngikutin offset canvas
        const canvasEl = document.getElementById('canvas');
        const rect = canvasEl
            ? canvasEl.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const screenW = rect.width;
        const screenH = rect.height;
        const offsetX = rect.left;
        const offsetY = rect.top;

        // Sync 3 frame: tools, panel, nav
        this.syncOneFrame(
            JT.State.drawingBar,
            'wasm_jt_get_tools_visible',
            'wasm_jt_get_tools_x', 'wasm_jt_get_tools_y',
            'wasm_jt_get_tools_w', 'wasm_jt_get_tools_h',
            screenW, screenH, offsetX, offsetY
        );

        this.syncOneFrame(
            JT.State.rightBar,
            'wasm_jt_get_panel_visible',
            'wasm_jt_get_panel_x', 'wasm_jt_get_panel_y',
            'wasm_jt_get_panel_w', 'wasm_jt_get_panel_h',
            screenW, screenH, offsetX, offsetY
        );

        this.syncOneFrame(
            JT.State.navBar,
            'wasm_jt_get_nav_visible',
            'wasm_jt_get_nav_x', 'wasm_jt_get_nav_y',
            'wasm_jt_get_nav_w', 'wasm_jt_get_nav_h',
            screenW, screenH, offsetX, offsetY
        );

        this._rafId = requestAnimationFrame(() => this.syncPosition());
    },

    /**
     * Sync 1 frame — baca rect dari C++, posisikan overlay.
     */
    syncOneFrame(el, visFn, xFn, yFn, wFn, hFn, screenW, screenH, offsetX, offsetY) {
        if (!el) return;

        const W = JT.WasmBridge;
        const C = JT.Config;

        if (offsetX === undefined) offsetX = 0;
        if (offsetY === undefined) offsetY = 0;

        const visible = W.getBool(visFn);
        if (!visible) {
            el.classList.remove('jt-visible');
            return;
        }

        const cx = W.getNumber(xFn);
        const cy = W.getNumber(yFn);
        const cw = W.getNumber(wFn);
        const ch = W.getNumber(hFn);

        // Validasi: rect tidak valid → sembunyikan
        if (cx === null || cy === null || cw === null || ch === null ||
            cw <= C.MIN_RECT_SIZE || ch <= C.MIN_RECT_SIZE) {
            el.classList.remove('jt-visible');
            return;
        }

        // Normalized (0-1) → pixel, LALU tambah canvas offset
        let left   = cx * screenW + offsetX;
        let top    = cy * screenH + offsetY;
        let width  = cw * screenW;
        let height = ch * screenH;

        // Safeguard: clamp posisi overlay biar tidak keluar viewport
        if (left < offsetX) { width += (left - offsetX); left = offsetX; }
        if (top  < offsetY) { height += (top - offsetY); top = offsetY; }
        if (left + width  > offsetX + screenW) width  = offsetX + screenW - left;
        if (top  + height > offsetY + screenH) height = offsetY + screenH - top;
        if (width <= 0 || height <= 0) {
            el.classList.remove('jt-visible');
            return;
        }

        el.style.left   = left + 'px';
        el.style.top    = top + 'px';
        el.style.width  = width + 'px';
        el.style.height = height + 'px';

        // Auto-orient: deteksi orientasi frame
        if (width > height + C.ORIENT_THRESHOLD) {
            el.classList.add('jt-horizontal');
            el.classList.remove('jt-vertical');
        } else {
            el.classList.add('jt-vertical');
            el.classList.remove('jt-horizontal');
        }

        // Update overlay scrollbar
        this.updateScrollIndicator(el);

        el.classList.add('jt-visible');
    },

    /**
     * Update scrollbar indicator position & size.
     */
    updateScrollIndicator(el) {
        // Untuk nav toolbar, inner ada di dalam #jt-nav-scrollable
        let inner = el.querySelector('.jt-toolbar-inner');
        let scrollIndicator = el.querySelector('.jt-scroll-indicator');
        if (!inner || !scrollIndicator) return;

        const C = JT.Config;

        if (el.classList.contains('jt-horizontal')) {
            inner.style.gap = '3px';
            const contentW = inner.scrollWidth;
            const containerW = inner.clientWidth;
            if (contentW > containerW + C.SCROLL_THRESHOLD) {
                const ratio = containerW / contentW;
                const thumbW = Math.max(C.MIN_SCROLL_THUMB, containerW * ratio);
                const maxScroll = contentW - containerW;
                const scrollPercent = maxScroll > 0 ? inner.scrollLeft / maxScroll : 0;
                const thumbX = scrollPercent * (containerW - thumbW);
                scrollIndicator.style.width = thumbW + 'px';
                scrollIndicator.style.height = '3px';
                scrollIndicator.style.left = thumbX + 'px';
                scrollIndicator.style.top = '';
                scrollIndicator.style.bottom = '2px';
                scrollIndicator.style.right = '';
                el.classList.add('jt-scrollable');
            } else {
                el.classList.remove('jt-scrollable');
            }
        } else {
            inner.style.gap = '3px';
            const contentH = inner.scrollHeight;
            const containerH = inner.clientHeight;
            if (contentH > containerH + C.SCROLL_THRESHOLD) {
                const ratio = containerH / contentH;
                const thumbH = Math.max(C.MIN_SCROLL_THUMB, containerH * ratio);
                const maxScroll = contentH - containerH;
                const scrollPercent = maxScroll > 0 ? inner.scrollTop / maxScroll : 0;
                const thumbY = scrollPercent * (containerH - thumbH);
                scrollIndicator.style.height = thumbH + 'px';
                scrollIndicator.style.width = '3px';
                scrollIndicator.style.top = thumbY + 'px';
                scrollIndicator.style.right = '2px';
                scrollIndicator.style.left = '';
                scrollIndicator.style.bottom = '';
                el.classList.add('jt-scrollable');
            } else {
                el.classList.remove('jt-scrollable');
            }
        }
    }
};
