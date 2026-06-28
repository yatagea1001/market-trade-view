// ============================================================
// jarvis_toolbar.js — Jarvis-style HTML/JS Toolbar Overlay (v2)
// ------------------------------------------------------------
// ARSITEKTUR v2 — ImGui Docking Frame + JS Overlay Content
//   Sama kayak Jarvis AI chat (src/ai/AiAssistant.h + jarvis_chat.js):
//
//   1. C++ (main.cpp) render 3 ImGui window:
//        - "Jarvis Tools"  → frame drawing toolbar (9 tombol)
//        - "Jarvis Panel"  → frame right toggle bar (7 panel)
//        - "Jarvis Replay" → frame replay button
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
let drawingBar, rightBar, replayBtn;      // 3 grup toolbar
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
    </div>

    <!-- Right Main Toolbar (toggle panels)
         Orientasi auto: horizontal saat dock atas/bawah, vertical saat dock kiri/kanan -->
    <div id="jt-right-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${RIGHT_BAR_TOOLS.map(tool => buildButtonHTML(tool, 'right')).join('')}
        </div>
    </div>

    <!-- Replay Floating Button
         Orientasi auto (biasanya cuma 1 tombol, tapi auto tetap jalan) -->
    <div id="jt-replay-btn" class="jt-toolbar" data-active="false">
        <div class="jt-toolbar-inner">
            <button class="jt-replay-btn" data-tooltip="Mode Replay">
                <img src="assets/replay.png" alt="Replay" class="jt-replay-icon"/>
                <span class="jt-replay-pulse"></span>
            </button>
        </div>
    </div>

    <!-- Tooltip (shared) -->
    <div id="jt-tooltip" class="jt-tooltip"></div>
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
       - C++ (main.cpp) render ImGui window "Jarvis Tools",
         "Jarvis Panel", "Jarvis Replay" → FRAME docking (title bar)
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
       display:flex + align/justify flex-start → ikon SELALU rata ATAS-KIRI
       (top-left aligned), walau frame di-drag/dock/resize. */
    .jt-toolbar {
        position: absolute;
        pointer-events: none;       /* Container tembus, hanya tombol yang pegang event */
        display: none;              /* Default hidden, syncPosition() yang show */
        overflow: hidden;           /* Ikon tidak boleh keluar frame ImGui */
    }
    .jt-toolbar.jt-visible { display: flex; }

    /* 🎯 INNER = RATA ATAS-KIRI (top-left aligned)
       align-items + justify-content → flex-start (atas & kiri)
       flex-wrap: wrap → kalau frame sempit, ikon pindah baris (merapat)
       width/height 100% → isi penuh content area ImGui
       padding 4px → merapat ke tepi frame (compact) */
    .jt-toolbar-inner {
        display: flex;
        align-items: flex-start;    /* rata ATAS (axis secondary) */
        justify-content: flex-start;/* rata KIRI (axis primary) */
        gap: 3px;                   /* gap kecil biar merapat */
        pointer-events: auto;
        padding: 4px;               /* padding minimal → merapat ke tepi */
        background: transparent;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        flex-wrap: wrap;            /* kalau sempit, pindah baris rapi */
        align-content: flex-start;  /* baris-baris ikon rata atas */
        min-width: 0;
        min-height: 0;
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

    /* ── Replay Button (TRANSPARAN — di dalam frame "Jarvis Replay") ── */
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
    replayBtn  = overlay.querySelector('#jt-replay-btn');
    tooltipEl  = overlay.querySelector('#jt-tooltip');

    // Deteksi mobile (untuk adjust ukuran tombol)
    detectMobile();
    window.addEventListener('resize', detectMobile);

    // Bind events
    bindDrawingToolbar();
    bindRightToolbar();
    bindReplayButton();
    bindTooltips();

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

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // ── Sync 3 frame: tools, panel, replay ──
    syncOneFrame(drawingBar, 'wasm_jt_get_tools_visible',
                 'wasm_jt_get_tools_x', 'wasm_jt_get_tools_y',
                 'wasm_jt_get_tools_w', 'wasm_jt_get_tools_h',
                 screenW, screenH);

    syncOneFrame(rightBar, 'wasm_jt_get_panel_visible',
                 'wasm_jt_get_panel_x', 'wasm_jt_get_panel_y',
                 'wasm_jt_get_panel_w', 'wasm_jt_get_panel_h',
                 screenW, screenH);

    syncOneFrame(replayBtn, 'wasm_jt_get_replay_visible',
                 'wasm_jt_get_replay_x', 'wasm_jt_get_replay_y',
                 'wasm_jt_get_replay_w', 'wasm_jt_get_replay_h',
                 screenW, screenH);

    requestAnimationFrame(syncPosition);
}

// Helper: sync 1 frame
function syncOneFrame(el, visFn, xFn, yFn, wFn, hFn, screenW, screenH) {
    if (!el) return;

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

    // Normalized (0-1) → pixel
    let left   = cx * screenW;
    let top    = cy * screenH;
    let width  = cw * screenW;
    let height = ch * screenH;

    // 🛡️ SAFEGUARD: clamp posisi overlay biar tidak keluar viewport
    // (kadang ImGui docked frame report rect yang sedikit melebihi viewport)
    if (left < 0) { width += left; left = 0; }
    if (top  < 0) { height += top; top = 0; }
    if (left + width  > screenW) width  = screenW - left;
    if (top  + height > screenH) height = screenH - top;
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

    // 📏 DYNAMIC GAP (hanya untuk mode horizontal) — saat frame di-geser
    // sempit, gap antar ikon mengecil sampai 0. Kalau sudah 0 dan masih
    // sempit, flex-wrap otomatis pindah baris.
    // Mode vertical: gap tetap (default dari CSS).
    const inner = el.querySelector('.jt-toolbar-inner');
    if (inner) {
        if (el.classList.contains('jt-horizontal')) {
            // Hitung jumlah tombol (exclude separator)
            const buttons = inner.querySelectorAll('.jt-btn, .jt-replay-btn');
            const n = buttons.length;
            // Hitung total lebar tombol (36px per tombol) + separator (1px each)
            const separators = inner.querySelectorAll('.jt-separator');
            const sepCount = separators.length;
            const buttonWidth = 36;   // fixed .jt-btn width
            const replayWidth = 44;   // .jt-replay-btn width
            // Cek apakah ada tombol replay
            let hasReplay = false;
            buttons.forEach(b => { if (b.classList.contains('jt-replay-btn')) hasReplay = true; });
            const totalButtonWidth = hasReplay ? replayWidth : (n * buttonWidth);
            const totalSepWidth = sepCount * 1;  // 1px per separator
            const padding = 8;  // 4px left + 4px right dari .jt-toolbar-inner
            const available = width - padding;
            const contentWidth = totalButtonWidth + totalSepWidth;
            const remainingSpace = available - contentWidth;
            // gap = remaining / (n - 1) atau (n + sepCount - 1), clamp [0, 6]
            const divider = Math.max(1, (n - 1) + sepCount);
            let gap = remainingSpace / divider;
            gap = Math.max(0, Math.min(6, gap));
            inner.style.gap = gap + 'px';
        } else {
            // Mode vertical: gap tetap 3px
            inner.style.gap = '3px';
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

    // Sync Replay state
    const rp = safeCcall('wasm_get_replay_active', 'number', [], []);
    if (rp !== null && replayActive !== (rp === 1)) {
        replayActive = (rp === 1);
        const replayInnerBtn = replayBtn.querySelector('.jt-replay-btn');
        if (replayInnerBtn) replayInnerBtn.dataset.active = replayActive ? 'true' : 'false';
    }
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
    // Force re-sync position
    resync:  syncPosition
};

})();
