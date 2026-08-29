// ============================================================
// replay-tools.js — Replay Button Logic
// ------------------------------------------------------------
// Logic terpisah untuk tombol Replay (start/stop).
// Tombol Replay sekarang ada di NAV toolbar, bukan frame terpisah.
//
// File ini dipakai kalau nanti mau bikin Replay frame terpisah
// lagi atau ada fitur replay yang lebih kompleks.
// ============================================================

window.JT = window.JT || {};

JT.ReplayTools = {

    /**
     * Toggle replay mode (start/stop).
     * @returns {boolean} new replay state
     */
    toggle() {
        const W = JT.WasmBridge;
        if (JT.State.replayActive) {
            W.action('wasm_replay_stop');
            JT.State.replayActive = false;
        } else {
            W.action('wasm_replay_start');
            JT.State.replayActive = true;
        }
        return JT.State.replayActive;
    },

    /**
     * Update visual tombol Replay di NAV toolbar.
     */
    updateVisual() {
        const overlay = JT.State.overlay;
        if (!overlay) return;
        const navReplayBtn = overlay.querySelector('[data-tool-id="nav-replay"]');
        if (navReplayBtn) {
            navReplayBtn.dataset.active = JT.State.replayActive ? 'true' : 'false';
        }
    },

    /**
     * Legacy: Bind replay button (kalau frame terpisah dipakai lagi).
     * Saat ini replay sudah ada di NAV toolbar.
     */
    bindLegacy() {
        const replayBtn = JT.State.replayBtn;
        if (!replayBtn) return;

        replayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const btn = replayBtn.querySelector('.jt-replay-btn');
            this.toggle();
            if (btn) btn.dataset.active = JT.State.replayActive ? 'true' : 'false';
            JT.Utils.flashButton(btn || replayBtn);
        });
    }
};
