// ================================================================
// jarvis_toolbar_main.js — Master entry point
// ----------------------------------------------------------------
// Include semua sub-modul + bootstrap
//
// Cara pakai di app.html:
//   <script src="web/jarvis_toolbar/jarvis_toolbar_config.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_render.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_settings.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_sidebar.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_pinned.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_interact.js"></script>
//   <script src="web/jarvis_toolbar/jarvis_toolbar_main.js"></script>
//
// Atau pakai ES6 module loader (TODO nanti).
// ================================================================

(function() {

function init() {
    console.log('%c[JTB] Jarvis Toolbar Modular — init start',
                'color:#00ffaa;font-weight:bold');

    // Wait for WASM Module ready
    function waitForWasm() {
        if (window.Module && Module.calledRun === true) {
            bootstrap();
        } else {
            setTimeout(waitForWasm, 100);
        }
    }
    waitForWasm();
}

function bootstrap() {
    console.log('[JTB] WASM ready, initializing sub-modules...');

    // Init sub-modul (urutan penting!)
    if (window.JarvisToolbar)        window.JarvisToolbar.init();         // render + sync
    if (window.JarvisToolbarSidebar) window.JarvisToolbarSidebar.init();  // snap + resize
    if (window.JarvisToolbarPinned)  window.JarvisToolbarPinned.init();   // drag
    if (window.JarvisToolbarInteract)window.JarvisToolbarInteract.init(); // click + sync
    if (window.JarvisToolbarSettings)window.JarvisToolbarSettings.init(); // popup

    console.log('[JTB] ✅ All sub-modules initialized');

    // Expose global helpers
    window.jtb_set_active_tool = function(enumId) {
        if (window.Module && Module._wasm_set_active_tool_v2) {
            Module.ccall('wasm_set_active_tool_v2', null, ['number'], [enumId]);
        }
    };

    window.jtb_open_settings = function() {
        if (window.Module && Module._wasm_drawing_open_settings) {
            Module.ccall('wasm_drawing_open_settings', null, [], []);
        }
    };

    window.jtb_pin_tool = function(enumId) {
        if (window.Module && Module._wasm_drawing_pin_tool) {
            return Module.ccall('wasm_drawing_pin_tool', 'number',
                                 ['number'], [enumId]);
        }
        return 0;
    };
}

// ── Auto-init ──────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
