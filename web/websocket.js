console.log("%c[JS] V18 — SERVERLESS (Direct Hyperliquid API)", "color: #00FFAA; font-weight:bold; background: #0B0E11; padding: 4px;");

// ═══════════════════════════════════════════════════════════════
// websocket.js V18 — 100% SERVERLESS (GitHub Pages Compatible)
//
// ARSITEKTUR:
//   - TIDAK ADA server localhost
//   - Data candle langsung dari Hyperliquid REST + WebSocket
//   - Cache di IndexedDB browser per user
//   - Bisa jalan 100% di GitHub Pages
//
// DATA FLOW:
//   Startup   → cek IDB → gap fill dari HL REST → render chart
//   Fresh     → fetch 5000 bar dari HL REST → simpan IDB → render
//   Live      → HL WebSocket candle stream → push WASM + simpan IDB
//   Lazy Load → scroll kiri → fetch older dari HL REST → simpan IDB
//   MarketWatch → HL WebSocket allMids → update harga semua pair
//
// CHANGELOG V18 (dari V17):
//   1. HAPUS semua koneksi ke ws://127.0.0.1:8765
//   2. HAPUS wsSend(), connectWS(), semua server message handlers
//   3. TAMBAH fetchCandlesFromHL() — REST API historical candles
//   4. TAMBAH connectHLWebSocket() — live candle + allMids stream
//   5. SetActiveSymbol → pakai fetch() langsung (bukan wsSend)
//   6. onNearLeftEdge → pakai fetch() langsung (bukan wsSend)
//   7. Gap fill → pakai fetch() langsung (synchronous await)
//   8. HAPUS semua async request/response tracking:
//      g_prefillResolve, g_tabPrefillResolvers, g_pendingTabGap,
//      g_pendingTabLazy, g_tabDownloadBuf, g_wsSendQueue
//   9. Symbol mapping via PLATFORM.SYMBOL_MAP (config.js)
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
            <div style="text-align:center">
              <div id="ov-msg"  style="font-size:18px;font-weight:bold;margin-bottom:20px">Loading...</div>
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
    const BATCH = 500;
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
            await new Promise(r => requestAnimationFrame(r));
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

/**
 * Fetch candle history dari Hyperliquid REST API
 * @param {string} uiSymbol - nama UI (misal "BTCUSDT")
 * @param {number} startMs  - Unix timestamp milliseconds (inclusive)
 * @param {number} endMs    - Unix timestamp milliseconds (inclusive)
 * @returns {Array} candles dalam format {time, o, h, l, c, v}
 */
async function fetchCandlesFromHL(uiSymbol, startMs, endMs) {
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
// 8. SWITCH PAIR (SetActiveSymbol)
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

    await new Promise(r => setTimeout(r, 16));

    // Subscribe ke HL WS untuk symbol baru
    subscribeCandleStream(newSym);

    // Cek IDB cache
    const existing = await getAllCandlesFromDB(CURRENT_SYMBOL);
    const MIN = 500;

    if (existing.length >= MIN) {
        logGood(`[CACHE HIT] ${CURRENT_SYMBOL}: ${existing.length} bars`);

        // Gap fill langsung via fetch (bukan wsSend!)
        const latestTime = existing.reduce((max, c) => c.time > max ? c.time : max, 0);
        const nowEpoch   = Math.floor(Date.now() / 1000);
        const gapSeconds = nowEpoch - latestTime;
        const gapMinutes = Math.floor(gapSeconds / 60);

        if (gapSeconds > 30) {
            logWarn(`[GAP] ${gapMinutes}m gap → fetch dari HL REST`);
            showLoadingOverlay(`Syncing ${CURRENT_SYMBOL} (${gapMinutes}m gap)...`, 0);

            const gapCandles = await fetchGapCandles(CURRENT_SYMBOL, latestTime);
            if (gapCandles.length > 0) {
                addToBuffer(CURRENT_SYMBOL, gapCandles);
                await flushBuffer();
                logGood(`[GAP] ✅ +${gapCandles.length} candles saved to IDB`);
            }
        } else {
            logInfo(`[GAP] IDB fresh (gap ${gapSeconds}s) → langsung render`);
        }

        showLoadingOverlay(`Loading ${CURRENT_SYMBOL} from cache`, 0);
        await rebuildFullFromDB(CURRENT_SYMBOL);
        hideLoadingOverlay();

        g_initialLoadDone = true;
        logInfo(`[INIT] Initial load selesai — lazy diizinkan`);

    } else {
        // CACHE MISS atau incomplete → download fresh dari HL REST
        logWarn(`[CACHE MISS] ${CURRENT_SYMBOL} → download dari Hyperliquid`);
        showLoadingOverlay(`Downloading ${CURRENT_SYMBOL} history`, 0);
        isDownloading = true;

        const candles = await fetchHistoryPaginated(CURRENT_SYMBOL, PLATFORM.HISTORY_BARS);

        if (candles.length > 0) {
            updateProgress(candles.length, candles.length, "Saving");
            addToBuffer(CURRENT_SYMBOL, candles);
            await flushBuffer();
            await rebuildFullFromDB(CURRENT_SYMBOL);
        } else {
            logErr(`[DOWNLOAD] Tidak ada data dari Hyperliquid untuk ${CURRENT_SYMBOL}`);
        }

        hideLoadingOverlay();
        isDownloading = false;
        g_initialLoadDone = true;

        logGood(`✅ ${CURRENT_SYMBOL} fully loaded!`);

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
// 11. LOAD TAB SYMBOL (multi-tab)
// =========================================================
window.LoadTabSymbol = async function(tabId, symbol) {
    g_tabSymbolMap.set(tabId, symbol);
    resetTabLazy(tabId);
    logInfo(`[TAB${tabId}] LoadTabSymbol: ${symbol}`);

    const MIN     = 100;
    const candles = await getAllCandlesFromDB(symbol);

    if (candles.length >= MIN) {
        candles.sort((a, b) => a.time - b.time);

        // Gap fill via fetch langsung
        const latestTime = candles.reduce((max, c) => c.time > max ? c.time : max, 0);
        const nowEpoch   = Math.floor(Date.now() / 1000);
        const gapSeconds = nowEpoch - latestTime;

        if (gapSeconds > 30) {
            const gapMinutes = Math.floor(gapSeconds / 60);
            logWarn(`[TAB${tabId}-GAP] ${gapMinutes}m gap → fetch dari HL REST`);
            const gapCandles = await fetchGapCandles(symbol, latestTime);
            if (gapCandles.length > 0) {
                addToBuffer(symbol, gapCandles);
                await flushBuffer();
                logGood(`[TAB${tabId}-GAP] ✅ +${gapCandles.length} candles`);
            }
        }

        // Reload fresh dari IDB (termasuk gap candles)
        const freshCandles = await getAllCandlesFromDB(symbol);
        freshCandles.sort((a, b) => a.time - b.time);
        logGood(`[TAB${tabId}] IDB hit: ${freshCandles.length} bars -> render`);

        if (Module._wasm_push_candle_for_tab) {
            if (Module._wasm_clear_tab) {
                Module._wasm_clear_tab(tabId);
            }
            for (const c of freshCandles) {
                Module.ccall('wasm_push_candle_for_tab', null,
                    ['number','number','number','number','number','number','number'],
                    [tabId, c.o, c.h, c.l, c.c, c.time, c.v || 1]);
            }
            logGood(`[TAB${tabId}] ${freshCandles.length} M1 candles pushed`);
            if (Module._wasm_rebuild_htfs_for_tab) Module._wasm_rebuild_htfs_for_tab(tabId);
            logGood(`[TAB${tabId}] ${symbol} siap!`);
        }

    } else {
        // IDB kosong → download fresh dari HL REST
        logWarn(`[TAB${tabId}] IDB kosong untuk ${symbol} → download fresh`);
        const candles = await fetchHistoryPaginated(symbol, PLATFORM.HISTORY_BARS);
        if (candles.length > 0) {
            addToBuffer(symbol, candles);
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

    // Connect ke Hyperliquid WebSocket (untuk live data)
    connectHLWebSocket();

    // Auto-load CURRENT_SYMBOL jika sudah di-set oleh picker C++
    if (CURRENT_SYMBOL) {
        const existing = await getAllCandlesFromDB(CURRENT_SYMBOL);
        if (existing.length >= MIN) {
            // Gap fill
            const latestTime = existing.reduce((max, c) => c.time > max ? c.time : max, 0);
            const gapSeconds = Math.floor(Date.now()/1000) - latestTime;
            if (gapSeconds > 30) {
                const gapMinutes = Math.floor(gapSeconds / 60);
                logWarn(`[STARTUP-GAP] ${gapMinutes}m gap → fetch dari HL REST`);
                showLoadingOverlay(`Syncing ${CURRENT_SYMBOL} (${gapMinutes}m gap)...`, 0);
                const gapCandles = await fetchGapCandles(CURRENT_SYMBOL, latestTime);
                if (gapCandles.length > 0) {
                    addToBuffer(CURRENT_SYMBOL, gapCandles);
                    await flushBuffer();
                }
                logGood(`[STARTUP-GAP] ✅ IDB lengkap → render`);
            }
            showLoadingOverlay(`Loading ${CURRENT_SYMBOL}`, 0);
            await rebuildFullFromDB(CURRENT_SYMBOL);
            hideLoadingOverlay();
        }
    } else {
        logInfo("[STARTUP] Menunggu user pilih symbol dari picker...");
        hideLoadingOverlay();
    }
};

window.addEventListener('beforeunload', () => flushBuffer());
setInterval(() => { if (candleBuffer.length > 0) flushBuffer(); }, 10000);

console.log("%c[WS] V18 Serverless Engine ready ✅", "color:#00FFAA;font-weight:bold");
