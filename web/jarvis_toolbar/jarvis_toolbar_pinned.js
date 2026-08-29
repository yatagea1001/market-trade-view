// ================================================================
// jarvis_toolbar_pinned.js — Pinned tools ribbon
// ----------------------------------------------------------------
// ADAPTASI DARI: ToolsPalette_RibbonPinned.mqh (977 lines)
//
// Pinned ribbon = strip kecil di atas chart untuk tools favorit.
// User bisa pin tool (klik kanan tombol di flyout → "Pin to ribbon")
// ================================================================

(function() {

let pinnedState = {
    visible: false,
    position: { x: 60, y: 8 },
    isDragging: false,
    dragOffset: { x: 0, y: 0 }
};

function init() {
    setupDrag();
}

function setupDrag() {
    document.addEventListener('mousedown', (e) => {
        const pinned = document.getElementById('jt-pinned');
        if (!pinned || pinned.style.display === 'none') return;
        // Cek apakah klik di padding area (bukan di tombol)
        if (e.target.closest('.jt-tile')) return;
        const rect = pinned.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            pinnedState.isDragging = true;
            pinnedState.dragOffset = {
                x: e.clientX - pinnedState.position.x,
                y: e.clientY - pinnedState.position.y
            };
            e.preventDefault();
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (!pinnedState.isDragging) return;
        const pinned = document.getElementById('jt-pinned');
        if (!pinned) return;
        pinnedState.position.x = e.clientX - pinnedState.dragOffset.x;
        pinnedState.position.y = e.clientY - pinnedState.dragOffset.y;
        // Clamp ke window
        const margin = 4;
        const maxX = window.innerWidth - pinned.offsetWidth - margin;
        const maxY = window.innerHeight - pinned.offsetHeight - margin;
        if (pinnedState.position.x < margin) pinnedState.position.x = margin;
        if (pinnedState.position.y < margin) pinnedState.position.y = margin;
        if (pinnedState.position.x > maxX) pinnedState.position.x = maxX;
        if (pinnedState.position.y > maxY) pinnedState.position.y = maxY;
        pinned.style.left = pinnedState.position.x + 'px';
        pinned.style.top  = pinnedState.position.y + 'px';
    });
    document.addEventListener('mouseup', () => {
        pinnedState.isDragging = false;
    });
}

function show() {
    const pinned = document.getElementById('jt-pinned');
    if (pinned) pinned.style.display = 'flex';
    pinnedState.visible = true;
}

function hide() {
    const pinned = document.getElementById('jt-pinned');
    if (pinned) pinned.style.display = 'none';
    pinnedState.visible = false;
}

// Refresh pinned list (dipanggil tiap 500ms oleh render.js)
function refresh() {
    if (!Module || !Module._wasm_drawing_is_pinned) return;
    const cfg = window.JarvisToolbarConfig;
    const pinnedTools = cfg.DRAWING_TOOLS.filter(t => {
        try {
            return Module.ccall('wasm_drawing_is_pinned', 'number',
                                ['number'], [t.toolId]) === 1;
        } catch(e) { return false; }
    });
    if (pinnedTools.length === 0) {
        hide();
        return;
    }
    show();
    const pinned = document.getElementById('jt-pinned');
    if (pinned) {
        pinned.innerHTML = pinnedTools.map(t => `
            <button class="jt-tile"
                    data-tool-id="${t.id}"
                    data-enum-id="${t.toolId}"
                    data-tooltip="${t.tooltip}"
                    title="${t.tooltip}">
                ${t.svg}
            </button>
        `).join('');
    }
}

window.JarvisToolbarPinned = { init, show, hide, refresh };

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
