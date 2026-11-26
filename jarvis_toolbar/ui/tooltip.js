// ============================================================
// tooltip.js — Tooltip Handler
// ------------------------------------------------------------
// Menampilkan tooltip saat hover tombol (desktop & mobile).
// Dipisahkan supaya bisa di-customize tanpa edit logic utama.
// ============================================================

window.JT = window.JT || {};

JT.Tooltip = {

    _timer: null,

    /**
     * Bind tooltip ke semua tombol di overlay.
     */
    bind() {
        const overlay = JT.State.overlay;
        const tooltipEl = JT.State.tooltipEl;
        if (!overlay || !tooltipEl) return;

        const C = JT.Config;
        const showTooltip = (text, target) => {
            clearTimeout(this._timer);
            this._timer = setTimeout(() => {
                tooltipEl.textContent = text;
                const rect = target.getBoundingClientRect();
                tooltipEl.style.left = (rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2) + 'px';
                tooltipEl.style.top  = (rect.top - tooltipEl.offsetHeight - 8) + 'px';
                tooltipEl.classList.add('jt-visible');
            }, C.TOOLTIP_DELAY);
        };

        const hideTooltip = () => {
            clearTimeout(this._timer);
            tooltipEl.classList.remove('jt-visible');
        };

        // Delegate ke semua tombol di drawing + right toolbar
        overlay.querySelectorAll('.jt-btn').forEach(btn => {
            const text = btn.dataset.tooltip;
            if (!text) return;
            btn.addEventListener('mouseenter', () => showTooltip(text, btn));
            btn.addEventListener('mouseleave', hideTooltip);
            btn.addEventListener('mousedown', hideTooltip);
        });

        // Replay button tooltip
        const replayInner = overlay.querySelector('.jt-replay-btn');
        if (replayInner) {
            replayInner.addEventListener('mouseenter', () => showTooltip('Mode Replay', replayInner));
            replayInner.addEventListener('mouseleave', hideTooltip);
            replayInner.addEventListener('mousedown', hideTooltip);
        }
    }
};
