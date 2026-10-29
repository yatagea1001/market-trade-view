// =============================================================
//  Market Trade View — Service Worker (v1)
//  Tujuan: HTTP-level cache untuk eliminasi network saat reload page
//          (.bin files + static assets cached di browser)
// =============================================================
//
//  STRATEGI CACHE:
//    1. data/*.bin (binary candle chunks) → CACHE-FIRST
//       (file gak pernah berubah kecuali user regenerate via export_candles_binary.py)
//    2. data/*_index.json → STALE-WHILE-REVALIDATE
//       (index bisa update kalau ada part baru — kasih yang lama dulu, update di bg)
//    3. Static assets (.js, .css, .html, .wasm, fonts) → CACHE-FIRST
//    4. External API (hyperliquid, binance, finnhub) → NETWORK-ONLY
//       (jangan cache — real-time data)
//    5. Navigation (HTML utama) → NETWORK-FIRST
//       (supaya update HTML cepat terlihat, fallback ke cache kalau offline)
//
//  CARA INVALIDATE CACHE:
//    Kalau kamu update .bin / .js, ganti CACHE_VERSION di bawah dari "v1" → "v2".
//    Service Worker akan purge semua cache lama otomatis saat activate.
// =============================================================

const CACHE_VERSION   = 'mtv-cache-v1';
// 🔥 STATIC bump v2 → v3 (V28 LAZY VIEW ANCHOR update):
//    - dist/index.js + index.wasm: rebuild C++ (TF-aware time anchor saat
//      prepend lazy load + g_forceXAxisUpdate paksa ImPlot re-apply X limits
//      → view TIDAK loncat/mengikuti candle tua saat lazy load).
//    Bump HANYA static — binary/index/nav tetap v1 (file .bin tidak berubah,
//    tidak perlu re-download). Activate akan purge 'mtv-cache-v2-static' otomatis.
const STATIC_CACHE    = `mtv-cache-v3-static`;
const BINARY_CACHE    = `${CACHE_VERSION}-binary`;
const INDEX_CACHE     = `${CACHE_VERSION}-index`;
const NAV_CACHE       = `${CACHE_VERSION}-nav`;

// Daftar URL static yang harus di-precache saat SW install (kosong = lazy cache)
// Tidak precache .bin krn besar (~40MB total), biarkan cache on-demand
const PRECACHE_URLS = [
    './',
    './app.html',
    './index.html',
    './web/config.js',
    './web/websocket.js'
];

// Pattern URL yang GAK boleh di-cache (real-time API)
const NETWORK_ONLY_PATTERNS = [
    'api.hyperliquid.xyz',
    'fapi.binance.com',
    'fstream.binance.com',
    'api.binance.com',
    'finnhub.io',
    'api.frankfurter.app',
    'api.twelvedata.com',
    'localhost:8765'  // VPS Python server (real-time)
];

// =============================================================
//  INSTALL — precache file static penting
// =============================================================
self.addEventListener('install', (event) => {
    console.log('[SW] 🔧 Installing Service Worker v1...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] 📦 Precaching static files...');
                // Pakai addAll tapi ignore error individual (kalau ada file gak ada)
                return Promise.allSettled(
                    PRECACHE_URLS.map(url =>
                        cache.add(url).catch(e =>
                            console.warn(`[SW] ⚠️ Precache skip: ${url} (${e.message})`)
                        )
                    )
                );
            })
            .then(() => self.skipWaiting())  // aktifkan SW baru langsung
    );
});

// =============================================================
//  ACTIVATE — cleanup cache versi lama + klaim clients
// =============================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] ✅ Activating Service Worker v1...');
    const allowedCaches = [STATIC_CACHE, BINARY_CACHE, INDEX_CACHE, NAV_CACHE];

    event.waitUntil(
        caches.keys()
            .then(keys => {
                return Promise.all(
                    keys.map(key => {
                        if (!allowedCaches.includes(key)) {
                            console.log(`[SW] 🗑️ Purging old cache: ${key}`);
                            return caches.delete(key);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())  // ambil kontrol semua tab langsung
    );
});

// =============================================================
//  FETCH — strategi caching berdasarkan URL pattern
// =============================================================
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Hanya handle GET (POST/PUT/etc skip)
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // ── 1. NETWORK-ONLY: API real-time (HL, Binance, Finnhub) ──────
    if (NETWORK_ONLY_PATTERNS.some(p => url.hostname.includes(p))) {
        return;  // biarkan browser handle biasa, jangan cache
    }

    // ── 2. NAVIGATION (HTML utama) → network-first ─────────────────
    if (req.mode === 'navigate') {
        event.respondWith(networkFirst(req, NAV_CACHE));
        return;
    }

    // ── 3. BINARY .bin files → cache-first (paling sering dipakai ulang) ──
    if (url.pathname.endsWith('.bin')) {
        event.respondWith(cacheFirst(req, BINARY_CACHE));
        return;
    }

    // ── 4. _index.json → stale-while-revalidate ────────────────────
    if (url.pathname.endsWith('_index.json')) {
        event.respondWith(staleWhileRevalidate(req, INDEX_CACHE));
        return;
    }

    // ── 5. Static assets (js, css, wasm, fonts, png) → cache-first ─
    if (/\.(js|css|wasm|woff2?|ttf|png|jpg|jpeg|svg|ico)$/i.test(url.pathname)) {
        event.respondWith(cacheFirst(req, STATIC_CACHE));
        return;
    }

    // ── 6. Default: network-first ──────────────────────────────────
    event.respondWith(networkFirst(req, STATIC_CACHE));
});

// =============================================================
//  CACHE STRATEGIES
// =============================================================

/**
 * Cache-First: cek cache dulu. Kalau ada → return cache (instant).
 * Kalau gak ada → fetch network, simpan ke cache, return.
 * Cocok untuk: .bin files, static assets yang gak berubah.
 */
async function cacheFirst(req, cacheName) {
    const cached = await caches.match(req);
    if (cached) {
        return cached;
    }
    try {
        const resp = await fetch(req);
        if (resp.ok && resp.type === 'basic') {
            const cache = await caches.open(cacheName);
            cache.put(req, resp.clone());
        }
        return resp;
    } catch (e) {
        // Offline & gak ada cache → return error response
        return new Response('Offline and not cached', { status: 503, statusText: 'Service Unavailable' });
    }
}

/**
 * Stale-While-Revalidate: return cache langsung (instant), TAPI
 * fetch network di background & update cache untuk request berikutnya.
 * Cocok untuk: _index.json yang kadang update (ada part baru).
 */
async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);

    const fetchPromise = fetch(req).then(resp => {
        if (resp.ok && resp.type === 'basic') {
            cache.put(req, resp.clone());
        }
        return resp;
    }).catch(() => cached);  // kalau offline, fallback ke cache

    return cached || fetchPromise;
}

/**
 * Network-First: coba network dulu (supaya dapat versi terbaru).
 * Kalau gagal (offline) → fallback ke cache.
 * Cocok untuk: HTML utama (supaya update cepat terlihat).
 */
async function networkFirst(req, cacheName) {
    try {
        const resp = await fetch(req);
        if (resp.ok && resp.type === 'basic') {
            const cache = await caches.open(cacheName);
            cache.put(req, resp.clone());
        }
        return resp;
    } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

// =============================================================
//  MESSAGE — handle pesan dari page (untuk invalidate cache manual)
// =============================================================
self.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (msg?.type === 'PURGE_ALL_CACHE') {
        console.log('[SW] 🗑️ Manual purge all cache...');
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => {
            event.source?.postMessage({ type: 'PURGE_DONE' });
        });
    }
    if (msg?.type === 'PURGE_BINARY_CACHE') {
        console.log('[SW] 🗑️ Purge binary cache only...');
        caches.delete(BINARY_CACHE).then(() => {
            event.source?.postMessage({ type: 'PURGE_DONE' });
        });
    }
});

// =============================================================
//  LOG SAAT SW SIAP
// =============================================================
console.log('[SW] 🚀 Service Worker v1 loaded. Cache strategies active.');
