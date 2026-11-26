// ============================================================
// config.js — Konfigurasi Global Jarvis Toolbar
// ------------------------------------------------------------
// Semua konstanta & pengaturan yang dipakai lintas modul.
// Untuk mengubah warna, interval, atau path — edit file ini saja.
// ============================================================

window.JT = window.JT || {};

JT.Config = Object.freeze({
    // ── Path & Asset ──
    ASSETS_PATH: 'assets/',          // Folder PNG (sama kayak C++ pakai)

    // ── Timing ──
    POLL_INTERVAL: 200,              // ms, polling state dari C++
    TOOLTIP_DELAY: 400,              // ms, hover delay sebelum tooltip muncul
    LONG_PRESS_DELAY: 500,           // ms, long-press untuk context menu (mobile)
    SCROLLBAR_HIDE_DELAY: 1500,      // ms, auto-hide scrollbar setelah idle
    FLASH_DURATION: 120,             // ms, durasi visual feedback flash

    // ── Warna (Jarvis Dark Tech) ──
    ACCENT_COLOR: '#10b981',         // Emerald 500
    ACCENT_RGB: '16, 185, 129',      // RGB tanpa prefix — untuk rgba()
    BG_DARK: '#0a0a12',              // Background dark
    TEXT_NORMAL: '#ccc',             // Label normal
    TEXT_MUTED: '#888',              // Label inactive

    // ── Ukuran ──
    BTN_SIZE: 36,                    // px, ukuran tombol default
    BTN_SIZE_MOBILE: 40,             // px, ukuran tombol mobile
    ICON_SIZE: 22,                   // px, ukuran ikon default
    ICON_SIZE_MOBILE: 24,            // px, ukuran ikon mobile
    REPLAY_BTN_SIZE: 44,             // px, ukuran tombol replay
    REPLAY_BTN_SIZE_MOBILE: 48,      // px, ukuran tombol replay mobile
    NAV_BTN_MIN_WIDTH: 80,           // px, min-width tombol navigasi
    NAV_BTN_MAX_WIDTH: 200,          // px, max-width tombol navigasi
    NAV_ICON_SIZE: 18,               // px, ukuran ikon di tombol navigasi
    NAV_LABEL_SIZE: 11,              // px, font-size label navigasi
    NAV_LABEL_SIZE_MOBILE: 9,        // px, font-size label navigasi mobile

    // ── Breakpoint ──
    MOBILE_BREAKPOINT: 900,          // px, di bawah ini = mobile

    // ── Z-Index ──
    Z_OVERLAY: 90,
    Z_TOOLTIP: 9999,
    Z_CONTEXT_MENU: 10000,

    // ── Threshold ──
    ORIENT_THRESHOLD: 2,             // px, threshold auto-orient horizontal/vertical
    SCROLL_THRESHOLD: 1,             // px, margin sebelum dianggap perlu scroll
    MIN_SCROLL_THUMB: 20,            // px, ukuran minimum scrollbar thumb
    MIN_RECT_SIZE: 0.001,            // normalized, minimum rect size yang valid

    // ── Notification Badge ──
    BADGE_MAX_COUNT: 99,             // Angka maks di badge (lebih dari ini → "99+")
    BADGE_COLOR: '#ef4444',          // Red 500 — warna badge
    BADGE_COLOR_RGB: '239, 68, 68',  // RGB — untuk rgba()
    BADGE_SIZE: 16,                  // px, ukuran badge (desktop)
    BADGE_SIZE_MOBILE: 14,           // px, ukuran badge (mobile)
    BADGE_FONT_SIZE: 9,              // px, font-size angka di badge
    BADGE_ANIM_DURATION: 400,        // ms, durasi bounce animation

    // ── Pinned Alert ──
    ALERT_PINNED_MIN_WIDTH: 80,      // px, min-width tombol Alert pinned
    ALERT_PINNED_BG: 'rgba(10, 10, 18, 0.3)', // Background area pinned
});
