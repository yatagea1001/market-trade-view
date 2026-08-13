// ================================================================
// jarvis_toolbar_interact.js — Click handlers + state sync
// ----------------------------------------------------------------
// ADAPTASI DARI: jarvis_toolbar.js lama (bindDrawingToolbar,
// setActiveDrawingBtn, syncState, dll)
//
// Tugas:
//   - Bind click event untuk semua tombol drawing
//   - Kirim toolId terpilih ke C++ via wasm_set_active_tool_v2
//   - Polling state C++ (active tool, pinned tools) setiap 200ms
//   - Update UI kalau state C++ berubah
// ================================================================

(function() {

function init() {
    bindToolClicks();
    startStateSync();
}

// ── Bind click events ──────────────────────────────────────────
function bindToolClicks() {
    // Delegate click ke container utama (event delegation)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-enum-id]');
        if (!btn) return;

        const enumId = parseInt(btn.dataset.enumId, 10);
        if (isNaN(enumId) || enumId < 1) return;

        // Kirim ke C++
        if (window.Module && Module._wasm_set_active_tool_v2) {
            try {
                Module.ccall('wasm_set_active_tool_v2', null,
                              ['number'], [enumId]);
                console.log(`[JTB] Tool set to ${enumId} (${btn.dataset.toolId})`);
            } catch(err) {
                console.error('[JTB] wasm_set_active_tool_v2 failed:', err);
            }
        }

        // Update UI: highlight active button
        updateActiveButton(enumId);
    });

    // Right-click untuk pin/unpin
    document.addEventListener('contextmenu', (e) => {
        const btn = e.target.closest('[data-enum-id]');
        if (!btn) return;
        e.preventDefault();
        const enumId = parseInt(btn.dataset.enumId, 10);
        if (isNaN(enumId)) return;
        if (window.Module && Module._wasm_drawing_pin_tool) {
            const isPinned = Module.ccall('wasm_drawing_pin_tool',
                                           'number', ['number'], [enumId]);
            console.log(`[JTB] Tool ${enumId} pin toggled → ${isPinned}`);
        }
    });
}

// ── Update active button visual ────────────────────────────────
function updateActiveButton(toolEnumId) {
    document.querySelectorAll('[data-enum-id]').forEach(btn => {
        const enumId = parseInt(btn.dataset.enumId, 10);
        btn.classList.toggle('active', enumId === toolEnumId);
    });

    // Update kategori tile active state
    const cfg = window.JarvisToolbarConfig;
    const tool = cfg.getToolByEnumId(toolEnumId);
    if (tool) {
        document.querySelectorAll('.jt-tile[data-cat-id]').forEach(tile => {
            tile.classList.toggle('active', tile.dataset.catId === tool.categoryId);
        });
    }
}

// ── Poll C++ state every 200ms ─────────────────────────────────
function startStateSync() {
    let lastActiveTool = -1;
    setInterval(() => {
        if (!window.Module || !Module._wasm_get_active_tool_v2) return;
        try {
            const current = Module.ccall('wasm_get_active_tool_v2',
                                          'number', [], []);
            if (current !== lastActiveTool) {
                lastActiveTool = current;
                updateActiveButton(current);
            }
        } catch(e) {}

        // Refresh pinned ribbon
        if (window.JarvisToolbarPinned) {
            window.JarvisToolbarPinned.refresh();
        }
    }, 200);
}

// ── Public API ─────────────────────────────────────────────────
window.JarvisToolbarInteract = {
    init,
    updateActiveButton
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
