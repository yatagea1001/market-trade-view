// ============================================================
// state.js — Shared State Management Jarvis Toolbar
// ------------------------------------------------------------
// Semua state yang dipakai lintas modul disimpan di sini.
// Setiap modul baca/tulis via JT.State, bukan variabel lokal.
//
// KEUNTUNGAN:
// - Debugging: console.log(JT.State) → lihat semua state
// - Tidak ada variabel global yang tersebar di mana-mana
// - Mudah di-reset / snapshot untuk testing
// ============================================================

window.JT = window.JT || {};

JT.State = {
    // ── DOM References ──
    // Di-set oleh index.js saat init()
    overlay: null,                    // root container (#jt-overlay)
    drawingBar: null,                 // #jt-drawing-toolbar
    rightBar: null,                   // #jt-right-toolbar
    navBar: null,                     // #jt-nav-toolbar
    replayBtn: null,                  // (legacy, sekarang di NAV toolbar)
    tooltipEl: null,                  // #jt-tooltip

    // ── WASM Status ──
    wasmReady: false,                 // true setelah Module.calledRun
    pollTimer: null,                  // setInterval ID untuk syncState

    // ── Drawing Tools ──
    activeToolId: 0,                  // ID tool yang sedang aktif (0 = cursor)
    jarvisVisible: false,             // Jarvis chat visible?

    // ── Replay ──
    replayActive: false,              // Mode replay sedang jalan?

    // ── Panel Toggle ──
    // Di-sync dari C++ via polling
    panelState: {
        topToolbar: true,
        navigation: false,
        trade: false,
        history: false,
        marketWatch: false,
        objectTree: false,
        displaySettings: false
    },

    // ── Context Menu ──
    contextMenuTarget: null,          // { toolbarId, frameId, frameName }
    longPressTimer: null,             // Timer ID untuk long-press mobile

    // ── Mobile ──
    isMobile: false,                  // Di-set oleh detectMobile()

    // ── Alert Badge ──
    alertBadgeCount: 0,               // Jumlah notif (0 = sembunyikan badge)
    alertBadgeVisible: false,          // Badge kelihatan?
    alertPanelOpen: false,             // Alert panel sedang terbuka?

    // ── Helper Methods ──
    reset() {
        this.wasmReady = false;
        this.pollTimer = null;
        this.activeToolId = 0;
        this.jarvisVisible = false;
        this.replayActive = false;
        this.contextMenuTarget = null;
        this.longPressTimer = null;
        this.isMobile = false;
        this.alertBadgeCount = 0;
        this.alertBadgeVisible = false;
        this.alertPanelOpen = false;
        this.panelState = {
            topToolbar: true,
            navigation: false,
            trade: false,
            history: false,
            marketWatch: false,
            objectTree: false,
            displaySettings: false
        };
    }
};
