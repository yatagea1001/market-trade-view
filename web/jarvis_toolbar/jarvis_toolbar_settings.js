// ================================================================
// jarvis_toolbar_settings.js — Settings popup window (JS overlay)
// ----------------------------------------------------------------
// ADAPTASI DARI: ToolsPalette_Settings.mqh (2811 lines)
//
// Popup window modal dengan 4 tab:
//   - Style, Text, Coordinates, Visibility
//
// Strategi: HTML/CSS overlay (bukan ImGui) supaya styling fleksibel.
// Property values disimpen di C++ (DrawnObject.propValues),
// JS baca via wasm_get_property / wasm_set_property.
//
// TODO: implement wasm_get_property / wasm_set_property di C++
// ================================================================

(function() {

let settingsEl = null;
let isOpen = false;
let currentObjId = -1;

function init() {
    settingsEl = document.createElement('div');
    settingsEl.id = 'jt-settings-popup';
    settingsEl.className = 'jt-settings';
    settingsEl.style.display = 'none';
    document.body.appendChild(settingsEl);
    injectCSS();
    bindEvents();
}

function injectCSS() {
    if (document.getElementById('jt-settings-css')) return;
    const style = document.createElement('style');
    style.id = 'jt-settings-css';
    style.textContent = `
        .jt-settings {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 420px;
            max-height: 480px;
            background: rgba(30, 30, 40, 0.98);
            border: 1px solid rgba(80, 80, 100, 0.6);
            border-radius: 8px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            z-index: 9999;
            pointer-events: auto;
            backdrop-filter: blur(12px);
            display: flex;
            flex-direction: column;
            font-family: 'Segoe UI', sans-serif;
            color: #ddd;
        }
        .jt-settings-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-bottom: 1px solid rgba(80, 80, 100, 0.3);
        }
        .jt-settings-title {
            font-size: 14px;
            font-weight: bold;
            color: #50d0ff;
            flex: 1;
        }
        .jt-settings-btn {
            padding: 4px 10px;
            background: rgba(60, 60, 80, 0.6);
            border: 1px solid rgba(100, 100, 120, 0.4);
            color: #ccc;
            font-size: 12px;
            border-radius: 4px;
            cursor: pointer;
        }
        .jt-settings-btn:hover {
            background: rgba(80, 200, 220, 0.2);
            border-color: rgba(80, 200, 220, 0.5);
            color: #fff;
        }
        .jt-settings-btn.danger:hover {
            background: rgba(255, 80, 80, 0.2);
            border-color: rgba(255, 80, 80, 0.5);
        }
        .jt-settings-tabs {
            display: flex;
            border-bottom: 1px solid rgba(80, 80, 100, 0.3);
        }
        .jt-settings-tab {
            flex: 1;
            padding: 8px 12px;
            text-align: center;
            background: transparent;
            border: none;
            color: #888;
            font-size: 12px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .jt-settings-tab:hover { color: #ccc; }
        .jt-settings-tab.active {
            color: #50d0ff;
            border-bottom-color: #50d0ff;
        }
        .jt-settings-body {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
        }
        .jt-prop-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
            padding: 6px 8px;
            border-radius: 4px;
        }
        .jt-prop-row:hover { background: rgba(255, 255, 255, 0.03); }
        .jt-prop-label {
            flex: 1;
            font-size: 12px;
            color: #aaa;
        }
        .jt-prop-widget {
            flex: 2;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .jt-prop-widget input[type="text"],
        .jt-prop-widget input[type="number"],
        .jt-prop-widget select {
            flex: 1;
            padding: 4px 8px;
            background: rgba(20, 20, 28, 0.8);
            border: 1px solid rgba(100, 100, 120, 0.4);
            color: #fff;
            font-size: 12px;
            border-radius: 3px;
        }
        .jt-prop-widget input[type="color"] {
            width: 32px; height: 24px;
            background: transparent;
            border: 1px solid rgba(100, 100, 120, 0.4);
            border-radius: 3px;
            cursor: pointer;
        }
        .jt-prop-widget input[type="range"] {
            flex: 1;
        }
        .jt-prop-widget input[type="checkbox"] {
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

function openForObject(objId) {
    currentObjId = objId;
    isOpen = true;
    render();
    settingsEl.style.display = 'flex';
}

function close() {
    isOpen = false;
    currentObjId = -1;
    settingsEl.style.display = 'none';
}

function isOpenFn() { return isOpen; }

function render() {
    if (currentObjId < 0) { close(); return; }
    // TODO: get toolType dari C++ via wasm_get_object_tool_type(objId)
    // Untuk starter: hardcoded contoh properties
    settingsEl.innerHTML = `
        <div class="jt-settings-header">
            <span class="jt-settings-title">Settings: Object #${currentObjId}</span>
            <button class="jt-settings-btn" id="jt-lock-btn">🔓 Lock</button>
            <button class="jt-settings-btn" id="jt-hide-btn">👁 Visible</button>
            <button class="jt-settings-btn danger" id="jt-delete-btn">🗑 Delete</button>
            <button class="jt-settings-btn" id="jt-close-btn">✕</button>
        </div>
        <div class="jt-settings-tabs">
            <button class="jt-settings-tab active" data-tab="style">Style</button>
            <button class="jt-settings-tab" data-tab="text">Text</button>
            <button class="jt-settings-tab" data-tab="coords">Coordinates</button>
            <button class="jt-settings-tab" data-tab="vis">Visibility</button>
        </div>
        <div class="jt-settings-body" id="jt-settings-body">
            <!-- Diisi oleh renderTab() -->
        </div>
    `;
    renderTab('style');
}

function renderTab(tabName) {
    const body = document.getElementById('jt-settings-body');
    if (!body) return;

    // Update tab active state
    document.querySelectorAll('.jt-settings-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // TODO: ambil properties dari C++ via wasm_get_properties_for_object(objId)
    // Untuk starter: render contoh properties
    if (tabName === 'style') {
        body.innerHTML = `
            <div class="jt-prop-row">
                <span class="jt-prop-label">Line color</span>
                <div class="jt-prop-widget">
                    <input type="color" value="#50d0ff">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Width</span>
                <div class="jt-prop-widget">
                    <select>
                        <option>1px</option>
                        <option selected>2px</option>
                        <option>3px</option>
                        <option>4px</option>
                    </select>
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Style</span>
                <div class="jt-prop-widget">
                    <select>
                        <option selected>Solid</option>
                        <option>Dashed</option>
                        <option>Dotted</option>
                        <option>Dash-Dot</option>
                    </select>
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Opacity</span>
                <div class="jt-prop-widget">
                    <input type="range" min="0" max="100" value="100">
                    <span style="font-size:11px;color:#888;min-width:32px;">100%</span>
                </div>
            </div>
        `;
    } else if (tabName === 'text') {
        body.innerHTML = `
            <div class="jt-prop-row">
                <span class="jt-prop-label">Text content</span>
                <div class="jt-prop-widget">
                    <input type="text" value="Sample text">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Font size</span>
                <div class="jt-prop-widget">
                    <select>
                        <option>10</option>
                        <option selected>12</option>
                        <option>14</option>
                        <option>16</option>
                        <option>18</option>
                        <option>20</option>
                    </select>
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Bold</span>
                <div class="jt-prop-widget">
                    <input type="checkbox">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Italic</span>
                <div class="jt-prop-widget">
                    <input type="checkbox">
                </div>
            </div>
        `;
    } else if (tabName === 'coords') {
        body.innerHTML = `
            <div class="jt-prop-row">
                <span class="jt-prop-label">P0 Price</span>
                <div class="jt-prop-widget">
                    <input type="number" step="0.00001" value="1.08500">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">P0 Time</span>
                <div class="jt-prop-widget">
                    <input type="text" value="1719900000">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">P1 Price</span>
                <div class="jt-prop-widget">
                    <input type="number" step="0.00001" value="1.09000">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">P1 Time</span>
                <div class="jt-prop-widget">
                    <input type="text" value="1719986400">
                </div>
            </div>
        `;
    } else if (tabName === 'vis') {
        body.innerHTML = `
            <div class="jt-prop-row">
                <span class="jt-prop-label">Extend left</span>
                <div class="jt-prop-widget">
                    <input type="checkbox">
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Extend right</span>
                <div class="jt-prop-widget">
                    <input type="checkbox" checked>
                </div>
            </div>
            <div class="jt-prop-row">
                <span class="jt-prop-label">Show price label</span>
                <div class="jt-prop-widget">
                    <input type="checkbox" checked>
                </div>
            </div>
        `;
    }
}

function bindEvents() {
    document.addEventListener('click', (e) => {
        // Tab click
        const tab = e.target.closest('.jt-settings-tab');
        if (tab) {
            renderTab(tab.dataset.tab);
            return;
        }
        // Close button
        if (e.target.id === 'jt-close-btn') { close(); return; }
        // Lock button
        if (e.target.id === 'jt-lock-btn') {
            // TODO: call wasm_drawing_toggle_lock_selected
            e.target.textContent = e.target.textContent.startsWith('🔓')
                ? '🔒 Locked' : '🔓 Lock';
            return;
        }
        // Hide button
        if (e.target.id === 'jt-hide-btn') {
            // TODO: call wasm_drawing_toggle_visibility_selected
            e.target.textContent = e.target.textContent.startsWith('👁')
                ? '🚫 Hidden' : '👁 Visible';
            return;
        }
        // Delete button
        if (e.target.id === 'jt-delete-btn') {
            if (Module && Module._wasm_drawing_delete_selected) {
                Module.ccall('wasm_drawing_delete_selected', null, [], []);
            }
            close();
            return;
        }
        // Click outside popup → close
        if (isOpen && !settingsEl.contains(e.target)) {
            // Jangan close kalau klik di toolbar
            const overlay = document.getElementById('jarvis-toolbar-overlay');
            if (!overlay || !overlay.contains(e.target)) close();
        }
    });

    // ESC → close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) close();
    });
}

// ── Public API ─────────────────────────────────────────────────
window.JarvisToolbarSettings = {
    init,
    openForObject,
    close,
    isOpen: isOpenFn
};

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
