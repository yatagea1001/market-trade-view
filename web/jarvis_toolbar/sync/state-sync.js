// ============================================================
// state-sync.js — State Sync (Polling dari C++)
// ------------------------------------------------------------
// Polling setiap POLL_INTERVAL ms untuk sinkronkan state visual
// JS overlay dengan state C++ (panel toggle, active tool, dll).
//
// CARA TAMBAH STATE SYNC BARU:
// 1. Tambah syncPanel() call di syncPanelStates()
// 2. Tambah key di JT.State.panelState
// 3. Tambah toolDef di JT.RightBarTools.TOOLS
// 4. Selesai
// ============================================================

window.JT = window.JT || {};

JT.StateSync = {

    _timerId: null,  // setInterval ID

    /**
     * Mulai polling state.
     */
    start() {
        const C = JT.Config;
        if (this._timerId) return;  // sudah jalan
        this._timerId = setInterval(() => this.syncState(), C.POLL_INTERVAL);
    },

    /**
     * Stop polling state.
     */
    stop() {
        if (this._timerId) {
            clearInterval(this._timerId);
            this._timerId = null;
        }
    },

    /**
     * Main sync function — dipanggil setiap POLL_INTERVAL ms.
     */
    syncState() {
        if (!JT.WasmBridge.isReady()) return;

        this.syncPanelStates();
        this.syncJarvisState();
        this.syncReplayState();
        this.syncAlertBadge();
        this.syncNavState();
    },

    /**
     * Sync semua panel toggle states dari C++.
     */
    syncPanelStates() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        const W = JT.WasmBridge;
        const tools = JT.RightBarTools.TOOLS;

        // Mapping: getterFn → panelState key
        const panelSyncMap = [
            { getter: 'wasm_get_top_toolbar',      key: 'topToolbar' },
            { getter: 'wasm_get_navigation_panel',  key: 'navigation' },
            { getter: 'wasm_get_trade_panel',       key: 'trade' },
            { getter: 'wasm_get_history_panel',     key: 'history' },
            { getter: 'wasm_get_market_watch',      key: 'marketWatch' },
            { getter: 'wasm_get_object_tree',       key: 'objectTree' },
            { getter: 'wasm_get_display_settings',  key: 'displaySettings' }
        ];

        panelSyncMap.forEach(({ getter, key }) => {
            const val = W.getBool(getter);
            if (val === null) return;
            const newState = val === 1;
            if (JT.State.panelState[key] !== newState) {
                JT.State.panelState[key] = newState;
                const toolDef = tools.find(t => t.toggleKey === key);
                if (toolDef) {
                    const btn = overlay.querySelector(`#jt-right-toolbar [data-tool-id="${toolDef.id}"]`);
                    if (btn) btn.dataset.active = newState ? 'true' : 'false';
                }
            }
        });
    },

    /**
     * Sync Jarvis visibility state.
     */
    syncJarvisState() {
        const W = JT.WasmBridge;
        const jv = W.getBool('wasm_get_jarvis_visible');
        if (jv !== null && JT.State.jarvisVisible !== (jv === 1)) {
            JT.State.jarvisVisible = (jv === 1);
            JT.DrawingTools.updateJarvisBtn();
        }
    },

    /**
     * Sync Replay state — update tombol Replay di NAV toolbar.
     */
    syncReplayState() {
        const W = JT.WasmBridge;
        const overlay = JT.State.overlay;
        if (!overlay) return;

        const rp = W.getBool('wasm_get_replay_active');
        if (rp !== null) {
            JT.State.replayActive = (rp === 1);
            const navReplayBtn = overlay.querySelector('[data-tool-id="nav-replay"]');
            if (navReplayBtn) navReplayBtn.dataset.active = JT.State.replayActive ? 'true' : 'false';
        }
    },

    /**
     * Sync Nav state (label symbol/TF + active segment glow).
     */
    syncNavState() {
        JT.NavTools.syncNavState();
    },

    /**
     * Sync Alert badge count.
     * ──────────────────────────────────────────────
     * Alert badge di-manage PURE JS (bukan dari WASM).
     * Code lain bisa panggil:
     *   JT.NavTools.incrementAlertBadge(1)  — tambah notif
     *   JT.NavTools.setAlertBadge(5)        — set count langsung
     *   JT.NavTools.clearAlertBadge()       — reset ke 0
     *
     * Kenapa pure JS? Karena wasm_get_alert_count belum di-export
     * dari C++ side, dan badge ini cukup di-handle di JS aja.
     * ──────────────────────────────────────────────
     */
    syncAlertBadge() {
        // No-op: badge state sudah di-manage oleh JT.NavTools.setAlertBadge()
        // yang dipanggil dari kode lain (WebSocket, Jarvis, dll).
        // Tidak perlu polling dari WASM.
    }
};
