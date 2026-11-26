// ============================================================
// scrollbar.js — Scrollbar Overlay Handler
// ------------------------------------------------------------
// Tampilkan scrollbar overlay saat user scroll/hover,
// sembunyikan otomatis setelah idle.
// Update posisi thumb saat scroll.
// ============================================================

window.JT = window.JT || {};

JT.Scrollbar = {

    _hideTimers: new WeakMap(),

    /**
     * Bind scrollbar overlay ke semua toolbar.
     */
    bind() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        const C = JT.Config;

        overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
            const inner = toolbar.querySelector('.jt-toolbar-inner');
            const indicator = toolbar.querySelector('.jt-scroll-indicator');
            if (!inner || !indicator) return;

            // Show indicator saat hover (jika scrollable)
            toolbar.addEventListener('mouseenter', () => {
                if (toolbar.classList.contains('jt-scrollable')) {
                    indicator.classList.add('jt-visible');
                }
            });
            toolbar.addEventListener('mouseleave', () => {
                indicator.classList.remove('jt-visible');
            });

            // Update thumb position + show saat scroll
            const onScroll = () => {
                if (!toolbar.classList.contains('jt-scrollable')) return;
                indicator.classList.add('jt-visible');

                if (toolbar.classList.contains('jt-horizontal')) {
                    const contentW = inner.scrollWidth;
                    const containerW = inner.clientWidth;
                    const ratio = containerW / contentW;
                    const thumbW = Math.max(C.MIN_SCROLL_THUMB, containerW * ratio);
                    const maxScroll = contentW - containerW;
                    const scrollPercent = maxScroll > 0 ? inner.scrollLeft / maxScroll : 0;
                    const thumbX = scrollPercent * (containerW - thumbW);
                    indicator.style.width = thumbW + 'px';
                    indicator.style.left = thumbX + 'px';
                } else {
                    const contentH = inner.scrollHeight;
                    const containerH = inner.clientHeight;
                    const ratio = containerH / contentH;
                    const thumbH = Math.max(C.MIN_SCROLL_THUMB, containerH * ratio);
                    const maxScroll = contentH - containerH;
                    const scrollPercent = maxScroll > 0 ? inner.scrollTop / maxScroll : 0;
                    const thumbY = scrollPercent * (containerH - thumbH);
                    indicator.style.height = thumbH + 'px';
                    indicator.style.top = thumbY + 'px';
                }

                // Auto-hide setelah idle
                clearTimeout(this._hideTimers.get(toolbar));
                const t = setTimeout(() => {
                    indicator.classList.remove('jt-visible');
                }, C.SCROLLBAR_HIDE_DELAY);
                this._hideTimers.set(toolbar, t);
            };

            inner.addEventListener('scroll', onScroll, { passive: true });

            // Mouse wheel → scroll horizontal di mode horizontal
            inner.addEventListener('wheel', (e) => {
                if (toolbar.classList.contains('jt-horizontal') && toolbar.classList.contains('jt-scrollable')) {
                    e.preventDefault();
                    inner.scrollLeft += e.deltaY;
                    onScroll();
                }
            }, { passive: false });
        });
    }
};
