// ============================================================
// index.js — Entry Point & Init (Jarvis Toolbar Modular)
// ------------------------------------------------------------
// File ini adalah entry point yang:
//   1. Inisialisasi overlay DOM
//   2. Inject CSS
//   3. Cache DOM references
//   4. Bind semua event
//   5. Start sync loops
//   6. Expose public API
//
// LOAD ORDER (di index.html / app.html):
//   1. config.js          ← Konstanta & pengaturan
//   2. state.js           ← Shared state
//   3. wasm-bridge.js     ← WASM communication
//   4. utils.js           ← Helper functions
//   5. tools/*.js         ← Konfigurasi tombol + handler
//   6. ui/*.js            ← HTML, CSS, tooltip, context-menu, scrollbar
//   7. sync/*.js          ← Position sync + state sync
//   8. index.js           ← Entry point (FILE INI)
// ============================================================

window.JT = window.JT || {};

JT.App = {

    /**
     * Initialize Jarvis Toolbar overlay.
     */
    init() {
        // Cek apakah overlay sudah ada (idempotent)
        if (document.getElementById('jt-overlay')) {
            console.log('[JT] Overlay sudah ada, skip init');
            return;
        }

        // 1. Buat root overlay
        const overlay = document.createElement('div');
        overlay.id = 'jt-overlay';
        overlay.innerHTML = JT.HtmlBuilder.buildOverlay();
        document.body.appendChild(overlay);
        JT.State.overlay = overlay;

        // 2. Inject CSS
        const style = document.createElement('style');
        style.id = 'jt-style';
        style.textContent = JT.CssBuilder.buildCSS();
        document.head.appendChild(style);

        // 3. Cache DOM refs
        JT.State.drawingBar = overlay.querySelector('#jt-drawing-toolbar');
        JT.State.rightBar   = overlay.querySelector('#jt-right-toolbar');
        JT.State.navBar     = overlay.querySelector('#jt-nav-toolbar');
        JT.State.replayBtn  = null;  // Replay sekarang di NAV toolbar
        JT.State.tooltipEl  = overlay.querySelector('#jt-tooltip');

        // 4. Deteksi mobile
        JT.Utils.detectMobile();
        window.addEventListener('resize', () => JT.Utils.detectMobile());

        // 5. Bind semua event
        JT.DrawingTools.bind();
        JT.RightBarTools.bind();
        JT.NavTools.bind();
        JT.Tooltip.bind();
        JT.Scrollbar.bind();
        JT.ContextMenu.bind();

        // 6. Start sync loops
        JT.PositionSync.start();
        JT.StateSync.start();

        // 7. Proses antrian alert yang datang sebelum overlay ready
        //    (C++ bisa trigger showAlertNotif() sebelum init() selesai)
        if (window._jtAlertQueue && window._jtAlertQueue.length > 0) {
            console.log('[JT] Processing', window._jtAlertQueue.length, 'queued alerts');
            window._jtAlertQueue.forEach(function(alertData) {
                JT.NavTools.pushAlert(alertData);
            });
            window._jtAlertQueue = [];
        }

        console.log('[JT] Toolbar overlay initialized (modular v3)');
    },

    /**
     * Destroy overlay (cleanup).
     */
    destroy() {
        JT.PositionSync.stop();
        JT.StateSync.stop();

        const overlay = JT.State.overlay;
        if (overlay) {
            overlay.remove();
        }

        const style = document.getElementById('jt-style');
        if (style) style.remove();

        JT.State.reset();
        console.log('[JT] Toolbar overlay destroyed');
    }
};

// ── Auto-init when Module is FULLY ready ────────────────────
function _jtWaitForModule() {
    if (typeof Module !== 'undefined' && Module.calledRun) {
        JT.State.wasmReady = true;
        JT.App.init();
        console.log('[JT] WASM ready, toolbar initialized');
    } else {
        setTimeout(_jtWaitForModule, 200);
    }
}

// Hook ke Emscripten onRuntimeInitialized (backup)
if (typeof Module !== 'undefined') {
    const origInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = function() {
        JT.State.wasmReady = true;
        if (origInit) origInit();
    };
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _jtWaitForModule);
} else {
    _jtWaitForModule();
}

// ── Public API (untuk debugging dari console) ──────────────
window.JarvisToolbar = {
    toggle: () => JT.State.overlay && JT.State.overlay.classList.toggle('jt-hidden'),
    show:   () => JT.State.overlay && JT.State.overlay.classList.remove('jt-hidden'),
    hide:   () => JT.State.overlay && JT.State.overlay.classList.add('jt-hidden'),
    sync:   () => JT.StateSync.syncState(),
    state:  () => ({
        panelState: JT.State.panelState,
        activeToolId: JT.State.activeToolId,
        jarvisVisible: JT.State.jarvisVisible,
        replayActive: JT.State.replayActive,
        alertBadgeCount: JT.NavTools.alertBadgeCount
    }),
    // Reopen frame yang sudah di-close (X button ImGui)
    openTools:  () => JT.WasmBridge.toggle('wasm_jt_toggle_tools'),
    openPanel:  () => JT.WasmBridge.toggle('wasm_jt_toggle_panel'),
    openReplay: () => JT.WasmBridge.toggle('wasm_jt_toggle_replay'),
    openNav:    () => JT.WasmBridge.toggle('wasm_jt_toggle_nav'),
    // Alert badge (WA-style)
    setAlertBadge:   (count) => JT.NavTools.setAlertBadge(count),
    clearAlertBadge: () => JT.NavTools.clearAlertBadge(),
    pushAlert:       (data) => JT.NavTools.pushAlert(data),
    getAlerts:       (opts) => JT.NavTools.getAlerts(opts),
    // Force re-sync position
    resync:  () => JT.PositionSync.syncPosition(),
    // Destroy & re-init
    destroy: () => JT.App.destroy(),
    reinit:  () => { JT.App.destroy(); JT.App.init(); },
    // Debug: akses internal state
    _internal: () => JT.State
};

// ── DEMO: Test Alert Badge dari Console ──────────────────────
// Ketik di browser console:
//   demoAlert()         → simulasi 3 notif masuk berturut-turut
//   demoAlert(1)        → 1 notif
//   demoAlert(10)       → 10 notif sekaligus
//   demoAlert('clear')  → hapus semua badge
window.demoAlert = function(count) {
    if (count === 'clear') {
        JT.NavTools.clearAlertBadge();
        console.log('[demo] Badge cleared');
        return;
    }
    const n = typeof count === 'number' ? count : 3;
    const alerts = [
        { title: 'Price Alert',   message: 'XAUUSD > $2,400',    type: 'price' },
        { title: 'Order Filled',   message: 'Buy 0.1 LOT EURUSD', type: 'trade' },
        { title: 'Margin Warning', message: 'Margin Level < 150%', type: 'risk' },
        { title: 'News Alert',     message: 'NFP Release in 5min', type: 'news' },
        { title: 'SL Triggered',   message: 'Sell 0.05 GBPUSD SL hit', type: 'trade' }
    ];
    let i = 0;
    function pushNext() {
        if (i >= n) return;
        const alert = alerts[i % alerts.length];
        JT.NavTools.pushAlert(alert);
        console.log(`[demo] Push #${i+1}:`, alert.title, '-', alert.message);
        i++;
        setTimeout(pushNext, 600);  // 600ms jeda antar notif (kayak WA)
    }
    pushNext();
};
