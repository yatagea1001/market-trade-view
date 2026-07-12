// ============================================================
// jarvis_toolbar.js — Jarvis-style HTML/JS Toolbar Overlay (v2)
// ------------------------------------------------------------
// ARSITEKTUR v2 — ImGui Docking Frame + JS Overlay Content
//   Sama kayak Jarvis AI chat (src/ai/AiAssistant.h + jarvis_chat.js):
//
//   1. C++ (main.cpp) render 3 ImGui window:
//        - "Tools"   → frame drawing toolbar (9 tombol)
//        - "Panel"   → frame right toggle bar (7 panel)
//        - "Replay"  → frame replay button
//      Setiap window punya title bar + dockable + X close button,
//      tapi content-nya kosong (cuma placeholder rect gelap).
//
//   2. C++ expose rect content area setiap window via WASM getters:
//        wasm_jt_get_tools_x/y/w/h, wasm_jt_get_tools_visible, dll.
//      Rect disimpan NORMALIZED (0.0-1.0) relatif terhadap display.
//
//   3. JS overlay (file ini) baca rect setiap frame via
//      requestAnimationFrame(syncPosition), lalu posisikan HTML
//      tombol TEPAT di atas content area ImGui.
//
//   4. User bisa drag/dock/resize frame ImGui seperti panel biasa.
//      Overlay JS akan otomatis follow (60fps) karena syncPosition
//      jalan tiap frame.
//
//   5. Klik tombol X di title bar ImGui → g_jtXxx.show = false →
//      JS detect via wasm_jt_get_*_visible → sembunyikan overlay.
//      Reopen via JarvisToolbar.openTools() / openPanel() / openReplay().
//
// CARA PAKAI:
//   1. Patch main.cpp (lihat komentar "JARVIS JS TOOLBAR BRIDGE")
//   2. Tambahkan <script src="web/jarvis_toolbar.js"></script>
//      di index.html SETELAH dist/index.js
//   3. Build ulang WASM dengan emcc
// ============================================================

(function() {
'use strict';

// ── Config ──────────────────────────────────────────────────
const ASSETS_PATH = 'assets/';          // Folder PNG (sama kayak C++ pakai)
const POLL_INTERVAL = 200;                // ms, untuk sync state dari C++
const TOOLTIP_DELAY = 400;                // ms, hover delay sebelum tooltip muncul
const ACCENT_COLOR = '#10b981';           // sama kayak jarvis_chat.js

// ── State ───────────────────────────────────────────────────
let overlay;                              // root container
let drawingBar, rightBar, replayBtn, navBar;  // 4 grup toolbar (drawing, panel, replay, nav)
let tooltipEl;                            // tooltip element
let wasmReady = false;
let pollTimer = null;

// ID tombol drawing yang sedang aktif (0 = cursor, 1-6 = tool)
// Sync dari C++ via polling — lihat syncState()
let activeToolId = 0;
let jarvisVisible = false;
let replayActive = false;

// State panel toggle (di-sync dari C++)
let panelState = {
    topToolbar: true,
    navigation: false,
    trade: false,
    history: false,
    marketWatch: false,
    objectTree: false,
    displaySettings: false
};

// ── Konfigurasi Tombol ──────────────────────────────────────
// Setiap tombol pakai PNG dari folder assets/ (kalau ada),
// kalau nggak ada → fallback ke SVG inline (warna accent).

// Top Drawing Toolbar — 9 tombol (sesuai RenderTopToolbar di main.cpp)
const DRAWING_TOOLS = [
    {
        id: 'cursor',
        toolId: 0,
        icon: 'assets/cursor.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7 16 2-7 7-2z"/></svg>',
        label: 'Cursor',
        tooltip: 'Cursor'
    },
    {
        id: 'line',
        toolId: 1,
        icon: 'assets/line.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>',
        label: 'Line',
        tooltip: 'Garis Trend'
    },
    {
        id: 'fib',
        toolId: 3,
        icon: 'assets/fib.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
        label: 'Fib',
        tooltip: 'Fibonacci'
    },
    {
        id: 'rect',
        toolId: 2,
        icon: 'assets/rect.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12"/></svg>',
        label: 'Rect',
        tooltip: 'Segi Empat'
    },
    {
        id: 'brush',
        toolId: 5,
        icon: 'assets/brush.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l-6 6v3h3l6-6"/><path d="M12 8l4-4 3 3-4 4"/></svg>',
        label: 'Brush',
        tooltip: 'Freehand Brush'
    },
    {
        id: 'text',
        toolId: 4,
        icon: 'assets/text.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
        label: 'Text',
        tooltip: 'Insert Text (Click on Chart)'
    },
    {
        id: 'elliot',
        toolId: 6,
        icon: 'assets/elliot.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/></svg>',
        label: 'Elliot',
        tooltip: 'Garis Gelombang'
    },
    {
        id: 'jarvis',
        toolId: -1, // special: toggle jarvis chat
        icon: null, // pakai SVG "J" badge
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor" stroke="none">J</text><circle cx="12" cy="12" r="10" stroke-dasharray="2 2"/></svg>',
        label: 'Jarvis',
        tooltip: 'Jarvis AI Chat'
    },
    {
        id: 'separator',
        toolId: -2, // special: separator (no action)
        icon: null,
        svg: null,
        label: '',
        tooltip: ''
    },
    {
        id: 'trash',
        toolId: -3, // special: clear shapes
        icon: 'assets/trash.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
        label: 'Trash',
        tooltip: 'Hapus Semua'
    }
];

// Right Main Toolbar — 7 toggle (sesuai RenderRightBar di main.cpp)
const RIGHT_BAR_TOOLS = [
    {
        id: 'tools',
        icon: 'assets/add_chart.png',  // pakai add_chart.png karena texToolsBtn = 0 di C++
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>',
        label: 'Tls',
        tooltip: 'Alat Gambar (Tools)',
        toggleKey: 'topToolbar',
        toggleFn: 'wasm_toggle_top_toolbar',
        getterFn: 'wasm_get_top_toolbar'
    },
    {
        id: 'nav',
        icon: null,  // texNavBtn = 0 di C++, jadi fallback SVG
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
        label: 'Nav',
        tooltip: 'Navigasi',
        toggleKey: 'navigation',
        toggleFn: 'wasm_toggle_navigation_panel',
        getterFn: 'wasm_get_navigation_panel'
    },
    { id: 'sep1', isSeparator: true },
    {
        id: 'trade',
        icon: null,  // texTradeBtn = 0 di C++
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        label: 'Trd',
        tooltip: 'Trade Panel',
        toggleKey: 'trade',
        toggleFn: 'wasm_toggle_trade_panel',
        getterFn: 'wasm_get_trade_panel'
    },
    {
        id: 'history',
        icon: null,  // texHistoryBtn = 0 di C++
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
        label: 'Hst',
        tooltip: 'Trade History',
        toggleKey: 'history',
        toggleFn: 'wasm_toggle_history_panel',
        getterFn: 'wasm_get_history_panel'
    },
    { id: 'sep2', isSeparator: true },
    {
        id: 'marketwatch',
        icon: 'assets/marketwatch.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        label: 'Mkt',
        tooltip: 'Market Watch',
        toggleKey: 'marketWatch',
        toggleFn: 'wasm_toggle_market_watch',
        getterFn: 'wasm_get_market_watch'
    },
    {
        id: 'objtree',
        icon: 'assets/tree.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/><line x1="9" y1="6" x2="15" y2="18"/></svg>',
        label: 'Obj',
        tooltip: 'Pohon Objek',
        toggleKey: 'objectTree',
        toggleFn: 'wasm_toggle_object_tree',
        getterFn: 'wasm_get_object_tree'
    },
    { id: 'sep3', isSeparator: true },
    {
        id: 'settings',
        icon: 'assets/setting.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        label: 'Set',
        tooltip: 'Pengaturan',
        toggleKey: 'displaySettings',
        toggleFn: 'wasm_toggle_display_settings',
        getterFn: 'wasm_get_display_settings'
    }
];

// ── Navigation Toolbar — 5 tombol (Symbol, TF, Candle, Indicator, + New) ──
// Beda dengan DRAWING_TOOLS/RIGHT_BAR_TOOLS:
// - Tombol lebih lebar (karena ada label teks)
// - Klik → panggil wasm_nav_click_segment(segIdx) — set active segment
// - Active segment dapat glow (slider animation via CSS)
// - Scrollable (sama kayak toolbar lain)
// - Symbol & Candle icon DINAMIS (update dari C++ sesuai state aktif)
const NAV_TOOLS = [
    {
        id: 'nav-symbol',
        segIdx: 0,
        icon: 'assets/gold.png',   // default, akan di-update JS sesuai symbol aktif
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h6"/></svg>',
        label: 'Symbol',
        tooltip: 'Pilih Symbol (XAUUSD, EURUSD, BTCUSD, dll)',
        isWide: true,
        dynamicIcon: true   // 🔥 icon update dari C++ via wasm_nav_get_symbol_icon
    },
    {
        id: 'nav-tf',
        segIdx: 1,
        icon: null,
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
        label: 'TF',
        tooltip: 'Pilih Timeframe (M1, M5, H1, dll)',
        isWide: true
    },
    {
        id: 'nav-candle',
        segIdx: 2,
        icon: null,   // 🔥 icon update dari C++ via wasm_nav_get_candle_style
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="4" height="10"/><line x1="8" y1="4" x2="8" y2="20"/><rect x="14" y="6" width="4" height="12"/><line x1="16" y1="2" x2="16" y2="22"/></svg>',
        label: 'Candle',
        tooltip: 'Pilih Style Candle (Line, Area, Footprint)',
        isWide: true,
        dynamicIcon: true   // 🔥 icon update dari C++ via wasm_nav_get_candle_style
    },
    {
        id: 'nav-indicator',
        segIdx: 3,
        icon: null,
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
        label: 'Indicator',
        tooltip: 'Buka Panel Indikator',
        isWide: true
    },
    {
        id: 'nav-new',
        segIdx: 4,
        icon: null,
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        label: '+ New',
        tooltip: 'Tambah Chart Baru',
        isWide: true
    },
    {
        id: 'nav-replay',
        segIdx: -1,              // 🔥 special: bukan segment nav, tapi tombol replay
        icon: 'assets/replay.png',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>',
        label: 'Replay',
        tooltip: 'Mode Replay',
        isWide: true,
        isReplay: true           // 🔥 flag: tombol ini handle replay start/stop
    }
];

// ── SVG icons untuk Candle Style (index 0-4) ──
// Index sesuai enum CandleRenderStyle di CandleStyleManager.h:
//   0 = RENDER_CANDLE (candlestick classic)
//   1 = RENDER_LINE (garis close price)
//   2 = RENDER_FP_OVERLAY (footprint overlay — box bid/ask di atas candle)
//   3 = RENDER_FP_PROFILE (footprint profile — grid bid/ask)
//   4 = RENDER_FP_BAR (footprint bar — proportional buy/sell bars)
const NAV_CANDLE_SVGS = [
    // 0: Candlestick classic
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="4" height="10"/><line x1="8" y1="4" x2="8" y2="20"/><rect x="14" y="6" width="4" height="12"/><line x1="16" y1="2" x2="16" y2="22"/></svg>',
    // 1: Line chart
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/></svg>',
    // 2: Footprint overlay (candle + box overlay)
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="6" width="14" height="12"/><line x1="5" y1="10" x2="19" y2="10"/><line x1="5" y1="14" x2="19" y2="14"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
    // 3: Footprint profile (grid)
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/></svg>',
    // 4: Footprint bar (bars)
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="8" height="4"/><rect x="13" y="8" width="8" height="8"/></svg>'
];

// ── WASM Ready Guard ────────────────────────────────────────
function isWasmReady() {
    if (wasmReady) return true;
    if (typeof Module !== 'undefined' && Module.calledRun) {
        wasmReady = true;
        return true;
    }
    return false;
}

function safeCcall(name, retType, argTypes, args) {
    if (!isWasmReady()) return null;
    try {
        return Module.ccall(name, retType, argTypes, args);
    } catch (e) {
        console.warn('[JARVIS-TB] ccall failed:', name, e.message);
        return null;
    }
}

// ── Build HTML ──────────────────────────────────────────────
function buildHTML() {
    return `
    <!-- Top Drawing Toolbar
         NOTE: class jt-horizontal/jt-vertical di-set dinamis oleh syncOneFrame()
         berdasarkan orientasi frame ImGui (width vs height) -->
    <div id="jt-drawing-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${DRAWING_TOOLS.map(tool => buildButtonHTML(tool, 'drawing')).join('')}
        </div>
        <div class="jt-scroll-indicator"></div>
    </div>

    <!-- Right Main Toolbar (toggle panels)
         Orientasi auto: horizontal saat dock atas/bawah, vertical saat dock kiri/kanan -->
    <div id="jt-right-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${RIGHT_BAR_TOOLS.map(tool => buildButtonHTML(tool, 'right')).join('')}
        </div>
        <div class="jt-scroll-indicator"></div>
    </div>

    <!-- Replay Button sekarang ada di NAV_TOOLS (tombol "Replay" di nav toolbar).
         Frame replay lama dihapus — tidak perlu container terpisah lagi. -->

    <!-- Navigation Toolbar — 6 tombol (Symbol, TF, Candle, Indicator, + New, Replay)
         Klik tombol → set active segment (visual feedback). Popup tetap C++.
         Tombol Replay handle start/stop via wasm_replay_start/stop. -->
    <div id="jt-nav-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${NAV_TOOLS.map(tool => buildNavButtonHTML(tool)).join('')}
        </div>
        <div class="jt-scroll-indicator"></div>
    </div>

    <!-- Context Menu (klik kanan / long-press) -->
    <div id="jt-context-menu" class="jt-context-menu">
        <div class="jt-context-menu-header" id="jt-ctx-header">Tools</div>
        <div class="jt-context-menu-separator"></div>
        <div class="jt-context-menu-item" data-action="toggle-title">
            <span id="jt-ctx-title-icon">👁️</span>
            <span id="jt-ctx-title-label">Sembunyikan Title Bar</span>
        </div>
        <div class="jt-context-menu-item" data-action="close-frame">
            <span>❌</span>
            <span>Tutup Frame</span>
        </div>
    </div>

    <!-- Tooltip (shared) -->
    <div id="jt-tooltip" class="jt-tooltip"></div>
    `;
}

// Builder khusus untuk tombol navigasi (lebih lebar + label dinamis)
function buildNavButtonHTML(tool) {
    const iconHTML = tool.icon
        ? `<img src="${tool.icon}" alt="${tool.label}" class="jt-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><span class="jt-icon-svg" style="display:none;">${tool.svg}</span>`
        : `<span class="jt-icon-svg">${tool.svg}</span>`;

    return `
    <button class="jt-btn jt-nav-btn" data-tool-id="${tool.id}" data-seg-idx="${tool.segIdx}" data-tooltip="${tool.tooltip}" data-active="false">
        ${iconHTML}
        <span class="jt-nav-label" data-nav-label="${tool.id}">${tool.label}</span>
    </button>
    `;
}

function buildButtonHTML(tool, group) {
    // Separator (orientasi auto via CSS — .jt-horizontal / .jt-vertical)
    if (tool.id === 'separator' || tool.isSeparator) {
        return `<div class="jt-separator"></div>`;
    }

    const iconHTML = tool.icon
        ? `<img src="${tool.icon}" alt="${tool.label}" class="jt-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"/><span class="jt-icon-svg" style="display:none;">${tool.svg}</span>`
        : `<span class="jt-icon-svg">${tool.svg}</span>`;

    return `
    <button class="jt-btn" data-tool-id="${tool.id}" data-group="${group}" data-tooltip="${tool.tooltip}" data-active="false">
        ${iconHTML}
    </button>
    `;
}

// ── CSS ─────────────────────────────────────────────────────
function buildCSS() {
    return `
    /* ════════════════════════════════════════════════════════
       JARVIS TOOLBAR — Dark Tech Style (v2: ImGui Docking Frame)
       ────────────────────────────────────────────────────────
       Arsitektur:
       - C++ (main.cpp) render ImGui window "Tools",
         "Panel", "Replay" → FRAME docking (title bar)
       - JS overlay (file ini) baca rect content area ImGui via
         wasm_jt_get_*_x/y/w/h, lalu posisikan HTML tombol
         TEPAT di atas content area ImGui.
       - User bisa drag / dock frame ImGui seperti panel biasa,
         JS overlay akan otomatis follow posisinya (60fps via
         requestAnimationFrame).
       ════════════════════════════════════════════════════════ */

    #jt-overlay {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        z-index: 90; pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        user-select: none; -webkit-user-select: none;
    }

    /* ── Toolbar Container (posisi di-set JS dari rect ImGui) ──
       Container = persis di atas content area ImGui (rect dari C++).
       overflow:hidden → ikon tidak pernah keluar dari frame ImGui.
       position:relative → anchor untuk scrollbar overlay (absolute). */
    .jt-toolbar {
        position: absolute;
        pointer-events: none;       /* Container tembus, hanya tombol yang pegang event */
        display: none;              /* Default hidden, syncPosition() yang show */
        overflow: hidden;           /* Ikon tidak boleh keluar frame ImGui */
    }
    .jt-toolbar.jt-visible { display: flex; }

    /* 🎯 INNER = RATA ATAS-KIRI + SCROLLABLE
       - pointer-events: NONE → click ke area kosong TEMBUS ke ImGui bawah
         (supaya segitiga ▾ di title bar dock bisa di-klik, close X jalan, dll)
       - Hanya tombol (.jt-btn, .jt-replay-btn) yang pointer-events: auto
       - align-items + justify-content → flex-start (atas & kiri)
       - flex-wrap: nowrap → TIDAK pindah baris, tetap 1 jalur
       - overflow:auto → bisa scroll kalau konten lebih besar dari container
       - Scrollbar overlay (muncul saat scroll/hover, hilang otomatis)
       - Width/height 100% → isi penuh content area ImGui
       - padding 0px → DEMPET ke title bar ImGui (no space) */
    .jt-toolbar-inner {
        display: flex;
        align-items: flex-start;    /* rata ATAS (axis secondary) */
        justify-content: flex-start;/* rata KIRI (axis primary) */
        gap: 3px;                   /* gap kecil biar merapat */
        pointer-events: none;       /* 🔥 TOMBOL saja yang auto, area kosong TEMBUS ke ImGui */
        padding: 0px;               /* 🔥 padding 0 = dempet ke title bar ImGui */
        background: transparent;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        flex-wrap: nowrap;          /* 🔥 TIDAK pindah baris — tetap 1 jalur panjang */
        align-content: flex-start;
        min-width: 0;
        min-height: 0;
        overflow: auto;             /* 🔥 SCROLL otomatis kalau konten overflow */
        scroll-behavior: smooth;    /* scroll halus saat wheel/swipe */

        /* 🔥 Sembunyikan scrollbar default (akan pakai overlay custom) */
        scrollbar-width: none;      /* Firefox */
        -ms-overflow-style: none;   /* IE10+ */
    }
    .jt-toolbar-inner::-webkit-scrollbar {
        display: none;              /* Chrome/Safari/Edge — sembunyikan default */
    }

    /* 🔥 HANYA tombol yang bisa di-klik — area kosong tembus ke ImGui */
    .jt-btn,
    .jt-replay-btn,
    .jt-scroll-indicator {
        pointer-events: auto;
    }

    /* 🎨 OVERLAY SCROLLBAR — muncul saat hover/scroll, hilang otomatis
       - Position absolute di dalam container (.jt-toolbar position:relative)
       - Transisi opacity smooth
       - Style: tipis, accent color, rounded */
    .jt-scroll-indicator {
        position: absolute;
        background: rgba(16, 185, 129, 0.5);
        border-radius: 3px;
        pointer-events: none;       /* tidak block klik tombol */
        opacity: 0;                 /* default: hilang */
        transition: opacity 0.3s ease;
        z-index: 10;
    }
    .jt-scroll-indicator.jt-visible {
        opacity: 1;                 /* muncul saat hover/swipe */
    }
    /* Mode horizontal — scrollbar di bawah */
    .jt-horizontal .jt-scroll-indicator {
        bottom: 2px;
        left: 0;
        height: 3px;
        width: 40px;                /* akan di-update JS berdasarkan ratio */
        min-width: 20px;
    }
    /* Mode vertical — scrollbar di kanan */
    .jt-vertical .jt-scroll-indicator {
        right: 2px;
        top: 0;
        width: 3px;
        height: 40px;               /* akan di-update JS berdasarkan ratio */
        min-height: 20px;
    }
    /* 🔄 AUTO-ORIENT: ikon berjajar horizontal/vertical ikut orientasi frame */
    .jt-horizontal .jt-toolbar-inner { flex-direction: row; }
    .jt-vertical   .jt-toolbar-inner { flex-direction: column; }

    /* ── Button Base (TRANSPARAN — cuma ikon kelihatan) ──
       Ukuran FIXED 36px (TIDAK boleh mengecil) — gap yang mengecil,
       bukan tombolnya. */
    .jt-btn {
        width: 36px; height: 36px;
        background: transparent;          /* ❌ NO background — transparan */
        border: 1px solid transparent;    /* ❌ NO border default */
        border-radius: 6px;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        color: #888;
        outline: none;
        flex-shrink: 0;              /* ❌ JANGAN mengecil — fixed 36px */
        flex-grow: 0;
        box-sizing: border-box;
    }
    .jt-btn:hover {
        background: rgba(16, 185, 129, 0.12);   /* tipis accent saat hover */
        border-color: rgba(16, 185, 129, 0.3);
        color: #10b981;
        transform: translateY(-1px);
    }
    .jt-btn:active {
        transform: translateY(0);
        background: rgba(16, 185, 129, 0.22);
    }
    .jt-btn:focus-visible {
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.5);
    }

    /* ── Nav Button (lebih lebar + label teks) ── */
    .jt-nav-btn {
        width: auto !important;           /* auto-width, bukan 36px fixed */
        min-width: 80px;
        max-width: 200px;
        padding: 4px 10px !important;     /* padding horizontal untuk label */
        gap: 6px;
        flex-direction: row !important;   /* selalu horizontal: ikon + teks */
        flex-shrink: 0;
    }
    .jt-nav-btn .jt-icon-img,
    .jt-nav-btn .jt-icon-svg {
        width: 18px; height: 18px;
        max-width: 18px; max-height: 18px;
        flex-shrink: 0;
    }
    .jt-nav-label {
        font-size: 11px;
        font-weight: 500;
        color: #ccc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
        letter-spacing: 0.3px;
    }
    .jt-nav-btn:hover .jt-nav-label,
    .jt-nav-btn[data-active="true"] .jt-nav-label {
        color: #10b981;
    }
    /* Nav button di mode vertical — label di bawah ikon */
    .jt-vertical .jt-nav-btn {
        flex-direction: column !important;
        padding: 4px 6px !important;
        min-width: 50px;
        gap: 2px;
    }
    .jt-vertical .jt-nav-label {
        font-size: 9px;
    }

    /* ── Active State (glow — cuma ini yang berwarna) ── */
    .jt-btn[data-active="true"] {
        background: rgba(16, 185, 129, 0.18);
        border-color: rgba(16, 185, 129, 0.6);
        color: #10b981;
        box-shadow: 0 0 12px rgba(16, 185, 129, 0.3),
                    inset 0 0 8px rgba(16, 185, 129, 0.15);
    }
    .jt-btn[data-active="true"]::before {
        content: '';
        position: absolute;
        top: 2px; left: 2px; right: 2px; bottom: 2px;
        border: 1px solid rgba(16, 185, 129, 0.4);
        border-radius: 4px;
        pointer-events: none;
        animation: jtPulse 2s ease-in-out infinite;
    }
    @keyframes jtPulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.7; }
    }
    .jt-btn[data-active="true"] .jt-icon-img {
        filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.6));
    }

    /* ── Icon (PNG & SVG) — fixed 22px (tombol tidak shrink) ── */
    .jt-icon-img {
        width: 22px; height: 22px;
        object-fit: contain;
        pointer-events: none;
        filter: brightness(0.9);
        transition: filter 0.18s;
    }
    .jt-btn:hover .jt-icon-img,
    .jt-btn[data-active="true"] .jt-icon-img {
        filter: brightness(1.1);
    }
    .jt-icon-svg {
        width: 20px; height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    }
    .jt-icon-svg svg {
        width: 100%; height: 100%;
        display: block;
    }

    /* ── Separator (ADAPTIF: garis pemisah ikut orientasi frame) ──
       - Saat toolbar horizontal (dock atas/bawah) → separator = garis VERTIKAL (|) antar tombol
       - Saat toolbar vertical (dock kiri/kanan)   → separator = garis HORIZONTAL (—) antar tombol */
    .jt-separator {
        background: rgba(16, 185, 129, 0.25);
        flex-shrink: 0;
    }
    .jt-horizontal .jt-separator {
        width: 1px; height: 24px;
        margin: 0 4px;
    }
    .jt-vertical .jt-separator {
        width: 24px; height: 1px;
        margin: 4px 0;
    }

    /* ── Replay Button Container KHUSUS ──
       Beda dari toolbar lainnya:
       - Padding 2px (sangat dempet ke sisi frame)
       - align-items flex-start + justify-content flex-start
         → POJOK KIRI-ATAS (dempet ke title bar + sisi kiri)
       - Karena user akan hide title bar nanti, tombol harus dempet ke
         pojok yang pasti ada (kiri-atas = pojok frame) */
    #jt-replay-btn .jt-toolbar-inner {
        padding: 2px;                   /* sangat merapat ke sisi frame */
        align-items: flex-start;        /* RATA ATAS (dempet ke title bar / pojok atas) */
        justify-content: flex-start;    /* RATA KIRI (dempet ke sisi kiri frame) */
        gap: 0;
    }

    /* ── Replay Button (TRANSPARAN — tengah-atas, dempet ke title bar) ── */
    .jt-replay-btn {
        width: 44px; height: 44px;
        background: transparent;          /* ❌ NO background */
        border: 1px solid transparent;    /* ❌ NO border default */
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        transition: all 0.2s ease;
        position: relative;
        margin: 0;                        /* hilangkan margin auto biar dempet */
        flex-shrink: 0;
    }
    .jt-replay-btn:hover {
        background: rgba(16, 185, 129, 0.12);
        border-color: rgba(16, 185, 129, 0.3);
        box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);
        transform: scale(1.05);
    }
    .jt-replay-btn[data-active="true"] {
        background: rgba(16, 185, 129, 0.2);
        border-color: rgba(16, 185, 129, 0.8);
        box-shadow: 0 0 24px rgba(16, 185, 129, 0.5),
                    inset 0 0 12px rgba(16, 185, 129, 0.2);
    }
    .jt-replay-btn[data-active="true"] .jt-replay-pulse {
        opacity: 1;
    }
    .jt-replay-icon {
        width: 24px; height: 24px;
        object-fit: contain;
        pointer-events: none;
        filter: brightness(0.85);
    }
    .jt-replay-btn:hover .jt-replay-icon,
    .jt-replay-btn[data-active="true"] .jt-replay-icon {
        filter: brightness(1.2);
    }
    .jt-replay-pulse {
        position: absolute;
        inset: -4px;
        border: 2px solid rgba(16, 185, 129, 0.6);
        border-radius: 50%;
        opacity: 0;
        animation: jtReplayPulse 1.5s ease-out infinite;
        pointer-events: none;
    }
    @keyframes jtReplayPulse {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.4); opacity: 0; }
    }

    /* ── Context Menu (klik kanan / long-press) ──
       Muncul saat user klik kanan di toolbar (desktop) atau
       tap-hold 500ms (mobile). Berisi opsi toggle title bar. */
    .jt-context-menu {
        position: fixed;
        background: rgba(10, 10, 18, 0.98);
        border: 1px solid rgba(16, 185, 129, 0.4);
        border-radius: 8px;
        padding: 6px;
        z-index: 10000;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.15s ease, transform 0.15s ease;
        pointer-events: none;
        min-width: 180px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        font-size: 12px;
    }
    .jt-context-menu.jt-visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
    }
    .jt-context-menu-item {
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        color: #ccc;
        transition: background 0.12s, color 0.12s;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .jt-context-menu-item:hover {
        background: rgba(16, 185, 129, 0.15);
        color: #10b981;
    }
    .jt-context-menu-separator {
        height: 1px;
        background: rgba(16, 185, 129, 0.2);
        margin: 4px 0;
    }
    .jt-context-menu-header {
        padding: 6px 12px;
        font-size: 10px;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* ── Tooltip ── */
    .jt-tooltip {
        position: fixed;
        background: rgba(10, 10, 18, 0.98);
        color: #10b981;
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 5px;
        border: 1px solid rgba(16, 185, 129, 0.3);
        pointer-events: none;
        z-index: 9999;
        opacity: 0;
        transform: translateY(2px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        letter-spacing: 0.3px;
    }
    .jt-tooltip.jt-visible {
        opacity: 1;
        transform: translateY(0);
    }

    /* ── Mobile Adjustments ── */
    body.jt-mobile .jt-btn {
        width: 40px; height: 40px;
    }
    body.jt-mobile .jt-icon-img {
        width: 24px; height: 24px;
    }
    body.jt-mobile .jt-icon-svg {
        width: 22px; height: 22px;
    }
    body.jt-mobile .jt-replay-btn {
        width: 48px; height: 48px;
    }
    body.jt-mobile .jt-replay-icon {
        width: 26px; height: 26px;
    }

    /* ── Hidden State ── */
    #jt-overlay.jt-hidden {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
    }
    `;
}

// ── Initialize ──────────────────────────────────────────────
function init() {
    // Cek apakah overlay sudah ada (idempotent)
    if (document.getElementById('jt-overlay')) {
        console.log('[JARVIS-TB] Overlay sudah ada, skip init');
        return;
    }

    // Buat root overlay
    overlay = document.createElement('div');
    overlay.id = 'jt-overlay';
    overlay.innerHTML = buildHTML();
    document.body.appendChild(overlay);

    // Inject CSS
    const style = document.createElement('style');
    style.id = 'jt-style';
    style.textContent = buildCSS();
    document.head.appendChild(style);

    // Cache DOM refs
    drawingBar = overlay.querySelector('#jt-drawing-toolbar');
    rightBar   = overlay.querySelector('#jt-right-toolbar');
    navBar     = overlay.querySelector('#jt-nav-toolbar');
    replayBtn  = null;   // 🔥 Replay sekarang ada di NAV_TOOLS, bukan frame terpisah
    tooltipEl  = overlay.querySelector('#jt-tooltip');

    // Deteksi mobile (untuk adjust ukuran tombol)
    detectMobile();
    window.addEventListener('resize', detectMobile);

    // Bind events
    bindDrawingToolbar();
    bindRightToolbar();
    bindNavToolbar();    // 🔥 Bind nav toolbar (sekarang termasuk tombol Replay)
    bindTooltips();
    bindScrollbars();   // 🔥 Bind scroll event untuk show/hide overlay scrollbar
    bindContextMenu();  // 🔥 Bind context menu (klik kanan / long-press)

    // ── POSITION SYNC LOOP (60fps) ──
    // Baca rect ImGui frame dari C++ setiap frame, posisikan overlay
    // tepat di atas content area ImGui. Sama kayak pattern jarvis_chat.js
    // syncPosition(). Ini yang bikin overlay "menempel" ke frame ImGui
    // saat user drag / dock / resize.
    requestAnimationFrame(syncPosition);

    // Polling state (active glow) setiap POLL_INTERVAL ms
    pollTimer = setInterval(syncState, POLL_INTERVAL);

    console.log('[JARVIS-TB] Toolbar overlay initialized (v2: ImGui docking frame)');
}

// ── Position Sync — Baca rect dari C++, posisikan overlay ────
// Pattern sama kayak jarvis_chat.js syncPosition():
// - C++ expose rect content area ImGui via wasm_jt_get_*_x/y/w/h
// - JS konversi normalized (0-1) → pixel, lalu set CSS left/top/width/height
// - Saat ImGui window di-drag/dock/resize, rect berubah → overlay ikut
function syncPosition() {
    if (!isWasmReady()) {
        requestAnimationFrame(syncPosition);
        return;
    }

    // 🔥 FIX: Baca canvas rect (bukan window) supaya JS overlay ngikutin offset canvas.
    // Kalau app.html offset canvas top: 36px (header bar), canvas rect.top = 36.
    // C++ kirim normalized 0-1 relatif terhadap DisplaySize (= canvas size).
    // JS konversi ke pixel pakai canvas size, lalu tambah canvas offset (left/top).
    const canvasEl = document.getElementById('canvas');
    const rect = canvasEl ? canvasEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const screenW = rect.width;
    const screenH = rect.height;
    const offsetX = rect.left;
    const offsetY = rect.top;

    // ── Sync 3 frame: tools, panel, nav ──
    syncOneFrame(drawingBar, 'wasm_jt_get_tools_visible',
                 'wasm_jt_get_tools_x', 'wasm_jt_get_tools_y',
                 'wasm_jt_get_tools_w', 'wasm_jt_get_tools_h',
                 screenW, screenH, offsetX, offsetY);

    syncOneFrame(rightBar, 'wasm_jt_get_panel_visible',
                 'wasm_jt_get_panel_x', 'wasm_jt_get_panel_y',
                 'wasm_jt_get_panel_w', 'wasm_jt_get_panel_h',
                 screenW, screenH, offsetX, offsetY);

    // 🔥 Sync nav frame (Navigasi) — sekarang termasuk tombol Replay
    syncOneFrame(navBar, 'wasm_jt_get_nav_visible',
                 'wasm_jt_get_nav_x', 'wasm_jt_get_nav_y',
                 'wasm_jt_get_nav_w', 'wasm_jt_get_nav_h',
                 screenW, screenH, offsetX, offsetY);

    requestAnimationFrame(syncPosition);
}

// Helper: sync 1 frame
function syncOneFrame(el, visFn, xFn, yFn, wFn, hFn, screenW, screenH, offsetX, offsetY) {
    if (!el) return;

    // 🔥 Default offset = 0 (kalau tidak di-pass, fallback ke behavior lama)
    if (offsetX === undefined) offsetX = 0;
    if (offsetY === undefined) offsetY = 0;

    const visible = safeCcall(visFn, 'number', [], []);
    if (!visible) {
        el.classList.remove('jt-visible');
        return;
    }

    const cx = safeCcall(xFn, 'number', [], []);
    const cy = safeCcall(yFn, 'number', [], []);
    const cw = safeCcall(wFn, 'number', [], []);
    const ch = safeCcall(hFn, 'number', [], []);

    // Validasi: rect nggak valid → sembunyikan
    if (cx === null || cy === null || cw === null || ch === null ||
        cw <= 0.001 || ch <= 0.001) {
        el.classList.remove('jt-visible');
        return;
    }

    // Normalized (0-1) → pixel, LALU tambah canvas offset (header bar 36px, dll)
    let left   = cx * screenW + offsetX;
    let top    = cy * screenH + offsetY;
    let width  = cw * screenW;
    let height = ch * screenH;

    // 🛡️ SAFEGUARD: clamp posisi overlay biar tidak keluar viewport
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

    // 🔄 AUTO-ORIENT: deteksi orientasi frame, set class horizontal/vertical
    // - width > height → frame docking atas/bawah → ikon berjajar HORIZONTAL
    // - height >= width → frame docking kiri/kanan → ikon berjajar VERTICAL
    // Threshold +2px biar lebih stabil saat ukuran mendekati persegi
    if (width > height + 2) {
        el.classList.add('jt-horizontal');
        el.classList.remove('jt-vertical');
    } else {
        el.classList.add('jt-vertical');
        el.classList.remove('jt-horizontal');
    }

    // 🎨 UPDATE OVERLAY SCROLLBAR
    // Hitung ratio konten vs container — kalau konten lebih besar, perlu scroll
    const inner = el.querySelector('.jt-toolbar-inner');
    const scrollIndicator = el.querySelector('.jt-scroll-indicator');
    if (inner && scrollIndicator) {
        if (el.classList.contains('jt-horizontal')) {
            // Mode horizontal: gap tetap 3px (tidak shrink), pakai scroll
            inner.style.gap = '3px';
            const contentW = inner.scrollWidth;
            const containerW = inner.clientWidth;
            if (contentW > containerW + 1) {
                // Perlu scroll horizontal
                const ratio = containerW / contentW;
                const thumbW = Math.max(20, containerW * ratio);
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
            // Mode vertical: gap tetap 3px, pakai scroll
            inner.style.gap = '3px';
            const contentH = inner.scrollHeight;
            const containerH = inner.clientHeight;
            if (contentH > containerH + 1) {
                // Perlu scroll vertical
                const ratio = containerH / contentH;
                const thumbH = Math.max(20, containerH * ratio);
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

    el.classList.add('jt-visible');
}

// ── Mobile Detection ────────────────────────────────────────
function detectMobile() {
    const isMobile = window.innerWidth < 900;
    document.body.classList.toggle('jt-mobile', isMobile);
}

// ── Bind: Drawing Toolbar ───────────────────────────────────
function bindDrawingToolbar() {
    overlay.querySelectorAll('#jt-drawing-toolbar .jt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const toolId = parseInt(btn.dataset.toolId, 10);
            const toolDef = DRAWING_TOOLS.find(t => t.id === btn.dataset.toolId);
            if (!toolDef) return;

            handleDrawingClick(toolDef);
        });
    });
}

function handleDrawingClick(tool) {
    switch (tool.id) {
        case 'cursor':
            safeCcall('wasm_set_active_tool', null, ['number'], [0]);
            setActiveDrawingBtn('cursor');
            break;
        case 'line':
            safeCcall('wasm_set_active_tool', null, ['number'], [1]);
            setActiveDrawingBtn('line');
            break;
        case 'fib':
            safeCcall('wasm_set_active_tool', null, ['number'], [3]);
            setActiveDrawingBtn('fib');
            break;
        case 'rect':
            safeCcall('wasm_set_active_tool', null, ['number'], [2]);
            setActiveDrawingBtn('rect');
            break;
        case 'brush':
            safeCcall('wasm_set_active_tool', null, ['number'], [5]);
            setActiveDrawingBtn('brush');
            break;
        case 'text':
            safeCcall('wasm_set_active_tool', null, ['number'], [4]);
            setActiveDrawingBtn('text');
            break;
        case 'elliot':
            safeCcall('wasm_set_active_tool', null, ['number'], [6]);
            setActiveDrawingBtn('elliot');
            break;
        case 'jarvis':
            const newVis = safeCcall('wasm_toggle_jarvis', 'number', [], []);
            jarvisVisible = newVis === 1;
            updateJarvisBtn();
            break;
        case 'trash':
            safeCcall('wasm_clear_shapes', null, [], []);
            // Visual feedback: flash tombol
            flashButton(document.querySelector('#jt-drawing-toolbar [data-tool-id="trash"]'));
            break;
    }
}

function setActiveDrawingBtn(toolId) {
    // Reset semua tombol drawing ke non-active
    overlay.querySelectorAll('#jt-drawing-toolbar .jt-btn').forEach(b => {
        b.dataset.active = 'false';
    });
    // Set tombol yang dipilih ke active
    const btn = overlay.querySelector(`#jt-drawing-toolbar [data-tool-id="${toolId}"]`);
    if (btn) btn.dataset.active = 'true';
    activeToolId = toolId === 'cursor' ? 0 : toolId;
}

function updateJarvisBtn() {
    const btn = overlay.querySelector('#jt-drawing-toolbar [data-tool-id="jarvis"]');
    if (btn) btn.dataset.active = jarvisVisible ? 'true' : 'false';
}

// ── Bind: Right Toolbar ─────────────────────────────────────
function bindRightToolbar() {
    overlay.querySelectorAll('#jt-right-toolbar .jt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const toolDef = RIGHT_BAR_TOOLS.find(t => t.id === btn.dataset.toolId);
            if (!toolDef || !toolDef.toggleFn) return;

            const newVal = safeCcall(toolDef.toggleFn, 'number', [], []);
            panelState[toolDef.toggleKey] = (newVal === 1);
            btn.dataset.active = (newVal === 1) ? 'true' : 'false';

            // Visual feedback
            flashButton(btn);
        });
    });
}

// ── Bind: Replay Button ─────────────────────────────────────
function bindReplayButton() {
    // Klik di container = klik tombol replay di dalamnya
    replayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const btn = replayBtn.querySelector('.jt-replay-btn');
        if (replayActive) {
            // Stop replay
            safeCcall('wasm_replay_stop', null, [], []);
            replayActive = false;
        } else {
            // Start replay → buka popup setup
            safeCcall('wasm_replay_start', null, [], []);
            replayActive = true;
        }
        if (btn) btn.dataset.active = replayActive ? 'true' : 'false';
        flashButton(btn || replayBtn);
    });
}

// ── Bind: Nav Toolbar (5 tombol navigasi) ───────────────────
function bindNavToolbar() {
    overlay.querySelectorAll('#jt-nav-toolbar .jt-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const segIdx = parseInt(btn.dataset.segIdx, 10);
            if (isNaN(segIdx)) return;

            // 🔥 SPECIAL: tombol Replay (segIdx = -1) → handle start/stop replay
            if (segIdx === -1) {
                if (replayActive) {
                    safeCcall('wasm_replay_stop', null, [], []);
                    replayActive = false;
                } else {
                    safeCcall('wasm_replay_start', null, [], []);
                    replayActive = true;
                }
                btn.dataset.active = replayActive ? 'true' : 'false';
                flashButton(btn);
                return;
            }

            // Panggil C++ untuk set active segment
            safeCcall('wasm_nav_click_segment', null, ['number'], [segIdx]);

            // Update visual: reset semua nav btn, set yang ini active
            overlay.querySelectorAll('#jt-nav-toolbar .jt-nav-btn').forEach(b => {
                b.dataset.active = 'false';
            });
            btn.dataset.active = 'true';

            flashButton(btn);
        });
    });
}

// ── Sync Nav State — update label & icon dari C++ ──────────
// Dipanggil dari syncState() setiap POLL_INTERVAL ms.
// Baca symbol/TF/candle style dari C++ → update label + icon tombol JS.
function syncNavState() {
    if (!navBar) return;

    // ── Update Symbol label + icon ──
    const symbol = safeCcall('wasm_nav_get_symbol', 'string', [], []);
    if (symbol) {
        const labelEl = navBar.querySelector('[data-nav-label="nav-symbol"]');
        if (labelEl) labelEl.textContent = symbol;
    }
    const symbolIcon = safeCcall('wasm_nav_get_symbol_icon', 'string', [], []);
    if (symbolIcon) {
        const symBtn = navBar.querySelector('[data-tool-id="nav-symbol"]');
        if (symBtn) {
            const imgEl = symBtn.querySelector('.jt-icon-img');
            if (imgEl && imgEl.src.indexOf(symbolIcon) === -1) {
                imgEl.src = symbolIcon;
                imgEl.style.display = '';
                const svgEl = symBtn.querySelector('.jt-icon-svg');
                if (svgEl) svgEl.style.display = 'none';
            }
        }
    }

    // ── Update TF label ──
    const tf = safeCcall('wasm_nav_get_tf', 'string', [], []);
    if (tf) {
        const labelEl = navBar.querySelector('[data-nav-label="nav-tf"]');
        if (labelEl) labelEl.textContent = tf;
    }

    // ── Update Candle label + icon (dinamis sesuai style) ──
    const candleStyle = safeCcall('wasm_nav_get_candle_style', 'number', [], []);
    if (candleStyle !== null && candleStyle >= 0 && candleStyle < NAV_CANDLE_SVGS.length) {
        const candleBtn = navBar.querySelector('[data-tool-id="nav-candle"]');
        if (candleBtn) {
            // Sembunyikan img, tampilkan SVG sesuai style
            const imgEl = candleBtn.querySelector('.jt-icon-img');
            const svgEl = candleBtn.querySelector('.jt-icon-svg');
            if (imgEl) imgEl.style.display = 'none';
            if (svgEl) {
                svgEl.innerHTML = NAV_CANDLE_SVGS[candleStyle];
                svgEl.style.display = 'flex';
            }
        }
    }
    const candleName = safeCcall('wasm_nav_get_candle_style_name', 'string', [], []);
    if (candleName) {
        const labelEl = navBar.querySelector('[data-nav-label="nav-candle"]');
        if (labelEl) labelEl.textContent = candleName;
    }

    // ── Update active segment glow ──
    const activeSeg = safeCcall('wasm_nav_get_active_segment', 'number', [], []);
    if (activeSeg !== null) {
        overlay.querySelectorAll('#jt-nav-toolbar .jt-nav-btn').forEach(btn => {
            const segIdx = parseInt(btn.dataset.segIdx, 10);
            btn.dataset.active = (segIdx === activeSeg) ? 'true' : 'false';
        });
    }
}

// ── Tooltip Handler ─────────────────────────────────────────
function bindTooltips() {
    let tooltipTimer = null;
    const showTooltip = (text, target) => {
        clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(() => {
            tooltipEl.textContent = text;
            const rect = target.getBoundingClientRect();
            tooltipEl.style.left = (rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2) + 'px';
            tooltipEl.style.top  = (rect.top - tooltipEl.offsetHeight - 8) + 'px';
            tooltipEl.classList.add('jt-visible');
        }, TOOLTIP_DELAY);
    };
    const hideTooltip = () => {
        clearTimeout(tooltipTimer);
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

// ── Context Menu Handler (klik kanan / long-press) ──────────
// Munculin popup "Sembunyikan/Tampilkan Title Bar" + "Tutup Frame"
// saat user klik kanan (desktop) atau tap-hold 500ms (mobile) di toolbar.
let contextMenuTarget = null;   // { el, frameId, frameName }
let longPressTimer = null;

function bindContextMenu() {
    const menu = overlay.querySelector('#jt-context-menu');

    // Mapping toolbar ID → frameId + nama
    // 🔥 Replay frame dihapus — tombol Replay sekarang ada di NAV toolbar
    const FRAME_MAP = {
        'jt-drawing-toolbar': { id: 0, name: 'Tools' },
        'jt-right-toolbar':   { id: 1, name: 'Panel' },
        'jt-nav-toolbar':     { id: 3, name: 'Navigasi' }
    };

    // Fungsi show context menu di posisi X,Y
    const showMenu = (x, y, toolbarId) => {
        const info = FRAME_MAP[toolbarId];
        if (!info) return;
        contextMenuTarget = { toolbarId, frameId: info.id, frameName: info.name };

        // Update header + label sesuai state title bar sekarang
        const titleBarVisible = safeCcall('wasm_jt_get_title_bar_visible',
                                          'number', ['number'], [info.id]);
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

    // Sembunyikan menu
    const hideMenu = () => {
        menu.classList.remove('jt-visible');
        contextMenuTarget = null;
    };

    // 1. Klik kanan (desktop)
    overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
        toolbar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMenu(e.clientX, e.clientY, toolbar.id);
        });
    });

    // 2. Long-press (mobile) — tahan 500ms
    overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
        toolbar.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const startX = touch.clientX, startY = touch.clientY;
            const tbId = toolbar.id;
            longPressTimer = setTimeout(() => {
                showMenu(startX, startY, tbId);
            }, 500);  // 500ms = long-press
        }, { passive: true });

        // Cancel kalau user bergerak (swipe) atau lepas
        toolbar.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
        toolbar.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
        toolbar.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
    });

    // 3. Klik item menu
    overlay.querySelectorAll('.jt-context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            if (!contextMenuTarget) return;
            const action = item.dataset.action;
            const { frameId, frameName, toolbarId } = contextMenuTarget;

            if (action === 'toggle-title') {
                // Toggle title bar via WASM
                safeCcall('wasm_jt_toggle_title_bar', 'number', ['number'], [frameId]);
                console.log('[JARVIS-TB] Title bar toggled for', frameName);
            } else if (action === 'close-frame') {
                // Tutup frame via toggle (klik X virtual)
                // 🔥 Replay frame dihapus — case 2 tidak dipakai lagi
                const toggleFn = {
                    0: 'wasm_jt_toggle_tools',
                    1: 'wasm_jt_toggle_panel',
                    3: 'wasm_jt_toggle_nav'
                }[frameId];
                if (toggleFn) safeCcall(toggleFn, 'number', [], []);
                console.log('[JARVIS-TB] Frame closed:', frameName);
            }

            hideMenu();
        });
    });

    // 4. Klik di luar menu → tutup
    document.addEventListener('click', (e) => {
        if (!menu.classList.contains('jt-visible')) return;
        if (menu.contains(e.target)) return;
        hideMenu();
    });
    document.addEventListener('contextmenu', (e) => {
        // Klik kanan di luar toolbar → tutup menu yang terbuka
        if (!menu.contains(e.target) && !e.target.closest('.jt-toolbar')) {
            hideMenu();
        }
    });

    // 5. Escape → tutup menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideMenu();
    });
}

// ── Scrollbar Overlay Handler ─────────────────────────────────
// Tampilkan scrollbar overlay saat user scroll/hover, sembunyikan otomatis
// setelah 1.5 detik idle. Update posisi thumb saat scroll.
function bindScrollbars() {
    let hideTimers = new WeakMap();

    overlay.querySelectorAll('.jt-toolbar').forEach(toolbar => {
        const inner = toolbar.querySelector('.jt-toolbar-inner');
        const indicator = toolbar.querySelector('.jt-scroll-indicator');
        if (!inner || !indicator) return;

        // Show indicator saat user hover toolbar (jika scrollable)
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

            // Update thumb position
            if (toolbar.classList.contains('jt-horizontal')) {
                const contentW = inner.scrollWidth;
                const containerW = inner.clientWidth;
                const ratio = containerW / contentW;
                const thumbW = Math.max(20, containerW * ratio);
                const maxScroll = contentW - containerW;
                const scrollPercent = maxScroll > 0 ? inner.scrollLeft / maxScroll : 0;
                const thumbX = scrollPercent * (containerW - thumbW);
                indicator.style.width = thumbW + 'px';
                indicator.style.left = thumbX + 'px';
            } else {
                const contentH = inner.scrollHeight;
                const containerH = inner.clientHeight;
                const ratio = containerH / contentH;
                const thumbH = Math.max(20, containerH * ratio);
                const maxScroll = contentH - containerH;
                const scrollPercent = maxScroll > 0 ? inner.scrollTop / maxScroll : 0;
                const thumbY = scrollPercent * (containerH - thumbH);
                indicator.style.height = thumbH + 'px';
                indicator.style.top = thumbY + 'px';
            }

            // Auto-hide setelah 1.5s idle
            clearTimeout(hideTimers.get(toolbar));
            const t = setTimeout(() => {
                indicator.classList.remove('jt-visible');
            }, 1500);
            hideTimers.set(toolbar, t);
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

// ── Visual Feedback: Flash ──────────────────────────────────
function flashButton(btn) {
    if (!btn) return;
    btn.style.transition = 'none';
    btn.style.background = 'rgba(16, 185, 129, 0.4)';
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btn.style.transition = '';
        btn.style.background = '';
        btn.style.transform = '';
    }, 120);
}

// ── State Sync (Polling dari C++) ───────────────────────────
function syncState() {
    if (!isWasmReady()) return;

    // Sync panel states dari C++
    const syncPanel = (getter, key) => {
        const val = safeCcall(getter, 'number', [], []);
        if (val !== null) {
            const newState = val === 1;
            if (panelState[key] !== newState) {
                panelState[key] = newState;
                const btnId = Object.keys(RIGHT_BAR_TOOLS).find(k =>
                    RIGHT_BAR_TOOLS[k].toggleKey === key
                );
                const toolDef = RIGHT_BAR_TOOLS.find(t => t.toggleKey === key);
                if (toolDef) {
                    const btn = overlay.querySelector(`#jt-right-toolbar [data-tool-id="${toolDef.id}"]`);
                    if (btn) btn.dataset.active = newState ? 'true' : 'false';
                }
            }
        }
    };
    syncPanel('wasm_get_top_toolbar',      'topToolbar');
    syncPanel('wasm_get_navigation_panel', 'navigation');
    syncPanel('wasm_get_trade_panel',      'trade');
    syncPanel('wasm_get_history_panel',    'history');
    syncPanel('wasm_get_market_watch',     'marketWatch');
    syncPanel('wasm_get_object_tree',      'objectTree');
    syncPanel('wasm_get_display_settings', 'displaySettings');

    // Sync Jarvis visibility
    const jv = safeCcall('wasm_get_jarvis_visible', 'number', [], []);
    if (jv !== null && jarvisVisible !== (jv === 1)) {
        jarvisVisible = (jv === 1);
        updateJarvisBtn();
    }

    // Sync Replay state — update tombol Replay di NAV toolbar (bukan frame terpisah)
    const rp = safeCcall('wasm_get_replay_active', 'number', [], []);
    if (rp !== null) {
        replayActive = (rp === 1);
        const navReplayBtn = overlay.querySelector('[data-tool-id="nav-replay"]');
        if (navReplayBtn) navReplayBtn.dataset.active = replayActive ? 'true' : 'false';
    }

    // 🔥 Sync Nav state (label symbol/TF + active segment glow)
    syncNavState();
}

// ── Auto-init when Module is FULLY ready ────────────────────
function waitForModule() {
    if (typeof Module !== 'undefined' && Module.calledRun) {
        wasmReady = true;
        init();
        console.log('[JARVIS-TB] WASM ready, toolbar initialized');
    } else {
        setTimeout(waitForModule, 200);
    }
}

// Hook ke Emscripten onRuntimeInitialized (backup)
if (typeof Module !== 'undefined') {
    const origInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = function() {
        wasmReady = true;
        if (origInit) origInit();
    };
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForModule);
} else {
    waitForModule();
}

// ── Public API (opsional, untuk debugging dari console) ─────
window.JarvisToolbar = {
    toggle: () => overlay && overlay.classList.toggle('jt-hidden'),
    show:   () => overlay && overlay.classList.remove('jt-hidden'),
    hide:   () => overlay && overlay.classList.add('jt-hidden'),
    sync:   syncState,
    state:  () => ({ panelState, activeToolId, jarvisVisible, replayActive }),
    // Reopen frame yang sudah di-close (X button ImGui)
    openTools:  () => safeCcall('wasm_jt_toggle_tools',  'number', [], []),
    openPanel:  () => safeCcall('wasm_jt_toggle_panel',  'number', [], []),
    openReplay: () => safeCcall('wasm_jt_toggle_replay', 'number', [], []),
    openNav:    () => safeCcall('wasm_jt_toggle_nav',    'number', [], []),
    // Force re-sync position
    resync:  syncPosition
};

})();
