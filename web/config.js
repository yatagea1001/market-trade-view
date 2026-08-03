// ═══════════════════════════════════════════════════════════════
// config.js — Market Trade View Platform Configuration
// ═══════════════════════════════════════════════════════════════
// Semua konfigurasi platform terpusat di sini.
// File ini HARUS di-load sebelum websocket.js dan script lain.
// ═══════════════════════════════════════════════════════════════

const PLATFORM = {
    VERSION: "25.3.0",
    MODE: "serverless",              // "serverless" = GitHub Pages, "server" = dengan backend

    // ── Data Provider ─────────────────────────────────────────
    DATA_PROVIDER: "multi",          // "multi" = routing per-symbol (HL + Binance)
    // ── Hyperliquid ──
    HL_REST_URL: "https://api.hyperliquid.xyz/info",
    HL_WS_URL:   "wss://api.hyperliquid.xyz/ws",
    // ── Binance Futures ── (TIDAK BUTUH API KEY untuk candle)
    BN_REST_URL: "https://fapi.binance.com/fapi/v1",
    BN_WS_URL:   "wss://fstream.binance.com/ws",

    // ── Fitur Toggle ──────────────────────────────────────────
    JARVIS_ENABLED: true,            // AI assistant — aktif (butuh localhost:3000)
    AUTH_ENABLED:   false,           // Login/register — dimatikan (guest mode)

    // ── Kunci API Pihak Ketiga ────────────────────────────────
    FINNHUB_API_KEY: "",             // (Dikosongkan, kita kembali 100% ke Hyperliquid)

    // ── Data Settings ─────────────────────────────────────────
    DEFAULT_SYMBOL: "BTCUSDT",       // Symbol default saat pertama buka
    HISTORY_BARS:   5000,            // Bar history per request (max HL ~5000)
    LAZY_CHUNK:     5000,            // Bar per lazy load (scroll kiri)
    GAP_TIMEOUT_MS: 15000,           // Timeout untuk gap fill (ms)

    // ── Symbol Dictionary ─────────────────────────────────────
    // UI Name → Provider coin name
    // "decimals" = berapa desimal harga ditampilkan
    // "provider" menentukan koneksi WebSocket/REST mana yang dipakai
    //
    // ⚠️ PENTING:
    //   • Hyperliquid: coin tanpa suffix → "BTC", "ETH", "SOL"
    //   • Binance Futures: coin pakai USDT suffix → "XAUUSDT", "EURUSDT"
    //   • Setiap symbol di-route ke provider yang benar
    //
    // 📊 Provider Routing:
    //   Crypto  → Hyperliquid (gratis, no API key, data lengkap)
    //   Forex/Gold → Binance Futures (gratis, no API key, candle akurat)
    SYMBOL_MAP: {
        // ── Forex / Gold → Binance Futures ────────────────────
        // Binance Futures punya XAUUSDT, EURUSDT, GBPUSDT, dll
        // Data candle & live tick gratis tanpa API key
        "XAUUSD":  { provider: "binance",  coin: "XAUUSDT", decimals: 2 },
        "EURUSD":  { provider: "binance",  coin: "EURUSDT", decimals: 5 },
        "GBPUSD":  { provider: "binance",  coin: "GBPUSDT", decimals: 5 },
        "JPYUSD":  { provider: "binance",  coin: "USDJPY",  decimals: 3 },  // JPY inverted
        "AUDUSD":  { provider: "binance",  coin: "AUDUSDT", decimals: 5 },
        "NZDUSD":  { provider: "binance",  coin: "NZDUSDT", decimals: 5 },
        "USDCAD":  { provider: "binance",  coin: "USDCAD",  decimals: 5 },
        "USDCNY":  { provider: "binance",  coin: "USDCNY",  decimals: 5 },
        "USDEUR":  { provider: "binance",  coin: "EURUSDT", decimals: 5 },  // reverse EUR

        // ── Major Crypto → Hyperliquid ───────────────────────
        "BTCUSDT":  { provider: "hyperliquid", coin: "BTC",   decimals: 1 },
        "ETHUSDT":  { provider: "hyperliquid", coin: "ETH",   decimals: 2 },
        "SOLUSDT":  { provider: "hyperliquid", coin: "SOL",   decimals: 2 },
        "BNBUSDT":  { provider: "hyperliquid", coin: "BNB",   decimals: 2 },
        "XRPUSDT":  { provider: "hyperliquid", coin: "XRP",   decimals: 5 },
        "ADAUSDT":  { provider: "hyperliquid", coin: "ADA",   decimals: 5 },
        "DOGEUSDT": { provider: "hyperliquid", coin: "DOGE",  decimals: 5 },
        "AVAXUSDT": { provider: "hyperliquid", coin: "AVAX",  decimals: 3 },
        "DOTUSDT":  { provider: "hyperliquid", coin: "DOT",   decimals: 3 },
        "LINKUSDT": { provider: "hyperliquid", coin: "LINK",  decimals: 3 },
        "MATICUSDT":{ provider: "hyperliquid", coin: "MATIC", decimals: 4 },
        "UNIUSDT":  { provider: "hyperliquid", coin: "UNI",   decimals: 3 },
        "ATOMUSDT": { provider: "hyperliquid", coin: "ATOM",  decimals: 3 },
        "LTCUSDT":  { provider: "hyperliquid", coin: "LTC",   decimals: 2 },

        // ── DeFi & Layer 2 ────────────────────────────────────
        "ARBUSDT":  { provider: "hyperliquid", coin: "ARB",   decimals: 4 },
        "OPUSDT":   { provider: "hyperliquid", coin: "OP",    decimals: 4 },
        "NEARUSDT": { provider: "hyperliquid", coin: "NEAR",  decimals: 4 },
        "SUIUSDT":  { provider: "hyperliquid", coin: "SUI",   decimals: 5 },
        "APTUSDT":  { provider: "hyperliquid", coin: "APT",   decimals: 4 },
        "SEIUSDT":  { provider: "hyperliquid", coin: "SEI",   decimals: 5 },
        "INJUSDT":  { provider: "hyperliquid", coin: "INJ",   decimals: 3 },
        "TIAUSDT":  { provider: "hyperliquid", coin: "TIA",   decimals: 4 },
        "JUPUSDT":  { provider: "hyperliquid", coin: "JUP",   decimals: 4 },
        "WIFUSDT":  { provider: "hyperliquid", coin: "WIF",   decimals: 5 },

        // ── Meme & Hype ───────────────────────────────────────
        "PEPEUSDT": { provider: "hyperliquid", coin: "PEPE",  decimals: 8 },
        "SHIBUSDT": { provider: "hyperliquid", coin: "SHIB",  decimals: 8 },
        "FLOKIUSDT":{ provider: "hyperliquid", coin: "FLOKI", decimals: 8 },
        "BONKUSDT": { provider: "hyperliquid", coin: "BONK",  decimals: 8 },

        // ── Hyperliquid Native ────────────────────────────────
        "HLUSDT":   { provider: "hyperliquid", coin: "HL",    decimals: 3 },
        "PURRUSDT": { provider: "hyperliquid", coin: "PURR",  decimals: 5 },

        // ── Lainnya ───────────────────────────────────────────
        "FILUSDT":  { provider: "hyperliquid", coin: "FIL",   decimals: 3 },
        "AAVEUSDT": { provider: "hyperliquid", coin: "AAVE",  decimals: 2 },
        "MKRUSDT":  { provider: "hyperliquid", coin: "MKR",   decimals: 1 },
        "SNXUSDT":  { provider: "hyperliquid", coin: "SNX",   decimals: 3 },
        "CRVUSDT":  { provider: "hyperliquid", coin: "CRV",   decimals: 4 },
        "LDOUSDT":  { provider: "hyperliquid", coin: "LDO",   decimals: 3 },
        "ENJUSDT":  { provider: "hyperliquid", coin: "ENJ",   decimals: 4 },
        "RENDERUSDT":{ provider: "hyperliquid", coin: "RENDER", decimals: 4 },
        "FETUSDT":  { provider: "hyperliquid", coin: "FET",   decimals: 4 },
        "AGIXUSDT": { provider: "hyperliquid", coin: "AGIX",  decimals: 5 },
        "BLURUSDT": { provider: "hyperliquid", coin: "BLUR",  decimals: 5 },
        "IMXUSDT":  { provider: "hyperliquid", coin: "IMX",   decimals: 4 },
        "DYDXUSDT": { provider: "hyperliquid", coin: "DYDX",  decimals: 3 },
        "GMXUSDT":  { provider: "hyperliquid", coin: "GMX",   decimals: 2 },
        "PENDLEUSDT":{ provider: "hyperliquid", coin: "PENDLE", decimals: 4 },
        "ENAUSDT":  { provider: "hyperliquid", coin: "ENA",   decimals: 5 },
        "ETHFIUSDT":{ provider: "hyperliquid", coin: "ETHFI", decimals: 5 },
        "WLDUSDT":  { provider: "hyperliquid", coin: "WLD",   decimals: 4 },
        "STRKUSDT": { provider: "hyperliquid", coin: "STRK",  decimals: 5 },
        "PIXELUSDT":{ provider: "hyperliquid", coin: "PIXEL", decimals: 5 },
        "PORTALUSDT":{ provider: "hyperliquid", coin: "PORTAL", decimals: 5 },
        "AEVOUSDT": { provider: "hyperliquid", coin: "AEVO",  decimals: 4 },
        "ONDOUSDT": { provider: "hyperliquid", coin: "ONDO",  decimals: 4 },
        "ALTUSDT":  { provider: "hyperliquid", coin: "ALT",   decimals: 5 },
        "MANTAUSDT":{ provider: "hyperliquid", coin: "MANTA", decimals: 5 },
        "DYMUSDT":  { provider: "hyperliquid", coin: "DYM",   decimals: 4 },
        "SAGAUSDT": { provider: "hyperliquid", coin: "SAGA",  decimals: 5 },
        "TAOUSDT":  { provider: "hyperliquid", coin: "TAO",   decimals: 3 },
        "KASUSDT":  { provider: "hyperliquid", coin: "KAS",   decimals: 5 },
        "TONUSDT":  { provider: "hyperliquid", coin: "TON",   decimals: 3 },
        "TRXUSDT":  { provider: "hyperliquid", coin: "TRX",   decimals: 5 },
        "BCHUSDT":  { provider: "hyperliquid", coin: "BCH",   decimals: 2 },
        "ICPUSDT":  { provider: "hyperliquid", coin: "ICP",   decimals: 2 },
        "ETCUSDT":  { provider: "hyperliquid", coin: "ETC",   decimals: 2 },
        "EGLDUSDT": { provider: "hyperliquid", coin: "EGLD",  decimals: 3 },
        "ALGOUSDT": { provider: "hyperliquid", coin: "ALGO",  decimals: 5 },
        "FTMUSDT":  { provider: "hyperliquid", coin: "FTM",   decimals: 4 },
        "SANDUSDT": { provider: "hyperliquid", coin: "SAND",  decimals: 5 },
        "MANAUSDT": { provider: "hyperliquid", coin: "MANA",  decimals: 5 },
        "AXSUSDT":  { provider: "hyperliquid", coin: "AXS",   decimals: 3 },
        "GALAUSDT": { provider: "hyperliquid", coin: "GALA",  decimals: 5 },
    },

    // ── Binance-only symbols (tidak ada di HL) ─────────────
    BN_ONLY_SYMBOLS: [
        "XAUUSDT", "EURUSDT", "GBPUSDT", "USDJPY",
        "AUDUSDT", "NZDUSDT", "USDCAD", "USDCNY",
    ],

    // ── Symbol Alias (UI Label → UI Symbol) ───────────────────
    // Kalau user ketik "BTC" di UI, otomatis resolve ke "BTCUSDT"
    // Kalau user ketik "GOLD" / "XAU" → resolve ke "XAUUSD"
    SYMBOL_ALIAS: {
        // ── Forex / Gold alias ───────────────────────────────
        "GOLD":  "XAUUSD",
        "XAU":   "XAUUSD",
        "EUR":   "EURUSD",
        "GBP":   "GBPUSD",
        "JPY":   "JPYUSD",
        "AUD":   "AUDUSD",
        "NZD":   "NZDUSD",
        // ── Crypto alias ─────────────────────────────────────
        "BTC":   "BTCUSDT",
        "ETH":   "ETHUSDT",
        "SOL":   "SOLUSDT",
        "BNB":   "BNBUSDT",
        "XRP":   "XRPUSDT",
        "ADA":   "ADAUSDT",
        "DOGE":  "DOGEUSDT",
        "AVAX":  "AVAXUSDT",
        "DOT":   "DOTUSDT",
        "LINK":  "LINKUSDT",
        "MATIC": "MATICUSDT",
        "UNI":   "UNIUSDT",
        "ATOM":  "ATOMUSDT",
        "LTC":   "LTCUSDT",
        "ARB":   "ARBUSDT",
        "OP":    "OPUSDT",
        "NEAR":  "NEARUSDT",
        "SUI":   "SUIUSDT",
        "APT":   "APTUSDT",
        "SEI":   "SEIUSDT",
        "INJ":   "INJUSDT",
        "TIA":   "TIAUSDT",
        "JUP":   "JUPUSDT",
        "WIF":   "WIFUSDT",
        "PEPE":  "PEPEUSDT",
        "SHIB":  "SHIBUSDT",
        "FLOKI": "FLOKIUSDT",
        "BONK":  "BONKUSDT",
        "HL":    "HLUSDT",
        "PURR":  "PURRUSDT",
        "FIL":   "FILUSDT",
        "AAVE":  "AAVEUSDT",
        "MKR":   "MKRUSDT",
        "SNX":   "SNXUSDT",
        "CRV":   "CRVUSDT",
        "LDO":   "LDOUSDT",
        "ENJ":   "ENJUSDT",
        "RENDER":"RENDERUSDT",
        "FET":   "FETUSDT",
        "AGIX":  "AGIXUSDT",
        "BLUR":  "BLURUSDT",
        "IMX":   "IMXUSDT",
        "DYDX":  "DYDXUSDT",
        "GMX":   "GMXUSDT",
        "PENDLE":"PENDLEUSDT",
        "ENA":   "ENAUSDT",
        "ETHFI": "ETHFIUSDT",
        "WLD":   "WLDUSDT",
        "STRK":  "STRKUSDT",
        "PIXEL": "PIXELUSDT",
        "PORTAL":"PORTALUSDT",
        "AEVO":  "AEVOUSDT",
        "ONDO":  "ONDOUSDT",
        "ALT":   "ALTUSDT",
        "MANTA": "MANTAUSDT",
        "DYM":   "DYMUSDT",
        "SAGA":  "SAGAUSDT",
        "TAO":   "TAOUSDT",
        "KAS":   "KASUSDT",
        "TON":   "TONUSDT",
        "TRX":   "TRXUSDT",
        "BCH":   "BCHUSDT",
        "ICP":   "ICPUSDT",
        "ETC":   "ETCUSDT",
        "EGLD":  "EGLDUSDT",
        "ALGO":  "ALGOUSDT",
        "FTM":   "FTMUSDT",
        "SAND":  "SANDUSDT",
        "MANA":  "MANAUSDT",
        "AXS":   "AXSUSDT",
        "GALA":  "GALAUSDT",
    },

    // ── Provider Capabilities ────────────────────────────────
    PROVIDERS: {
        hyperliquid: {
            name: "Hyperliquid",
            restUrl: "https://api.hyperliquid.xyz/info",
            wsUrl:   "wss://api.hyperliquid.xyz/ws",
            maxBarsPerRequest: 5000,
            interval: "1m",
            needsApiKey: false,
            supports: ["crypto", "perps"],
        },
        binance: {
            name: "Binance Futures",
            restUrl: "https://fapi.binance.com/fapi/v1",
            wsUrl:   "wss://fstream.binance.com/ws",
            maxBarsPerRequest: 1500,
            interval: "1m",
            needsApiKey: false,
            supports: ["crypto", "forex", "gold", "perps"],
        },
        finnhub: {
            name: "Finnhub",
            restUrl: "https://finnhub.io/api/v1",
            wsUrl:   "wss://ws.finnhub.io",
            maxBarsPerRequest: 300,
            interval: "1",
            needsApiKey: true,
            supports: ["forex", "crypto", "stock"],
        },
    },
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS — Multi-Provider Symbol Resolution
// ═══════════════════════════════════════════════════════════════

// ── Helper: Resolve alias / symbol → UI Symbol ───────────────
// Contoh: resolveSymbol("BTC")    → "BTCUSDT"
//         resolveSymbol("BTCUSDT")→ "BTCUSDT"
//         resolveSymbol("GOLD")   → "XAUUSD"
//         resolveSymbol("XAU")    → "XAUUSD"
function resolveSymbol(input) {
    if (PLATFORM.SYMBOL_MAP[input]) return input;
    if (PLATFORM.SYMBOL_ALIAS[input]) return PLATFORM.SYMBOL_ALIAS[input];
    return input;  // fallback
}

// ── Helper: UI Symbol → HL Coin ──────────────────────────────
// Contoh: getHLCoin("BTCUSDT") → "BTC"
//         getHLCoin("SOLUSDT") → "SOL"
//         Dipakai saat subscribe WebSocket ke Hyperliquid
function getHLCoin(uiSymbol) {
    const resolved = PLATFORM.SYMBOL_ALIAS[uiSymbol] || uiSymbol;
    const entry = PLATFORM.SYMBOL_MAP[resolved];
    if (entry) return entry.coin;
    // Fallback: coba strip USDT suffix
    if (resolved.endsWith("USDT")) return resolved.slice(0, -5);
    return resolved;
}

// ── Helper: UI Symbol → Binance Coin ─────────────────────────
// Contoh: getBinanceCoin("XAUUSD")  → "XAUUSDT"
//         getBinanceCoin("EURUSD")  → "EURUSDT"
//         getBinanceCoin("BTCUSDT") → "BTCUSDT"  (crypto juga ada di Binance)
//         Dipakai saat subscribe WebSocket / REST ke Binance
function getBinanceCoin(uiSymbol) {
    const resolved = PLATFORM.SYMBOL_ALIAS[uiSymbol] || uiSymbol;
    const entry = PLATFORM.SYMBOL_MAP[resolved];
    if (entry && entry.provider === "binance") return entry.coin;
    // Crypto symbol: Binance pakai USDT suffix
    if (resolved.endsWith("USDT")) return resolved;
    return resolved + "USDT";
}

// ── Helper: HL Coin → UI Symbol (reverse lookup) ─────────────
// Contoh: getUISymbol("BTC")     → "BTCUSDT"
//         getUISymbol("SOL")     → "SOLUSDT"
//         getUISymbol("XAUUSDT") → "XAUUSD"   (Binance coin → UI)
//         Dipakai saat terima data dari WebSocket
function getUISymbol(providerCoin) {
    for (const [ui, info] of Object.entries(PLATFORM.SYMBOL_MAP)) {
        if (info.coin === providerCoin) return ui;
    }
    // Fallback: strip USDT suffix kalau ada
    if (providerCoin.endsWith("USDT")) return providerCoin.slice(0, -5) + "USD";
    return providerCoin;
}

// ── Helper: Get decimals for symbol ──────────────────────────
function getDecimals(uiSymbol) {
    const resolved = resolveSymbol(uiSymbol);
    const entry = PLATFORM.SYMBOL_MAP[resolved];
    return entry ? entry.decimals : 2;
}

// ── Helper: Get provider for symbol ──────────────────────────
// Contoh: getProvider("BTCUSDT") → "hyperliquid"
//         getProvider("XAUUSD")  → "binance"
function getProvider(uiSymbol) {
    const resolved = resolveSymbol(uiSymbol);
    const entry = PLATFORM.SYMBOL_MAP[resolved];
    return entry ? entry.provider : "hyperliquid";
}

// ── Helper: Get provider coin name (generic) ─────────────────
// Contoh: getProviderCoin("BTCUSDT") → "BTC"     (Hyperliquid)
//         getProviderCoin("XAUUSD")  → "XAUUSDT"  (Binance)
function getProviderCoin(uiSymbol) {
    const resolved = resolveSymbol(uiSymbol);
    const entry = PLATFORM.SYMBOL_MAP[resolved];
    if (entry) return entry.coin;
    // Fallback
    const provider = getProvider(resolved);
    if (provider === "binance") return getBinanceCoin(resolved);
    return getHLCoin(resolved);
}

// ═══════════════════════════════════════════════════════════════
// SYMBOL MAPPING untuk WebSocket2
// ═══════════════════════════════════════════════════════════════

// ── Build SYMBOL_MAPPING & REVERSE_MAPPING ───────────────────
// Format yang dipakai WebSocket2:
//   SYMBOL_MAPPING["BTCUSDT"] = "BTC"      → subscribe ke Hyperliquid
//   SYMBOL_MAPPING["XAUUSD"]  = "XAUUSDT"  → subscribe ke Binance
//   REVERSE_MAPPING["BTC"]     = "BTCUSDT" → data dari HL → UI
//   REVERSE_MAPPING["XAUUSDT"] = "XAUUSD"  → data dari BN → UI
const SYMBOL_MAPPING = Object.fromEntries(
    Object.entries(PLATFORM.SYMBOL_MAP).map(([ui, info]) => [ui, info.coin])
);
const REVERSE_MAPPING = Object.fromEntries(
    Object.entries(SYMBOL_MAPPING).map(([k, v]) => [v, k])
);

// ── Provider-specific mappings ───────────────────────────────
// Untuk WebSocket yang terpisah per provider
const HL_SYMBOLS = Object.entries(PLATFORM.SYMBOL_MAP)
    .filter(([, info]) => info.provider === "hyperliquid")
    .map(([ui]) => ui);

const BN_SYMBOLS = Object.entries(PLATFORM.SYMBOL_MAP)
    .filter(([, info]) => info.provider === "binance")
    .map(([ui]) => ui);

// ── Daftar semua UI symbols ──────────────────────────────────
const ALL_SYMBOLS = Object.keys(PLATFORM.SYMBOL_MAP);

// ═══════════════════════════════════════════════════════════════
// Binance REST API — fetchCandles
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch candle history dari Binance Futures REST API
 * TIDAK BUTUH API KEY — gratis untuk candle data
 *
 * @param {string} uiSymbol — UI symbol (misal "XAUUSD", "EURUSD")
 * @param {number} startMs — start time dalam milliseconds
 * @param {number} endMs   — end time dalam milliseconds
 * @returns {Array} array of { time, o, h, l, c, v } candles
 */
async function fetchBinanceCandles(uiSymbol, startMs, endMs) {
    const coin = getBinanceCoin(uiSymbol);  // XAUUSD → XAUUSDT
    const interval = "1m";
    const limit = 1500;  // Binance max per request
    let allCandles = [];
    let currentEnd = endMs;

    if (typeof logInfo === "function") logInfo(`[BN-REST] Fetching ${coin} (${uiSymbol})...`);
    else console.log(`[BN-REST] Fetching ${coin} (${uiSymbol})...`);

    try {
        while (true) {
            const url = `${PLATFORM.BN_REST_URL}/klines?symbol=${coin}&interval=${interval}&endTime=${currentEnd}&limit=${limit}`;

            const resp = await fetch(url);
            if (!resp.ok) {
                console.error(`[BN-REST] HTTP ${resp.status} for ${coin}`);
                break;
            }

            const data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) break;

            const batch = data.map(c => ({
                time: Math.floor(c[0] / 1000),   // ms → seconds
                o: parseFloat(c[1]),
                h: parseFloat(c[2]),
                l: parseFloat(c[3]),
                c: parseFloat(c[4]),
                v: parseFloat(c[5]) || 1
            }));

            allCandles = [...batch, ...allCandles]; // prepend (data dari BN descending)

            // Stop jika sudah melewati startMs
            if (batch[0].time * 1000 <= startMs) break;

            // Geser window ke belakang
            currentEnd = batch[0].time * 1000 - 1;

            // Yield biar UI tidak freeze
            await new Promise(r => setTimeout(r, 80));
        }

        // Filter sesuai range yang diminta
        allCandles = allCandles.filter(c => c.time * 1000 >= startMs && c.time * 1000 <= endMs);

        // Deduplicate by time
        const seen = new Set();
        allCandles = allCandles.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
        });

        allCandles.sort((a, b) => a.time - b.time);

        console.log(`%c[BN-REST] ✅ ${coin}: ${allCandles.length} candles`, "color:#0f0;font-weight:bold");
        return allCandles;

    } catch (e) {
        console.error(`[BN-REST] Error: ${e.message}`);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// UNIFIED fetchCandles — router ke provider yang benar
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch candle history — otomatis route ke provider yang benar
 * berdasarkan SYMBOL_MAP.provider
 *
 * @param {string} uiSymbol — UI symbol (BTCUSDT, XAUUSD, EURUSD, dll)
 * @param {number} startMs — start time dalam milliseconds
 * @param {number} endMs   — end time dalam milliseconds
 * @returns {Array} array of { time, o, h, l, c, v } candles
 */
async function fetchCandles(uiSymbol, startMs, endMs) {
    const provider = getProvider(uiSymbol);
    console.log(`[FETCH-CANDLES] ${uiSymbol} → provider: ${provider}`);

    switch (provider) {
        case "binance":
            return await fetchBinanceCandles(uiSymbol, startMs, endMs);

        case "finnhub":
            // Kalau ada fetchFinnhubCandles, pakai itu
            if (typeof fetchFinnhubCandles === "function") {
                return await fetchFinnhubCandles(uiSymbol, startMs, endMs);
            }
            console.warn(`[FETCH-CANDLES] Finnhub not available for ${uiSymbol}, fallback to Binance`);
            return await fetchBinanceCandles(uiSymbol, startMs, endMs);

        case "hyperliquid":
        default:
            // Kalau ada fetchCandlesFromHL, pakai itu
            if (typeof fetchCandlesFromHL === "function") {
                return await fetchCandlesFromHL(uiSymbol, startMs, endMs);
            }
            console.warn(`[FETCH-CANDLES] fetchCandlesFromHL not available for ${uiSymbol}`);
            return [];
    }
}

// ═══════════════════════════════════════════════════════════════
// BOOT LOG
// ═══════════════════════════════════════════════════════════════

console.log(`%c[CONFIG] Market Trade View v${PLATFORM.VERSION} | Mode: ${PLATFORM.MODE} | Provider: ${PLATFORM.DATA_PROVIDER}`,
    "color:#0af;font-weight:bold;background:#0B0E11;padding:4px;");
console.log(`%c[CONFIG] ${ALL_SYMBOLS.length} symbols mapped | HL: ${HL_SYMBOLS.length} | BN: ${BN_SYMBOLS.length} | SYMBOL_MAPPING & REVERSE_MAPPING ready`,
    "color:#0f0;font-weight:bold;background:#0B0E11;padding:4px;");
console.log(`%c[CONFIG] Forex/Gold → Binance | Crypto → Hyperliquid | fetchCandles() auto-routes`,
    "color:#ff0;font-weight:bold;background:#0B0E11;padding:4px;");