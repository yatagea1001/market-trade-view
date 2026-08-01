// ============================================================
// css-builder.js — CSS Stylesheet Generator
// ------------------------------------------------------------
// Semua CSS untuk Jarvis Toolbar overlay.
// Dipisahkan dari logic supaya desainer bisa edit tanpa
// menyentuh kode JavaScript.
//
// KONVENSI CSS CLASS:
//   .jt-toolbar       — container frame (di-sync dari C++)
//   .jt-toolbar-inner — flex container untuk tombol
//   .jt-btn           — tombol dasar (36×36px)
//   .jt-nav-btn       — tombol navigasi (lebih lebar + label)
//   .jt-replay-btn    — tombol replay (44×44px bulat)
//   .jt-scroll-indicator — scrollbar overlay
//   .jt-tooltip       — tooltip hover
//   .jt-context-menu  — context menu (klik kanan)
// ============================================================

window.JT = window.JT || {};

JT.CssBuilder = {

    /**
     * Build seluruh CSS stylesheet.
     * @returns {string} CSS string
     */
    buildCSS() {
        const C = JT.Config;
        const R = C.ACCENT_RGB;  // "16, 185, 129"

        return `
    /* ════════════════════════════════════════════════════════
       JARVIS TOOLBAR — Dark Tech Style (v2: ImGui Docking Frame)
       ════════════════════════════════════════════════════════ */

    #jt-overlay {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        z-index: ${C.Z_OVERLAY}; pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        user-select: none; -webkit-user-select: none;
    }

    /* ── Toolbar Container ── */
    .jt-toolbar {
        position: absolute;
        pointer-events: none;
        display: none;
        overflow: hidden;
    }
    .jt-toolbar.jt-visible { display: flex; }

    /* ── Toolbar Inner ── */
    .jt-toolbar-inner {
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 3px;
        pointer-events: none;
        padding: 0px;
        background: transparent;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        flex-wrap: nowrap;
        align-content: flex-start;
        min-width: 0;
        min-height: 0;
        overflow: auto;
        scroll-behavior: smooth;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    .jt-toolbar-inner::-webkit-scrollbar {
        display: none;
    }

    /* ── HANYA tombol yang bisa di-klik ── */
    .jt-btn,
    .jt-replay-btn,
    .jt-scroll-indicator {
        pointer-events: auto;
    }

    /* ── Overlay Scrollbar ── */
    .jt-scroll-indicator {
        position: absolute;
        background: rgba(${R}, 0.5);
        border-radius: 3px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 10;
    }
    .jt-scroll-indicator.jt-visible {
        opacity: 1;
    }
    .jt-horizontal .jt-scroll-indicator {
        bottom: 2px; left: 0;
        height: 3px; width: 40px; min-width: ${C.MIN_SCROLL_THUMB}px;
    }
    .jt-vertical .jt-scroll-indicator {
        right: 2px; top: 0;
        width: 3px; height: 40px; min-height: ${C.MIN_SCROLL_THUMB}px;
    }

    /* ── Auto-Orient ── */
    .jt-horizontal .jt-toolbar-inner { flex-direction: row; }
    .jt-vertical   .jt-toolbar-inner { flex-direction: column; }

    /* ── Button Base ── */
    .jt-btn {
        width: ${C.BTN_SIZE}px; height: ${C.BTN_SIZE}px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        color: ${C.TEXT_MUTED};
        outline: none;
        flex-shrink: 0;
        flex-grow: 0;
        box-sizing: border-box;
    }
    .jt-btn:hover {
        background: rgba(${R}, 0.12);
        border-color: rgba(${R}, 0.3);
        color: ${C.ACCENT_COLOR};
        transform: translateY(-1px);
    }
    .jt-btn:active {
        transform: translateY(0);
        background: rgba(${R}, 0.22);
    }
    .jt-btn:focus-visible {
        box-shadow: 0 0 0 2px rgba(${R}, 0.5);
    }

    /* ── Nav Button ── */
    .jt-nav-btn {
        width: auto !important;
        min-width: ${C.NAV_BTN_MIN_WIDTH}px;
        max-width: ${C.NAV_BTN_MAX_WIDTH}px;
        padding: 4px 10px !important;
        gap: 6px;
        flex-direction: row !important;
        flex-shrink: 0;
    }
    .jt-nav-btn .jt-icon-img,
    .jt-nav-btn .jt-icon-svg {
        width: ${C.NAV_ICON_SIZE}px; height: ${C.NAV_ICON_SIZE}px;
        max-width: ${C.NAV_ICON_SIZE}px; max-height: ${C.NAV_ICON_SIZE}px;
        flex-shrink: 0;
    }
    .jt-nav-label {
        font-size: ${C.NAV_LABEL_SIZE}px;
        font-weight: 500;
        color: ${C.TEXT_NORMAL};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
        letter-spacing: 0.3px;
    }
    .jt-nav-btn:hover .jt-nav-label,
    .jt-nav-btn[data-active="true"] .jt-nav-label {
        color: ${C.ACCENT_COLOR};
    }
    .jt-vertical .jt-nav-btn {
        flex-direction: column !important;
        padding: 4px 6px !important;
        min-width: 50px;
        gap: 2px;
    }
    .jt-vertical .jt-nav-label {
        font-size: ${C.NAV_LABEL_SIZE_MOBILE}px;
    }

    /* ── Active State (glow) ── */
    .jt-btn[data-active="true"] {
        background: rgba(${R}, 0.18);
        border-color: rgba(${R}, 0.6);
        color: ${C.ACCENT_COLOR};
        box-shadow: 0 0 12px rgba(${R}, 0.3),
                    inset 0 0 8px rgba(${R}, 0.15);
    }
    .jt-btn[data-active="true"]::before {
        content: '';
        position: absolute;
        top: 2px; left: 2px; right: 2px; bottom: 2px;
        border: 1px solid rgba(${R}, 0.4);
        border-radius: 4px;
        pointer-events: none;
        animation: jtPulse 2s ease-in-out infinite;
    }
    @keyframes jtPulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.7; }
    }
    .jt-btn[data-active="true"] .jt-icon-img {
        filter: drop-shadow(0 0 4px rgba(${R}, 0.6));
    }

    /* ── Icon (PNG & SVG) ── */
    .jt-icon-img {
        width: ${C.ICON_SIZE}px; height: ${C.ICON_SIZE}px;
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

    /* ── Separator ── */
    .jt-separator {
        background: rgba(${R}, 0.25);
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

    /* ════════════════════════════════════════════════════════
       NAV TOOLBAR — Scrollable + Pinned Alert
       ════════════════════════════════════════════════════════
       Layout:
       ┌─────────────────────────────────────────┬──────────┐
       │ #jt-nav-scrollable (flex, overflow)     │ #pinned  │
       │ Symbol │ TF │ Candle │ Ind │ +New │ Rep │  🔔 Alert │
       └─────────────────────────────────────────┴──────────┘
       - Scrollable area: bisa di-scroll saat window sempit
       - Pinned alert: SELALU kelihatan di kanan
       ════════════════════════════════════════════════════════ */

    /* ── Nav Toolbar: Override jadi flex row ── */
    #jt-nav-toolbar {
        flex-direction: row !important;  /* SELALU horizontal */
        align-items: stretch;           /* anak full height */
    }

    /* ── Scrollable Area (kiri) ──
       - flex: 1 → ambil sisa ruang
       - overflow: auto → bisa scroll
       - min-width: 0 → boleh shrink */
    .jt-nav-scrollable {
        flex: 1 1 0%;
        min-width: 0;
        overflow: hidden;
        position: relative;
        display: flex;
    }
    .jt-nav-scrollable .jt-toolbar-inner {
        flex-direction: row !important;  /* SELALU horizontal */
    }

    /* ── Separator antara scrollable & pinned ── */
    .jt-nav-pinned-separator {
        width: 1px;
        background: rgba(${R}, 0.3);
        flex-shrink: 0;
        margin: 4px 0;
    }

    /* ── Pinned Area (kanan) ──
       - flex-shrink: 0 → TIDAK BOLEH mengecil
       - flex-grow: 0 → TIDAK ambil ruang ekstra
       - Alert SELALU kelihatan di sini */
    .jt-nav-pinned {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
        flex-shrink: 0;
        background: rgba(10, 10, 18, 0.3);  /* sedikit bg biar kelihatan beda */
    }

    /* ── Alert Button (pinned, icon only — tanpa tulisan) ── */
    .jt-alert-btn {
        width: 36px !important;
        height: 36px !important;
        min-width: 36px !important;
        max-width: 36px !important;
        padding: 4px !important;
        border-radius: 8px;
        position: relative;
        /* Icon only — compact seperti WA notification bell */
    }
    .jt-alert-btn .jt-icon-svg {
        width: 20px;
        height: 20px;
    }
    .jt-alert-btn:hover {
        background: rgba(${R}, 0.15);
        border-color: rgba(${R}, 0.5);
    }
    .jt-alert-btn[data-active="true"] {
        background: rgba(${R}, 0.2);
        border-color: rgba(${R}, 0.8);
    }

    /* ════════════════════════════════════════════════════════
       NOTIFICATION BADGE (seperti WhatsApp)
       ════════════════════════════════════════════════════════
       - Lingkaran merah kecil di pojok kanan-atas tombol
       - Angka di dalam (1-99, atau "99+")
       - Animasi bounce saat muncul (seperti WA)
       - Pulse glow saat ada notif baru masuk
       - Hilang saat user klik Alert (buka panel) */
    .jt-badge {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: #ef4444;          /* Red 500 — sama kayak WA */
        color: white;
        font-size: 10px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
        pointer-events: none;
        display: none;                /* Default: sembunyi */
        z-index: 20;
        box-shadow: 0 0 0 2px rgba(10, 10, 18, 0.8),   /* border gelap di luar lingkaran */
                    0 0 8px rgba(239, 68, 68, 0.5),     /* red glow */
                    0 1px 3px rgba(0,0,0,0.5);
        letter-spacing: -0.5px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transform: scale(0);          /* Start dari scale 0 untuk animasi */
        transition: transform 0.2s ease;
    }

    /* Badge VISIBLE — muncul dengan bounce animasi kayak WA */
    .jt-badge.jt-badge-visible {
        display: block;
        transform: scale(1);
        animation: jtBadgePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes jtBadgePop {
        0%   { transform: scale(0); }
        50%  { transform: scale(1.25); }
        70%  { transform: scale(0.9); }
        100% { transform: scale(1); }
    }

    /* Badge PULSE — glow berkedip kayak WA pas notif baru masuk
       Dipasang BERSAMAAN dengan jt-badge-visible.
       Pakai box-shadow animation (BUKAN transform) supaya gak konflik. */
    .jt-badge.jt-badge-visible.jt-badge-pulse {
        animation: jtBadgePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                  jtBadgeGlow 1.5s ease-in-out 0.4s infinite;
    }
    @keyframes jtBadgeGlow {
        0%, 100% { box-shadow: 0 0 0 2px rgba(10, 10, 18, 0.8),
                              0 0 6px rgba(239, 68, 68, 0.4),
                              0 1px 3px rgba(0,0,0,0.5); }
        50%      { box-shadow: 0 0 0 2px rgba(10, 10, 18, 0.8),
                              0 0 16px rgba(239, 68, 68, 0.9),
                              0 0 24px rgba(239, 68, 68, 0.3),
                              0 1px 3px rgba(0,0,0,0.5); }
    }

    /* ── Mobile: Alert pinned tetap kelihatan ── */
    body.jt-mobile .jt-nav-pinned {
        padding: 0 2px;
    }
    body.jt-mobile .jt-alert-btn {
        min-width: 50px;
    }
    body.jt-mobile .jt-badge {
        min-width: 14px;
        height: 14px;
        font-size: 8px;
        line-height: 14px;
        top: -3px;
        right: -3px;
    }

    /* ── Replay Button Container ── */
    #jt-replay-btn .jt-toolbar-inner {
        padding: 2px;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 0;
    }

    /* ── Replay Button ── */
    .jt-replay-btn {
        width: ${C.REPLAY_BTN_SIZE}px; height: ${C.REPLAY_BTN_SIZE}px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        transition: all 0.2s ease;
        position: relative;
        margin: 0;
        flex-shrink: 0;
    }
    .jt-replay-btn:hover {
        background: rgba(${R}, 0.12);
        border-color: rgba(${R}, 0.3);
        box-shadow: 0 0 16px rgba(${R}, 0.2);
        transform: scale(1.05);
    }
    .jt-replay-btn[data-active="true"] {
        background: rgba(${R}, 0.2);
        border-color: rgba(${R}, 0.8);
        box-shadow: 0 0 24px rgba(${R}, 0.5),
                    inset 0 0 12px rgba(${R}, 0.2);
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
        border: 2px solid rgba(${R}, 0.6);
        border-radius: 50%;
        opacity: 0;
        animation: jtReplayPulse 1.5s ease-out infinite;
        pointer-events: none;
    }
    @keyframes jtReplayPulse {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.4); opacity: 0; }
    }

    /* ── Context Menu ── */
    .jt-context-menu {
        position: fixed;
        background: rgba(10, 10, 18, 0.98);
        border: 1px solid rgba(${R}, 0.4);
        border-radius: 8px;
        padding: 6px;
        z-index: ${C.Z_CONTEXT_MENU};
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
        color: ${C.TEXT_NORMAL};
        transition: background 0.12s, color 0.12s;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .jt-context-menu-item:hover {
        background: rgba(${R}, 0.15);
        color: ${C.ACCENT_COLOR};
    }
    .jt-context-menu-separator {
        height: 1px;
        background: rgba(${R}, 0.2);
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
        color: ${C.ACCENT_COLOR};
        font-size: 11px;
        font-weight: 500;
        padding: 5px 10px;
        border-radius: 5px;
        border: 1px solid rgba(${R}, 0.3);
        pointer-events: none;
        z-index: ${C.Z_TOOLTIP};
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
        width: ${C.BTN_SIZE_MOBILE}px; height: ${C.BTN_SIZE_MOBILE}px;
    }
    body.jt-mobile .jt-icon-img {
        width: ${C.ICON_SIZE_MOBILE}px; height: ${C.ICON_SIZE_MOBILE}px;
    }
    body.jt-mobile .jt-icon-svg {
        width: 22px; height: 22px;
    }
    body.jt-mobile .jt-replay-btn {
        width: ${C.REPLAY_BTN_SIZE_MOBILE}px; height: ${C.REPLAY_BTN_SIZE_MOBILE}px;
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
};
