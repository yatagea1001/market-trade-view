// ════════════════════════════════════════════════════════════════
// 🧠 CUSTOM SCRIPT ENGINE (JS) — User-defined indicators via JavaScript
//
//  Cara kerja:
//    1. User ketik code JS di editor ImGui (C++ side)
//    2. Klik "Run JS" → C++ kirim code string via EM_ASM
//    3. JS eval() code dalam sandbox → register sebagai function
//    4. Setiap frame, C++ panggil execute() → JS run logic + draw via WASM APIs
//    5. Code berubah? Klik "Run JS" lagi → eval() baru → langsung jalan!
//    6. TANPA RELOAD BROWSER — eval() jalan runtime
//
//  WASM APIs yang dipakai (di-expose dari C++):
//    Module._wasm_cs_get_candles()       → return pointer ke Float64Array (6 doubles per candle)
//    Module._wasm_cs_get_candle_count()  → return jumlah candle
//    Module._wasm_cs_get_view_offset()   → return global_offset (visible buffer start)
//    Module._wasm_cs_get_buffer_count()  → return buffer count (visible candles)
//    Module._wasm_cs_draw_line(i1,p1,i2,p2,r,g,b,a,w)  → queue line
//    Module._wasm_cs_draw_arrow(i,p,dir,r,g,b,a,size)  → queue arrow
//    Module._wasm_cs_draw_label(i,p,text,r,g,b,a)     → queue text label
//    Module._wasm_cs_clear_buffer()      → clear render buffer (per frame)
//    Module._wasm_cs_render_buffer()     → execute queued commands → render ke chart
//
//  Cara pakai dari C++:
//    EM_ASM({ window.CustomScriptEngine.eval($0); }, codeString.c_str());
//    EM_ASM({ window.CustomScriptEngine.execute(); });
// ════════════════════════════════════════════════════════════════

window.CustomScriptEngine = (function() {
    'use strict';

    let userFunction = null;  // function hasil eval() user code
    let enabled = false;
    let lastError = null;
    let stats = { runs: 0, drawCommands: 0, lastExecMs: 0 };

    // ── Color helper ──────────────────────────────────────
    function parseColor(name) {
        const colors = {
            blue:   [0.2, 0.5, 1.0],
            red:    [1.0, 0.25, 0.25],
            green:  [0.2, 0.9, 0.4],
            yellow: [1.0, 0.9, 0.2],
            orange: [0.95, 0.55, 0.15],
            purple: [0.65, 0.35, 0.85],
            white:  [1.0, 1.0, 1.0],
            gray:   [0.6, 0.6, 0.6],
            cyan:   [0.2, 0.9, 0.9],
            magenta:[0.9, 0.2, 0.9],
            lime:   [0.3, 0.85, 0.25],
            pink:   [1.0, 0.4, 0.7]
        };
        return colors[name] || colors.blue;
    }

    // ── Technical Analysis helpers ───────────────────────
    function sma(values, period) {
        const result = new Array(values.length).fill(NaN);
        let sum = 0, count = 0;
        for (let i = 0; i < values.length; i++) {
            if (!isNaN(values[i])) { sum += values[i]; count++; }
            if (i >= period) {
                if (!isNaN(values[i - period])) { sum -= values[i - period]; count--; }
            }
            if (count >= period) result[i] = sum / period;
        }
        return result;
    }

    function ema(values, period) {
        const result = new Array(values.length).fill(NaN);
        const k = 2 / (period + 1);
        let prev = NaN;
        for (let i = 0; i < values.length; i++) {
            if (isNaN(values[i])) continue;
            if (isNaN(prev)) prev = values[i];
            else prev = values[i] * k + prev * (1 - k);
            result[i] = prev;
        }
        return result;
    }

    function rsi(values, period) {
        const result = new Array(values.length).fill(NaN);
        if (values.length < 2) return result;
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i < values.length; i++) {
            const change = values[i] - values[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;
            if (i <= period) {
                avgGain += gain / period;
                avgLoss += loss / period;
                if (i === period) {
                    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
                }
            } else {
                avgGain = (avgGain * (period - 1) + gain) / period;
                avgLoss = (avgLoss * (period - 1) + loss) / period;
                result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
            }
        }
        return result;
    }

    function crossUp(a, b) {
        const result = new Array(a.length).fill(0);
        for (let i = 1; i < a.length; i++) {
            if (!isNaN(a[i-1]) && !isNaN(a[i]) && !isNaN(b[i-1]) && !isNaN(b[i])) {
                if (a[i-1] <= b[i-1] && a[i] > b[i]) result[i] = 1;
            }
        }
        return result;
    }

    function crossDown(a, b) {
        const result = new Array(a.length).fill(0);
        for (let i = 1; i < a.length; i++) {
            if (!isNaN(a[i-1]) && !isNaN(a[i]) && !isNaN(b[i-1]) && !isNaN(b[i])) {
                if (a[i-1] >= b[i-1] && a[i] < b[i]) result[i] = 1;
            }
        }
        return result;
    }

    // ── Drawing helpers (call WASM APIs) ──────────────────
    function plot(values, colorName, width) {
        const [r, g, b] = parseColor(colorName);
        const w = width || 2.0;
        let drawCount = 0;
        for (let i = 1; i < values.length; i++) {
            if (isNaN(values[i]) || isNaN(values[i - 1])) continue;
            Module._wasm_cs_draw_line(i - 1, values[i - 1], i, values[i],
                r, g, b, 1.0, w);
            drawCount++;
        }
        stats.drawCommands += drawCount;
    }

    function arrow(idx, price, dir, colorName) {
        const [r, g, b] = parseColor(colorName);
        const d = dir === 'buy' || dir === 'up' ? 1 : -1;
        Module._wasm_cs_draw_arrow(idx, price, d, r, g, b, 1.0, 7.0);
        stats.drawCommands++;
    }

    function label(idx, price, text, colorName) {
        const [r, g, b] = parseColor(colorName);
        // Text di-encode ke UTF8 buffer
        const len = lengthBytesUTF8(text) + 1;
        const ptr = Module._malloc(len);
        stringToUTF8(text, ptr, len);
        Module._wasm_cs_draw_label(idx, price, ptr, r, g, b, 1.0);
        Module._free(ptr);
    }

    // ── Get candle data dari WASM ─────────────────────────
    function getCandles() {
        const ptr = Module._wasm_cs_get_candles();
        const count = Module._wasm_cs_get_candle_count();
        if (!ptr || count === 0) return null;
        // 6 doubles per candle: high, low, open, close, time, volume
        return {
            flat: new Float64Array(Module.buffer, ptr, count * 6),
            count: count
        };
    }

    // ── Build context untuk user code ─────────────────────
    function buildContext() {
        const data = getCandles();
        if (!data) return null;

        const { flat, count } = data;
        const high = new Array(count);
        const low = new Array(count);
        const open = new Array(count);
        const close = new Array(count);
        const time = new Array(count);
        const volume = new Array(count);
        for (let i = 0; i < count; i++) {
            high[i] = flat[i * 6 + 0];
            low[i] = flat[i * 6 + 1];
            open[i] = flat[i * 6 + 2];
            close[i] = flat[i * 6 + 3];
            time[i] = flat[i * 6 + 4];
            volume[i] = flat[i * 6 + 5];
        }

        const view = {
            globalOffset: Module._wasm_cs_get_view_offset(),
            bufferCount: Module._wasm_cs_get_buffer_count()
        };

        return {
            high, low, open, close, time, volume,
            count, view,
            // TA functions
            sma, ema, rsi,
            crossUp, crossDown,
            // Drawing functions
            plot,
            arrow,
            label
        };
    }

    // ════════════════════════════════════════════════════════════════
    //  PUBLIC API — dipanggil dari C++ via EM_ASM
    // ════════════════════════════════════════════════════════════════

    // ── eval(code) — compile user code, run tanpa reload ──
    function evalCode(code) {
        try {
            // Bikin function dari user code
            // User code bisa akses ctx (context) yang kita sediakan
            const fn = new Function('ctx', code);
            userFunction = fn;
            enabled = true;
            lastError = null;
            stats.runs++;
            console.log('[CustomScriptEngine] Code compiled successfully');
            return true;
        } catch (e) {
            lastError = 'Compile error: ' + e.message;
            console.error('[CustomScriptEngine] Compile error:', e);
            enabled = false;
            return false;
        }
    }

    // ── execute() — dipanggil C++ per frame ──
    function execute() {
        if (!enabled || !userFunction) return;

        const startTime = performance.now();

        try {
            // Clear render buffer dulu
            Module._wasm_cs_clear_buffer();

            // Build context (candle data + helpers)
            const ctx = buildContext();
            if (!ctx) return;

            stats.drawCommands = 0;

            // Run user code
            userFunction(ctx);

            // Render queued commands ke chart
            Module._wasm_cs_render_buffer();

            stats.lastExecMs = performance.now() - startTime;
        } catch (e) {
            lastError = 'Runtime error: ' + e.message;
            console.error('[CustomScriptEngine] Runtime error:', e);
            // Disable supaya gak spam error
            enabled = false;
        }
    }

    // ── Getters ──
    function getError() { return lastError; }
    function isEnabled() { return enabled; }
    function getStats() { return stats; }

    function disable() { enabled = false; }
    function enable() { enabled = true; lastError = null; }
    function clearError() { lastError = null; }

    return {
        eval: evalCode,
        execute: execute,
        getError: getError,
        isEnabled: isEnabled,
        getStats: getStats,
        disable: disable,
        enable: enable,
        clearError: clearError
    };
})();

console.log('[CustomScriptEngine] Loaded. Ready for eval().');
