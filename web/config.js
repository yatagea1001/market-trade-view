// ═══════════════════════════════════════════════════════════════
// config.js — Market Trade View Platform Configuration
// ═══════════════════════════════════════════════════════════════
// Semua konfigurasi platform terpusat di sini.
// File ini HARUS di-load sebelum websocket.js dan script lain.
// ═══════════════════════════════════════════════════════════════

const PLATFORM = {
    VERSION: "25.1.0",
    MODE: "serverless",              // "serverless" = GitHub Pages, "server" = dengan backend

    // ── Data Provider ─────────────────────────────────────────
    DATA_PROVIDER: "hyperliquid",
    HL_REST_URL: "https://api.hyperliquid.xyz/info",
    HL_WS_URL:   "wss://api.hyperliquid.xyz/ws",

    // ── Fitur Toggle ──────────────────────────────────────────
    JARVIS_ENABLED: true,            // AI assistant — aktif (butuh localhost:3000)
    AUTH_ENABLED:   false,           // Login/register — dimatikan (guest mode)

    // ── Data Settings ─────────────────────────────────────────
    DEFAULT_SYMBOL: "BTCUSDT",       // Symbol default saat pertama buka
    HISTORY_BARS:   5000,            // Bar history per request (max HL ~5000)
    LAZY_CHUNK:     5000,            // Bar per lazy load (scroll kiri)
    GAP_TIMEOUT_MS: 15000,           // Timeout untuk gap fill (ms)

    // ── Symbol Dictionary ─────────────────────────────────────
    // UI Name → Hyperliquid coin name
    // "decimals" = berapa desimal harga ditampilkan
    SYMBOL_MAP: {
        "BTCUSDT": { coin: "BTC", decimals: 1 },
        "ETHUSDT": { coin: "ETH", decimals: 2 },
        "XAUUSD":  { coin: "XAU", decimals: 2 },
        "EURUSD":  { coin: "EUR", decimals: 5 },
        "GBPUSD":  { coin: "GBP", decimals: 5 },
    },
};

// ── Helper: UI Symbol → HL Coin ──────────────────────────────
function getHLCoin(uiSymbol) {
    const entry = PLATFORM.SYMBOL_MAP[uiSymbol];
    return entry ? entry.coin : uiSymbol;
}

// ── Helper: HL Coin → UI Symbol (reverse lookup) ─────────────
function getUISymbol(hlCoin) {
    for (const [ui, info] of Object.entries(PLATFORM.SYMBOL_MAP)) {
        if (info.coin === hlCoin) return ui;
    }
    return hlCoin;  // fallback: pakai nama HL langsung
}

// ── Daftar semua UI symbols ──────────────────────────────────
const ALL_SYMBOLS = Object.keys(PLATFORM.SYMBOL_MAP);

console.log(`%c[CONFIG] Market Trade View v${PLATFORM.VERSION} | Mode: ${PLATFORM.MODE} | Provider: ${PLATFORM.DATA_PROVIDER}`,
    "color:#0af;font-weight:bold;background:#0B0E11;padding:4px;");
