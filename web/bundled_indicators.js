// ═══════════════════════════════════════════════════════════════
// bundled_indicators.js — Load bundled custom indicators
// ═══════════════════════════════════════════════════════════════
// Creator publish indikator (tombol Publish di Script Builder) →
// file .json di-upload ke folder "indicators_json/" (web server
// atau GitHub repo). File JS ini fetch folder itu saat startup →
// register ke WASM via wasm_register_bundled_script() → muncul
// di UI list indicator section "Indicators (Bundled)".
//
// ❗ TANPA REBUILD WASM — nambah indikator = upload 1 file JSON.
//
// Sumber yang dipakai (urutan prioritas):
//   1. PLATFORM.INDICATORS_JSON_URL  (di web/config.js) — kalau di-set
//   2. GitHub repo creator (raw.githubusercontent.com)
//   3. Folder lokal indicators_json/ di web server yang sama
//
// Format manifest (index.json):
//   { "engine_required": "V6.4",
//     "indicators": [ {"file": "Nama_Indikator.json"}, ... ] }
//
// Format per-indicator (output tombol Publish):
//   { "name": "...", "formula": "...", "engine_required": "V6.4",
//     "published_by": "creator", "version": 1 }
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── Konfigurasi sumber ─────────────────────────────────────
    // Repo creator: https://github.com/yatagea1001/market-trade-view
    // (fallback kalau PLATFORM.INDICATORS_JSON_URL kosong di config.js)
    var GITHUB_MANIFEST = "https://raw.githubusercontent.com/yatagea1001/market-trade-view/main/indicators_json/index.json";
    var LOCAL_MANIFEST = "indicators_json/index.json";   // folder di web server (sejajar app.html)

    function manifestURL() {
        // 1. Platform config override (web/config.js)
        if (typeof PLATFORM !== "undefined" && PLATFORM.INDICATORS_JSON_URL) {
            return PLATFORM.INDICATORS_JSON_URL;
        }
        // 2. GitHub (kalau sudah diisi — bukan placeholder)
        if (GITHUB_MANIFEST.indexOf("USERNAME") === -1) {
            return GITHUB_MANIFEST;
        }
        // 3. Folder lokal
        return LOCAL_MANIFEST;
    }

    function baseDir(url) {
        var i = url.lastIndexOf("/");
        return url.substring(0, i + 1);
    }

    function fetchJSON(url) {
        return fetch(url, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
            return r.json();
        });
    }

    // ── Kirim 1 indicator ke WASM ──────────────────────────────
    function registerToWASM(script) {
        if (!script || !script.name || !script.formula) return false;
        try {
            var nb = Module._malloc(Module.lengthBytesUTF8(script.name) + 1);
            Module.stringToUTF8(script.name, nb, Module.lengthBytesUTF8(script.name) + 1);
            var fb = Module._malloc(Module.lengthBytesUTF8(script.formula) + 1);
            Module.stringToUTF8(script.formula, fb, Module.lengthBytesUTF8(script.formula) + 1);
            Module.ccall("wasm_register_bundled_script", null,
                         ["number", "number"], [nb, fb]);
            Module._free(nb);
            Module._free(fb);
            return true;
        } catch (e) {
            console.error("[Bundled] register failed:", script.name, e);
            return false;
        }
    }

    // ── Retry sampai WASM siap (register bisa dipanggil sebelum  ──
    //    Module.ccall tersedia — tunggu max ~15 dtk)
    function whenWASMReady(cb, attempt) {
        attempt = attempt || 0;
        if (typeof Module !== "undefined" && Module.ccall && Module._malloc) {
            cb();
        } else if (attempt < 30) {
            setTimeout(function () { whenWASMReady(cb, attempt + 1); }, 500);
        } else {
            console.warn("[Bundled] WASM bridge tidak tersedia — bundled indicators dimuat");
        }
    }

    function loadAll() {
        var mURL = manifestURL();
        var base = baseDir(mURL);

        fetchJSON(mURL)
            .then(function (man) {
                if (!man || !man.indicators || !man.indicators.length) {
                    console.log("[Bundled] manifest kosong:", mURL);
                    return [];
                }
                // engine compatibility check (warning saja, tetap load)
                if (man.engine_required && window.__BUNDLED_ENGINE__) {
                    console.log("[Bundled] manifest engine:", man.engine_required);
                }
                // Fetch semua indicator paralel
                return Promise.all(man.indicators.map(function (e) {
                    return fetchJSON(base + e.file).catch(function (err) {
                        console.warn("[Bundled] gagal fetch:", e.file, err.message);
                        return null;
                    });
                }));
            })
            .then(function (scripts) {
                var ok = 0;
                whenWASMReady(function () {
                    scripts.forEach(function (s) {
                        if (registerToWASM(s)) ok++;
                    });
                    console.log("[Bundled] registered " + ok + "/" + scripts.length + " indicators → ui_listindicator");
                });
            })
            .catch(function (err) {
                console.log("[Bundled] manifest tidak tersedia:", err.message);
            });
    }

    // ── Startup ────────────────────────────────────────────────
    if (document.readyState === "complete" || document.readyState === "interactive") {
        loadAll();
    } else {
        document.addEventListener("DOMContentLoaded", loadAll);
    }

    // Public API (untuk debug dari console / refresh manual)
    window.BundledIndicators = { reload: loadAll };
})();
