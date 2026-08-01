// ============================================================
// drawing-tools.js — Drawing Toolbar (9 tombol alat gambar)
// ------------------------------------------------------------
// Konfigurasi tombol + event binding + handler.
// Sesuai RenderTopToolbar di main.cpp.
//
// CARA TAMBAH TOOL BARU:
// 1. Tambah objek di array DRAWING_TOOLS
// 2. Tambah case di handleDrawingClick()
// 3. Selesai — tidak perlu edit file lain
// ============================================================

window.JT = window.JT || {};

JT.DrawingTools = {

    // ── Konfigurasi Tombol ──
    // Setiap tombol pakai PNG dari folder assets/ (kalau ada),
    // kalau nggak ada → fallback ke SVG inline (warna accent).
    TOOLS: [
        {
            id: 'cursor',
            toolId: 0,
            icon: 'assets/cursor.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7 16 2-7 7-2z"/></svg>',
            label: 'Cursor',
            tooltip: 'Cursor'
        },
        {
            id: 'line',
            toolId: 1,
            icon: 'assets/line.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>',
            label: 'Line',
            tooltip: 'Garis Trend'
        },
        {
            id: 'fib',
            toolId: 3,
            icon: 'assets/fib.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
            label: 'Fib',
            tooltip: 'Fibonacci'
        },
        {
            id: 'rect',
            toolId: 2,
            icon: 'assets/rect.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12"/></svg>',
            label: 'Rect',
            tooltip: 'Segi Empat'
        },
        {
            id: 'brush',
            toolId: 5,
            icon: 'assets/brush.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l-6 6v3h3l6-6"/><path d="M12 8l4-4 3 3-4 4"/></svg>',
            label: 'Brush',
            tooltip: 'Freehand Brush'
        },
        {
            id: 'text',
            toolId: 4,
            icon: 'assets/text.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
            label: 'Text',
            tooltip: 'Insert Text (Click on Chart)'
        },
        {
            id: 'elliot',
            toolId: 6,
            icon: 'assets/elliot.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/></svg>',
            label: 'Elliot',
            tooltip: 'Garis Gelombang'
        },
        {
            id: 'jarvis',
            toolId: -1, // special: toggle jarvis chat
            icon: null,  // pakai SVG "J" badge
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor" stroke="none">J</text><circle cx="12" cy="12" r="10" stroke-dasharray="2 2"/></svg>',
            label: 'Jarvis',
            tooltip: 'Jarvis AI Chat'
        },
        {
            id: 'separator',
            toolId: -2, // special: separator (no action)
            icon: null,
            svg: null,
            label: '',
            tooltip: ''
        },
        {
            id: 'trash',
            toolId: -3, // special: clear shapes
            icon: 'assets/trash.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
            label: 'Trash',
            tooltip: 'Hapus Semua'
        }
    ],

    // ── Event Binding ──
    bind() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        overlay.querySelectorAll('#jt-drawing-toolbar .jt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const toolDef = this.TOOLS.find(t => t.id === btn.dataset.toolId);
                if (!toolDef) return;
                this.handleDrawingClick(toolDef);
            });
        });
    },

    // ── Click Handler ──
    handleDrawingClick(tool) {
        const W = JT.WasmBridge;
        const overlay = JT.State.overlay;

        switch (tool.id) {
            case 'cursor':
                W.setNumber('wasm_set_active_tool', 0);
                this.setActiveBtn('cursor');
                break;
            case 'line':
                W.setNumber('wasm_set_active_tool', 1);
                this.setActiveBtn('line');
                break;
            case 'fib':
                W.setNumber('wasm_set_active_tool', 3);
                this.setActiveBtn('fib');
                break;
            case 'rect':
                W.setNumber('wasm_set_active_tool', 2);
                this.setActiveBtn('rect');
                break;
            case 'brush':
                W.setNumber('wasm_set_active_tool', 5);
                this.setActiveBtn('brush');
                break;
            case 'text':
                W.setNumber('wasm_set_active_tool', 4);
                this.setActiveBtn('text');
                break;
            case 'elliot':
                W.setNumber('wasm_set_active_tool', 6);
                this.setActiveBtn('elliot');
                break;
            case 'jarvis':
                const newVis = W.toggle('wasm_toggle_jarvis');
                JT.State.jarvisVisible = newVis === 1;
                this.updateJarvisBtn();
                break;
            case 'trash':
                W.action('wasm_clear_shapes');
                JT.Utils.flashButton(
                    overlay.querySelector('#jt-drawing-toolbar [data-tool-id="trash"]')
                );
                break;
        }
    },

    // ── Visual Helpers ──
    setActiveBtn(toolId) {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        overlay.querySelectorAll('#jt-drawing-toolbar .jt-btn').forEach(b => {
            b.dataset.active = 'false';
        });
        const btn = overlay.querySelector(`#jt-drawing-toolbar [data-tool-id="${toolId}"]`);
        if (btn) btn.dataset.active = 'true';
        JT.State.activeToolId = toolId === 'cursor' ? 0 : toolId;
    },

    updateJarvisBtn() {
        const overlay = JT.State.overlay;
        if (!overlay) return;
        const btn = overlay.querySelector('#jt-drawing-toolbar [data-tool-id="jarvis"]');
        if (btn) btn.dataset.active = JT.State.jarvisVisible ? 'true' : 'false';
    }
};
