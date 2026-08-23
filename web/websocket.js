console.log("%c[JS] V20 — MULTI-PROVIDER (Hyperliquid + Binance Futures + Forex Poll)", "color: #00FFAA; font-weight:bold; background: #0B0E11; padding: 4px;");

// ═══════════════════════════════════════════════════════════════
// websocket.js V20 — MULTI-PROVIDER (GitHub Pages Compatible)
//
// ARSITEKTUR:
//   - TIDAK ADA server localhost
//   - Data candle dari MULTI-PROVIDER:
//       • Crypto  → Hyperliquid REST + WebSocket
//       • Forex/Gold → Binance Futures REST + WebSocket
//   - Cache di IndexedDB browser per user
//   - Bisa jalan 100% di GitHub Pages
//
// DATA FLOW:
//   Startup   → cek IDB → gap fill dari REST → render chart
//   Fresh     → fetch bar dari REST (HL atau BN) → simpan IDB → render
//   Live      → WebSocket candle stream (HL atau BN) → push WASM + simpan IDB
//   Lazy Load → scroll kiri → fetch older dari REST → simpan IDB
//   MarketWatch → HL WS allMids + BN WS kline → update harga semua pair
//
// CHANGELOG V20 (dari V19):
//   1. FIX kline=0 bug — Binance exchangeInfo validation, hanya subscribe valid symbols
//   2. FIX EURUSD/GBPUSD — tidak ada di Binance Futures → route ke forex-poll provider
//   3. TAMBAH fetchValidBinanceSymbols() — cek exchangeInfo sebelum subscribe
//   4. TAMBAH startForexPolling() — polling EURUSD/GBPUSD dari free API
//   5. TAMBAH raw message debug logging untuk Binance WS
//   6. UPDATE connectBinanceWebSocket() — filter invalid symbols, better logging
// ═══════════════════════════════════════════════════════════════

// =========================================================
// 1. STATE
// =========================================================

const SYMBOLS_FOREX  = ["XAUUSD","EURUSD","GBPUSD"];
const SYMBOLS_CRYPTO = ["BTCUSDT","ETHUSDT"];
// ALL_SYMBOLS sudah didefinisikan di config.js

let CURRENT_SYMBOL = "";
let lastWasmTime   = 0;

var isWasmReady   = false;
// isWSConnected tidak diperlukan lagi (HL WS manage sendiri)

let isDownloading      = false;
let isRendering        = false;
let pendingSymbolSwitch = null;
let downloadedSymbols  = new Set();
let downloadedCandles  = [];
let candleBuffer       = [];

// 🔒 REBUILD MUTEX
let g_rebuildInProgress = false;

// 🔒 INITIAL LOAD GUARD
let g_initialLoadDone = true;

// 🔥 HL WebSocket reference
let hlWS = null;
let hlSubscribedCoin = null; // coin yang sedang di-subscribe candle stream
let hlLastCandleTime = {};   // coin → last candle open time (untuk deteksi bar close)

// 💹 Finnhub WebSocket reference
let fhWS = null;
let fhSubscribedCoin = null;

// 🔥 Binance WebSocket reference
let bnWS = null;
let bnSubscribedStreams = new Set();
let bnValidSymbols = null;       // Set of valid Binance Futures symbols (from exchangeInfo)
let bnValidUISymbols = [];       // UI symbols yang valid di Binance (filtered BN_SYMBOLS)
let bnInvalidUISymbols = [];     // UI symbols yang TIDAK valid di Binance (untuk forex-poll)

// 💱 Forex Polling state (untuk EURUSD/GBPUSD yang tidak ada di Binance)
let forexPollInterval = null;
let forexPollSymbols = [];       // symbols yang di-poll dari free API

function logInfo(m) { console.log ("%c" + m, "color:#0af"); }
function logGood(m) { console.log ("%c" + m, "color:#0f0;font-weight:bold"); }
function logWarn(m) { console.warn("%c" + m, "color:orange;font-weight:bold"); }
function logErr (m) { console.error("%c"+ m, "color:red;font-weight:bold"); }

function isCryptoSymbol(sym) {
    return SYMBOLS_CRYPTO.includes(sym) || sym.includes("USDT") || sym === "BTC" || sym === "ETH";
}

// =========================================================
// 2. WASM BRIDGE
// =========================================================
function sendTickToWasm(symbol, price, vol, time) {
    if (!isWasmReady || !Module || !Module.ccall) return;
    Module.ccall('wasm_push_tick', null,
        ['string', 'number', 'number', 'number'],
        [symbol,   price,    vol,      time]);

    // 🔥 TAHAP 2: Simpan harga terbaru ke global registry untuk ticker bar
    if (!window.g_tickerPrices) window.g_tickerPrices = {};
    const prev = window.g_tickerPrices[symbol];
    window.g_tickerPrices[symbol] = {
        price: price,
        prevPrice: prev ? prev.price : price,   // untuk hitung change
        time: Date.now()
    };
}

function notifyWASM_candle(o, h, l, c, t, v) {
    if (!isWasmReady || !Module || !Module.ccall) return;
    if (Module._wasm_get_replay_gate && Module._wasm_get_replay_gate() === 1) return;
    Module.ccall('wasm_push_candle', null,
        ['number','number','number','number','number','number'],
        [o, h, l, c, t, v]);
}

function notifyWASM_footprint(symbol, time, price, buy_vol, sell_vol, fromIDB = 0) {
    if (!isWasmReady || !Module || !Module.ccall) return;
    Module.ccall('wasm_push_footprint', null,
        ['string', 'number', 'number', 'number', 'number', 'number'],
        [symbol, time, price, buy_vol, sell_vol, fromIDB]);
}

// =========================================================
// 3. PROGRESS UI
// =========================================================
function showLoadingOverlay(msg, pct = 0) {
    let ov = document.getElementById('data-loading-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'data-loading-overlay';
        ov.style.cssText = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.85);z-index:9998;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            color:#0af;font-family:'Segoe UI',sans-serif;pointer-events:none;`;
        ov.innerHTML = `
            <style>
            @keyframes ov_spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .ov-spinner { border: 4px solid rgba(0, 170, 255, 0.2); border-top: 4px solid #0af; border-radius: 50%; width: 40px; height: 40px; animation: ov_spin 1s linear infinite; margin: 0 auto 15px auto; }
            </style>
            <div style="text-align:center">
              <div class="ov-spinner"></div>
              <div id="ov-msg"  style="font-size:18px;font-weight:bold;margin-bottom:20px;letter-spacing:1px">Synchronizing...</div>
              <div style="width:320px;height:8px;background:#222;border-radius:4px;overflow:hidden;margin-bottom:10px">
                <div id="ov-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#0af,#0f0);transition:width .3s"></div>
              </div>
              <div id="ov-detail" style="font-size:13px;color:#888">Preparing...</div>
            </div>`;
        document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    document.getElementById('ov-msg').innerText    = msg;
    document.getElementById('ov-bar').style.width  = pct + '%';
    document.getElementById('ov-detail').innerText = Math.round(pct) + '%';
}

function hideLoadingOverlay() {
    const ov = document.getElementById('data-loading-overlay');
    if (ov) ov.style.display = 'none';
}

// ── CORNER SPINNER ──────────────────────────────────────────
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes _yt_dot { 0%,80%,100%{opacity:.15} 40%{opacity:1} }
        #_yt_spinner { position:fixed;bottom:14px;right:14px;z-index:9997;
            display:none;align-items:center;gap:4px;pointer-events:none; }
        #_yt_spinner span { width:6px;height:6px;border-radius:50%;
            background:#4af;display:block;
            animation:_yt_dot 1.2s ease-in-out infinite; }
        #_yt_spinner span:nth-child(1){animation-delay:0s}
        #_yt_spinner span:nth-child(2){animation-delay:.2s}
        #_yt_spinner span:nth-child(3){animation-delay:.4s}
    `;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = '_yt_spinner';
    el.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(el);
    let _count = 0;
    window._spinnerShow = function() { _count++; el.style.display = 'flex'; };
    window._spinnerHide = function() { _count = Math.max(0, _count - 1); if (_count === 0) el.style.display = 'none'; };
})();

function updateProgress(current, total, phase) {
    const pct = total > 0 ? (current / total) * 100 : 0;
    const bar = document.getElementById('ov-bar');
    const msg = document.getElementById('ov-msg');
    const det = document.getElementById('ov-detail');
    if (bar) bar.style.width  = pct + '%';
    if (msg) msg.innerText    = `${phase} ${CURRENT_SYMBOL}`;
    if (det) det.innerText    = `${current.toLocaleString()} / ${total.toLocaleString()} candles`;
}

// =========================================================
// 4. INDEXEDDB (TIDAK BERUBAH dari V17)
// =========================================================
let db = null;
const DB_NAME = 'TradingAppDB';
const DB_VER  = 2;
const STORE   = 'multi_candles';

async function initIndexedDB() {
    return new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onerror = () => { logErr('[DB] Open failed'); rej(); };
        r.onupgradeneeded = e => {
            db = e.target.result;
            if (db.objectStoreNames.contains('candles')) db.deleteObjectStore('candles');
            if (!db.objectStoreNames.contains(STORE)) {
                const s = db.createObjectStore(STORE, { keyPath: ['symbol', 'time'] });
                s.createIndex('symbol_idx', 'symbol', { unique: false });
            }
            logGood('[DB] Upgraded to V2');
        };
        r.onsuccess = e => { db = e.target.result; res(); };
    });
}

async function getAllCandlesFromDB(symbol) {
    if (!db) return [];
    return new Promise(res => {
        const t = db.transaction([STORE], 'readonly');
        const r = t.objectStore(STORE).index('symbol_idx').getAll(IDBKeyRange.only(symbol));
        r.onsuccess = () => res(r.result || []);
        r.onerror   = () => res([]);
    });
}

async function getAllSymbolsInDB() {
    if (!db) return [];
    return new Promise(res => {
        const t = db.transaction([STORE], 'readonly');
        const r = t.objectStore(STORE).index('symbol_idx').openKeyCursor(null, 'nextunique');
        const syms = [];
        r.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { syms.push(cursor.key); cursor.continue(); }
            else res(syms);
        };
        r.onerror = () => res([]);
    });
}

async function saveBufferToDB(data) {
    if (!db || !data.length) return;
    const bigWrite = data.length > 500;
    if (bigWrite && window._spinnerShow) window._spinnerShow();
    const BATCH = 3000;
    for (let i = 0; i < data.length; i += BATCH) {
        const chunk = data.slice(i, i + BATCH);
        await new Promise((res, rej) => {
            const t = db.transaction([STORE], 'readwrite');
            const s = t.objectStore(STORE);
            chunk.forEach(item => s.put(item));
            t.oncomplete = () => res();
            t.onerror    = e  => { console.error('[DB] Save error:', e); res(); };
        });
        if (i + BATCH < data.length)
            await new Promise(r => setTimeout(r, 0));
    }
    if (bigWrite && window._spinnerHide) window._spinnerHide();
}

function addToBuffer(symbol, candles) {
    if (!candles || !candles.length) return;
    candleBuffer.push(...candles.map(c => ({
        symbol,
        time: c.time || c.t,
        o: c.o || c.open,  h: c.h || c.high,
        l: c.l || c.low,   c: c.c || c.close,
        v: c.v || c.volume || 1
    })));
}

async function flushBuffer() {
    if (!candleBuffer.length) return;
    const tmp = [...candleBuffer];
    candleBuffer = [];
    await saveBufferToDB(tmp);
}

/**
 * TURBO MODE: Push candle langsung ke WASM tanpa lewat IndexedDB.
 * Chart langsung muncul tanpa menunggu IDB selesai menyimpan.
 * Data sudah harus terurut (oldest → newest).
 */
function pushCandlesDirectToWASM(symbol, candles) {
    if (!isWasmReady || !candles.length) return;

    logGood(`[DIRECT] ${candles.length.toLocaleString()} bars → push langsung ke WASM...`);
    isRendering = true;
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(1);

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        notifyWASM_candle(
            c.o || c.open,  c.h || c.high,
            c.l || c.low,   c.c || c.close,
            c.time,         c.v || c.volume || 1
        );
        if (c.time > lastWasmTime) lastWasmTime = c.time;
    }

    if (Module._wasm_rebuild_all_htfs) Module._wasm_rebuild_all_htfs();
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
    isRendering = false;
    downloadedSymbols.add(symbol);

    logGood(`[DIRECT] ✅ ${symbol}: ${candles.length.toLocaleString()} bars rendered!`);
}

/**
 * Background IDB Save: Simpan candle ke IndexedDB tanpa blocking UI.
 * Dipanggil SETELAH chart sudah muncul, jadi user tidak perlu menunggu.
 * Menggunakan batch besar (5000) dan setTimeout(0) agar tidak mengganggu rendering.
 */
async function saveToIDBBackground(symbol, candles) {
    if (!db || !candles.length) return;

    const data = candles.map(c => ({
        symbol,
        time: c.time || c.t,
        o: c.o || c.open,  h: c.h || c.high,
        l: c.l || c.low,   c: c.c || c.close,
        v: c.v || c.volume || 1
    }));

    const BATCH = 5000;
    const totalBatches = Math.ceil(data.length / BATCH);
    logInfo(`[BG-SAVE] 💾 Menyimpan ${data.length.toLocaleString()} candles ke IDB (${totalBatches} batch, background)...`);

    for (let i = 0; i < data.length; i += BATCH) {
        const chunk = data.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;
        await new Promise((res) => {
            const t = db.transaction([STORE], 'readwrite');
            const s = t.objectStore(STORE);
            chunk.forEach(item => s.put(item));
            t.oncomplete = () => res();
            t.onerror    = () => res();
        });
        logInfo(`[BG-SAVE] batch ${batchNum}/${totalBatches} done`);
        // Yield ke main thread agar chart tetap responsif
        await new Promise(r => setTimeout(r, 10));
    }

    logGood(`[BG-SAVE] ✅ ${data.length.toLocaleString()} candles tersimpan di IDB`);
}

async function getOlderCandlesFromDB(symbol, beforeTime, limit = 10000) {
    if (!db) return [];
    return new Promise(res => {
        const t = db.transaction([STORE], 'readonly');
        const range = IDBKeyRange.bound([symbol, 0], [symbol, beforeTime], false, true);
        const req = t.objectStore(STORE).getAll(range);
        req.onsuccess = () => {
            let r = req.result || [];
            r.sort((a, b) => b.time - a.time);
            r = r.slice(0, limit);
            r.reverse();
            res(r);
        };
        req.onerror = () => res([]);
    });
}

// =========================================================
// 5. REBUILD FROM DB (TIDAK BERUBAH dari V17)
// =========================================================
async function rebuildTabFromDB(tabId, symbol) {
    let candles = await getAllCandlesFromDB(symbol);
    if (!candles.length) {
        logWarn(`[REBUILD TAB${tabId}] Tidak ada data IDB untuk ${symbol}`);
        return;
    }
    candles.sort((a, b) => a.time - b.time);
    if (Module._wasm_clear_tab) Module._wasm_clear_tab(tabId);
    for (const c of candles) {
        Module.ccall('wasm_push_candle_for_tab', null,
            ['number','number','number','number','number','number','number'],
            [tabId, c.o, c.h, c.l, c.c, c.time, c.v || 1]);
    }
    if (Module._wasm_rebuild_htfs_for_tab)
        Module.ccall('wasm_rebuild_htfs_for_tab', null, ['number'], [tabId]);
    logGood(`[REBUILD TAB${tabId}] ✅ ${symbol}: ${candles.length} bars OK`);
}

/**
 * 🔥 OPTIMASI: Push candles langsung ke WASM tanpa baca IDB ulang.
 * Dipakai saat data sudah ada di memori (dari getAllCandlesFromDB sebelumnya).
 * Menghindari double IDB read yang memakan 50-300ms extra.
 */
function pushCandlesToWASMDirect(symbol, candles) {
    if (!isWasmReady || !candles.length) return;

    // IDB Sanitizer (sama kayak rebuildFullFromDB)
    if (candles.length > 10) {
        const recent = candles.slice(-Math.max(100, Math.floor(candles.length * 0.5)));
        const closes = recent.map(c => c.c).sort((a, b) => a - b);
        const median = closes[Math.floor(closes.length / 2)];
        if (median > 0) {
            const hiLim = median * 5.0;
            const loLim = median * 0.2;
            const before = candles.length;
            candles = candles.filter(c =>
                c.c >= loLim && c.c <= hiLim &&
                c.h > 0 && c.l > 0
            );
            if (candles.length < before) {
                logWarn(`[DIRECT-PUSH] Sanitizer: removed ${before - candles.length} corrupt candles`);
            }
        }
    }

    candles.sort((a, b) => a.time - b.time);

    logGood(`[DIRECT-PUSH] ${candles.length} bars → push ke WASM (tanpa IDB read ulang)...`);
    isRendering = true;
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(1);

    for (const c of candles) {
        notifyWASM_candle(c.o, c.h, c.l, c.c, c.time, c.v || c.volume || 1);
        if (c.time > lastWasmTime) lastWasmTime = c.time;
    }

    if (Module._wasm_rebuild_all_htfs) Module._wasm_rebuild_all_htfs();
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
    isRendering = false;
    downloadedSymbols.add(symbol);
    logGood(`[DIRECT-PUSH] ✅ ${symbol}: ${candles.length} bars OK`);
}

async function rebuildFullFromDB(symbol) {
    if (!isWasmReady) { console.log('[REBUILD] WASM not ready'); return; }
    if (g_rebuildInProgress) {
        logWarn(`[REBUILD] Skipped (rebuild already in progress) for ${symbol}`);
        return;
    }
    g_rebuildInProgress = true;

    let candles = await getAllCandlesFromDB(symbol);
    if (!candles.length) { logWarn(`[REBUILD] No data for ${symbol}`); g_rebuildInProgress = false; return; }
    candles.sort((a, b) => a.time - b.time);

    // 🛡️ IDB SANITIZER: Hapus candle corrupt
    if (candles.length > 10) {
        const recent = candles.slice(-Math.max(100, Math.floor(candles.length * 0.5)));
        const closes = recent.map(c => c.c).sort((a, b) => a - b);
        const median = closes[Math.floor(closes.length / 2)];
        if (median > 0) {
            const hiLim = median * 5.0;
            const loLim = median * 0.2;
            const before = candles.length;
            const corruptTimes = [];
            for (const c of candles) {
                if (!(c.c >= loLim && c.c <= hiLim && c.h > 0 && c.l > 0)) {
                    corruptTimes.push(c.time);
                }
            }
            candles = candles.filter(c =>
                c.c >= loLim && c.c <= hiLim &&
                c.h > 0 && c.l > 0
            );
            const removed = before - candles.length;
            if (removed > 0) {
                logWarn(`[REBUILD] 🛡️ ${removed} corrupt removed (median=${median.toFixed(2)})`);
                try {
                    const tx = db.transaction([STORE], 'readwrite');
                    const store = tx.objectStore(STORE);
                    for (const t of corruptTimes) {
                        store.delete([symbol, t]);
                    }
                    await new Promise((res) => { tx.oncomplete = res; tx.onerror = res; });
                    logGood(`[REBUILD] 🗑️ ${removed} corrupt deleted from IDB`);
                } catch (e) {
                    console.warn('[REBUILD] Failed to delete corrupt from IDB:', e);
                }
            }
        }
    }

    logGood(`[REBUILD] ${candles.length} bars → push...`);
    isRendering = true;
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(1);

    for (const c of candles) {
        notifyWASM_candle(c.o, c.h, c.l, c.c, c.time, c.v);
        if (c.time > lastWasmTime) lastWasmTime = c.time;
    }

    if (Module._wasm_rebuild_all_htfs) Module._wasm_rebuild_all_htfs();
    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
    isRendering = false;
    downloadedSymbols.add(symbol);
    hideLoadingOverlay();
    logGood(`[REBUILD] ✅ ${symbol}: ${candles.length} bars OK`);
    g_rebuildInProgress = false;
}

// =========================================================
// 6. HYPERLIQUID REST ADAPTER (BARU)
// =========================================================

async function fetchFinnhubCandles(uiSymbol, startMs, endMs) {
    const coin = PLATFORM.SYMBOL_MAP[uiSymbol].coin; // misal "OANDA:XAU_USD"
    const startSec = Math.floor(startMs / 1000);
    const endSec = Math.floor(endMs / 1000);
    const apiKey = PLATFORM.FINNHUB_API_KEY;

    if (!apiKey) {
        logErr(`[FH-REST] API Key kosong, tidak bisa fetch history untuk ${uiSymbol}`);
        return [];
    }

    logInfo(`[FH-REST] Fetching ${coin} (${uiSymbol}) candles: ${new Date(startMs).toISOString().slice(0,16)} → ${new Date(endMs).toISOString().slice(0,16)}`);

    try {
        const url = `https://finnhub.io/api/v1/forex/candle?symbol=${coin}&resolution=1&from=${startSec}&to=${endSec}&token=${apiKey}`;
        const resp = await fetch(url);

        if (!resp.ok) {
            logErr(`[FH-REST] HTTP ${resp.status} for ${coin}`);
            return [];
        }

        const data = await resp.json();
        
        // Finnhub mengembalikan status "no_data" jika tidak ada candle di range tsb
        if (data.s !== "ok" || !data.t) {
            logWarn(`[FH-REST] No data/Unexpected response for ${coin}: ${data.s}`);
            return [];
        }

        const count = data.t.length;
        const candles = new Array(count);
        for (let i = 0; i < count; i++) {
            candles[i] = {
                time: data.t[i],          // Finnhub sudah dalam seconds
                o: parseFloat(data.o[i]),
                h: parseFloat(data.h[i]),
                l: parseFloat(data.l[i]),
                c: parseFloat(data.c[i]),
                v: parseFloat(data.v[i]) || 1
            };
        }

        logGood(`[FH-REST] ✅ ${coin}: ${candles.length} candles fetched`);
        return candles;

    } catch (e) {
        logErr(`[FH-REST] Fetch error for ${coin}: ${e.message}`);
        return [];
    }
}

/**
 * Fetch candle history dari Hyperliquid (atau dialihkan ke Finnhub) REST API
 * @param {string} uiSymbol - nama UI (misal "BTCUSDT")
 * @param {number} startMs  - Unix timestamp milliseconds (inclusive)
 * @param {number} endMs    - Unix timestamp milliseconds (inclusive)
 * @returns {Array} candles dalam format {time, o, h, l, c, v}
 */
async function fetchCandlesFromHL(uiSymbol, startMs, endMs) {
    const provider = PLATFORM.SYMBOL_MAP[uiSymbol] ? PLATFORM.SYMBOL_MAP[uiSymbol].provider : "hyperliquid";

    // ── Route ke Binance ─────────────────────────────────────
    if (provider === "binance") {
        // Kalau fetchBinanceCandles ada di config.js, pakai itu
        if (typeof fetchBinanceCandles === "function") {
            return await fetchBinanceCandles(uiSymbol, startMs, endMs);
        }
        // Fallback: inline fetch (kalau config.js belum loaded)
        return await _fetchBinanceCandlesInline(uiSymbol, startMs, endMs);
    }

    // ── Route ke Forex-Poll ─────────────────────────────────
    if (provider === "forex-poll") {
        // Forex-poll tidak punya candle history — hanya live price via polling
        logWarn(`[FOREX-POLL] ${uiSymbol} — no candle history (polling-only provider)`);
        return [];
    }

    // ── Route ke Finnhub ─────────────────────────────────────
    if (provider === "finnhub") {
        return await fetchFinnhubCandles(uiSymbol, startMs, endMs);
    }

    // ── Default: Hyperliquid ─────────────────────────────────
    const coin = getHLCoin(uiSymbol);
    logInfo(`[HL-REST] Fetching ${coin} (${uiSymbol}) candles: ${new Date(startMs).toISOString().slice(0,16)} → ${new Date(endMs).toISOString().slice(0,16)}`);

    try {
        const resp = await fetch(PLATFORM.HL_REST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "candleSnapshot",
                req: {
                    coin: coin,
                    interval: "1m",
                    startTime: startMs,
                    endTime: endMs
                }
            })
        });

        if (!resp.ok) {
            logErr(`[HL-REST] HTTP ${resp.status} for ${coin}`);
            return [];
        }

        const data = await resp.json();
        if (!Array.isArray(data)) {
            logWarn(`[HL-REST] Unexpected response for ${coin}`);
            return [];
        }

        const candles = data.map(c => ({
            time: Math.floor(c.t / 1000),   // HL pakai ms → kita pakai seconds
            o: parseFloat(c.o),
            h: parseFloat(c.h),
            l: parseFloat(c.l),
            c: parseFloat(c.c),
            v: parseFloat(c.v) || 1
        }));

        logGood(`[HL-REST] ✅ ${coin}: ${candles.length} candles fetched`);
        return candles;

    } catch (e) {
        logErr(`[HL-REST] Fetch error for ${coin}: ${e.message}`);
        return [];
    }
}

/**
 * Inline Binance candle fetch (fallback kalau config.js fetchBinanceCandles belum loaded)
 */
async function _fetchBinanceCandlesInline(uiSymbol, startMs, endMs) {
    const entry = PLATFORM.SYMBOL_MAP[uiSymbol];
    const coin = entry ? entry.coin : uiSymbol + "USDT";
    const interval = "1m";
    const limit = 1500;
    let allCandles = [];
    let currentEnd = endMs;

    logInfo(`[BN-REST] Fetching ${coin} (${uiSymbol})...`);

    try {
        while (true) {
            const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${coin}&interval=${interval}&endTime=${currentEnd}&limit=${limit}`;
            const resp = await fetch(url);
            if (!resp.ok) { logErr(`[BN-REST] HTTP ${resp.status} for ${coin}`); break; }

            const data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) break;

            const batch = data.map(c => ({
                time: Math.floor(c[0] / 1000),
                o: parseFloat(c[1]), h: parseFloat(c[2]), l: parseFloat(c[3]),
                c: parseFloat(c[4]), v: parseFloat(c[5]) || 1
            }));

            allCandles = [...batch, ...allCandles];
            if (batch[0].time * 1000 <= startMs) break;
            currentEnd = batch[0].time * 1000 - 1;
            await new Promise(r => setTimeout(r, 80));
        }

        allCandles = allCandles.filter(c => c.time * 1000 >= startMs && c.time * 1000 <= endMs);
        const seen = new Set();
        allCandles = allCandles.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
        allCandles.sort((a, b) => a.time - b.time);

        logGood(`[BN-REST] ✅ ${coin}: ${allCandles.length} candles`);
        return allCandles;
    } catch (e) {
        logErr(`[BN-REST] Error: ${e.message}`);
        return [];
    }
}

/**
 * Fetch historical candles dengan PAGINATION otomatis
 * Hyperliquid limit ~5000 candle per request. Fungsi ini fetch berulang
 * sampai tercapai targetBars atau data habis.
 *
 * @param {string} uiSymbol   - nama UI
 * @param {number} targetBars - jumlah bar yang diinginkan
 * @param {number} endMs      - waktu akhir (default: sekarang)
 * @returns {Array} all candles sorted oldest→newest
 */
async function fetchHistoryPaginated(uiSymbol, targetBars, endMs = Date.now()) {
    const PAGE_SIZE = 5000;
    let allCandles = [];
    let currentEnd = endMs;
    let pages = 0;
    const maxPages = Math.ceil(targetBars / PAGE_SIZE) + 1;

    while (allCandles.length < targetBars && pages < maxPages) {
        // Hitung start: targetBars sisa × 60 detik per bar × 1000 ms
        const remaining = targetBars - allCandles.length;
        const barsToFetch = Math.min(remaining, PAGE_SIZE);
        const startMs = currentEnd - (barsToFetch * 60 * 1000);

        const pct = Math.round((allCandles.length / targetBars) * 100);
        updateProgress(allCandles.length, targetBars, "Downloading");

        const batch = await fetchCandlesFromHL(uiSymbol, startMs, currentEnd);
        if (!batch.length) {
            logInfo(`[HL-REST] No more history for ${uiSymbol} (page ${pages+1})`);
            break;
        }

        allCandles = [...batch, ...allCandles]; // prepend (batch lebih lama)
        pages++;

        // Geser window ke belakang
        const oldestInBatch = batch[0].time * 1000;
        currentEnd = oldestInBatch - 1; // -1 ms agar tidak overlap

        logInfo(`[HL-REST] Page ${pages}: +${batch.length} | total: ${allCandles.length}/${targetBars}`);

        // Yield sedikit agar UI tidak freeze
        await new Promise(r => setTimeout(r, 100));
    }

    // Deduplicate by time
    const seen = new Set();
    allCandles = allCandles.filter(c => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
    });

    allCandles.sort((a, b) => a.time - b.time);
    logGood(`[HL-REST] ✅ Pagination done: ${allCandles.length} unique candles (${pages} pages)`);
    return allCandles;
}

/**
 * Gap fill: fetch candle dari fromTime sampai sekarang
 */
async function fetchGapCandles(uiSymbol, fromTimeSec) {
    const startMs = (fromTimeSec + 60) * 1000; // +60s agar tidak overlap candle terakhir
    const endMs   = Date.now();
    const gapMinutes = Math.floor((endMs - startMs) / 60000);
    logInfo(`[GAP] ${uiSymbol}: fetching ${gapMinutes}m gap...`);
    return await fetchCandlesFromHL(uiSymbol, startMs, endMs);
}

/**
 * Lazy load: fetch candle lebih lama dari beforeTime
 */
async function fetchOlderCandles(uiSymbol, beforeTimeSec, limitBars) {
    const endMs   = beforeTimeSec * 1000;
    const startMs = endMs - (limitBars * 60 * 1000);
    logInfo(`[LAZY] ${uiSymbol}: fetching ${limitBars} older candles...`);
    return await fetchCandlesFromHL(uiSymbol, startMs, endMs);
}

/**
 * Download dan parse binary candle file (.bin) dari folder data/
 * Format MTVC: Header(12 bytes) + Body(N × 24 bytes)
 *   Header: Magic"MTVC"(4) + Version uint32(4) + Count uint32(4)
 *   Candle: time uint32(4) + open float32(4) + high float32(4)
 *           + low float32(4) + close float32(4) + vol float32(4)
 *
 * File ini di-generate dari candles.db via export_candles_binary.py
 * dan di-upload ke GitHub bersama project.
 * Hanya dipakai saat user pertama kali buka (IndexedDB kosong).
 */
async function downloadBinaryHistory(uiSymbol) {
    const url = `data/${uiSymbol}.bin`;
    logInfo(`[BIN] ⬇️ Syncing ${url}...`);
    showLoadingOverlay(`Synchronizing ${uiSymbol}...`, 5);

    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            logWarn(`[BIN] ${url} not found (HTTP ${resp.status}) → fallback HL REST`);
            return null;
        }

        const contentLength = resp.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength) : 0;

        // Stream download dengan progress
        let buffer;
        if (totalBytes > 0 && resp.body && resp.body.getReader) {
            const reader = resp.body.getReader();
            const chunks = [];
            let received = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                const pct = Math.round((received / totalBytes) * 40); // 0-40%
                showLoadingOverlay(`Synchronizing ${uiSymbol}`, pct);
            }
            // Gabungkan chunks
            const merged = new Uint8Array(received);
            let pos = 0;
            for (const chunk of chunks) {
                merged.set(chunk, pos);
                pos += chunk.length;
            }
            buffer = merged.buffer;
        } else {
            buffer = await resp.arrayBuffer();
        }

        const view = new DataView(buffer);

        // Parse header (12 bytes)
        if (buffer.byteLength < 12) {
            logErr(`[BIN] File terlalu kecil: ${buffer.byteLength} bytes`);
            return null;
        }
        const magic = String.fromCharCode(
            view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
        );
        if (magic !== 'MTVC') {
            logErr(`[BIN] Invalid magic: "${magic}" (expected MTVC)`);
            return null;
        }

        const version = view.getUint32(4, true);  // little-endian
        const count   = view.getUint32(8, true);

        logInfo(`[BIN] Format MTVC v${version} — ${count.toLocaleString()} candles`);

        // Parse body
        const HEADER  = 12;
        const CANDLE  = 24;  // 6 × float32/uint32
        const expectedSize = HEADER + (count * CANDLE);
        if (buffer.byteLength < expectedSize) {
            logErr(`[BIN] Ukuran file tidak sesuai: ${buffer.byteLength} < ${expectedSize}`);
            return null;
        }

        showLoadingOverlay(`Processing Data...`, 45);

        const candles = new Array(count);
        for (let i = 0; i < count; i++) {
            const off = HEADER + (i * CANDLE);
            candles[i] = {
                time: view.getUint32(off,      true),
                o:    view.getFloat32(off + 4,  true),
                h:    view.getFloat32(off + 8,  true),
                l:    view.getFloat32(off + 12, true),
                c:    view.getFloat32(off + 16, true),
                v:    view.getFloat32(off + 20, true)
            };
        }

        logGood(`[BIN] ✅ ${candles.length.toLocaleString()} candles parsed dari ${uiSymbol}.bin`);
        return candles;

    } catch (e) {
        logErr(`[BIN] Download error: ${e.message}`);
        return null;
    }
}

// =========================================================
// 7. HYPERLIQUID WEBSOCKET ADAPTER (BARU)
// =========================================================

/**
 * Connect ke Hyperliquid WebSocket untuk live data
 * - candle 1m stream untuk CURRENT_SYMBOL
 * - allMids untuk Market Watch harga semua pair
 * - trades untuk footprint (opsional)
 */
function connectHLWebSocket() {
    if (hlWS && hlWS.readyState === WebSocket.OPEN) {
        logWarn('[HL-WS] Already connected');
        return;
    }

    logInfo('[HL-WS] Connecting to Hyperliquid...');
    hlWS = new WebSocket(PLATFORM.HL_WS_URL);

    hlWS.onopen = () => {
        logGood('[HL-WS] ✅ Connected!');

        // Subscribe allMids untuk Market Watch
        hlWS.send(JSON.stringify({
            method: "subscribe",
            subscription: { type: "allMids" }
        }));
        logInfo('[HL-WS] Subscribed: allMids (Market Watch)');

        // Subscribe candle untuk symbol aktif (jika ada)
        if (CURRENT_SYMBOL) {
            subscribeCandleStream(CURRENT_SYMBOL);
        }
    };

    hlWS.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            handleHLMessage(msg);
        } catch (e) {
            // Ignore parse errors (e.g. pong responses)
        }
    };

    hlWS.onerror = (e) => {
        logErr('[HL-WS] Error');
    };

    hlWS.onclose = (e) => {
        logWarn(`[HL-WS] Disconnected (${e.code}) → reconnect 3s`);
        hlWS = null;
        hlSubscribedCoin = null;
        setTimeout(connectHLWebSocket, 3000);
    };

    // Keepalive ping setiap 30 detik
    // HL WS tidak butuh ping eksplisit, tapi kita jaga koneksi
}

/**
 * Subscribe candle 1m stream untuk symbol tertentu
 */
function subscribeCandleStream(uiSymbol) {
    const provider = PLATFORM.SYMBOL_MAP[uiSymbol] ? PLATFORM.SYMBOL_MAP[uiSymbol].provider : "hyperliquid";

    // ── Forex-Poll: tidak ada WebSocket, harga dari polling ──
    if (provider === "forex-poll") {
        logInfo(`[FOREX-POLL] ${uiSymbol} live via polling (no WebSocket available)`);
        return;
    }

    // ── Binance: Combined stream sudah subscribe semua BN_SYMBOLS ──
    // Tidak perlu subscribe individual, live data sudah mengalir
    if (provider === "binance") {
        logInfo(`[BN-WS] ${uiSymbol} live via combined stream (already subscribed)`);
        return;
    }

    // ── Finnhub ──────────────────────────────────────────────────────
    if (provider === "finnhub") {
        if (!fhWS || fhWS.readyState !== WebSocket.OPEN) return;
        
        const fhCoin = PLATFORM.SYMBOL_MAP[uiSymbol].coin;

        // Unsubscribe old
        if (fhSubscribedCoin && fhSubscribedCoin !== fhCoin) {
            fhWS.send(JSON.stringify({ type: "unsubscribe", symbol: fhSubscribedCoin }));
            logInfo(`[FH-WS] Unsubscribed: ${fhSubscribedCoin}`);
        }
        
        fhWS.send(JSON.stringify({ type: "subscribe", symbol: fhCoin }));
        fhSubscribedCoin = fhCoin;
        logGood(`[FH-WS] Subscribed: trades for ${fhCoin} (${uiSymbol})`);
        return;
    }

    // ── Default: Hyperliquid ─────────────────────────────────────────
    if (!hlWS || hlWS.readyState !== WebSocket.OPEN) return;

    const coin = getHLCoin(uiSymbol);

    // Unsubscribe coin lama (jika beda)
    if (hlSubscribedCoin && hlSubscribedCoin !== coin) {
        hlWS.send(JSON.stringify({
            method: "unsubscribe",
            subscription: { type: "candle", coin: hlSubscribedCoin, interval: "1m" }
        }));
        // Juga unsubscribe trades untuk footprint
        hlWS.send(JSON.stringify({
            method: "unsubscribe",
            subscription: { type: "trades", coin: hlSubscribedCoin }
        }));
        logInfo(`[HL-WS] Unsubscribed: ${hlSubscribedCoin}`);
    }

    // Subscribe candle baru
    hlWS.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "candle", coin: coin, interval: "1m" }
    }));

    // Subscribe trades untuk live footprint
    hlWS.send(JSON.stringify({
        method: "subscribe",
        subscription: { type: "trades", coin: coin }
    }));

    hlSubscribedCoin = coin;
    logGood(`[HL-WS] Subscribed: candle 1m + trades for ${coin} (${uiSymbol})`);
}

/**
 * Handle pesan dari Hyperliquid WebSocket
 */
function handleHLMessage(msg) {
    if (!msg.channel) return;

    // ── A. CANDLE UPDATE (live bar forming / bar close) ─────────
    if (msg.channel === "candle") {
        handleHLCandle(msg.data);
        return;
    }

    // ── B. ALL MIDS (harga semua pair untuk Market Watch) ───────
    if (msg.channel === "allMids") {
        handleHLAllMids(msg.data);
        return;
    }

    // ── C. TRADES (footprint / order flow) ──────────────────────
    if (msg.channel === "trades") {
        handleHLTrades(msg.data);
        return;
    }

    // ── D. SUBSCRIPTION ACK ────────────────────────────────────
    if (msg.channel === "subscriptionResponse") {
        // logInfo('[HL-WS] Subscription ack');
        return;
    }
}

// =========================================================
// 8. FINNHUB WEBSOCKET ADAPTER (FOREX)
// =========================================================

function connectFinnhubWebSocket() {
    if (!PLATFORM.FINNHUB_API_KEY || PLATFORM.FINNHUB_API_KEY === "") {
        logWarn('[FH-WS] API Key kosong, fitur Forex dilewati.');
        return;
    }

    if (fhWS && fhWS.readyState === WebSocket.OPEN) return;

    logInfo('[FH-WS] Connecting to Finnhub...');
    fhWS = new WebSocket(`wss://ws.finnhub.io?token=${PLATFORM.FINNHUB_API_KEY}`);

    fhWS.onopen = () => {
        logGood('[FH-WS] ✅ Connected!');
        
        // Auto-subscribe ke semua pair Forex untuk ngisi Market Watch
        for (const [uiSym, info] of Object.entries(PLATFORM.SYMBOL_MAP)) {
            if (info.provider === 'finnhub') {
                fhWS.send(JSON.stringify({ type: "subscribe", symbol: info.coin }));
                logInfo(`[FH-WS] Subscribed Market Watch: ${info.coin}`);
            }
        }
        
        // Jika symbol aktif saat ini adalah forex, jadikan fokus
        if (CURRENT_SYMBOL && PLATFORM.SYMBOL_MAP[CURRENT_SYMBOL]?.provider === "finnhub") {
            fhSubscribedCoin = PLATFORM.SYMBOL_MAP[CURRENT_SYMBOL].coin;
        }
    };

    fhWS.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "trade" && msg.data) {
                msg.data.forEach(trade => handleFinnhubTrade(trade));
            }
        } catch (e) {}
    };

    fhWS.onclose = () => {
        logWarn('[FH-WS] Disconnected → reconnect 5s');
        fhWS = null;
        setTimeout(connectFinnhubWebSocket, 5000);
    };
}

// Pseudo-candle builder dari trade (karena Finnhub free tidak kasih WSS candle)
let fhCurrentCandle = {};

function handleFinnhubTrade(trade) {
    // trade: { p: price, s: symbol, t: ms_timestamp, v: volume }
    const fhCoin = trade.s;
    const uiSymbol = Object.keys(PLATFORM.SYMBOL_MAP).find(k => PLATFORM.SYMBOL_MAP[k].coin === fhCoin) || fhCoin;
    
    const price = trade.p;
    const vol = trade.v;
    const timeMs = trade.t;
    const openTimeSec = Math.floor(timeMs / 60000) * 60; // Dibulatkan ke menit terdekat (1m)

    // Push tick untuk Market Watch (berkedip)
    sendTickToWasm(uiSymbol, price, vol, Math.floor(timeMs / 1000));

    // Jika ini bukan simbol utama chart, stop di sini (hanya update market watch)
    if (uiSymbol !== CURRENT_SYMBOL || isDownloading) return;

    // --- Build Pseudo 1m Candle untuk Chart Utama ---
    if (!fhCurrentCandle[uiSymbol] || fhCurrentCandle[uiSymbol].time !== openTimeSec) {
        // Bar baru terbentuk, siram bar lama ke IDB
        if (fhCurrentCandle[uiSymbol]) {
            addToBuffer(uiSymbol, [fhCurrentCandle[uiSymbol]]);
            flushBuffer();
        }
        // Inisialisasi bar baru
        fhCurrentCandle[uiSymbol] = {
            time: openTimeSec,
            o: price, h: price, l: price, c: price, v: vol
        };
    } else {
        // Update bar berjalan
        const c = fhCurrentCandle[uiSymbol];
        c.h = Math.max(c.h, price);
        c.l = Math.min(c.l, price);
        c.c = price;
        c.v += vol;
    }

    // Gambar ke Chart WASM
    const c = fhCurrentCandle[uiSymbol];
    notifyWASM_candle(c.o, c.h, c.l, c.c, c.time, c.v);
}

// =========================================================
// 9. BINANCE FUTURES WEBSOCKET (FOREX / GOLD)
// =========================================================

// Debug counters — throttled log biar console tidak spam
let _bnKlineCount = 0, _bnBookCount = 0, _bnTradeCount = 0;
let _bnLastLogSec = 0;
let _bnFirstMsgLogged = false;
// Raw stream type tracking — untuk debug kline=0
let _bnStreamTypes = {};  // streamType → count

function _bnDebugLog() {
    const now = Math.floor(Date.now() / 1000);
    if (now - _bnLastLogSec >= 5) {  // log setiap 5 detik
        if (_bnKlineCount + _bnBookCount + _bnTradeCount > 0) {
            logInfo(`[BN-WS] 📊 5s stats: kline=${_bnKlineCount} bookTicker=${_bnBookCount} aggTrade=${_bnTradeCount}`);
        }
        // Log raw stream types jika ada mismatch
        const types = Object.keys(_bnStreamTypes);
        if (types.length > 0) {
            const summary = types.map(t => `${t}=${_bnStreamTypes[t]}`).join(' ');
            logInfo(`[BN-WS] 📡 raw streams: ${summary}`);
        }
        _bnKlineCount = 0; _bnBookCount = 0; _bnTradeCount = 0;
        _bnStreamTypes = {};
        _bnLastLogSec = now;
    }
}

// ═══════════════════════════════════════════════════════════════
// Binance ExchangeInfo — Validasi Symbol
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch Binance Futures exchangeInfo untuk validasi symbol
 * Hanya symbol yang ADA di Binance Futures yang bisa di-subscribe
 * Symbol yang TIDAK ADA (EURUSDT, GBPUSDT) → route ke forex-poll
 *
 * @returns {Set} Set of valid symbol names (e.g., "XAUUSDT", "BTCUSDT")
 */
async function fetchValidBinanceSymbols() {
    try {
        const restUrl = (typeof PLATFORM !== 'undefined' && PLATFORM.BN_REST_URL)
            ? PLATFORM.BN_REST_URL : "https://fapi.binance.com/fapi/v1";
        const resp = await fetch(`${restUrl}/exchangeInfo`);
        if (!resp.ok) {
            logWarn(`[BN] exchangeInfo HTTP ${resp.status}, fallback: assume all valid`);
            return null;  // null = don't know, assume all valid
        }
        const data = await resp.json();
        const validSet = new Set(data.symbols.map(s => s.symbol));
        logGood(`[BN] exchangeInfo: ${validSet.size} symbols available`);
        return validSet;
    } catch (e) {
        logWarn(`[BN] exchangeInfo fetch failed: ${e.message}, fallback: assume all valid`);
        return null;
    }
}

/**
 * Filter BN_SYMBOLS berdasarkan exchangeInfo
 * Pisahkan mana yang valid di Binance, mana yang tidak
 * Symbol yang tidak valid → route ke forex-poll
 */
async function validateBinanceSymbols() {
    const bnSymbols = (typeof BN_SYMBOLS !== 'undefined') ? BN_SYMBOLS : [];
    if (bnSymbols.length === 0) {
        bnValidUISymbols = [];
        bnInvalidUISymbols = [];
        forexPollSymbols = [];
        return;
    }

    const validSet = await fetchValidBinanceSymbols();

    if (!validSet) {
        // Tidak bisa fetch exchangeInfo → assume semua valid
        bnValidUISymbols = [...bnSymbols];
        bnInvalidUISymbols = [];
        forexPollSymbols = [];
        return;
    }

    bnValidSymbols = validSet;
    bnValidUISymbols = [];
    bnInvalidUISymbols = [];

    bnSymbols.forEach(ui => {
        const coin = (typeof getBinanceCoin === 'function')
            ? getBinanceCoin(ui)
            : (PLATFORM.SYMBOL_MAP[ui]?.coin || ui + "USDT");

        if (validSet.has(coin)) {
            bnValidUISymbols.push(ui);
        } else {
            bnInvalidUISymbols.push(ui);
            logWarn(`[BN] ⚠️ ${ui} (${coin}) NOT found on Binance Futures → forex-poll`);
        }
    });

    logGood(`[BN] Valid: ${bnValidUISymbols.join(', ') || 'none'}`);
    if (bnInvalidUISymbols.length > 0) {
        logWarn(`[BN] Invalid (will poll): ${bnInvalidUISymbols.join(', ')}`);
        forexPollSymbols = [...bnInvalidUISymbols];
    }
}

// ═══════════════════════════════════════════════════════════════
// Forex Polling — EURUSD/GBPUSD live price dari free API
// ═══════════════════════════════════════════════════════════════

/**
 * Poll harga forex dari free API
 * API yang digunakan:
 *   - Frankfurter (ECB rates): https://api.frankfurter.app/latest?from=USD&to=EUR,GBP
 *   - Gratis, tanpa API key, update ~daily (ECB)
 *   - Untuk tick-by-tick yang lebih cepat, perlu provider berbayar
 *
 * Alternatif yang lebih real-time (butuh API key):
 *   - Twelve Data: https://twelvedata.com (WebSocket forex, free tier 8 hits/min)
 *   - Finnhub: https://finnhub.io (WebSocket forex, free tier)
 */
async function pollForexPrices() {
    if (forexPollSymbols.length === 0) return;

    try {
        // Frankfurter API — gratis, tanpa API key
        // Returns: { rates: { EUR: 0.9234, GBP: 0.7891 }, base: "USD" }
        const currencies = forexPollSymbols.map(ui => {
            // EURUSD → EUR, GBPUSD → GBP, XAUUSD → XAU (tidak supported)
            if (ui === "EURUSD") return "EUR";
            if (ui === "GBPUSD") return "GBP";
            if (ui === "JPYUSD") return "JPY";
            if (ui === "AUDUSD") return "AUD";
            if (ui === "NZDUSD") return "NZZ";
            if (ui === "USDCAD") return "CAD";
            if (ui === "USDCNY") return "CNY";
            return null;
        }).filter(Boolean);

        if (currencies.length === 0) return;

        const resp = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${currencies.join(',')}`);
        if (!resp.ok) return;
        const data = await resp.json();
        const timeSec = Math.floor(Date.now() / 1000);

        // Map rates ke UI symbols
        forexPollSymbols.forEach(ui => {
            let rate = null;
            if (ui === "EURUSD" && data.rates.EUR) rate = data.rates.EUR;
            else if (ui === "GBPUSD" && data.rates.GBP) rate = data.rates.GBP;
            else if (ui === "JPYUSD" && data.rates.JPY) rate = 1 / data.rates.JPY; // inverted
            else if (ui === "AUDUSD" && data.rates.AUD) rate = 1 / data.rates.AUD;
            else if (ui === "NZDUSD" && data.rates.NZD) rate = 1 / data.rates.NZD;
            else if (ui === "USDCAD" && data.rates.CAD) rate = data.rates.CAD;
            else if (ui === "USDCNY" && data.rates.CNY) rate = data.rates.CNY;

            if (rate && rate > 0) {
                // Push ke Market Watch
                sendTickToWasm(ui, rate, 0, timeSec);
            }
        });

    } catch (e) {
        // Silent fail — polling, akan coba lagi next interval
    }
}

/**
 * Start forex polling interval
 * @param {number} intervalMs — polling interval (default 10000 = 10 detik)
 */
function startForexPolling(intervalMs = 10000) {
    if (forexPollInterval) clearInterval(forexPollInterval);
    if (forexPollSymbols.length === 0) return;

    logInfo(`[FOREX-POLL] Starting poll for: ${forexPollSymbols.join(', ')} every ${intervalMs/1000}s`);

    // Poll pertama langsung
    pollForexPrices();

    // Lalu interval
    forexPollInterval = setInterval(pollForexPrices, intervalMs);
}

/**
 * Connect ke Binance Futures WebSocket — Combined Stream
 * - Hanya subscribe symbol yang VALID (dari exchangeInfo)
 * - Symbol yang tidak valid → sudah di-route ke forex-poll
 * - Format: wss://fstream.binance.com/stream?streams=xauusdt@kline_1m/xauusdt@bookTicker/...
 * - TIDAK BUTUH API KEY
 *
 * Data yang diterima:
 *   - @kline_1m   → live candle forming + bar close → push ke WASM chart + IDB
 *   - @bookTicker → best bid/ask tick-by-tick → Market Watch live price
 *   - @aggTrade   → individual trades → footprint + candle tick update
 */
async function connectBinanceWebSocket() {
    if (bnWS && (bnWS.readyState === WebSocket.OPEN || bnWS.readyState === WebSocket.CONNECTING)) {
        logWarn('[BN-WS] Already connected / connecting');
        return;
    }

    // ── VALIDASI SYMBOL DULU ──────────────────────────────────
    // Cek exchangeInfo untuk filter symbol yang benar-benar ada
    await validateBinanceSymbols();

    // Hanya subscribe symbol yang valid di Binance Futures
    const symbolsToSubscribe = bnValidUISymbols;
    if (symbolsToSubscribe.length === 0) {
        logWarn('[BN-WS] No valid Binance symbols found — skipping Binance WS');
        // Tapi tetap start forex polling untuk invalid symbols
        startForexPolling();
        return;
    }

    // Build combined stream URL — TIGA stream per symbol:
    //   1. @kline_1m   → untuk candle chart (update ~100ms, bar close ke IDB)
    //   2. @bookTicker → untuk live price tick-by-tick di Market Watch
    //   3. @aggTrade   → individual trades untuk footprint + candle tick
    const streams = [];
    symbolsToSubscribe.forEach(ui => {
        const coin = (typeof getBinanceCoin === 'function') ? getBinanceCoin(ui) : (PLATFORM.SYMBOL_MAP[ui]?.coin || ui + "USDT");
        const sym = coin.toLowerCase();
        streams.push(`${sym}@kline_1m`);    // candle stream
        streams.push(`${sym}@bookTicker`);   // tick-by-tick live price (Market Watch)
        streams.push(`${sym}@aggTrade`);     // individual trades (footprint + candle tick)
    });

    const streamUrl = `wss://fstream.binance.com/stream?streams=${streams.join("/")}`;

    logInfo(`[BN-WS] Connecting to Binance Futures...`);
    logInfo(`[BN-WS] ${symbolsToSubscribe.length} valid symbols × 3 streams = ${streams.length} total`);
    logInfo(`[BN-WS] Subscribing: ${symbolsToSubscribe.map(ui => getBinanceCoin(ui)).join(', ')}`);
    bnWS = new WebSocket(streamUrl);

    bnWS.onopen = () => {
        logGood(`[BN-WS] ✅ Connected! Streams: ${streams.length} (kline + bookTicker + aggTrade)`);
        logGood(`[BN-WS] Symbols: ${symbolsToSubscribe.join(', ')}`);
        bnSubscribedStreams = new Set(streams);
    };

    bnWS.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            // ── RAW DEBUG: Track semua stream types ──
            if (msg.stream) {
                const streamType = msg.stream.split('@')[1] || 'unknown';
                _bnStreamTypes[streamType] = (_bnStreamTypes[streamType] || 0) + 1;
            }
            // ── FIRST MESSAGE DEBUG ──
            if (!_bnFirstMsgLogged) {
                _bnFirstMsgLogged = true;
                logInfo(`[BN-WS] 📨 First message: stream="${msg.stream || 'N/A'}" hasData=${!!msg.data} keys=${Object.keys(msg).join(',')}`);
            }
            handleBinanceMessage(msg);
        } catch (e) {
            // Ignore parse errors
        }
    };

    bnWS.onerror = (e) => {
        logErr('[BN-WS] Error');
    };

    bnWS.onclose = (e) => {
        logWarn(`[BN-WS] Disconnected (${e.code}) → reconnect 3s`);
        bnWS = null;
        bnSubscribedStreams.clear();
        setTimeout(connectBinanceWebSocket, 3000);
    };

    // ── START FOREX POLLING untuk symbol yang tidak ada di Binance ──
    startForexPolling();
}

/**
 * Handle pesan dari Binance Combined WebSocket
 * Format combined stream:
 *   { stream: "xauusdt@kline_1m",   data: { e: "kline", ... } }
 *   { stream: "xauusdt@bookTicker", data: { e: "bookTicker", ... } }
 *   { stream: "xauusdt@aggTrade",   data: { e: "aggTrade", ... } }
 */
function handleBinanceMessage(msg) {
    // Combined stream format
    if (!msg.stream || !msg.data) {
        // Bisa jadi connection result atau error — log sekali untuk debug
        if (msg.error) {
            logErr(`[BN-WS] Binance error: ${JSON.stringify(msg.error)}`);
        }
        return;
    }

    // Route berdasarkan stream type
    if (msg.stream.includes("@kline_")) {
        _bnKlineCount++;
        handleBinanceCandle(msg.data);
    } else if (msg.stream.includes("@bookTicker")) {
        _bnBookCount++;
        handleBinanceBookTicker(msg.data);
    } else if (msg.stream.includes("@aggTrade")) {
        _bnTradeCount++;
        handleBinanceAggTrade(msg.data);
    }
    _bnDebugLog();
}

/**
 * Handle bookTicker dari Binance WS — TICK-BY-TICK live price
 * Format:
 *   { e: "bookTicker", u: updateId, E: eventTime,
 *     s: "XAUUSDT", b: "2650.50", B: "12.5", a: "2650.60", A: "8.3" }
 *   b = best bid price, B = best bid qty
 *   a = best ask price, A = best ask qty
 *
 * Ini yang bikin Market Watch XAUUSD/GBPUSD berkedip real-time!
 */
function handleBinanceBookTicker(data) {
    if (!data || !data.s) return;

    const bnSymbol = data.s;                    // "XAUUSDT"
    const uiSymbol = getUISymbol(bnSymbol);      // "XAUUSD"
    if (!uiSymbol) return;

    // Mid price = (best bid + best ask) / 2
    const bestBid = parseFloat(data.b);
    const bestAsk = parseFloat(data.a);
    const midPrice = (bestBid + bestAsk) / 2;
    const timeSec = Math.floor(Date.now() / 1000);

    // Push ke Market Watch — ini yang bikin harga berkedip!
    sendTickToWasm(uiSymbol, midPrice, 0, timeSec);
}

/**
 * Handle aggTrade dari Binance WS — INDIVIDUAL TRADES
 * Format:
 *   { e: "aggTrade", E: eventTime, s: "XAUUSDT",
 *     p: "2650.55", q: "0.5", T: tradeTime, m: isBuyerMaker }
 *   p = price, q = quantity, m = true if seller is maker
 *
 * Dipakai untuk:
 *   1. Push footprint ke WASM (buy/sell volume per price level)
 *   2. Update candle tick-by-tick (lebih responsif dari kline 100ms)
 *   3. Market Watch live price (backup bookTicker)
 */
function handleBinanceAggTrade(data) {
    if (!data || !data.s) return;

    const bnSymbol = data.s;                    // "XAUUSDT"
    const uiSymbol = getUISymbol(bnSymbol);      // "XAUUSD"
    if (!uiSymbol) return;

    const price = parseFloat(data.p);
    const qty = parseFloat(data.q);
    const timeMs = data.T;
    const timeSec = Math.floor(timeMs / 1000);
    const isSell = data.m === true;   // isBuyerMaker = true → sell trade

    // ── 1. Push footprint ke WASM (buy_vol, sell_vol per price) ──
    if (uiSymbol === CURRENT_SYMBOL && !isDownloading) {
        const buyVol  = isSell ? 0 : qty;
        const sellVol = isSell ? qty : 0;
        notifyWASM_footprint(uiSymbol, timeSec, price, buyVol, sellVol, 0);
    }

    // ── 2. Push tick ke Market Watch ──
    sendTickToWasm(uiSymbol, price, qty, timeSec);
}

// Track last candle time per BN symbol (untuk deteksi bar close)
let bnLastCandleTime = {};

/**
 * Handle candle update dari Binance WS
 * Format kline data:
 *   { e: "kline", E: eventTime, s: "XAUUSDT", k: { t, T, s, i, o, h, l, c, v, x... } }
 *   k.x = is this kline closed? (boolean)
 *
 * Binance @kline_1m update setiap ~100ms (jauh lebih sering dari HL)
 * → candle chart XAUUSD update real-time sama kayak BTC!
 */
function handleBinanceCandle(data) {
    if (!data || !data.k) return;

    const k = data.k;
    const bnSymbol = k.s;                    // "XAUUSDT"
    const uiSymbol = getUISymbol(bnSymbol);   // "XAUUSD"
    if (!uiSymbol) return;

    const openTime = Math.floor(k.t / 1000);  // ms → seconds
    const o = parseFloat(k.o);
    const h = parseFloat(k.h);
    const l = parseFloat(k.l);
    const c = parseFloat(k.c);
    const v = parseFloat(k.v) || 1;
    const isBarClosed = k.x === true;

    // Deteksi BAR CLOSE
    const prevTime = bnLastCandleTime[bnSymbol];
    const isNewBar = (prevTime !== undefined && openTime !== prevTime);

    if (isNewBar && prevTime) {
        // Bar sebelumnya sudah close — flush buffer ke IDB
        flushBuffer();
    }
    bnLastCandleTime[bnSymbol] = openTime;

    // Buffer ke IDB (simpan candle yang sudah close)
    if (downloadedSymbols.has(uiSymbol)) {
        if (isBarClosed) {
            addToBuffer(uiSymbol, [{ time: openTime, o, h, l, c, v }]);
        }
    }

    // Push ke chart utama (WASM) — candle forming tick-by-tick + bar close
    // Binance @kline_1m update ~100ms → candle XAUUSD bergerak real-time!
    if (uiSymbol === CURRENT_SYMBOL && !isDownloading) {
        notifyWASM_candle(o, h, l, c, openTime, v);
        if (openTime > lastWasmTime) lastWasmTime = openTime;
    }
}

/**
 * Handle candle update dari HL WS
 * Format: { s: "BTC", i: "1m", t: openMs, T: closeMs, o, h, l, c, v, n }
 */
function handleHLCandle(data) {
    if (!data || !data.s) return;

    const hlCoin   = data.s;
    const uiSymbol = getUISymbol(hlCoin);
    const openTime = Math.floor(data.t / 1000); // ms → seconds
    const price    = parseFloat(data.c);
    const vol      = parseFloat(data.v) || 1;

    // Deteksi BAR CLOSE: kalau openTime berubah, candle sebelumnya sudah close
    const prevTime = hlLastCandleTime[hlCoin];
    const isNewBar = (prevTime !== undefined && openTime !== prevTime);

    if (isNewBar && prevTime) {
        // Bar sebelumnya sudah close — simpan ke IDB
        // (data bar close sudah di-push ke WASM saat update terakhir)
        // Flush buffer agar masuk IDB
        flushBuffer();
    }

    hlLastCandleTime[hlCoin] = openTime;

    const o = parseFloat(data.o);
    const h = parseFloat(data.h);
    const l = parseFloat(data.l);
    const c = parseFloat(data.c);
    const v = parseFloat(data.v) || 1;

    // Push tick ke semua symbol (Market Watch + tab non-primary)
    sendTickToWasm(uiSymbol, c, v, openTime);

    // Buffer untuk IDB (hanya symbol yang pernah dibuka)
    if (downloadedSymbols.has(uiSymbol)) {
        addToBuffer(uiSymbol, [{ time: openTime, o, h, l, c, v }]);
    }

    // Push candle ke chart (hanya CURRENT_SYMBOL)
    if (uiSymbol === CURRENT_SYMBOL && !isDownloading) {
        notifyWASM_candle(o, h, l, c, openTime, v);
        if (openTime > lastWasmTime) lastWasmTime = openTime;
    } else if (downloadedSymbols.has(uiSymbol) && !isDownloading) {
        // Non-primary tab
        if (Module._wasm_push_candle_for_symbol) {
            Module.ccall('wasm_push_candle_for_symbol', null,
                ['string','number','number','number','number','number','number'],
                [uiSymbol, o, h, l, c, openTime, v]);
        }
    }
}

/**
 * Handle allMids — update harga semua pair untuk Market Watch
 * Format: { mids: { "BTC": "70050.0", "ETH": "3800.0", ... } }
 */
function handleHLAllMids(data) {
    if (!data || !data.mids) return;

    for (const [hlCoin, priceStr] of Object.entries(data.mids)) {
        const uiSymbol = getUISymbol(hlCoin);
        if (!uiSymbol || !PLATFORM.SYMBOL_MAP[uiSymbol]) continue;

        const price = parseFloat(priceStr);
        if (price <= 0 || isNaN(price)) continue;

        // Kirim ke WASM sebagai tick (untuk Market Watch panel)
        sendTickToWasm(uiSymbol, price, 1, Math.floor(Date.now() / 1000));
    }
}

/**
 * Handle trades stream — untuk live footprint
 * Format: [{ coin, side, px, sz, time, ... }, ...]
 */
function handleHLTrades(dataArray) {
    if (!Array.isArray(dataArray)) return;

    for (const trade of dataArray) {
        if (!trade.coin) continue;

        const uiSymbol = getUISymbol(trade.coin);
        if (!downloadedSymbols.has(uiSymbol)) continue;

        const price   = parseFloat(trade.px);
        const size    = parseFloat(trade.sz);
        const isBuy   = trade.side === "B";
        const barTime = Math.floor((trade.time || Date.now()) / 1000);
        // Round down ke menit (bar time M1)
        const barTimeM1 = barTime - (barTime % 60);

        const buyVol  = isBuy  ? size * price : 0;
        const sellVol = !isBuy ? size * price : 0;

        notifyWASM_footprint(uiSymbol, barTimeM1, price, buyVol, sellVol);
    }
}

// =========================================================
// 8. SWITCH PAIR (SetActiveSymbol) — OPTIMIZED 3 SKENARIO
// =========================================================
//   SKENARIO 1 (No IDB):  Binary TURBO → push langsung → gap fill background
//   SKENARIO 2 (IDB Hit): Baca IDB sekali → push langsung → gap fill background
//   SKENARIO 3 (Live):    Quick switch → cache push instant → gap fill background
//
//   Optimasi utama:
//   - Tidak ada double IDB read (dulu: baca IDB → rebuildFullFromDB → baca IDB lagi)
//   - Gap fill JALAN DI BACKGROUND (chart sudah muncul, user bisa pakai)
//   - 16ms artificial delay dihapus (unused)
// =========================================================
window.SetActiveSymbol = async function(newSym) {
    if (isDownloading) {
        logWarn(`[UI] Still loading ${CURRENT_SYMBOL}, queued: ${newSym}`);
        pendingSymbolSwitch = newSym;
        return;
    }

    if (CURRENT_SYMBOL && CURRENT_SYMBOL === newSym && isWasmReady) return;

    logInfo(`[UI] Switching: ${CURRENT_SYMBOL} → ${newSym}`);
    await flushBuffer();

    const oldSym = CURRENT_SYMBOL;
    CURRENT_SYMBOL = newSym;
    lastWasmTime   = 0;
    g_noMoreHistory.delete(newSym);

    if (oldSym && oldSym !== newSym && window.clearFPForSymbol) {
        window.clearFPForSymbol(oldSym);
    }
    g_lazyLoadInProgress = false;
    g_initialLoadDone = false;

    g_tabSymbolMap.set(0, newSym);
    resetTabLazy(0);

    showLoadingOverlay(`Switching to ${newSym}...`, 0);

    if (Module && Module._wasm_clear_chart) {
        Module._wasm_clear_chart();
        logInfo(`[CHART] GPU + candles cleared for ${oldSym} → ${newSym}`);
    }

    // 🔥 OPTIMASI: Hapus 16ms artificial delay — tidak diperlukan
    // await new Promise(r => setTimeout(r, 16));

    // Subscribe ke HL WS untuk symbol baru
    subscribeCandleStream(newSym);

    // ════════════════════════════════════════════════════════════════
    // 🔥 OPTIMASI: Cek apakah IDB sudah punya data symbol ini
    //   - Kalau YA → SKENARIO 2 (IDB Hit): push langsung tanpa baca IDB ulang
    //   - Kalau TIDAK → SKENARIO 1 (No IDB): download binary/REST
    // ════════════════════════════════════════════════════════════════
    const existing = await getAllCandlesFromDB(CURRENT_SYMBOL);
    const MIN = 500;

    if (existing.length >= MIN) {
        // ════════════════════════════════════════════════════════════
        // 🔥 SKENARIO 2: IDB CACHE HIT — Optimasi utama
        //   - Push LANGSUNG ke WASM dari data di memori (existing)
        //   - TIDAK baca IDB lagi di rebuildFullFromDB (hemat 50-300ms)
        //   - Gap fill JALAN DI BACKGROUND (chart sudah muncul)
        // ════════════════════════════════════════════════════════════
        logGood(`[CACHE HIT] ${CURRENT_SYMBOL}: ${existing.length} bars`);

        // 🔥 OPTIMASI: Push langsung ke WASM tanpa baca IDB ulang
        showLoadingOverlay(`Loading ${CURRENT_SYMBOL} from cache`, 50);
        pushCandlesToWASMDirect(CURRENT_SYMBOL, existing);
        hideLoadingOverlay();
        g_initialLoadDone = true;
        logInfo(`[INIT] Initial load selesai — lazy diizinkan`);

        // 🔥 OPTIMASI: Gap fill di BACKGROUND — chart sudah muncul!
        //   User bisa scroll/zoom sementara gap candles di-fetch
        const latestTime = existing.reduce((max, c) => c.time > max ? c.time : max, 0);
        const nowEpoch   = Math.floor(Date.now() / 1000);
        const gapSeconds = nowEpoch - latestTime;
        const gapMinutes = Math.floor(gapSeconds / 60);

        if (gapSeconds > 30) {
            logWarn(`[GAP-BG] ${gapMinutes}m gap → background fill dari HL REST`);
            // Gap fill async — tidak block UI
            (async () => {
                try {
                    const gapCandles = await fetchGapCandles(CURRENT_SYMBOL, latestTime);
                    if (gapCandles.length > 0) {
                        // 🔥 FIX: Set g_primaryBulkLoading=true supaya wasm_push_candle
                        //    masuk KASUS 3.A (push_back historical) bukan KASUS 3.B (search & skip)
                        //    Tanpa ini, gap candle yang time-nya lebih kecil dari lastWasmTime
                        //    akan di-skip (HILANG dari chart)!
                        if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(1);
                        isRendering = true;

                        // Sort gap candles oldest→newest (penting supaya KASUS 1 jalan)
                        gapCandles.sort((a, b) => a.time - b.time);

                        // Push gap candles langsung ke WASM
                        for (const c of gapCandles) {
                            notifyWASM_candle(c.o, c.h, c.l, c.c, c.time, c.v || 1);
                            if (c.time > lastWasmTime) lastWasmTime = c.time;
                        }

                        // 🔥 FIX: Rebuild HTF supaya M5/H1/H4 ikut update dengan candle baru
                        if (Module._wasm_rebuild_all_htfs) Module._wasm_rebuild_all_htfs();

                        // 🔥 FIX: Force re-upload VBO supaya candle baru langsung render
                        //    Tanpa ini, gap render logic gak detect candle baru (srcSize naik tapi ec gak berubah)
                        if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();

                        // Clear primary loading flag
                        if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
                        isRendering = false;

                        // 🔥 FIX: Trigger GoToLive supaya chart auto-scroll ke candle terbaru
                        //    Tanpa ini, viewCenterIndex tetap di posisi lama → user gak lihat candle baru
                        if (Module._wasm_trigger_goto_live) Module._wasm_trigger_goto_live();

                        // Simpan ke IDB di background
                        addToBuffer(CURRENT_SYMBOL, gapCandles);
                        await flushBuffer();
                        logGood(`[GAP-BG] ✅ +${gapCandles.length} gap candles pushed + saved`);
                    }
                } catch(e) {
                    logWarn(`[GAP-BG] Gap fill error: ${e.message}`);
                    // 🔥 FIX: Clear flag kalau error (jangan biarkan stuck)
                    if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
                    isRendering = false;
                }
            })();
        } else {
            logInfo(`[GAP] IDB fresh (gap ${gapSeconds}s) → no gap fill needed`);
        }

    } else {
        // ════════════════════════════════════════════════════════════
        // 🔥 SKENARIO 1: CACHE MISS (No IDB) — First time load
        //   - Binary TURBO: download .bin → parse → push langsung ke WASM
        //   - Gap fill paralel: mulai fetch gap SEBELUM binary selesai
        //   - IDB save di background (tidak block chart)
        // ════════════════════════════════════════════════════════════
        logWarn(`[CACHE MISS] ${CURRENT_SYMBOL} → sync...`);
        showLoadingOverlay(`Synchronizing ${CURRENT_SYMBOL}...`, 0);
        isDownloading = true;

        // ═══════════════════════════════════════════════════════════
        // TAHAP 1: Coba download binary file (.bin) dari folder data/
        // ═══════════════════════════════════════════════════════════
        let candles = await downloadBinaryHistory(CURRENT_SYMBOL);
        let usedBinary = false;
        let allCandles = [];  // semua candle (binary + gap) untuk IDB save

        if (candles && candles.length > 0) {
            usedBinary = true;
            allCandles = [...candles];

            // ═══════════════════════════════════════════════════════
            // TURBO: Push LANGSUNG ke WASM → chart muncul INSTAN!
            //   Tidak perlu simpan ke IDB dulu!
            // ═══════════════════════════════════════════════════════
            showLoadingOverlay(`Rendering ${CURRENT_SYMBOL}...`, 60);
            pushCandlesDirectToWASM(CURRENT_SYMBOL, allCandles);
            hideLoadingOverlay();

            // Chart sudah muncul! ✅ Sekarang simpan ke IDB di background
            logInfo(`[TURBO] Chart sudah tampil! Menyimpan ke IDB di background...`);
            saveToIDBBackground(CURRENT_SYMBOL, allCandles).then(() => {
                logGood(`[TURBO] ✅ IDB background save selesai — lazy load siap!`);
            });

            // ═══════════════════════════════════════════════════════
            // 🔥 OPTIMASI: Gap fill di BACKGROUND
            //   Chart sudah muncul dari binary, gap fill jalan di belakang
            //   User bisa langsung pakai chart sementara data terbaru dimuat
            // ═══════════════════════════════════════════════════════
            const latestBinTime = candles[candles.length - 1].time;
            const nowEpoch = Math.floor(Date.now() / 1000);
            const gapSec = nowEpoch - latestBinTime;
            const gapMin = Math.floor(gapSec / 60);

            if (gapSec > 60) {
                logInfo(`[BIN-GAP-BG] ${gapMin}m gap → background fill dari HL REST`);
                (async () => {
                    try {
                        let gapCandles;
                        if (gapMin > 4500) {
                            gapCandles = await fetchHistoryPaginated(CURRENT_SYMBOL, gapMin);
                        } else {
                            gapCandles = await fetchGapCandles(CURRENT_SYMBOL, latestBinTime);
                        }
                        if (gapCandles && gapCandles.length > 0) {
                            // 🔥 FIX: Set g_primaryBulkLoading=true supaya gap candle di-push dengan benar
                            if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(1);
                            isRendering = true;

                            // Sort gap candles oldest→newest (penting supaya KASUS 1 jalan)
                            gapCandles.sort((a, b) => a.time - b.time);

                            // Push gap candles ke WASM langsung (live-like)
                            for (const c of gapCandles) {
                                notifyWASM_candle(c.o, c.h, c.l, c.c, c.time, c.v || 1);
                                if (c.time > lastWasmTime) lastWasmTime = c.time;
                            }
                            if (Module._wasm_rebuild_all_htfs) Module._wasm_rebuild_all_htfs();

                            // 🔥 FIX: Force re-upload VBO supaya candle baru langsung render
                            if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();

                            // 🔥 FIX: Trigger GoToLive supaya chart auto-scroll ke candle terbaru
                            if (Module._wasm_trigger_goto_live) Module._wasm_trigger_goto_live();

                            // Clear primary loading flag
                            if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
                            isRendering = false;

                            // Save to IDB background
                            addToBuffer(CURRENT_SYMBOL, gapCandles);
                            await flushBuffer();
                            logGood(`[BIN-GAP-BG] ✅ +${gapCandles.length.toLocaleString()} gap candles pushed + saved`);
                        }
                    } catch(e) {
                        logWarn(`[BIN-GAP-BG] Gap fill error: ${e.message}`);
                        // 🔥 FIX: Clear flag kalau error (jangan biarkan stuck)
                        if (Module._wasm_set_primary_loading) Module._wasm_set_primary_loading(0);
                        isRendering = false;
                    }
                })();
            }

        } else {
            // ═══════════════════════════════════════════════════════
            // FALLBACK: Binary tidak ada (404) → fetch dari HL REST
            //   (alur lama, tetap pakai IDB karena data kecil)
            // ═══════════════════════════════════════════════════════
            logWarn(`[FALLBACK] Binary tidak tersedia → fetch ${PLATFORM.HISTORY_BARS} candles dari Hyperliquid REST`);
            candles = await fetchHistoryPaginated(CURRENT_SYMBOL, PLATFORM.HISTORY_BARS);
            if (candles && candles.length > 0) {
                // 🔥 OPTIMASI: Push langsung ke WASM, simpan IDB di background
                showLoadingOverlay(`Rendering ${CURRENT_SYMBOL}...`, 80);
                pushCandlesDirectToWASM(CURRENT_SYMBOL, candles);
                hideLoadingOverlay();
                saveToIDBBackground(CURRENT_SYMBOL, candles).then(() => {
                    logGood(`[FALLBACK] ✅ IDB background save selesai`);
                });
            } else {
                logErr(`[DOWNLOAD] Tidak ada data untuk ${CURRENT_SYMBOL}`);
                hideLoadingOverlay();
            }
        }

        isDownloading = false;
        g_initialLoadDone = true;

        const source = usedBinary ? 'TURBO binary + BG gap' : 'HL REST + BG save';
        logGood(`✅ ${CURRENT_SYMBOL} fully loaded! (source: ${source})`);

        if (pendingSymbolSwitch) {
            const next = pendingSymbolSwitch;
            pendingSymbolSwitch = null;
            setTimeout(() => window.SetActiveSymbol(next), 300);
        }
    }
};

// =========================================================
// 9. LAZY LOAD (scroll kiri = fetch lebih lama)
// =========================================================
const LAZY_CHUNK = PLATFORM.LAZY_CHUNK || 5000;
let g_lazyLoadInProgress = false;
let g_noMoreHistory      = new Set();

// Per-tab lazy state
const g_tabLazy      = new Map();
const g_tabSymbolMap = new Map();

function getTabLazy(tabId) {
    if (!g_tabLazy.has(tabId)) {
        g_tabLazy.set(tabId, { inProgress: false, noMoreHistory: false });
    }
    return g_tabLazy.get(tabId);
}

function resetTabLazy(tabId) {
    g_tabLazy.set(tabId, { inProgress: false, noMoreHistory: false });
}

window.onNearLeftEdge = async function(oldestTime) {
    if (g_lazyLoadInProgress) return;
    if (g_noMoreHistory.has(CURRENT_SYMBOL)) return;
    if (!g_initialLoadDone) {
        logInfo(`[LAZY] ${CURRENT_SYMBOL}: initial load belum selesai, skip`);
        return;
    }

    g_lazyLoadInProgress = true;
    logInfo(`[LAZY] ${CURRENT_SYMBOL} oldest: ${new Date(oldestTime * 1000).toISOString().slice(0,10)}`);

    // TAHAP 1: cek IDB dulu
    const older = await getOlderCandlesFromDB(CURRENT_SYMBOL, oldestTime, LAZY_CHUNK);
    if (older.length > 0) {
        logInfo(`[LAZY] IDB +${older.length} → rebuild`);
        if (Module._wasm_save_view_anchor) Module._wasm_save_view_anchor();
        if (Module._wasm_clear_chart) Module._wasm_clear_chart();
        await rebuildFullFromDB(CURRENT_SYMBOL);
        if (Module._wasm_restore_view_anchor) Module._wasm_restore_view_anchor();
        // 🔥 FIX v6: Force VBO refresh supaya candle hasil lazy load langsung render
        if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();
        logGood(`[LAZY] ✅ rebuilt from IDB (+${older.length})`);
        if (Module._wasm_set_lazy_load_done) Module._wasm_set_lazy_load_done();
        g_lazyLoadInProgress = false;
        return;
    }

    // TAHAP 2: IDB habis → fetch dari Hyperliquid REST
    logInfo(`[LAZY] IDB habis → fetch dari HL REST before=${new Date(oldestTime*1000).toISOString().slice(0,10)}`);
    if (window._spinnerShow) window._spinnerShow();

    const olderCandles = await fetchOlderCandles(CURRENT_SYMBOL, oldestTime, LAZY_CHUNK);

    if (!olderCandles.length) {
        logInfo('[LAZY] HL tidak punya data lebih lama');
        g_noMoreHistory.add(CURRENT_SYMBOL);
        getTabLazy(0).noMoreHistory = true;
        if (Module._wasm_set_tab_no_more_history)
            Module.ccall('wasm_set_tab_no_more_history', null, ['number'], [0]);
        if (Module._wasm_set_lazy_load_done) Module._wasm_set_lazy_load_done();
        g_lazyLoadInProgress = false;
        if (window._spinnerHide) window._spinnerHide();
        return;
    }

    logGood(`[LAZY] ✅ +${olderCandles.length} candles dari HL REST`);
    addToBuffer(CURRENT_SYMBOL, olderCandles);
    await flushBuffer();

    if (Module._wasm_save_view_anchor) Module._wasm_save_view_anchor();
    if (Module._wasm_clear_chart) Module._wasm_clear_chart();
    await rebuildFullFromDB(CURRENT_SYMBOL);
    if (Module._wasm_restore_view_anchor) Module._wasm_restore_view_anchor();
    // 🔥 FIX v6: Force VBO refresh supaya candle hasil lazy load langsung render
    if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();

    if (Module._wasm_set_lazy_load_done) Module._wasm_set_lazy_load_done();
    g_lazyLoadInProgress = false;
    if (window._spinnerHide) window._spinnerHide();
};

// Per-tab lazy load
window.onNearLeftEdgeTab = async function(tabId, oldestTime) {
    const state = getTabLazy(tabId);
    if (state.inProgress || state.noMoreHistory) return;
    state.inProgress = true;

    const symbol = g_tabSymbolMap.get(tabId);
    if (!symbol) {
        logWarn(`[LAZY TAB${tabId}] symbol unknown, skip`);
        state.inProgress = false;
        return;
    }

    const isPrimary = (tabId === 0);
    const tag = isPrimary ? '[LAZY]' : `[LAZY TAB${tabId}]`;
    logInfo(`${tag} ${symbol} oldest: ${new Date(oldestTime*1000).toISOString().slice(0,10)}`);

    // TAHAP 1: cek IDB dulu
    const older = await getOlderCandlesFromDB(symbol, oldestTime, LAZY_CHUNK);
    if (older.length > 0) {
        logInfo(`${tag} IDB +${older.length} → rebuild`);
        if (isPrimary) {
            if (Module._wasm_save_view_anchor) Module._wasm_save_view_anchor();
            if (Module._wasm_clear_chart) Module._wasm_clear_chart();
            await rebuildFullFromDB(symbol);
            if (Module._wasm_restore_view_anchor) Module._wasm_restore_view_anchor();
            // 🔥 FIX v6: Force VBO refresh (lazy load tab primary)
            if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();
            if (Module._wasm_set_lazy_load_done) Module._wasm_set_lazy_load_done();
        } else {
            if (Module._wasm_save_view_anchor_tab)
                Module.ccall('wasm_save_view_anchor_tab', null, ['number'], [tabId]);
            await rebuildTabFromDB(tabId, symbol);
            if (Module._wasm_restore_view_anchor_tab)
                Module.ccall('wasm_restore_view_anchor_tab', null, ['number'], [tabId]);
            // 🔥 FIX v6: Force VBO refresh (lazy load tab non-primary — ClearInstances di-tab itu saja)
            // Catatan: wasm_force_vbo_refresh cuma clear primary tabs. Untuk tab non-primary,
            // VBO akan di-update otomatis di next frame karena UpdateData() original selalu upload.
            if (Module._wasm_set_tab_lazy_done)
                Module.ccall('wasm_set_tab_lazy_done', null, ['number'], [tabId]);
        }
        state.inProgress = false;
        return;
    }

    // TAHAP 2: IDB habis → fetch dari HL REST
    logInfo(`${tag} IDB habis → fetch dari HL REST`);
    const olderCandles = await fetchOlderCandles(symbol, oldestTime, LAZY_CHUNK);

    if (!olderCandles.length) {
        logWarn(`${tag} HL tidak punya data lebih lama`);
        state.noMoreHistory = true;
        if (Module._wasm_set_tab_no_more_history)
            Module.ccall('wasm_set_tab_no_more_history', null, ['number'], [tabId]);
        state.inProgress = false;
        return;
    }

    addToBuffer(symbol, olderCandles);
    await flushBuffer();

    if (isPrimary) {
        if (Module._wasm_save_view_anchor) Module._wasm_save_view_anchor();
        if (Module._wasm_clear_chart) Module._wasm_clear_chart();
        await rebuildFullFromDB(symbol);
        if (Module._wasm_restore_view_anchor) Module._wasm_restore_view_anchor();
        // 🔥 FIX v6: Force VBO refresh (lazy load tab primary, dari HL REST)
        if (Module._wasm_force_vbo_refresh) Module._wasm_force_vbo_refresh();
        if (Module._wasm_set_lazy_load_done) Module._wasm_set_lazy_load_done();
    } else {
        if (Module._wasm_save_view_anchor_tab)
            Module.ccall('wasm_save_view_anchor_tab', null, ['number'], [tabId]);
        await rebuildTabFromDB(tabId, symbol);
        if (Module._wasm_restore_view_anchor_tab)
            Module.ccall('wasm_restore_view_anchor_tab', null, ['number'], [tabId]);
        if (Module._wasm_set_tab_lazy_done)
            Module.ccall('wasm_set_tab_lazy_done', null, ['number'], [tabId]);
    }
    state.inProgress = false;
};

// =========================================================
// 10. REPLAY SUPPORT
// =========================================================
window.reloadLiveAfterReplay = async function() {
    console.log('%c[RELOAD] Replay selesai — reload live dari IDB...', 'color:#00AAFF;font-weight:bold');

    if (!isWasmReady || !Module) {
        console.warn('[RELOAD] WASM belum ready, skip');
        return;
    }

    if (Module._wasm_clear_chart) {
        Module._wasm_clear_chart();
        console.log('[RELOAD] WASM cleared');
    }

    lastWasmTime = 0;

    if (Module._wasm_set_replay_mode) {
        Module._wasm_set_replay_mode(0);
        console.log('[RELOAD] Gate dibuka');
    }

    if (g_rebuildInProgress) {
        logWarn('[RELOAD] ⚠️ g_rebuildInProgress ON → force reset');
        g_rebuildInProgress = false;
    }

    await new Promise(r => requestAnimationFrame(r));

    showLoadingOverlay('Restoring live data...', 0);
    await rebuildFullFromDB(CURRENT_SYMBOL);
    hideLoadingOverlay();

    if (window.clearAllFP) {
        window.clearAllFP();
        console.log('[RELOAD] FP cache cleared');
    }

    // Smart guard: auto-reload FP jika sebelumnya aktif
    let needsFP = false;
    try {
        if (Module._wasm_get_active_renderstyle) {
            const style = Module._wasm_get_active_renderstyle();
            needsFP = (style >= 3 && style <= 5);
        }
        if (!needsFP && window._lastFPStyleActive) {
            needsFP = true;
        }
    } catch(e) {}

    if (needsFP && CURRENT_SYMBOL) {
        if (window.requestFootprint) {
            window.requestFootprint(CURRENT_SYMBOL, 500, 0);
        }
    }

    console.log('%c[RELOAD] ✅ Live restored!', 'color:#00FF88;font-weight:bold');
};

// =========================================================
// 11. LOAD TAB SYMBOL (multi-tab) — OPTIMIZED
//   - Gap fill di BACKGROUND (chart muncul dulu dari cache)
//   - Tidak ada double IDB read (hemat 50-200ms)
// =========================================================
window.LoadTabSymbol = async function(tabId, symbol) {
    g_tabSymbolMap.set(tabId, symbol);
    resetTabLazy(tabId);
    logInfo(`[TAB${tabId}] LoadTabSymbol: ${symbol}`);

    const MIN     = 100;
    const candles = await getAllCandlesFromDB(symbol);

    if (candles.length >= MIN) {
        candles.sort((a, b) => a.time - b.time);
        logGood(`[TAB${tabId}] IDB hit: ${candles.length} bars → push langsung`);

        // 🔥 OPTIMASI: Push langsung dari memori, TIDAK baca IDB ulang
        if (Module._wasm_push_candle_for_tab) {
            if (Module._wasm_clear_tab) {
                Module._wasm_clear_tab(tabId);
            }
            for (const c of candles) {
                Module.ccall('wasm_push_candle_for_tab', null,
                    ['number','number','number','number','number','number','number'],
                    [tabId, c.o, c.h, c.l, c.c, c.time, c.v || 1]);
            }
            logGood(`[TAB${tabId}] ${candles.length} M1 candles pushed`);
            if (Module._wasm_rebuild_htfs_for_tab) Module._wasm_rebuild_htfs_for_tab(tabId);
            logGood(`[TAB${tabId}] ${symbol} siap!`);
        }

        // 🔥 OPTIMASI: Gap fill di BACKGROUND — chart sudah muncul
        const latestTime = candles.reduce((max, c) => c.time > max ? c.time : max, 0);
        const nowEpoch   = Math.floor(Date.now() / 1000);
        const gapSeconds = nowEpoch - latestTime;

        if (gapSeconds > 30) {
            const gapMinutes = Math.floor(gapSeconds / 60);
            logWarn(`[TAB${tabId}-GAP-BG] ${gapMinutes}m gap → background fill`);
            (async () => {
                try {
                    const gapCandles = await fetchGapCandles(symbol, latestTime);
                    if (gapCandles.length > 0) {
                        // Push gap candles langsung ke tab
                        for (const c of gapCandles) {
                            if (Module._wasm_push_candle_for_tab) {
                                Module.ccall('wasm_push_candle_for_tab', null,
                                    ['number','number','number','number','number','number','number'],
                                    [tabId, c.o, c.h, c.l, c.c, c.time, c.v || 1]);
                            }
                        }
                        if (Module._wasm_rebuild_htfs_for_tab) Module._wasm_rebuild_htfs_for_tab(tabId);
                        // Save to IDB
                        addToBuffer(symbol, gapCandles);
                        await flushBuffer();
                        logGood(`[TAB${tabId}-GAP-BG] ✅ +${gapCandles.length} gap candles pushed + saved`);
                    }
                } catch(e) {
                    logWarn(`[TAB${tabId}-GAP-BG] Gap fill error: ${e.message}`);
                }
            })();
        }

    } else {
        // IDB kosong → download fresh dari HL REST
        logWarn(`[TAB${tabId}] IDB kosong untuk ${symbol} → download fresh`);
        const dlCandles = await fetchHistoryPaginated(symbol, PLATFORM.HISTORY_BARS);
        if (dlCandles.length > 0) {
            addToBuffer(symbol, dlCandles);
            await flushBuffer();
            await rebuildTabFromDB(tabId, symbol);
        }
    }
};

// =========================================================
// 12. STARTUP
// =========================================================
var Module = Module || {};

Module.onRuntimeInitialized = async function() {
    logGood('[WASM] 🚀 RUNTIME INITIALIZED!');
    isWasmReady = true;

    ['status','spinner','progress'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // GUEST MODE
    const gateway = document.getElementById('login-gateway');
    if (gateway) gateway.style.display = 'none';
    const cv = document.getElementById('canvas');
    if (cv) { cv.style.opacity = '1'; cv.focus(); }
    if (Module._wasm_on_login_success) Module._wasm_on_login_success();

    await initIndexedDB();

    const MIN = 500;
    // Scan IDB untuk mengetahui symbol yang sudah pernah di-cache
    const allKeys = await getAllSymbolsInDB();
    for (const sym of allKeys) {
        downloadedSymbols.add(sym);
        try {
            const candles = await getAllCandlesFromDB(sym);
            if (candles.length > 0) {
                const oldest    = candles.reduce((min, c) => c.time < min ? c.time : min, candles[0].time);
                const latest    = candles.reduce((max, c) => c.time > max ? c.time : max, 0);
                const gapSec    = Math.floor(Date.now()/1000) - latest;
                const gapMin    = Math.floor(gapSec / 60);
                const oldestStr = new Date(oldest * 1000).toISOString().slice(0,16).replace('T',' ');
                const latestStr = new Date(latest * 1000).toISOString().slice(0,16).replace('T',' ');
                if (gapMin > 1) {
                    logWarn(`[STARTUP] ${sym}: ${candles.length} candles | ${oldestStr} ~ ${latestStr} | gap: ~${gapMin}m ⚠️`);
                } else {
                    logGood(`[STARTUP] ${sym}: ${candles.length} candles | ${oldestStr} ~ ${latestStr} | gap: fresh ✅`);
                }
            }
        } catch(e) {
            logInfo(`[STARTUP] ${sym}: IDB ✓ (scan error)`);
        }
    }

    // Connect ke Hyperliquid WebSocket (untuk live data Crypto)
    connectHLWebSocket();
    
    // Connect ke Binance WebSocket (untuk live data Forex/Gold)
    connectBinanceWebSocket();
    
    // Connect ke Finnhub WebSocket (untuk live data Forex — legacy, kalau ada API key)
    connectFinnhubWebSocket();

    // ─────────────────────────────────────────────────────────────────
    // 🔄 SYNC SYMBOL DARI C++ (single source of truth)
    //
    // BUG LAMA (sudah fix):
    //   Sebelumnya WebSocket baca localStorage "MyTradingApp_ChartState"
    //   untuk dapat symbol terakhir. Tapi kadang race condition dengan
    //   C++ → CURRENT_SYMBOL tetap kosong → chart tampil label saja,
    //   tanpa history & tanpa subscribe HL WS live. Baru lengkap kalau
    //   user pindah simbol via picker (SetActiveSymbol ter-trigger).
    //
    // FIX:
    //   Ambil langsung dari C++ via wasm_nav_get_symbol(). C++ sudah
    //   LoadWebLayout() di main() dan set g_symbol sebelum JS init.
    //   Setelah dapat symbol → panggil SetActiveSymbol penuh, yg akan
    //   handle:
    //     1. Clear chart di C++ (Module._wasm_clear_chart)
    //     2. Load history dari IDB (rebuildFullFromDB) atau download fresh
    //     3. Gap fill dari HL REST (kalau IDB ada gap)
    //     4. Subscribe HL WebSocket live stream (subscribeCandleStream)
    //   → chart lengkap: history + live. Sama seperti user pindah via picker.
    // ─────────────────────────────────────────────────────────────────
    let initialSym = "";

    // 1. Prioritas: ambil dari C++ (paling akurat — sesuai chart C++)
    try {
        if (Module._wasm_nav_get_symbol) {
            const symFromCpp = Module.ccall(
                'wasm_nav_get_symbol', 'string', [], []
            );
            if (symFromCpp && symFromCpp.trim().length > 0) {
                initialSym = symFromCpp.trim();
                logGood(`[STARTUP] Symbol aktif dari C++: ${initialSym}`);
            }
        } else {
            logWarn(`[STARTUP] wasm_nav_get_symbol tidak tersedia di Module`);
        }
    } catch(e) {
        logWarn(`[STARTUP] Gagal ambil symbol dari C++: ${e.message}`);
    }

    // 2. Fallback: baca dari localStorage (kalau C++ belum set / bridge gagal)
    if (!initialSym) {
        try {
            const savedState = localStorage.getItem("MyTradingApp_ChartState");
            if (savedState) {
                const j = JSON.parse(savedState);
                if (j.symbol && j.symbol.trim().length > 0) {
                    initialSym = j.symbol.trim();
                    logInfo(`[STARTUP] Symbol dari localStorage (fallback): ${initialSym}`);
                }
            }
        } catch(e) {
            logWarn(`[STARTUP] localStorage parse error: ${e.message}`);
        }
    }

    // 3. Auto-load via SetActiveSymbol — handle history + gap fill + live
    //
    //    PENTING: JANGAN set CURRENT_SYMBOL dulu sebelum panggil SetActiveSymbol!
    //    SetActiveSymbol punya early-return guard:
    //        if (CURRENT_SYMBOL && CURRENT_SYMBOL === newSym) return;
    //    Kalau CURRENT_SYMBOL sudah di-set == newSym, guard akan return early
    //    dan chart gak ke-load. Biarkan SetActiveSymbol yg set CURRENT_SYMBOL
    //    di dalamnya (line 1095).
    //
    //    Race condition dgn connectHLWebSocket() di atas aman:
    //    - Kalau HL WS sudah open → SetActiveSymbol panggil subscribeCandleStream
    //      langsung (line 1118).
    //    - Kalau HL WS belum open → onopen trigger nanti, cek CURRENT_SYMBOL
    //      (sudah di-set oleh SetActiveSymbol), lalu subscribe (line 768-770).
    if (initialSym) {
        logInfo(`[STARTUP] Auto-load ${initialSym} via SetActiveSymbol...`);
        await window.SetActiveSymbol(initialSym);
        logGood(`[STARTUP] ✅ ${initialSym} ready (history + live subscribed)`);
    } else {
        // Tidak ada simbol tersimpan → user pertama kali → tampilkan picker
        logInfo("[STARTUP] Menunggu user pilih symbol dari picker...");
        hideLoadingOverlay();
    }

};

window.addEventListener('beforeunload', () => flushBuffer());
setInterval(() => { if (candleBuffer.length > 0) flushBuffer(); }, 10000);

console.log("%c[WS] V18 Serverless Engine ready ✅", "color:#00FFAA;font-weight:bold");
