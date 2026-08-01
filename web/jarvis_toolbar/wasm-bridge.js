// ============================================================
// wasm-bridge.js — WASM Communication Layer
// ------------------------------------------------------------
// Abstraksi semua komunikasi dengan C++ via WASM.
// Modul lain TIDAK BOLEH langsung pakai Module.ccall —
// harus lewat JT.WasmBridge supaya:
//   1. Guard otomatis (wasmReady check)
//   2. Error handling terpusat
//   3. Logging bisa di-toggle
//   4. Kalau nanti ganti dari ccall ke cwrap, cuma edit sini
// ============================================================

window.JT = window.JT || {};

JT.WasmBridge = {
    /**
     * Cek apakah WASM sudah siap dipakai.
     * @returns {boolean}
     */
    isReady() {
        if (JT.State.wasmReady) return true;
        if (typeof Module !== 'undefined' && Module.calledRun) {
            JT.State.wasmReady = true;
            return true;
        }
        return false;
    },

    /**
     * Panggil WASM function dengan guard otomatis.
     * @param {string} name     — Nama function C++ (tanpa prefix wasm_)
     * @param {string} retType  — 'number', 'string', null (void)
     * @param {Array}  argTypes — ['number'], [], dll.
     * @param {Array}  args     — [0], [1], dll.
     * @returns {*} null kalau WASM belum ready atau error
     */
    call(name, retType, argTypes, args) {
        if (!this.isReady()) return null;
        try {
            return Module.ccall(name, retType, argTypes, args);
        } catch (e) {
            console.warn('[JT.WasmBridge] ccall failed:', name, e.message);
            return null;
        }
    },

    // ── Shortcut Methods ──
    // Modul lain pakai ini supaya lebih ringkas & type-safe.
    // Kalau mau tambah shortcut baru, tambah di sini.

    /** Toggle boolean flag di C++. Returns new value (1/0). */
    toggle(fnName) {
        return this.call(fnName, 'number', [], []);
    },

    /** Get boolean flag dari C++. Returns 1/0. */
    getBool(fnName) {
        return this.call(fnName, 'number', [], []);
    },

    /** Set number value di C++. */
    setNumber(fnName, value) {
        return this.call(fnName, null, ['number'], [value]);
    },

    /** Get number value dari C++. */
    getNumber(fnName) {
        return this.call(fnName, 'number', [], []);
    },

    /** Get string value dari C++. */
    getString(fnName) {
        return this.call(fnName, 'string', [], []);
    },

    /** Void action di C++ (tanpa return). */
    action(fnName) {
        return this.call(fnName, null, [], []);
    },

    /** Call dengan 1 number argument. */
    callWithNumber(fnName, value) {
        return this.call(fnName, null, ['number'], [value]);
    }
};
