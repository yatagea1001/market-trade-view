// ============================================================
// right-bar-tools.js — Right Panel Toolbar (7 toggle)
// ------------------------------------------------------------
// Konfigurasi tombol toggle panel + event binding.
// Sesuai RenderRightBar di main.cpp.
//
// CARA TAMBAH PANEL BARU:
// 1. Tambah objek di array TOOLS
// 2. Tambah key di JT.State.panelState
// 3. Tambah syncPanel() di state-sync.js
// 4. Selesai — tidak perlu edit file lain
// ============================================================

window.JT = window.JT || {};

JT.RightBarTools = {

    // ── Konfigurasi Tombol ──
    TOOLS: [
        {
            id: 'tools',
            icon: 'assets/add_chart.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>',
            label: 'Tls',
            tooltip: 'Alat Gambar (Tools)',
            toggleKey: 'topToolbar',
            toggleFn: 'wasm_toggle_top_toolbar',
            getterFn: 'wasm_get_top_toolbar'
        },
        {
            id: 'nav',
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
            label: 'Nav',
            tooltip: 'Navigasi',
            toggleKey: 'navigation',
            toggleFn: 'wasm_toggle_navigation_panel',
            getterFn: 'wasm_get_navigation_panel'
        },
        { id: 'sep1', isSeparator: true },
        {
            id: 'trade',
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
            label: 'Trd',
            tooltip: 'Trade Panel',
            toggleKey: 'trade',
            toggleFn: 'wasm_toggle_trade_panel',
            getterFn: 'wasm_get_trade_panel'
        },
        {
            id: 'history',
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
            label: 'Hst',
            tooltip: 'Trade History',
            toggleKey: 'history',
            toggleFn: 'wasm_toggle_history_panel',
            getterFn: 'wasm_get_history_panel'
        },
        { id: 'sep2', isSeparator: true },
        {
            id: 'marketwatch',
            icon: 'assets/marketwatch.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
            label: 'Mkt',
            tooltip: 'Market Watch',
            toggleKey: 'marketWatch',
            toggleFn: 'wasm_toggle_market_watch',
            getterFn: 'wasm_get_market_watch'
        },
        {
            id: 'objtree',
            icon: 'assets/tree.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/><line x1="9" y1="6" x2="15" y2="18"/></svg>',
            label: 'Obj',
            tooltip: 'Pohon Objek',
            toggleKey: 'objectTree',
            toggleFn: 'wasm_toggle_object_tree',
            getterFn: 'wasm_get_object_tree'
        },
        { id: 'sep3', isSeparator: true },
        {
            id: 'settings',
            icon: 'assets/setting.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
            label: 'Set',
            tooltip: 'Pengaturan',
            toggleKey: 'displaySettings',
            toggleFn: 'wasm_toggle_display_settings',
            getterFn: 'wasm_get_display_settings'
        }
    ],

    // ── Event Binding ──
    bind() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        overlay.querySelectorAll('#jt-right-toolbar .jt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const toolDef = this.TOOLS.find(t => t.id === btn.dataset.toolId);
                if (!toolDef || !toolDef.toggleFn) return;

                const newVal = JT.WasmBridge.toggle(toolDef.toggleFn);
                JT.State.panelState[toolDef.toggleKey] = (newVal === 1);
                btn.dataset.active = (newVal === 1) ? 'true' : 'false';

                JT.Utils.flashButton(btn);
            });
        });
    }
};
