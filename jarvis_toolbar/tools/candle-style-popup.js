// ============================================================
// candle-style-popup.js — Modern Candle Style Picker (V7.6.5)
// ------------------------------------------------------------
// Pengganti popup ImGui (C++ ##CandleStylePopup) dgn UI HTML/CSS
// modern: glassmorphism, kartu responsive, mini-preview SVG per
// style, active highlight, keyboard navigation.
//
// Trigger: tombol "Candle" di nav-tools.js (segIdx 2) →
//   JT.CandleStylePopup.open()   (intercept di _handleNavClick)
//
// Card click → JT.WasmBridge.callWithNumber('wasm_nav_set_candle_style', id)
//   → C++ export _wasm_nav_set_candle_style(int) set tab->renderStyle
//   + SaveSettings + requestFootprint (kalau FP style).
//   Nav button label/icon auto-update via syncNavState() polling.
//
// 7 style (match k_StyleDefs di CandleStyleManager.h, exclude FP_BAR):
//   0 Candle, 1 Line, 2 Area, 3 Footprint Cluster,
//   4 Footprint Profile, 6 TPO Profile, 7 Heikin Ashi
// ============================================================

window.JT = window.JT || {};

JT.CandleStylePopup = (function () {

    // ── Style definitions (id match enum CandleRenderStyle) ──
    const STYLES = [
        {
            id: 0, name: 'Candle', tag: 'OHLC',
            desc: 'Candlestick klasik — body + wick',
            accent: '#26d0a8',
            preview: candlePreview()
        },
        {
            id: 1, name: 'Line', tag: 'Close',
            desc: 'Garis harga close — tren halus',
            accent: '#4aa8ff',
            preview: linePreview()
        },
        {
            id: 2, name: 'Area', tag: 'Fill',
            desc: 'Area fill bawah garis close',
            accent: '#7c6cff',
            preview: areaPreview()
        },
        {
            id: 3, name: 'Footprint Cluster', tag: 'MMT',
            desc: 'Cluster cells Delta/Volume/Dominant/VP',
            accent: '#ff8c42',
            preview: fpClusterPreview()
        },
        {
            id: 4, name: 'Footprint Profile', tag: 'Buy/Sell',
            desc: 'Proportional bars buy vs sell per level',
            accent: '#ff5c8a',
            preview: fpProfilePreview()
        },
        {
            id: 6, name: 'TPO Profile', tag: 'POC+VA',
            desc: 'Histogram harga + Point of Control + Value Area',
            accent: '#ffd23f',
            preview: tpoPreview()
        },
        {
            id: 7, name: 'Heikin Ashi', tag: 'Smooth',
            desc: 'Candle dihaluskan — tren kelihatan jelas',
            accent: '#36e0c8',
            preview: haPreview()
        }
    ];

    // ── Mini preview SVG generators (24x60 viewport) ──
    function candlePreview() {
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <line x1="10" y1="6" x2="10" y2="34" stroke="#26d0a8" stroke-width="1"/>
            <rect x="7" y="14" width="6" height="14" fill="#26d0a8" rx="1"/>
            <line x1="22" y1="4" x2="22" y2="30" stroke="#ff5c5c" stroke-width="1"/>
            <rect x="19" y="10" width="6" height="16" fill="#ff5c5c" rx="1"/>
            <line x1="34" y1="8" x2="34" y2="32" stroke="#26d0a8" stroke-width="1"/>
            <rect x="31" y="12" width="6" height="16" fill="#26d0a8" rx="1"/>
            <line x1="46" y1="6" x2="46" y2="28" stroke="#26d0a8" stroke-width="1"/>
            <rect x="43" y="10" width="6" height="14" fill="#26d0a8" rx="1"/>
        </svg>`;
    }
    function linePreview() {
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <polyline points="4,28 14,22 24,26 34,14 44,18 56,8" fill="none" stroke="#4aa8ff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
            <circle cx="56" cy="8" r="1.8" fill="#4aa8ff"/>
        </svg>`;
    }
    function areaPreview() {
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <defs><linearGradient id="cspAg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#7c6cff" stop-opacity="0.55"/>
                <stop offset="100%" stop-color="#7c6cff" stop-opacity="0.05"/>
            </linearGradient></defs>
            <path d="M4,30 L14,24 L24,28 L34,16 L44,20 L56,10 L56,36 L4,36 Z" fill="url(#cspAg)"/>
            <polyline points="4,30 14,24 24,28 34,16 44,20 56,10" fill="none" stroke="#7c6cff" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>`;
    }
    function fpClusterPreview() {
        // gradient cells red→green (X-Ray style)
        let cells = '';
        for (let r = 0; r < 4; r++) {
            const t = r / 3;
            const col = `rgb(${Math.round(220*(1-t)+60*t)},${Math.round(70*(1-t)+200*t)},${Math.round(70*(1-t)+70*t)})`;
            cells += `<rect x="6" y="${6 + r*8}" width="48" height="7" fill="${col}" rx="1"/>`;
        }
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">${cells}</svg>`;
    }
    function fpProfilePreview() {
        // proportional buy (right) / sell (left) bars
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <line x1="30" y1="4" x2="30" y2="36" stroke="#3a3f4d" stroke-width="0.6"/>
            <rect x="18" y="6"  width="12" height="6" fill="#ff5c8a" rx="1"/>
            <rect x="30" y="6"  width="8"  height="6" fill="#26d0a8" rx="1"/>
            <rect x="12" y="14" width="18" height="6" fill="#ff5c8a" rx="1"/>
            <rect x="30" y="14" width="14" height="6" fill="#26d0a8" rx="1"/>
            <rect x="20" y="22" width="10" height="6" fill="#ff5c8a" rx="1"/>
            <rect x="30" y="22" width="11" height="6" fill="#26d0a8" rx="1"/>
            <rect x="16" y="30" width="14" height="5" fill="#ff5c8a" rx="1"/>
            <rect x="30" y="30" width="9"  height="5" fill="#26d0a8" rx="1"/>
        </svg>`;
    }
    function tpoPreview() {
        // horizontal histogram + POC marker
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <rect x="6"  y="6"  width="20" height="6" fill="#ffd23f" opacity="0.55" rx="1"/>
            <rect x="6"  y="14" width="34" height="6" fill="#ffd23f" opacity="0.85" rx="1"/>
            <rect x="6"  y="22" width="26" height="6" fill="#ffd23f" opacity="0.65" rx="1"/>
            <rect x="6"  y="30" width="16" height="6" fill="#ffd23f" opacity="0.45" rx="1"/>
            <line x1="42" y1="14" x2="42" y2="20" stroke="#ff5c5c" stroke-width="1.4" stroke-dasharray="2 1.5"/>
        </svg>`;
    }
    function haPreview() {
        // smoothed consecutive candles (HA style — body berurutan)
        return `<svg class="csp-mini" viewBox="0 0 60 40" preserveAspectRatio="xMidYMid meet">
            <line x1="9"  y1="8"  x2="9"  y2="32" stroke="#36e0c8" stroke-width="0.8"/>
            <rect x="6"  y="12" width="6" height="16" fill="#36e0c8" rx="1"/>
            <line x1="21" y1="6"  x2="21" y2="30" stroke="#36e0c8" stroke-width="0.8"/>
            <rect x="18" y="10" width="6" height="16" fill="#36e0c8" rx="1"/>
            <line x1="33" y1="10" x2="33" y2="32" stroke="#ff5c5c" stroke-width="0.8"/>
            <rect x="30" y="14" width="6" height="14" fill="#ff5c5c" rx="1"/>
            <line x1="45" y1="8"  x2="45" y2="28" stroke="#36e0c8" stroke-width="0.8"/>
            <rect x="42" y="12" width="6" height="14" fill="#36e0c8" rx="1"/>
        </svg>`;
    }

    // ── CSS (injected once) ──
    const CSS = `
.csp-root{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;
    background:rgba(6,8,14,0.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
    opacity:0;transition:opacity .18s ease;padding:clamp(8px,3vw,24px)}
.csp-root.csp-open{opacity:1}
.csp-root.csp-hidden{display:none}
.csp-panel{width:min(720px,96vw);max-height:92vh;overflow:auto;
    background:linear-gradient(160deg,rgba(24,28,40,0.97),rgba(14,17,26,0.97));
    border:1px solid rgba(120,140,180,0.18);border-radius:16px;
    box-shadow:0 24px 60px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.03) inset,0 0 40px rgba(80,120,200,0.08);
    transform:translateY(12px) scale(.97);transition:transform .22s cubic-bezier(.2,.8,.25,1);
    color:#e6e9f0;font-family:inherit}
.csp-root.csp-open .csp-panel{transform:translateY(0) scale(1)}
.csp-head{display:flex;align-items:center;gap:12px;padding:clamp(14px,2.5vw,20px) clamp(16px,3vw,24px);
    border-bottom:1px solid rgba(120,140,180,0.12)}
.csp-head-icon{width:clamp(28px,4vw,36px);height:clamp(28px,4vw,36px);flex:none;border-radius:9px;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,rgba(56,120,220,0.25),rgba(120,80,220,0.22));
    border:1px solid rgba(120,160,240,0.2)}
.csp-head-icon svg{width:60%;height:60%;color:#9cc4ff}
.csp-head-title{font-size:clamp(15px,2.2vw,18px);font-weight:600;letter-spacing:.2px}
.csp-head-sub{font-size:clamp(11px,1.6vw,12.5px);color:#8b94a8;margin-top:2px}
.csp-close{margin-left:auto;width:30px;height:30px;flex:none;border-radius:8px;border:1px solid rgba(120,140,180,0.16);
    background:rgba(255,255,255,0.04);color:#aab2c4;cursor:pointer;display:flex;align-items:center;justify-content:center;
    transition:all .15s ease}
.csp-close:hover{background:rgba(255,90,90,0.18);color:#ff8a8a;border-color:rgba(255,120,120,0.3)}
.csp-close svg{width:16px;height:16px}
.csp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:clamp(8px,1.5vw,12px);
    padding:clamp(14px,2.5vw,20px)}
.csp-card{position:relative;background:rgba(255,255,255,0.025);border:1px solid rgba(120,140,180,0.12);
    border-radius:12px;padding:12px 12px 14px;cursor:pointer;overflow:hidden;
    transition:transform .16s ease,border-color .16s ease,background .16s ease,box-shadow .16s ease;
    display:flex;flex-direction:column;gap:8px}
.csp-card::before{content:"";position:absolute;inset:0;background:linear-gradient(160deg,var(--csp-accent),transparent 60%);
    opacity:0;transition:opacity .18s ease;pointer-events:none}
.csp-card:hover{transform:translateY(-3px);border-color:rgba(140,170,220,0.32);background:rgba(255,255,255,0.05)}
.csp-card:hover::before{opacity:0.07}
.csp-card:focus-visible{outline:2px solid var(--csp-accent);outline-offset:2px}
.csp-prev{height:clamp(44px,7vw,58px);display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.22);border-radius:8px;border:1px solid rgba(120,140,180,0.08)}
.csp-prev .csp-mini{width:78%;height:90%}
.csp-row{display:flex;align-items:center;gap:8px}
.csp-name{font-size:clamp(12.5px,1.9vw,14.5px);font-weight:600;color:#eef1f7;flex:1;min-width:0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.csp-tag{font-size:9.5px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;
    padding:2px 6px;border-radius:5px;color:var(--csp-accent);
    background:color-mix(in srgb,var(--csp-accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--csp-accent) 28%,transparent)}
.csp-desc{font-size:clamp(10px,1.5vw,11.5px);color:#8b94a8;line-height:1.4;min-height:2.6em}
.csp-check{position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;
    background:var(--csp-accent);display:flex;align-items:center;justify-content:center;
    opacity:0;transform:scale(.6);transition:all .18s ease;box-shadow:0 0 12px var(--csp-accent)}
.csp-check svg{width:11px;height:11px;color:#0a0d14}
.csp-card.csp-active{border-color:var(--csp-accent);background:color-mix(in srgb,var(--csp-accent) 9%,rgba(255,255,255,0.04))}
.csp-card.csp-active::before{opacity:0.1}
.csp-card.csp-active .csp-check{opacity:1;transform:scale(1)}
.csp-foot{padding:clamp(10px,2vw,14px) clamp(16px,3vw,24px);border-top:1px solid rgba(120,140,180,0.12);
    display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:clamp(10px,1.5vw,11.5px);color:#6b7388}
.csp-foot kbd{font-family:inherit;background:rgba(255,255,255,0.06);border:1px solid rgba(120,140,180,0.18);
    border-radius:4px;padding:1px 5px;color:#aab2c4;font-size:10px}
@media (max-width:480px){.csp-card{padding:10px}.csp-desc{min-height:2.2em}}
`;

    let _root = null, _grid = null, _focusIdx = 0, _onKey = null;
    let _styleInjected = false;

    function injectCSS() {
        if (_styleInjected) return;
        const st = document.createElement('style');
        st.id = 'csp-style';
        st.textContent = CSS;
        document.head.appendChild(st);
        _styleInjected = true;
    }

    function activeStyleId() {
        const v = JT.WasmBridge.getNumber('wasm_nav_get_candle_style');
        return (v !== null && v >= 0) ? v : 0;
    }

    function buildPanel() {
        injectCSS();
        const cur = activeStyleId();

        const root = document.createElement('div');
        root.className = 'csp-root csp-hidden';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Pilih Chart Style');

        const panel = document.createElement('div');
        panel.className = 'csp-panel';

        // Header
        const head = document.createElement('div');
        head.className = 'csp-head';
        head.innerHTML = `
            <div class="csp-head-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="8" width="4" height="10"/><line x1="8" y1="4" x2="8" y2="20"/><rect x="14" y="6" width="4" height="12"/><line x1="16" y1="2" x2="16" y2="22"/></svg></div>
            <div><div class="csp-head-title">Chart Style</div><div class="csp-head-sub">Pilih tipe render candle — tekan kartu atau gunakan keyboard</div></div>
            <button class="csp-close" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button>`;
        head.querySelector('.csp-close').addEventListener('click', close);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'csp-grid';

        STYLES.forEach((s, i) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'csp-card' + (s.id === cur ? ' csp-active' : '');
            card.style.setProperty('--csp-accent', s.accent);
            card.dataset.styleId = String(s.id);
            card.tabIndex = i === 0 ? 0 : -1;
            card.innerHTML = `
                <div class="csp-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                <div class="csp-prev">${s.preview}</div>
                <div class="csp-row"><span class="csp-name">${s.name}</span><span class="csp-tag">${s.tag}</span></div>
                <div class="csp-desc">${s.desc}</div>`;
            card.addEventListener('click', () => select(s.id));
            grid.appendChild(card);
        });

        // Footer
        const foot = document.createElement('div');
        foot.className = 'csp-foot';
        foot.innerHTML = `
            <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> navigasi</span>
            <span><kbd>Enter</kbd> pilih</span>
            <span><kbd>Esc</kbd> tutup</span>`;

        panel.appendChild(head);
        panel.appendChild(grid);
        root.appendChild(panel);

        // click backdrop to close (click on root but not panel)
        root.addEventListener('mousedown', (e) => {
            if (e.target === root) close();
        });

        _root = root;
        _grid = grid;
        _focusIdx = Math.max(0, STYLES.findIndex(s => s.id === cur));
        document.body.appendChild(root);
    }

    function select(styleId) {
        JT.WasmBridge.callWithNumber('wasm_nav_set_candle_style', styleId);
        // update active state instantly (don't wait for syncNavState poll)
        _grid.querySelectorAll('.csp-card').forEach(c => {
            c.classList.toggle('csp-active', parseInt(c.dataset.styleId, 10) === styleId);
        });
        // brief flash feedback then close
        setTimeout(close, 140);
    }

    function moveFocus(delta) {
        const cards = [..._grid.querySelectorAll('.csp-card')];
        if (!cards.length) return;
        _focusIdx = (_focusIdx + delta + cards.length) % cards.length;
        cards.forEach((c, i) => {
            c.tabIndex = (i === _focusIdx) ? 0 : -1;
        });
        cards[_focusIdx].focus();
    }

    function onKeydown(e) {
        if (!_root || _root.classList.contains('csp-hidden')) return;
        switch (e.key) {
            case 'Escape': e.preventDefault(); close(); break;
            case 'ArrowRight': case 'ArrowDown': e.preventDefault(); moveFocus(1); break;
            case 'ArrowLeft':  case 'ArrowUp':   e.preventDefault(); moveFocus(-1); break;
            case 'Enter': case ' ': {
                e.preventDefault();
                const cards = [..._grid.querySelectorAll('.csp-card')];
                const c = cards[_focusIdx];
                if (c) select(parseInt(c.dataset.styleId, 10));
                break;
            }
        }
    }

    function open() {
        if (!_root) buildPanel();
        else {
            // refresh active state (style mungkin berubah sejak terakhir dibuka)
            const cur = activeStyleId();
            _grid.querySelectorAll('.csp-card').forEach(c => {
                c.classList.toggle('csp-active', parseInt(c.dataset.styleId, 10) === cur);
            });
            _focusIdx = Math.max(0, STYLES.findIndex(s => s.id === cur));
        }
        _root.classList.remove('csp-hidden');
        // force reflow then open for transition
        void _root.offsetWidth;
        _root.classList.add('csp-open');
        if (!_onKey) {
            _onKey = onKeydown;
            document.addEventListener('keydown', _onKey);
        }
        // focus first / active card
        const cards = [..._grid.querySelectorAll('.csp-card')];
        if (cards[_focusIdx]) {
            cards.forEach((c, i) => c.tabIndex = (i === _focusIdx) ? 0 : -1);
            cards[_focusIdx].focus();
        }
    }

    function close() {
        if (!_root) return;
        _root.classList.remove('csp-open');
        setTimeout(() => {
            if (_root) _root.classList.add('csp-hidden');
        }, 170);
    }

    function toggle() {
        if (_root && !_root.classList.contains('csp-hidden') && _root.classList.contains('csp-open')) close();
        else open();
    }

    return { open, close, toggle, STYLES };
})();
