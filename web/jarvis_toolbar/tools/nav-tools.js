// ============================================================
// nav-tools.js — Navigation Toolbar (Symbol, TF, Candle, dll)
// ------------------------------------------------------------
// Tombol navigasi + label dinamis + icon update dari C++.
//
// ARSITEKTUR NAV BAR:
//   ┌──────────┬─────────────────────────────────────────┬──────────┐
//   │ 👁 Header │ Symbol │ TF │ Candle │ Ind │ +New │ Rep │  🔔 Alert │
//   │  pinned  │ ← scrollable (bisa geser) →            │  pinned  │
//   └──────────┴─────────────────────────────────────────┴──────────┘
//
//   - HEADER TOGGLE (KIRI): Pinned di paling kiri, show/hide #app-header
//   - SCROLLABLE TOOLS: Symbol → Replay (bisa di-scroll)
//   - PINNED ALERT (KANAN): Selalu kelihatan di kanan, tidak bisa scroll
//     + Badge merah (seperti WA) kalau ada notif
//
// CARA TAMBAH NAV BUTTON BARU:
// 1. Tambah objek di array SCROLLABLE_TOOLS
// 2. Tambah case di bind() (kalau special handling)
// 3. Selesai
// ============================================================

window.JT = window.JT || {};

JT.NavTools = {

    // ── Scrollable Tools (bisa di-scroll saat window sempit) ──
    SCROLLABLE_TOOLS: [
        {
            id: 'nav-symbol',
            segIdx: 0,
            icon: 'assets/gold.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h6"/></svg>',
            label: 'Symbol',
            tooltip: 'Pilih Symbol (XAUUSD, EURUSD, BTCUSD, dll)',
            isWide: true,
            dynamicIcon: true
        },
        {
            id: 'nav-tf',
            segIdx: 1,
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
            label: 'TF',
            tooltip: 'Pilih Timeframe (M1, M5, H1, dll)',
            isWide: true
        },
        {
            id: 'nav-candle',
            segIdx: 2,
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="4" height="10"/><line x1="8" y1="4" x2="8" y2="20"/><rect x="14" y="6" width="4" height="12"/><line x1="16" y1="2" x2="16" y2="22"/></svg>',
            label: 'Candle',
            tooltip: 'Pilih Style Candle (Line, Area, Footprint)',
            isWide: true,
            dynamicIcon: true
        },
        {
            id: 'nav-indicator',
            segIdx: 3,
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>',
            label: 'Indicator',
            tooltip: 'Buka Panel Indikator',
            isWide: true
        },
        {
            id: 'nav-new',
            segIdx: 4,
            icon: null,
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
            label: '+ New',
            tooltip: 'Tambah Chart Baru',
            isWide: true
        },
        {
            id: 'nav-replay',
            segIdx: -1,              // special: tombol replay
            icon: 'assets/replay.png',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>',
            label: 'Replay',
            tooltip: 'Mode Replay',
            isWide: true,
            isReplay: true
        }
    ],

    // ── Pinned Header Toggle Button (TIDAK bisa di-scroll, selalu di KIRI) ──
    HEADER_TOGGLE_PINNED: {
        id: 'nav-header-toggle',
        segIdx: -4,
        icon: null,
        // Panel dengan header bar di atas (header TAMPIL)
        svgShow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="8" y1="8" x2="8" y2="21"/></svg>',
        // Panel tanpa header bar (header TERSEMBUNYI)
        svgHide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="3" x2="8" y2="21"/></svg>',
        get svg() { return JT.NavTools.headerVisible ? this.svgShow : this.svgHide; },
        label: 'Header',
        tooltip: 'Show / Hide Header Bar',
        isWide: false,
        isHeaderToggle: true,
        isPinned: true
    },

    // ── Header Visibility State ──
    headerVisible: true,   // true = header kelihatan (default)

    // ── Pinned Alert Button (TIDAK bisa di-scroll, selalu di kanan) ──
    ALERT_PINNED: {
        id: 'nav-alert',
        segIdx: -3,
        icon: null,
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
        label: 'Alert',
        tooltip: 'Atur Notifikasi Alert',
        isWide: true,
        isAlert: true,
        isPinned: true
    },

    // ── Alert Badge State ──
    alertBadgeCount: 0,       // Jumlah notif unread (0 = sembunyikan badge)
    alertBadgeVisible: false,  // Badge kelihatan?
    _lastSeenTriggeredCount: null,  // Baseline triggered count dari C++ (WA-style: track unread)

    // ── Legacy TOOLS getter (backward compat) ──
    get TOOLS() {
        return [...this.SCROLLABLE_TOOLS, this.ALERT_PINNED];
    },

    // ── SVG icons untuk Candle Style (index 0-4) ──
    CANDLE_SVGS: [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="4" height="10"/><line x1="8" y1="4" x2="8" y2="20"/><rect x="14" y="6" width="4" height="12"/><line x1="16" y1="2" x2="16" y2="22"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 9 11 13 15 21 7"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="6" width="14" height="12"/><line x1="5" y1="10" x2="19" y2="10"/><line x1="5" y1="14" x2="19" y2="14"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="8" y1="4" x2="8" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="4" x2="16" y2="20"/></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="8" height="4"/><rect x="13" y="8" width="8" height="8"/></svg>'
    ],

    // ── Event Binding ──
    bind() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        // Bind scrollable nav buttons
        overlay.querySelectorAll('#jt-nav-scrollable .jt-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleNavClick(btn);
            });
        });

        // Bind pinned header toggle button (kiri)
        const headerToggleBtn = overlay.querySelector('#jt-nav-header-toggle-pinned');
        if (headerToggleBtn) {
            headerToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleHeaderToggleClick(headerToggleBtn);
            });
        }

        // Bind pinned alert button (kanan)
        const alertBtn = overlay.querySelector('#jt-nav-alert-pinned');
        if (alertBtn) {
            alertBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._handleAlertClick(alertBtn);
            });
        }
    },

    // ── Click Handler: Header Toggle Button (pinned kiri) ──
    _handleHeaderToggleClick(btn) {
        this.headerVisible = !this.headerVisible;

        const header = document.getElementById('app-header');
        const canvas = document.getElementById('canvas');     // ImGui canvas
        const HEADER_H = 36; // px — harus sama dengan CSS top: 36px

        if (this.headerVisible) {
            // ── TAMPILKAN header ──
            // 1. Munculkan dulu (display flex) lalu fade-in
            if (header) {
                header.style.display = '';
                // Force reflow supaya transition jalan dari opacity 0
                void header.offsetHeight;
                header.style.opacity = '1';
                header.style.transform = 'translateY(0)';
            }
            // 2. Canvas turun kembali ke posisi normal (dengan smooth transition)
            if (canvas) {
                canvas.style.transition = 'top 0.3s ease, height 0.3s ease';
                canvas.style.top  = HEADER_H + 'px';
                canvas.style.height = 'calc(100% - ' + HEADER_H + 'px)';
            }
        } else {
            // ── SEMBUNYIKAN header ──
            // 1. Slide up header (opacity + transform)
            if (header) {
                header.style.opacity = '0';
                header.style.transform = 'translateY(-100%)';
                // Setelah animasi selesai → display none
                setTimeout(() => {
                    if (!this.headerVisible) header.style.display = 'none';
                }, 300);
            }
            // 2. Canvas langsung naik ke top:0 full height (smooth)
            if (canvas) {
                canvas.style.transition = 'top 0.3s ease, height 0.3s ease';
                canvas.style.top  = '0px';
                canvas.style.height = '100%';
            }
        }

        // Update tombol icon (eye / eye-off)
        const iconSvg = btn.querySelector('.jt-icon-svg');
        if (iconSvg) {
            iconSvg.innerHTML = this.headerVisible
                ? this.HEADER_TOGGLE_PINNED.svgShow
                : this.HEADER_TOGGLE_PINNED.svgHide;
        }

        // Update active state (active = header TERSEMBUNYI = mata coret)
        btn.dataset.active = this.headerVisible ? 'false' : 'true';

        // Tooltip update
        btn.title = this.headerVisible ? 'Sembunyikan Header' : 'Tampilkan Header';

        JT.Utils.flashButton(btn);
    },

    // ── Click Handler: Nav Buttons (scrollable) ──
    _handleNavClick(btn) {
        const segIdx = parseInt(btn.dataset.segIdx, 10);
        if (isNaN(segIdx)) return;

        // Special: tombol Replay
        if (segIdx === -1) {
            if (JT.State.replayActive) {
                JT.WasmBridge.action('wasm_replay_stop');
                JT.State.replayActive = false;
            } else {
                JT.WasmBridge.action('wasm_replay_start');
                JT.State.replayActive = true;
            }
            btn.dataset.active = JT.State.replayActive ? 'true' : 'false';
            JT.Utils.flashButton(btn);
            return;
        }

        // Normal: panggil C++ untuk set active segment
        JT.WasmBridge.callWithNumber('wasm_nav_click_segment', segIdx);

        // Update visual: reset semua nav btn, set yang ini active
        const overlay = JT.State.overlay;
        overlay.querySelectorAll('#jt-nav-scrollable .jt-nav-btn').forEach(b => {
            b.dataset.active = 'false';
        });
        btn.dataset.active = 'true';

        JT.Utils.flashButton(btn);
    },

    // ── Click Handler: Alert Button (pinned) ──
    _handleAlertClick(btn) {
        const alertVisible = JT.WasmBridge.toggle('wasm_toggle_alert_panel');
        btn.dataset.active = (alertVisible === 1) ? 'true' : 'false';
        JT.Utils.flashButton(btn);

        // Saat alert panel dibuka → reset badge (kayak WA: klik chat → read semua)
        if (alertVisible === 1) {
            this.clearAlertBadge();
            // Update baseline ke triggered count saat ini
            // Supaya notif baru SETELAH ini terhitung lagi
            const currentTriggered = JT.WasmBridge.getNumber('wasm_alert_get_count_triggered');
            if (currentTriggered !== null) {
                this._lastSeenTriggeredCount = currentTriggered;
            }
        }
    },

    // ── Alert Badge Methods ──
    // Semua PURE JS — tidak pakai WASM call.
    // Code lain (WebSocket, Jarvis, dll) bisa panggil:
    //   JT.NavTools.pushAlert({ title: 'Price Alert', message: 'XAUUSD > 2400' })
    //   JT.NavTools.incrementAlertBadge(1)
    //   JT.NavTools.setAlertBadge(5)
    //   JT.NavTools.clearAlertBadge()

    /**
     * Set badge count. 0 = sembunyikan badge.
     * @param {number} count
     */
    setAlertBadge(count) {
        this.alertBadgeCount = count;
        this.alertBadgeVisible = count > 0;

        // Sync ke JT.State juga
        JT.State.alertBadgeCount = count;
        JT.State.alertBadgeVisible = count > 0;

        const overlay = JT.State.overlay;
        if (!overlay) {
            console.log('[JT.NavTools] setAlertBadge(' + count + ') — overlay NOT ready yet');
            return;
        }

        const badge = overlay.querySelector('#jt-alert-badge');
        if (!badge) {
            console.log('[JT.NavTools] setAlertBadge(' + count + ') — badge element NOT found in DOM');
            return;
        }

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.add('jt-badge-visible');
            console.log('[JT.NavTools] setAlertBadge(' + count + ') — badge VISIBLE ✅');
        } else {
            badge.classList.remove('jt-badge-visible');
            badge.classList.remove('jt-badge-pulse');
            console.log('[JT.NavTools] setAlertBadge(0) — badge HIDDEN');
        }
    },

    /**
     * Tambah badge count (untuk notif baru).
     * Otomatis trigger pulse animation.
     * @param {number} add — default 1
     */
    incrementAlertBadge(add = 1) {
        this.setAlertBadge(this.alertBadgeCount + add);
        this._pulseBadge();
    },

    /**
     * Reset badge ke 0 (notif sudah dibaca).
     */
    clearAlertBadge() {
        this.setAlertBadge(0);
    },

    /**
     * Push alert notification — API publik utama.
     * Dipanggil dari showAlertNotif() di app.html, WebSocket, Jarvis, dll.
     * @param {Object} alertData — { title, message, type?, priority? }
     */
    pushAlert(alertData) {
        console.log('[JT.NavTools] pushAlert:', alertData.title, '-', alertData.message);

        // Increment badge
        this.incrementAlertBadge(1);

        // Simpan ke internal alert list (max 100)
        this._alertList = this._alertList || [];
        this._alertList.unshift({
            ...alertData,
            id: Date.now(),
            timestamp: new Date().toISOString(),
            read: false
        });
        if (this._alertList.length > 100) this._alertList.length = 100;

        // Emit custom event supaya code lain bisa listen
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('jt-alert', {
                detail: alertData
            }));
        }
    },

    /**
     * Ambil alert list (untuk ditampil di alert panel).
     * @param {Object} [opts] — { unreadOnly: true }
     * @returns {Array}
     */
    getAlerts(opts = {}) {
        const list = this._alertList || [];
        if (opts.unreadOnly) return list.filter(a => !a.read);
        return list;
    },

    /**
     * Mark semua alert sebagai sudah dibaca.
     */
    markAlertsRead() {
        (this._alertList || []).forEach(a => a.read = true);
    },

    /**
     * Trigger pulse animation di badge (red glow blink).
     * @private
     */
    _pulseBadge() {
        const overlay = JT.State.overlay;
        if (!overlay) return;

        const badge = overlay.querySelector('#jt-alert-badge');
        if (!badge) return;

        // Add pulse class, remove after 3 seconds
        badge.classList.add('jt-badge-pulse');
        clearTimeout(this._pulseTimer);
        this._pulseTimer = setTimeout(() => {
            badge.classList.remove('jt-badge-pulse');
        }, 3000);
    },

    /** @private */
    _alertList: [],
    /** @private */
    _pulseTimer: null,

    // ── Sync Nav State dari C++ ──
    syncNavState() {
        const navBar = JT.State.navBar;
        const overlay = JT.State.overlay;
        if (!navBar || !overlay) return;

        const W = JT.WasmBridge;

        // Update Symbol label + icon
        const symbol = W.getString('wasm_nav_get_symbol');
        if (symbol) {
            const labelEl = navBar.querySelector('[data-nav-label="nav-symbol"]');
            if (labelEl) labelEl.textContent = symbol;
        }
        const symbolIcon = W.getString('wasm_nav_get_symbol_icon');
        if (symbolIcon) {
            const symBtn = navBar.querySelector('[data-tool-id="nav-symbol"]');
            if (symBtn) {
                const imgEl = symBtn.querySelector('.jt-icon-img');
                if (imgEl && imgEl.src.indexOf(symbolIcon) === -1) {
                    imgEl.src = symbolIcon;
                    imgEl.style.display = '';
                    const svgEl = symBtn.querySelector('.jt-icon-svg');
                    if (svgEl) svgEl.style.display = 'none';
                }
            }
        }

        // Update TF label
        const tf = W.getString('wasm_nav_get_tf');
        if (tf) {
            const labelEl = navBar.querySelector('[data-nav-label="nav-tf"]');
            if (labelEl) labelEl.textContent = tf;
        }

        // Update Candle label + icon (dinamis sesuai style)
        const candleStyle = W.getNumber('wasm_nav_get_candle_style');
        if (candleStyle !== null && candleStyle >= 0 && candleStyle < this.CANDLE_SVGS.length) {
            const candleBtn = navBar.querySelector('[data-tool-id="nav-candle"]');
            if (candleBtn) {
                const imgEl = candleBtn.querySelector('.jt-icon-img');
                const svgEl = candleBtn.querySelector('.jt-icon-svg');
                if (imgEl) imgEl.style.display = 'none';
                if (svgEl) {
                    svgEl.innerHTML = this.CANDLE_SVGS[candleStyle];
                    svgEl.style.display = 'flex';
                }
            }
        }
        const candleName = W.getString('wasm_nav_get_candle_style_name');
        if (candleName) {
            const labelEl = navBar.querySelector('[data-nav-label="nav-candle"]');
            if (labelEl) labelEl.textContent = candleName;
        }

        // Update active segment glow
        const activeSeg = W.getNumber('wasm_nav_get_active_segment');
        if (activeSeg !== null) {
            overlay.querySelectorAll('#jt-nav-scrollable .jt-nav-btn').forEach(btn => {
                const segIdx = parseInt(btn.dataset.segIdx, 10);
                btn.dataset.active = (segIdx === activeSeg) ? 'true' : 'false';
            });
        }

        // NOTE: Alert badge count TIDAK di-sync dari WASM.
        // Badge di-manage pure JS via setAlertBadge() / incrementAlertBadge().
        // Code lain (WebSocket, Jarvis) bisa panggil:
        //   JT.NavTools.incrementAlertBadge(1)  — tambah notif baru
        //   JT.NavTools.setAlertBadge(count)    — set count langsung
        //   JT.NavTools.clearAlertBadge()       — reset ke 0 (sudah dibaca)
    }
};
