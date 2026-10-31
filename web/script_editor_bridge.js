/* ============================================================================
 *  script_editor_bridge.js V3 — Full HTML Panel untuk Script Editor
 * ----------------------------------------------------------------------------
 *  Project : MarketTradeWeb_V26.2
 *  Pair with: src/ui/UICustomScriptBuilder.h (V3)
 *
 *  🔥 V3 ARSITEKTUR:
 *  - ImGui Script Editor window jadi "frame" saja (judul bisa drag/dock)
 *  - Inside frame: InvisibleButton placeholder — reserves space
 *  - Setiap frame C++ kirim panel rect (x,y,w,h,visible) ke JS via
 *    wasm_sync_panel_state()
 *  - JS render SELURUH panel UI sebagai HTML overlay:
 *    • Top toolbar (+New, Open template dropdown, Run, Save, Delete, Clear)
 *    • Name input + [Active]/[Modified] indicators
 *    • Editor toolbar (Copy, Paste, Cut, Clear, Select All, Clip preview)
 *    • Code editor (<textarea> — native browser, clipboard full support)
 *    • Status header + Clear button
 *    • Status log (<textarea readonly> — selectable + copyable native)
 *
 *  Semua logik (RunScript, SaveScript, NewDocument, dll) tetap di C++.
 *  JS hanya panggil lewat Module.ccall('wasm_run_script', dll).
 *
 *  CARA PAKAI:
 *  1. Copy file ini ke web/ sebelah app.html
 *  2. Tambahkan <script src="script_editor_bridge.js"></script> sebelum </body>
 *  3. Build WASM pakai build_web.bat V3
 *  4. Reload halaman. Selesai.
 *
 *  BENEFIT V3:
 *  ✅ UI rapih & modern (CSS, bukan ImGui styling)
 *  ✅ Copy/Paste/Cut/Select All native browser (Ctrl+C, Ctrl+V)
 *  ✅ Undo/Redo native (Ctrl+Z, Ctrl+Y)
 *  ✅ IME support (Chinese, Japanese, Korean)
 *  ✅ Drag-drop text dari VS Code/notepad → editor
 *  ✅ Gak perlu recompile WASM buat ubah UI/styling (cuma edit JS)
 * ========================================================================== */

(function () {
    'use strict';

    if (window.__scriptEditorBridge) return;

    // ════════════════════════════════════════════════════════════════
    //  CSS — semua styling di-scope ke #imgui-script-editor-panel
    //  supaya gak nabrak style lain di app.html
    // ════════════════════════════════════════════════════════════════
    const PANEL_CSS = `
#imgui-script-editor-panel {
    position: fixed;
    z-index: 998;
    display: none;
    background: #0d1018;
    border: 1px solid #1a2a4a;
    border-radius: 4px;
    overflow: hidden;
    font-family: 'Inter', 'Segoe UI', sans-serif;
    color: #e0e6f0;
    font-size: 13px;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

#imgui-script-editor-panel.csb-visible {
    display: flex !important;
}

/* === Top toolbar === */
.csb-top-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: linear-gradient(180deg, #161b2a 0%, #11151f 100%);
    border-bottom: 1px solid #1a2a4a;
    flex-shrink: 0;
}

.csb-btn {
    background: #1e2535;
    color: #c8d0e0;
    border: 1px solid #2a3550;
    border-radius: 3px;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
}
.csb-btn:hover {
    background: #2a3550;
    color: #ffffff;
    border-color: #3a5078;
}
.csb-btn:active {
    transform: translateY(1px);
}
.csb-btn-primary {
    background: #1a4a8a;
    color: #ffffff;
    border-color: #2a5faa;
}
.csb-btn-primary:hover {
    background: #2a5faa;
}
.csb-btn-danger {
    background: #5a1a1a;
    color: #ffcccc;
    border-color: #7a2a2a;
}
.csb-btn-danger:hover {
    background: #7a2a2a;
    color: #ffffff;
}
.csb-btn-success {
    background: #1a5a2a;
    color: #ccffcc;
    border-color: #2a7a3a;
}
.csb-btn-success:hover {
    background: #2a7a3a;
}

.csb-btn-sm {
    padding: 4px 10px;
    font-size: 11px;
}

/* === Templates dropdown === */
.csb-dropdown {
    position: relative;
    display: inline-block;
}
.csb-dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: #161b2a;
    border: 1px solid #2a3550;
    border-radius: 4px;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 1000;
    display: none;
    padding: 4px 0;
}
.csb-dropdown-menu.csb-open {
    display: block;
}
.csb-dropdown-item {
    padding: 8px 14px;
    color: #c8d0e0;
    cursor: pointer;
    font-size: 12px;
}
.csb-dropdown-item:hover {
    background: #2a3550;
    color: #ffffff;
}

/* === Name input row === */
.csb-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #11151f;
    border-bottom: 1px solid #1a2a4a;
    flex-shrink: 0;
}
.csb-name-label {
    font-size: 11px;
    color: #8893a8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.csb-name-input {
    background: #0a0d14;
    border: 1px solid #2a3550;
    border-radius: 3px;
    color: #e0e6f0;
    padding: 4px 8px;
    font-size: 13px;
    font-family: inherit;
    width: 280px;
    outline: none;
    transition: border-color 0.15s ease;
}
.csb-name-input:focus {
    border-color: #3a5fb0;
    box-shadow: 0 0 0 2px rgba(58, 95, 176, 0.2);
}
.csb-indicator {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
}
.csb-indicator-active {
    background: rgba(50, 200, 80, 0.15);
    color: #34d399;
    border: 1px solid rgba(50, 200, 80, 0.4);
}
.csb-indicator-notsaved {
    background: rgba(120, 120, 130, 0.15);
    color: #8a8a95;
    border: 1px solid rgba(120, 120, 130, 0.3);
}
.csb-indicator-modified {
    background: rgba(240, 180, 30, 0.15);
    color: #f0b41e;
    border: 1px solid rgba(240, 180, 30, 0.4);
}

/* === Editor toolbar === */
.csb-editor-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: #0a0d14;
    border-bottom: 1px solid #1a2a4a;
    flex-shrink: 0;
}

/* === Editor textarea === */
.csb-editor {
    flex: 1 1 auto;
    background: #0a0d14;
    color: #d8dce5;
    border: 0;
    border-bottom: 1px solid #1a2a4a;
    padding: 8px 10px;
    font-family: 'Consolas', 'SF Mono', 'Cascadia Code', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    outline: none;
    resize: none;
    width: 100%;
    min-height: 100px;
    white-space: pre;
    overflow: auto;
}
.csb-editor::placeholder {
    color: #4a5266;
}

/* === Status row === */
.csb-status-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    background: #0a0d14;
    border-top: 1px solid #1a2a4a;
    flex-shrink: 0;
}
.csb-status-label {
    font-size: 11px;
    color: #8893a8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.csb-status-label .csb-hint {
    color: #4a5266;
    text-transform: none;
    margin-left: 8px;
    font-size: 10px;
}

.csb-status-log {
    flex: 0 0 auto;
    background: #06080c;
    color: #b8c0d0;
    border: 0;
    padding: 6px 10px;
    font-family: 'Consolas', 'SF Mono', monospace;
    font-size: 12px;
    line-height: 1.4;
    outline: none;
    resize: none;
    width: 100%;
    white-space: pre;
    overflow: auto;
    min-height: 60px;
    max-height: 250px;
}

/* === Empty state === */
.csb-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    color: #6a7388;
}
.csb-empty-state h3 {
    margin: 0 0 8px 0;
    color: #a8b0c0;
    font-size: 16px;
    font-weight: 600;
}
.csb-empty-state p {
    margin: 4px 0;
    font-size: 12px;
}
.csb-template-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 16px;
    max-width: 480px;
    width: 100%;
}
`;

    // ════════════════════════════════════════════════════════════════
    //  Bridge object — handles panel state + UI rendering + sync
    // ════════════════════════════════════════════════════════════════
    const bridge = {
        panel: null,            // Root overlay div
        canvas: null,
        elements: {},           // UI elements (textarea, buttons, etc.)
        currentRect: { x: 0, y: 0, w: 0, h: 0, visible: false },
        lastDocIdx: -2,          // -2 supaya pasti trigger first load
        lastStatusLogCount: -1,
        lastDocCount: -1,
        statusAutoScroll: true,
        refreshTimer: null,
        styleInjected: false,

        // ─── Init: inject CSS, create panel, attach to DOM ────────────
        init() {
            this.canvas = document.querySelector('canvas.emscripten')
                       || document.querySelector('canvas');
            if (!this.canvas) {
                console.warn('[Script Editor Bridge] Canvas not found');
                return;
            }

            // Inject CSS (once)
            if (!this.styleInjected) {
                const style = document.createElement('style');
                style.textContent = PANEL_CSS;
                document.head.appendChild(style);
                this.styleInjected = true;
            }

            // Build panel HTML
            this.panel = document.createElement('div');
            this.panel.id = 'imgui-script-editor-panel';
            this.panel.innerHTML = this.buildPanelHTML();
            document.body.appendChild(this.panel);

            // Cache UI element references
            this.elements = {
                topToolbar: this.panel.querySelector('.csb-top-toolbar'),
                nameInput: this.panel.querySelector('.csb-name-input'),
                indicatorActive: this.panel.querySelector('.csb-indicator-active'),
                indicatorNotSaved: this.panel.querySelector('.csb-indicator-notsaved'),
                indicatorModified: this.panel.querySelector('.csb-indicator-modified'),
                editorToolbar: this.panel.querySelector('.csb-editor-toolbar'),
                editor: this.panel.querySelector('.csb-editor'),
                statusLog: this.panel.querySelector('.csb-status-log'),
                emptyState: this.panel.querySelector('.csb-empty-state'),
                mainContent: this.panel.querySelector('.csb-main-content'),
                dropdownMenu: this.panel.querySelector('.csb-dropdown-menu'),
            };

            // Wire up events
            this.bindEvents();

            // Start polling for status log + doc list refresh
            this.refreshTimer = setInterval(() => this.poll(), 250);

            console.log('[Script Editor Bridge] V3 initialized — full HTML panel');
        },

        // ─── Build panel HTML structure ────────────────────────────────
        buildPanelHTML() {
            return `
<div class="csb-top-toolbar">
    <button class="csb-btn csb-btn-success csb-btn-sm" data-action="new">+ New</button>
    <div class="csb-dropdown">
        <button class="csb-btn csb-btn-sm" data-action="open">Open ▾</button>
        <div class="csb-dropdown-menu"></div>
    </div>
    <button class="csb-btn csb-btn-primary csb-btn-sm" data-action="run">▶ Run</button>
    <button class="csb-btn csb-btn-sm" data-action="save">💾 Save</button>
    <button class="csb-btn csb-btn-danger csb-btn-sm" data-action="delete">🗑 Delete</button>
    <button class="csb-btn csb-btn-sm" data-action="clear-console">Clear Log</button>
</div>

<div class="csb-main-content" style="flex:1; display:flex; flex-direction:column; min-height:0;">
    <!-- Empty state (shown when no docs) -->
    <div class="csb-empty-state" style="display:none;">
        <h3>No documents open</h3>
        <p>Click "+ New" or "Open" to start</p>
        <div class="csb-template-grid"></div>
    </div>

    <!-- Active document UI -->
    <div class="csb-active-doc" style="flex:1; display:flex; flex-direction:column; min-height:0;">
        <div class="csb-name-row">
            <span class="csb-name-label">Name:</span>
            <input type="text" class="csb-name-input" maxlength="127" placeholder="Script name...">
            <span class="csb-indicator csb-indicator-notsaved" style="display:none;">Not Saved</span>
            <span class="csb-indicator csb-indicator-active" style="display:none;">● Active</span>
            <span class="csb-indicator csb-indicator-modified" style="display:none;">* Modified</span>
        </div>

        <div class="csb-editor-toolbar">
            <button class="csb-btn csb-btn-sm" data-action="copy">📋 Copy</button>
            <button class="csb-btn csb-btn-sm" data-action="paste">📥 Paste</button>
            <button class="csb-btn csb-btn-sm" data-action="cut">✂ Cut</button>
            <button class="csb-btn csb-btn-sm" data-action="clear-code">Clear Code</button>
            <button class="csb-btn csb-btn-sm" data-action="select-all">Select All</button>
            <button class="csb-btn csb-btn-sm" data-action="clip-preview">👁 Preview Clipboard</button>
        </div>

        <textarea class="csb-editor" spellcheck="false" placeholder="// Type your formula here..."></textarea>

        <div class="csb-status-header">
            <span class="csb-status-label">Status <span class="csb-hint">(click text, Ctrl+A → Ctrl+C to copy)</span></span>
            <button class="csb-btn csb-btn-danger csb-btn-sm" data-action="clear-status">Clear Status</button>
        </div>

        <textarea class="csb-status-log" readonly spellcheck="false"></textarea>
    </div>
</div>
`;
        },

        // ─── Bind all button + input events ───────────────────────────
        bindEvents() {
            // Delegate button clicks
            this.panel.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                this.handleAction(action, btn);
            });

            // Name input (debounced sync)
            let nameTimer = null;
            this.elements.nameInput.addEventListener('input', () => {
                if (nameTimer) clearTimeout(nameTimer);
                nameTimer = setTimeout(() => {
                    this.callCPP('wasm_set_doc_name', [this.elements.nameInput.value]);
                    this.refreshDocIndicators();
                }, 300);
            });

            // Editor textarea (debounced sync — write to doc.code)
            let editorTimer = null;
            this.elements.editor.addEventListener('input', () => {
                if (editorTimer) clearTimeout(editorTimer);
                editorTimer = setTimeout(() => {
                    this.syncToCPP();
                }, 200);
            });

            // Editor Tab key → insert 4 spaces
            this.elements.editor.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.handleTab(e.shiftKey);
                }
            });

            // Status log: detect user scroll → toggle auto-scroll
            this.elements.statusLog.addEventListener('scroll', () => {
                const ta = this.elements.statusLog;
                const atBottom = (ta.scrollHeight - ta.scrollTop - ta.clientHeight) < 20;
                this.statusAutoScroll = atBottom;
            });

            // Click outside dropdown → close it
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.csb-dropdown')) {
                    this.elements.dropdownMenu?.classList.remove('csb-open');
                }
            });
        },

        // ─── Handle button clicks ─────────────────────────────────────
        handleAction(action, btn) {
            switch (action) {
                case 'new':       this.callCPP('wasm_new_document', []); break;
                case 'open':      this.toggleTemplateDropdown(); break;
                case 'run':       this.callCPP('wasm_run_script', []); break;
                case 'save':      this.callCPP('wasm_save_script', []); break;
                case 'delete':    this.callCPP('wasm_delete_script', []); break;
                case 'clear-console':
                    this.callCPP('wasm_clear_console', []);
                    this.statusAutoScroll = true;
                    break;
                case 'copy':      this.copySelection(); break;
                case 'paste':     this.pasteFromClipboard(); break;
                case 'cut':       this.cutSelection(); break;
                case 'clear-code':
                    if (confirm('Clear code editor?')) {
                        this.elements.editor.value = '';
                        this.syncToCPP();
                    }
                    break;
                case 'select-all': this.selectAll(); break;
                case 'clip-preview': this.previewClipboard(); break;
                case 'clear-status':
                    this.callCPP('wasm_clear_console', []);
                    this.statusAutoScroll = true;
                    break;
            }
        },

        // ─── Toggle Open template dropdown ────────────────────────────
        toggleTemplateDropdown() {
            const menu = this.elements.dropdownMenu;
            if (menu.classList.contains('csb-open')) {
                menu.classList.remove('csb-open');
                return;
            }

            // Populate menu from C++ templates
            menu.innerHTML = '';
            const count = this.callCPP('wasm_get_template_count', [], 'number') || 0;
            for (let i = 0; i < count; i++) {
                const name = this.callCPP('wasm_get_template_name', [i], 'string');
                const item = document.createElement('div');
                item.className = 'csb-dropdown-item';
                item.textContent = name;
                item.addEventListener('click', () => {
                    this.callCPP('wasm_open_template', [i]);
                    menu.classList.remove('csb-open');
                });
                menu.appendChild(item);
            }

            menu.classList.add('csb-open');
        },

        // ─── Helper: call C++ function via Module.ccall ───────────────
        callCPP(name, args, returnType) {
            if (typeof Module === 'undefined' || !Module.ccall) {
                console.warn('[Bridge] Module.ccall not available for:', name);
                return null;
            }
            try {
                const argTypes = args.map(a => typeof a === 'number' ? 'number' : 'string');
                return Module.ccall(name, returnType || null, argTypes, args);
            } catch (e) {
                console.error('[Bridge] ccall failed:', name, e);
                return null;
            }
        },

        // ─── Update panel rect + visibility (dipanggil C++ tiap frame)
        updatePanelState(x, y, w, h, visible) {
            if (!this.panel || !this.canvas) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            const winX = canvasRect.left + x;
            const winY = canvasRect.top + y;

            this.currentRect = { x: winX, y: winY, w, h, visible: !!visible };

            this.panel.style.left = winX + 'px';
            this.panel.style.top = winY + 'px';
            this.panel.style.width = w + 'px';
            this.panel.style.height = h + 'px';

            if (visible) {
                this.panel.classList.add('csb-visible');
            } else {
                this.panel.classList.remove('csb-visible');
            }
        },

        // ─── Polling: refresh UI state dari C++ ───────────────────────
        poll() {
            if (!this.panel || !this.panel.classList.contains('csb-visible')) return;
            this.refreshDocList();
            this.refreshStatusLog();
            this.refreshActiveDoc();
        },

        // ─── Refresh: doc list (kalau count berubah, reload) ─────────
        refreshDocList() {
            const count = this.callCPP('wasm_get_doc_count', [], 'number') || 0;
            if (count === this.lastDocCount) return;
            this.lastDocCount = count;

            // Show/hide empty state vs active doc UI
            const emptyState = this.elements.emptyState;
            const activeDoc = this.panel.querySelector('.csb-active-doc');

            if (count === 0) {
                emptyState.style.display = 'flex';
                activeDoc.style.display = 'none';
                this.populateTemplateGrid();
            } else {
                emptyState.style.display = 'none';
                activeDoc.style.display = 'flex';
            }
        },

        populateTemplateGrid() {
            const grid = this.elements.emptyState.querySelector('.csb-template-grid');
            if (!grid) return;
            grid.innerHTML = '';
            const count = this.callCPP('wasm_get_template_count', [], 'number') || 0;
            for (let i = 0; i < count; i++) {
                const name = this.callCPP('wasm_get_template_name', [i], 'string');
                const btn = document.createElement('button');
                btn.className = 'csb-btn csb-btn-sm';
                btn.textContent = name;
                btn.addEventListener('click', () => {
                    this.callCPP('wasm_open_template', [i]);
                });
                grid.appendChild(btn);
            }
        },

        // ─── Refresh: active doc (code, name, indicators) ──────────────
        refreshActiveDoc() {
            const activeIdx = this.callCPP('wasm_get_active_doc_idx', [], 'number');
            if (activeIdx === this.lastDocIdx && activeIdx >= 0) {
                // Same doc — only refresh indicators
                this.refreshDocIndicators();
                return;
            }

            this.lastDocIdx = activeIdx;
            if (activeIdx < 0) return;

            // Doc switched — reload everything
            const code = this.callCPP('wasm_get_script_code', [], 'string') || '';
            this.elements.editor.value = code;

            const name = this.callCPP('wasm_get_doc_name', [], 'string') || '';
            this.elements.nameInput.value = name;

            this.refreshDocIndicators();
            console.log('[Bridge] Loaded doc #' + activeIdx + ' (' + name + ')');
        },

        refreshDocIndicators() {
            const activeIdx = this.callCPP('wasm_get_active_doc_idx', [], 'number');
            if (activeIdx < 0) return;

            const state = this.callCPP('wasm_get_doc_state', [activeIdx], 'number') || 0;
            const isModified = !!(state & 1);
            const isActive = !!(state & 2);

            this.elements.indicatorModified.style.display = isModified ? 'inline-block' : 'none';
            this.elements.indicatorActive.style.display = isActive ? 'inline-block' : 'none';
            this.elements.indicatorNotSaved.style.display = isActive ? 'none' : 'inline-block';
        },

        // ─── Refresh: status log (only if count changed) ──────────────
        refreshStatusLog() {
            const count = this.callCPP('wasm_get_status_log_count', [], 'number');
            if (count === this.lastStatusLogCount) return;
            this.lastStatusLogCount = count;

            const log = this.callCPP('wasm_get_status_log', [], 'string') || '';
            this.elements.statusLog.value = log;

            if (this.statusAutoScroll) {
                this.elements.statusLog.scrollTop = this.elements.statusLog.scrollHeight;
            }
        },

        // ─── Sync: editor → C++ doc.code ───────────────────────────────
        syncToCPP() {
            this.callCPP('wasm_set_script_code', [this.elements.editor.value]);
            this.refreshDocIndicators();
        },

        // ─── Editor operations ─────────────────────────────────────────
        getText() { return this.elements.editor ? this.elements.editor.value : ''; },
        setText(t) { if (this.elements.editor) this.elements.editor.value = t || ''; },

        handleTab(shiftKey) {
            const ta = this.elements.editor;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            if (shiftKey) {
                const before = ta.value.substring(0, start);
                const lineStart = before.lastIndexOf('\n') + 1;
                if (ta.value.substring(lineStart, lineStart + 4) === '    ') {
                    ta.value = ta.value.substring(0, lineStart) + ta.value.substring(lineStart + 4);
                    ta.selectionStart = ta.selectionEnd = start - 4;
                }
            } else {
                ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
                ta.selectionStart = ta.selectionEnd = start + 4;
            }
            this.syncToCPP();
        },

        async copySelection() {
            const ta = this.elements.editor;
            const start = ta.selectionStart, end = ta.selectionEnd;
            const hasSelection = (start !== end);
            const text = hasSelection ? ta.value.substring(start, end) : ta.value;
            if (!text) return;
            window.__imguiClipboard = text;
            if (navigator.clipboard) {
                try { await navigator.clipboard.writeText(text); } catch (e) {
                    this.fallbackCopy(text);
                }
            } else { this.fallbackCopy(text); }
        },

        fallbackCopy(text) {
            const tmp = document.createElement('textarea');
            tmp.value = text;
            tmp.style.position = 'fixed'; tmp.style.left = '-9999px'; tmp.style.opacity = '0';
            document.body.appendChild(tmp);
            tmp.select(); document.execCommand('copy');
            document.body.removeChild(tmp);
        },

        async pasteFromClipboard() {
            const ta = this.elements.editor;
            if (navigator.clipboard) {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        const start = ta.selectionStart, end = ta.selectionEnd;
                        ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
                        ta.selectionStart = ta.selectionEnd = start + text.length;
                        window.__imguiClipboard = text;
                        this.syncToCPP();
                    }
                } catch (e) { window.prompt('Tempel kode:', ''); }
            }
        },

        async cutSelection() {
            await this.copySelection();
            const ta = this.elements.editor;
            const start = ta.selectionStart, end = ta.selectionEnd;
            if (start !== end) {
                ta.value = ta.value.substring(0, start) + ta.value.substring(end);
                ta.selectionStart = ta.selectionEnd = start;
            } else { ta.value = ''; }
            this.syncToCPP();
        },

        selectAll() {
            this.elements.editor.focus();
            this.elements.editor.select();
        },

        previewClipboard() {
            if (navigator.clipboard) {
                navigator.clipboard.readText().then(text => {
                    console.log('[Clipboard Preview]', (text || '').length, 'chars:\n', text);
                }).catch(err => console.warn('Preview failed:', err));
            }
        },
    };

    window.__scriptEditorBridge = bridge;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bridge.init());
    } else {
        bridge.init();
    }

    console.log('[Script Editor Bridge] V3 module loaded — full HTML panel approach');
})();
