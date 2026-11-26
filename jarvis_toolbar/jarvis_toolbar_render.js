// ================================================================
// jarvis_toolbar_render.js — Render icon + sync position
// ----------------------------------------------------------------
// ADAPTASI DARI: jarvis_toolbar.js lama (syncPosition, syncState,
// buildButtonHTML, dll)
//
// Tugas:
//   1. Generate HTML tombol dari DRAWING_TOOLS config
//   2. Sync position overlay ke rect C++ (wasm_jt_get_tools_*)
//   3. Update active button state (selected / hovered)
// ================================================================

(function() {

// ── State ──────────────────────────────────────────────────────
let overlay;
let sidebarEl;
let flyoutEl;
let pinnedEl;
let activeToolId = 0;       // TOOL_POINTER
let activeCategoryId = null;
let isOpen = true;

// ── Init ───────────────────────────────────────────────────────
function init() {
    overlay = document.getElementById('jarvis-toolbar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'jarvis-toolbar-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            z-index: 999;
        `;
        document.body.appendChild(overlay);
    }
    buildHTML();
    bindEvents();
    startSyncLoop();
}

// ── Build HTML ─────────────────────────────────────────────────
function buildHTML() {
    const cfg = window.JarvisToolbarConfig;
    overlay.innerHTML = '';

    // 1. Sidebar (vertical, 9 kategori tiles)
    sidebarEl = document.createElement('div');
    sidebarEl.id = 'jt-sidebar';
    sidebarEl.className = 'jt-sidebar';
    sidebarEl.innerHTML = cfg.CATEGORIES.map(cat => `
        <button class="jt-tile"
                data-cat-id="${cat.id}"
                data-tooltip="${cat.tooltip || ''}"
                ${cat.hiddenIfEmpty ? 'data-hidden-if-empty="true"' : ''}
                style="display: ${cat.hiddenIfEmpty ? 'none' : 'flex'}">
            ${cat.svg}
        </button>
    `).join('');
    overlay.appendChild(sidebarEl);

    // 2. Flyout (hidden by default, shown when category clicked)
    flyoutEl = document.createElement('div');
    flyoutEl.id = 'jt-flyout';
    flyoutEl.className = 'jt-flyout';
    flyoutEl.style.display = 'none';
    overlay.appendChild(flyoutEl);

    // 3. Pinned ribbon (top, hidden by default)
    pinnedEl = document.createElement('div');
    pinnedEl.id = 'jt-pinned';
    pinnedEl.className = 'jt-pinned';
    pinnedEl.style.display = 'none';
    overlay.appendChild(pinnedEl);

    // Inject CSS kalau belum ada
    if (!document.getElementById('jt-styles')) {
        injectCSS();
    }
}

// ── Inject CSS ─────────────────────────────────────────────────
function injectCSS() {
    const style = document.createElement('style');
    style.id = 'jt-styles';
    style.textContent = `
        .jt-sidebar {
            position: absolute;
            left: 8px;
            top: 80px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px;
            background: rgba(20, 20, 28, 0.92);
            border: 1px solid rgba(80, 80, 100, 0.6);
            border-radius: 6px;
            pointer-events: auto;
            backdrop-filter: blur(8px);
        }
        .jt-tile {
            width: 40px; height: 40px;
            display: flex; align-items: center; justify-content: center;
            background: transparent;
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            color: #ccc;
            transition: all 0.15s;
        }
        .jt-tile:hover {
            background: rgba(80, 200, 220, 0.15);
            border-color: rgba(80, 200, 220, 0.4);
            color: #fff;
        }
        .jt-tile.active {
            background: rgba(80, 200, 220, 0.25);
            border-color: rgba(80, 200, 220, 0.8);
            color: #50d0ff;
        }
        .jt-tile svg {
            width: 20px; height: 20px;
            stroke: currentColor;
        }
        .jt-flyout {
            position: absolute;
            left: 60px;
            top: 80px;
            min-width: 180px;
            max-height: 400px;
            overflow-y: auto;
            background: rgba(30, 30, 40, 0.96);
            border: 1px solid rgba(80, 80, 100, 0.6);
            border-radius: 6px;
            padding: 4px;
            pointer-events: auto;
            backdrop-filter: blur(8px);
        }
        .jt-flyout-header {
            padding: 6px 10px;
            font-size: 12px;
            color: #888;
            border-bottom: 1px solid rgba(80, 80, 100, 0.3);
            margin-bottom: 4px;
        }
        .jt-tool-btn {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 8px 10px;
            background: transparent;
            border: none;
            color: #ccc;
            font-size: 13px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.1s;
        }
        .jt-tool-btn:hover {
            background: rgba(80, 200, 220, 0.15);
            color: #fff;
        }
        .jt-tool-btn.active {
            background: rgba(80, 200, 220, 0.25);
            color: #50d0ff;
        }
        .jt-tool-btn svg {
            width: 18px; height: 18px;
            flex-shrink: 0;
        }
        .jt-pin-btn {
            margin-left: auto;
            padding: 2px 6px;
            background: transparent;
            border: 1px solid rgba(100, 100, 120, 0.4);
            color: #888;
            font-size: 11px;
            border-radius: 3px;
            cursor: pointer;
        }
        .jt-pin-btn:hover {
            color: #fff;
            border-color: rgba(80, 200, 220, 0.6);
        }
        .jt-pin-btn.pinned {
            background: rgba(255, 220, 0, 0.2);
            border-color: rgba(255, 220, 0, 0.6);
            color: #ffdc00;
        }
        .jt-pinned {
            position: absolute;
            left: 60px;
            top: 8px;
            display: flex;
            gap: 4px;
            padding: 4px;
            background: rgba(20, 20, 28, 0.92);
            border: 1px solid rgba(80, 80, 100, 0.6);
            border-radius: 6px;
            pointer-events: auto;
        }
        .jt-tooltip {
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            pointer-events: none;
            z-index: 9999;
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

// ── Render flyout for category ─────────────────────────────────
function showFlyout(categoryId) {
    const cfg = window.JarvisToolbarConfig;
    const cat = cfg.CATEGORIES.find(c => c.id === categoryId);
    if (!cat) return;

    const tools = cfg.getToolsByCategory(categoryId);
    flyoutEl.innerHTML = `
        <div class="jt-flyout-header">${cat.label}</div>
        ${tools.map(tool => `
            <button class="jt-tool-btn"
                    data-tool-id="${tool.id}"
                    data-enum-id="${tool.toolId}"
                    data-tooltip="${tool.tooltip}"
                    ${activeToolId === tool.toolId ? 'data-active="true"' : ''}>
                ${tool.svg}
                <span>${tool.label}</span>
                <button class="jt-pin-btn"
                        data-pin-tool="${tool.id}"
                        data-pinned="false">📌</button>
            </button>
        `).join('')}
    `;
    flyoutEl.style.display = 'block';

    // Update active state
    Array.from(flyoutEl.querySelectorAll('.jt-tool-btn')).forEach(btn => {
        if (parseInt(btn.dataset.enumId) === activeToolId) {
            btn.classList.add('active');
        }
    });
}

function hideFlyout() {
    flyoutEl.style.display = 'none';
    activeCategoryId = null;
}

// ── Render pinned ribbon ───────────────────────────────────────
function renderPinned() {
    // Query C++ for pinned tools
    if (!Module || !Module._wasm_drawing_is_pinned) {
        pinnedEl.style.display = 'none';
        return;
    }
    const cfg = window.JarvisToolbarConfig;
    const pinnedTools = cfg.DRAWING_TOOLS.filter(t => {
        try {
            return Module.ccall('wasm_drawing_is_pinned', 'number',
                                ['number'], [t.toolId]) === 1;
        } catch(e) { return false; }
    });

    if (pinnedTools.length === 0) {
        pinnedEl.style.display = 'none';
        return;
    }

    pinnedEl.innerHTML = pinnedTools.map(t => `
        <button class="jt-tile"
                data-tool-id="${t.id}"
                data-enum-id="${t.toolId}"
                data-tooltip="${t.tooltip}">
            ${t.svg}
        </button>
    `).join('');
    pinnedEl.style.display = 'flex';
}

// ── Update active button state ─────────────────────────────────
function updateActiveState(toolEnumId) {
    activeToolId = toolEnumId;
    // Update sidebar tiles
    const cfg = window.JarvisToolbarConfig;
    const tool = cfg.getToolByEnumId(toolEnumId);
    if (tool) {
        // Highlight kategori yg punya tool aktif
        Array.from(sidebarEl.querySelectorAll('.jt-tile')).forEach(tile => {
            tile.classList.toggle('active', tile.dataset.catId === tool.categoryId);
        });
    }
    // Update flyout tool buttons
    if (flyoutEl.style.display !== 'none') {
        Array.from(flyoutEl.querySelectorAll('.jt-tool-btn')).forEach(btn => {
            btn.classList.toggle('active',
                parseInt(btn.dataset.enumId) === toolEnumId);
        });
    }
}

// ── Sync loop (polling state dari C++) ─────────────────────────
function startSyncLoop() {
    setInterval(() => {
        // Cek active tool dari C++
        if (Module && Module._wasm_get_active_tool_v2) {
            try {
                const newActive = Module.ccall('wasm_get_active_tool_v2',
                                                 'number', [], []);
                if (newActive !== activeToolId) {
                    updateActiveState(newActive);
                }
            } catch(e) {}
        }
        // Refresh pinned ribbon setiap 500ms
        renderPinned();
    }, 500);
}

// ── Bind events ────────────────────────────────────────────────
function bindEvents() {
    // Sidebar tile click → toggle flyout
    sidebarEl.addEventListener('click', (e) => {
        const tile = e.target.closest('.jt-tile');
        if (!tile) return;
        const catId = tile.dataset.catId;
        if (tile.dataset.action === 'delete') {
            // Clear all
            if (Module && Module._wasm_drawing_clear_all) {
                Module.ccall('wasm_drawing_clear_all', null, [], []);
            }
            return;
        }
        if (activeCategoryId === catId) {
            hideFlyout();
        } else {
            activeCategoryId = catId;
            showFlyout(catId);
        }
    });

    // Flyout tool click → set active tool
    flyoutEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.jt-tool-btn');
        if (!btn) return;
        // Cek apakah pin button yg diklik
        const pinBtn = e.target.closest('.jt-pin-btn');
        if (pinBtn) {
            e.stopPropagation();
            const toolId = parseInt(btn.dataset.enumId);
            if (Module && Module._wasm_drawing_pin_tool) {
                Module.ccall('wasm_drawing_pin_tool', 'number',
                              ['number'], [toolId]);
            }
            const isPinned = pinBtn.dataset.pinned === 'true';
            pinBtn.dataset.pinned = (!isPinned).toString();
            pinBtn.classList.toggle('pinned', !isPinned);
            return;
        }
        const enumId = parseInt(btn.dataset.enumId);
        if (Module && Module._wasm_set_active_tool_v2) {
            Module.ccall('wasm_set_active_tool_v2', null, ['number'], [enumId]);
        }
        updateActiveState(enumId);
        hideFlyout();
    });

    // Pinned ribbon click → set active tool
    pinnedEl.addEventListener('click', (e) => {
        const tile = e.target.closest('.jt-tile');
        if (!tile) return;
        const enumId = parseInt(tile.dataset.enumId);
        if (Module && Module._wasm_set_active_tool_v2) {
            Module.ccall('wasm_set_active_tool_v2', null, ['number'], [enumId]);
        }
        updateActiveState(enumId);
    });

    // Click outside → hide flyout
    document.addEventListener('click', (e) => {
        if (!overlay.contains(e.target)) hideFlyout();
    });
}

// ── Public API ─────────────────────────────────────────────────
window.JarvisToolbar = {
    init,
    showFlyout,
    hideFlyout,
    updateActiveState,
    renderPinned
};

// Auto-init saat DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
