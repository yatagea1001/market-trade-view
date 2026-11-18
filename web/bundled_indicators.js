// ═══════════════════════════════════════════════════════════════
// bundled_indicators.js — Load bundled custom indicators
// ═══════════════════════════════════════════════════════════════
// Creator publish indikator (tombol Publish di Script Builder) →
// file .json di-upload ke folder "indicators_json/" di web server
// (sejajar app.html — sama kayak data/*.bin). File JS ini fetch folder
// itu saat C++ fire trigger → register ke WASM via
// wasm_register_bundled_script() → muncul di UI list indicator
// section "Indicators (Bundled)".
//
// ❗ TANPA REBUILD WASM — nambah indikator = upload 1 file JSON.
//
// Sumber: LOCAL-ONLY (PLATFORM.INDICATORS_JSON_URL di web/config.js,
//   default "indicators_json/index.json"). Gak ada fallback GitHub
//   karena environment offline / DNS lokal mati.
//
// Trigger: C++ main.cpp render loop fire window.onBundledIndicatorsNeeded()
// saat g_bundledScripts kosong (tiap 15 dtk). Sama kayak onNearLeftEdge.
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
    // LOCAL-ONLY: fetch dari folder indicators_json/ di web server
    // (sejajar app.html — sama kayak data/*.bin). GAK ADA fallback GitHub
    // karena environment offline / DNS lokal mati (fonts + firebase juga
    // NS_ERROR_UNKNOWN_HOST). Kalau folder belum ada → log error jelas.
    var LOCAL_MANIFEST = "indicators_json/index.json";

    function manifestURL() {
        // Platform config (web/config.js) — default "indicators_json/index.json"
        if (typeof PLATFORM !== "undefined" && PLATFORM.INDICATORS_JSON_URL) {
            return PLATFORM.INDICATORS_JSON_URL;
        }
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
        // Pre-check: function HARUS ada di export table sebelum ccall.
        // Kalau gak ada, ccall akan abort() dan crash app — di-skip di sini.
        if (typeof Module["_wasm_register_bundled_script"] !== "function") {
            console.error("[Bundled] wasm_register_bundled_script TIDAK di-export di WASM.");
            console.error("[Bundled] → Rebuild: jalankan build_web.bat (pastikan exports.rsp di root).");
            console.error("[Bundled] → Copy dist/index.js + index.wasm + index.data ke server (ganti lama).");
            return false;
        }
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

    // ── Tunggu sampe WASM runtime READY + function export tersedia ──
    // Cek function SPESIFIK (bukan cuma Module.ccall method) — Module.ccall
    // bisa ada sebelum WASM binary selesai compile. Module["_wasm_..."] baru
    // ada setelah runtime init + function di-export.
    function whenWASMReady(cb, attempt) {
        attempt = attempt || 0;
        if (typeof Module !== "undefined" && Module._malloc &&
            typeof Module["_wasm_register_bundled_script"] === "function") {
            cb();
            return;
        }
        // WASM sudah selesai load (calledRun=true) TAPI function gak ada
        // → pasti gak di-export → dist/ lama, butuh rebuild. Error segera.
        if (typeof Module !== "undefined" && Module.calledRun === true &&
            typeof Module["_wasm_register_bundled_script"] !== "function") {
            console.error("[Bundled] WASM sudah load tapi 'wasm_register_bundled_script' tidak di-export.");
            console.error("[Bundled] → dist/index.js yang di-deploy VERSI LAMA (sebelum patch bundled).");
            console.error("[Bundled] → Rebuild: build_web.bat, lalu copy dist/* ke server (ganti yang lama).");
            return;
        }
        // Masih loading — retry sampe 20 dtk (40 × 500ms)
        if (attempt < 40) {
            setTimeout(function () { whenWASMReady(cb, attempt + 1); }, 500);
        }
    }

    // ── Fetch + register dari URL (poll, hot-add aware) ───────
    // Trigger C++ fire tiap 15 dtk TERUS (main.cpp render loop) supaya
    // JSON baru yang di-upload user langsung muncul (hot-add). Dedup
    // di C++ (wasm_register_bundled_script guard by name), jadi log di
    // sini cuma print saat ada entry BARU yang sukses register.
    var g_lastOK = -1;    // jumlah registered sukses terakhir (untuk deteksi baru)
    function loadFromURL(mURL) {
        var base = baseDir(mURL);
        return fetchJSON(mURL)
            .then(function (man) {
                if (!man || !man.indicators || !man.indicators.length) {
                    console.log("[Bundled] manifest kosong:", mURL);
                    return [];
                }
                // Fetch semua indicator paralel (relative ke base URL)
                return Promise.all(man.indicators.map(function (e) {
                    return fetchJSON(base + e.file).catch(function (err) {
                        console.warn("[Bundled] gagal fetch:", e.file, err.message);
                        return null;
                    });
                }));
            })
            .then(function (scripts) {
                whenWASMReady(function () {
                    var ok = 0;
                    scripts.forEach(function (s) {
                        if (registerToWASM(s)) ok++;
                    });
                    // Log ringkas tiap poll; log detail per-indicator dari C++
                    // (printf di wasm_register_bundled cuma jalan untuk entry BARU)
                    if (ok > g_lastOK) {
                        var extra = (g_lastOK >= 0) ? " (+" + (ok - g_lastOK) + " baru)" : "";
                        g_lastOK = ok;
                        console.log("[Bundled] " + ok + " indicator aktif → ui_listindicator" + extra);
                    }
                });
            });
    }

    // ── Load entry point: LOCAL-ONLY ───────────────────────────
    // Fetch indicators_json/index.json dari web server lokal (sejajar
    // app.html — sama kayak data/*.bin). Gak ada fallback GitHub
    // (environment offline). Kalau 404 → log error jelas + retry
    // otomatis tiap 15 dtk dari trigger C++ (main.cpp render loop).
    function loadAll() {
        var mURL = manifestURL();
        return loadFromURL(mURL).catch(function (err) {
            console.error("[Bundled] manifest lokal gagal:", err.message);
            console.error("[Bundled] → pastikan folder indicators_json/ ada di server root");
            console.error("[Bundled]   (sejajar app.html, isinya: index.json + *.json per indicator)");
            console.error("[Bundled] → cek: http://localhost:8000/indicators_json/index.json");
        });
    }

    // ── ON-DEMAND trigger (pola lazy load §5) ─────────────────
    // C++ (main.cpp render loop) fire window.onBundledIndicatorsNeeded()
    // saat g_bundledScripts kosong (tiap 15 dtk). Sama kayak onNearLeftEdge:
    // EM_ASM di main loop → bridge fetch + push balik. Gak peduli modal
    // indicator buka/tutup — trigger jalan tiap frame sampai terisi.
    var g_inFlight = false;
    function onNeeded() {
        if (g_inFlight) return;   // cegah double-fire (retry 15s C++)
        g_inFlight = true;
        loadAll().finally(function () { g_inFlight = false; });
    }
    window.onBundledIndicatorsNeeded = onNeeded;

    // Public API (debug dari console / refresh manual)
    window.BundledIndicators = { reload: loadAll };
})();
