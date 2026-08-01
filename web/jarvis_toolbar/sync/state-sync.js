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
     * Badge di-trigger langsung dari C++ via showAlertNotif()
     * (di app.html), yang memanggil JT.NavTools.pushAlert().
     *
     * Tidak perlu polling WASM — showAlertNotif() sudah real-time
     * dan lebih reliable karena dipanggil langsung saat trigger.
     *
     * WASM exports yang tersedia (kalau nanti perlu):
     *   wasm_alert_get_count_triggered()
     *   wasm_alert_get_count_price()
     *   wasm_alert_get_count_indicator()
     * ──────────────────────────────────────────────
     */
    syncAlertBadge() {
        // No-op: badge di-trigger langsung oleh showAlertNotif() di app.html
        // yang memanggil JT.NavTools.pushAlert() → incrementAlertBadge()
    }
};
