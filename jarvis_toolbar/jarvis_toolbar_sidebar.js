// ================================================================
// jarvis_toolbar_sidebar.js — Sidebar + flyout logic
// ----------------------------------------------------------------
// ADAPTASI DARI: ToolsPalette_Sidebar.mqh (1479 lines)
//
// Logic terpisah untuk sidebar & flyout:
//   - Toggle flyout saat tile kategori di-click
//   - Position sidebar (snap ke left/right/bottom)
//   - Resize sidebar (drag bottom edge)
//   - Scrollbar (kalau tools melebihi tinggi sidebar)
// ================================================================

(function() {

let sidebarState = {
    snapSide: 'left',     // 'left' | 'right' | 'float'
    width: 48,
    height: 0,            // auto
    isDragging: false,
    isResizing: false,
    dragOffset: { x: 0, y: 0 }
};

function init() {
    // Logic sudah di jarvis_toolbar_render.js
    // File ini untuk extend dengan fitur snap & resize
    setupSnap();
    setupResize();
}

function setupSnap() {
    // TODO: implement snap-to-edge logic
    // Saat user drag sidebar dekat edge (mis. < 20px), snap ke edge tsb
}

function setupResize() {
    // TODO: drag bottom edge → resize height
}

function toggle() {
    const sidebar = document.getElementById('jt-sidebar');
    if (!sidebar) return;
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
}

function show() {
    const sidebar = document.getElementById('jt-sidebar');
    if (sidebar) sidebar.style.display = 'flex';
}

function hide() {
    const sidebar = document.getElementById('jt-sidebar');
    if (sidebar) sidebar.style.display = 'none';
}

// WASM bridge: sidebar toggle dari C++
window.wasm_sidebar_toggle_js = function() {
    toggle();
    return sidebarState.snapSide === 'left' ? 1 : 0;
};

window.JarvisToolbarSidebar = { init, toggle, show, hide };

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
