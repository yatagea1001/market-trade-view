// modern_ui.js
// Script to synchronize HTML Overlay with ImGui C++ state

class HybridUI {
    constructor() {
        this.container = null;
        this.toolbar = null;
        this.navbar = null;
        this.rightbar = null;
        this.isInitialized = false;
        
        // Wait until WASM Module is ready
        this.checkInterval = setInterval(() => {
            if (typeof Module !== 'undefined' && Module.calledRun) {
                clearInterval(this.checkInterval);
                this.init();
            }
        }, 100);
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // Create Container
        this.container = document.createElement('div');
        this.container.id = 'hybrid-ui-container';
        document.body.appendChild(this.container);

        // Create Toolbar
        this.toolbar = this.createPanel('hybrid-toolbar', [
            { icon: '🖱️', action: 'tool', param: 'cursor', tooltip: 'Cursor' },
            { icon: '📏', action: 'tool', param: 'line', tooltip: 'Line' },
            { icon: '📐', action: 'tool', param: 'fib', tooltip: 'Fibonacci' },
            { icon: '🔲', action: 'tool', param: 'rect', tooltip: 'Rectangle' },
            { icon: '🖌️', action: 'tool', param: 'brush', tooltip: 'Brush' },
            { icon: 'T', action: 'tool', param: 'text', tooltip: 'Text' },
            { icon: '🌊', action: 'tool', param: 'elliot', tooltip: 'Elliot Wave' },
            { icon: '🗑️', action: 'tool', param: 'trash', tooltip: 'Clear All' }
        ]);

        // Create Navbar (Placeholder for now)
        this.navbar = this.createPanel('hybrid-navbar', [
            { icon: 'BTCUSDT ▾', action: 'nav', param: 'symbol', tooltip: 'Symbol' },
            { icon: 'M1 ▾', action: 'nav', param: 'tf', tooltip: 'Timeframe' },
            { icon: '🤖 Jarvis', action: 'toggle', param: 'jarvis', tooltip: 'Jarvis AI' },
            { icon: 'Replay', action: 'toggle', param: 'history', tooltip: 'History' }
        ]);

        // Create Rightbar
        this.rightbar = this.createPanel('hybrid-rightbar', [
            { icon: 'Tls', action: 'toggle', param: 'tools', tooltip: 'Tools' },
            { icon: 'Nav', action: 'toggle', param: 'nav', tooltip: 'Navigation' },
            { icon: 'Trd', action: 'toggle', param: 'trade', tooltip: 'Trade Panel' },
            { icon: 'Hst', action: 'toggle', param: 'history', tooltip: 'History' },
            { icon: 'Mkt', action: 'toggle', param: 'mktwatch', tooltip: 'Market Watch' },
            { icon: 'Obj', action: 'toggle', param: 'objtree', tooltip: 'Object Tree' },
            { icon: 'Set', action: 'toggle', param: 'settings', tooltip: 'Settings' }
        ]);

        this.startSyncLoop();
        console.log("[HybridUI] Initialized.");
    }

    createPanel(id, buttons) {
        let panel = document.createElement('div');
        panel.id = id;
        panel.className = 'hybrid-panel';
        
        buttons.forEach(btn => {
            let b = document.createElement('button');
            b.className = 'hybrid-btn';
            b.innerHTML = btn.icon;
            b.title = btn.tooltip;
            
            // Prevent pointer events falling through
            b.addEventListener('mousedown', e => e.stopPropagation());
            b.addEventListener('touchstart', e => e.stopPropagation());
            
            b.addEventListener('click', () => {
                if (Module.ccall) {
                    Module.ccall('jarvis_ui_action', null, ['string', 'string'], [btn.action, btn.param]);
                }
            });
            panel.appendChild(b);
        });

        this.container.appendChild(panel);
        return panel;
    }

    startSyncLoop() {
        const sync = () => {
            if (typeof Module === 'undefined' || !Module.calledRun) {
                requestAnimationFrame(sync);
                return;
            }

            // Sync Toolbar
            const tX = Module.ccall('jarvis_get_toolbar_x', 'number', [], []);
            const tY = Module.ccall('jarvis_get_toolbar_y', 'number', [], []);
            const tW = Module.ccall('jarvis_get_toolbar_w', 'number', [], []);
            const tH = Module.ccall('jarvis_get_toolbar_h', 'number', [], []);
            
            if (tW > 0 && tH > 0) {
                this.toolbar.style.opacity = '1';
                this.toolbar.style.left = tX + 'px';
                this.toolbar.style.top = tY + 'px';
                this.toolbar.style.width = tW + 'px';
                this.toolbar.style.height = tH + 'px';
            } else {
                this.toolbar.style.opacity = '0';
            }

            // Sync Navbar
            const nX = Module.ccall('jarvis_get_navbar_x', 'number', [], []);
            const nY = Module.ccall('jarvis_get_navbar_y', 'number', [], []);
            const nW = Module.ccall('jarvis_get_navbar_w', 'number', [], []);
            const nH = Module.ccall('jarvis_get_navbar_h', 'number', [], []);
            
            if (nW > 0 && nH > 0) {
                this.navbar.style.opacity = '1';
                this.navbar.style.left = nX + 'px';
                this.navbar.style.top = nY + 'px';
                this.navbar.style.width = nW + 'px';
                this.navbar.style.height = nH + 'px';
            } else {
                this.navbar.style.opacity = '0';
            }

            // Sync Rightbar
            const rX = Module.ccall('jarvis_get_rightbar_x', 'number', [], []);
            const rY = Module.ccall('jarvis_get_rightbar_y', 'number', [], []);
            const rW = Module.ccall('jarvis_get_rightbar_w', 'number', [], []);
            const rH = Module.ccall('jarvis_get_rightbar_h', 'number', [], []);
            
            if (rW > 0 && rH > 0) {
                this.rightbar.style.opacity = '1';
                this.rightbar.style.left = rX + 'px';
                this.rightbar.style.top = rY + 'px';
                this.rightbar.style.width = rW + 'px';
                this.rightbar.style.height = rH + 'px';
            } else {
                this.rightbar.style.opacity = '0';
            }

            requestAnimationFrame(sync);
        };
        requestAnimationFrame(sync);
    }
}

// Instantiate
window.hybridUI = new HybridUI();
