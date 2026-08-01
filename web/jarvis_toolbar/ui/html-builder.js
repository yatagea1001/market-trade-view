// ============================================================
// html-builder.js — HTML Template Generator
// ------------------------------------------------------------
// Menghasilkan HTML string untuk overlay, tombol, tooltip, dll.
// Dipisahkan dari CSS dan logic supaya mudah edit tampilan.
//
// NAV BAR STRUCTURE:
//   ┌─────────────────────────────────────────┬──────────┐
//   │ #jt-nav-scrollable (flex, overflow)     │ #pinned  │
//   │ Symbol │ TF │ Candle │ Ind │ +New │ Rep │  🔔 Alert │
//   └─────────────────────────────────────────┴──────────┘
// ============================================================

window.JT = window.JT || {};

JT.HtmlBuilder = {

    /**
     * Build seluruh HTML overlay.
     * @returns {string} HTML string
     */
    buildOverlay() {
        return `
    <div id="jt-drawing-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${JT.DrawingTools.TOOLS.map(t => this.buildButton(t, 'drawing')).join('')}
        </div>
        <div class="jt-scroll-indicator"></div>
    </div>

    <div id="jt-right-toolbar" class="jt-toolbar">
        <div class="jt-toolbar-inner">
            ${JT.RightBarTools.TOOLS.map(t => this.buildButton(t, 'right')).join('')}
        </div>
        <div class="jt-scroll-indicator"></div>
    </div>

    <!-- ═══ NAV TOOLBAR ═══════════════════════════════════════
         Struktur: Scrollable Area (kiri) + Pinned Alert (kanan)
         Alert selalu kelihatan, tidak bisa di-scroll.
    ══════════════════════════════════════════════════════════ -->
    <div id="jt-nav-toolbar" class="jt-toolbar">
        <div id="jt-nav-scrollable" class="jt-nav-scrollable">
            <div class="jt-toolbar-inner">
                ${JT.NavTools.SCROLLABLE_TOOLS.map(t => this.buildNavButton(t)).join('')}
            </div>
            <div class="jt-scroll-indicator"></div>
        </div>
        <div class="jt-nav-pinned-separator"></div>
        <div id="jt-nav-alert-pinned" class="jt-nav-pinned">
            ${this.buildAlertPinnedButton(JT.NavTools.ALERT_PINNED)}
        </div>
    </div>

    <!-- Context Menu (klik kanan / long-press) -->
    <div id="jt-context-menu" class="jt-context-menu">
        <div class="jt-context-menu-header" id="jt-ctx-header">Tools</div>
        <div class="jt-context-menu-separator"></div>
        <div class="jt-context-menu-item" data-action="toggle-title">
            <span id="jt-ctx-title-icon">👁️</span>
            <span id="jt-ctx-title-label">Sembunyikan Title Bar</span>
        </div>
        <div class="jt-context-menu-item" data-action="close-frame">
            <span>✕</span>
            <span>Tutup Frame</span>
        </div>
    </div>

    <!-- Tooltip (shared) -->
    <div id="jt-tooltip" class="jt-tooltip"></div>
    `;
    },

    /**
     * Build tombol biasa (drawing / right bar).
     */
    buildButton(tool, group) {
        // Separator
        if (tool.id === 'separator' || tool.isSeparator) {
            return `<div class="jt-separator"></div>`;
        }

        const iconHTML = tool.icon
            ? `<img src="${tool.icon}" alt="${tool.label}" class="jt-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='block';"/><span class="jt-icon-svg" style="display:none;">${tool.svg}</span>`
            : `<span class="jt-icon-svg">${tool.svg}</span>`;

        return `
    <button class="jt-btn" data-tool-id="${tool.id}" data-group="${group}" data-tooltip="${tool.tooltip}" data-active="false">
        ${iconHTML}
    </button>
    `;
    },

    /**
     * Build tombol navigasi (lebih lebar + label dinamis).
     */
    buildNavButton(tool) {
        const iconHTML = tool.icon
            ? `<img src="${tool.icon}" alt="${tool.label}" class="jt-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><span class="jt-icon-svg" style="display:none;">${tool.svg}</span>`
            : `<span class="jt-icon-svg">${tool.svg}</span>`;

        return `
    <button class="jt-btn jt-nav-btn" data-tool-id="${tool.id}" data-seg-idx="${tool.segIdx}" data-tooltip="${tool.tooltip}" data-active="false">
        ${iconHTML}
        <span class="jt-nav-label" data-nav-label="${tool.id}">${tool.label}</span>
    </button>
    `;
    },

    /**
     * Build tombol Alert PINNED (selalu di kanan, + badge notif).
     * Hanya icon bell — tanpa tulisan, compact seperti WA.
     * Badge merah muncul kalau ada notif.
     */
    buildAlertPinnedButton(tool) {
        const iconHTML = tool.icon
            ? `<img src="${tool.icon}" alt="${tool.label}" class="jt-icon-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><span class="jt-icon-svg" style="display:none;">${tool.svg}</span>`
            : `<span class="jt-icon-svg">${tool.svg}</span>`;

        return `
    <button class="jt-btn jt-alert-btn" data-tool-id="${tool.id}" data-seg-idx="${tool.segIdx}" data-tooltip="${tool.tooltip}" data-active="false">
        ${iconHTML}
        <!-- Notification Badge (seperti WA) -->
        <span id="jt-alert-badge" class="jt-badge">0</span>
    </button>
    `;
    }
};
