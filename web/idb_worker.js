// ════════════════════════════════════════════════════════════════
// 🚀 IDB Worker — Background IndexedDB writer (anti FPS drop)
//
// Konsep:
//   Main thread (WASM render loop) kirim candle ke Worker via postMessage
//   Worker save ke IDB di background (gak block main thread)
//   Result: 60fps stabil, gak drop saat IDB write
// ════════════════════════════════════════════════════════════════

const DB_NAME = 'MarketTradeDB';
const STORE = 'candles';
const CHUNK_SIZE = 5000;

let db = null;

// Buka IDB connection di worker (worker punya akses IDB sendiri)
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: ['symbol', 'time'] });
                store.createIndex('symbol', 'symbol', { unique: false });
                store.createIndex('time', 'time', { unique: false });
            }
        };
    });
}

async function saveChunked(symbol, candles) {
    if (!db) db = await openDB();
    if (!db) return 0;

    const totalChunks = Math.ceil(candles.length / CHUNK_SIZE);
    let savedCount = 0;

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        const start = chunkIdx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, candles.length);
        const chunk = candles.slice(start, end);

        // Prepare data
        const data = chunk.map(c => ({
            symbol,
            time: c.time,
            o: c.o, h: c.h, l: c.l, c: c.c,
            v: c.v || 1
        }));

        // Single transaction per chunk
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction([STORE], 'readwrite');
                const store = tx.objectStore(STORE);
                for (const item of data) {
                    store.put(item);
                }
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            savedCount += chunk.length;

            // Report progress ke main thread (optional, untuk debug)
            if ((chunkIdx + 1) % 5 === 0 || chunkIdx === totalChunks - 1) {
                self.postMessage({
                    type: 'progress',
                    symbol,
                    saved: savedCount,
                    total: candles.length,
                    chunk: chunkIdx + 1,
                    totalChunks
                });
            }
        } catch (e) {
            self.postMessage({
                type: 'error',
                symbol,
                error: `Chunk ${chunkIdx + 1}/${totalChunks} error: ${e.message}`,
                savedCount
            });
            // Continue ke chunk berikutnya (gak fatal)
        }
    }

    return savedCount;
}

// Listen for messages dari main thread
self.onmessage = async function(e) {
    const { type, symbol, candles } = e.data;

    if (type === 'save') {
        try {
            const saved = await saveChunked(symbol, candles);
            self.postMessage({
                type: 'done',
                symbol,
                saved,
                total: candles.length
            });
        } catch (err) {
            self.postMessage({
                type: 'error',
                symbol,
                error: err.message,
                savedCount: 0
            });
        }
    } else if (type === 'init') {
        // Pre-open DB supaya siap pakai
        try {
            db = await openDB();
            self.postMessage({ type: 'ready' });
        } catch (e) {
            self.postMessage({ type: 'error', error: `Init error: ${e.message}` });
        }
    }
};

console.log('[IDB Worker] Background writer ready');
