// ============================================================
// jarvis_chat.js — ChatGPT-Style Chat UI Overlay
// ImGui = Frame (window chrome), This = Content (chat UI)
//
// ARSITEKTUR:
// - ImGui window = drag/resize container
// - HTML div overlay = positioned over ImGui content area
// - Chat = fetch() ke server.js
// - Draw actions = Module.ccall() ke C++
// ============================================================

// 🔒 SERVERLESS GUARD — Skip semua jika Jarvis AI dimatikan
if (typeof PLATFORM !== 'undefined' && !PLATFORM.JARVIS_ENABLED) {
    console.log("%c[JARVIS-CHAT] Disabled — serverless mode (PLATFORM.JARVIS_ENABLED = false)", "color:#888");
    window.jarvis_send = function() {};
    window.jarvis_toggle = function() {};
    window.initJarvisOverlay = function() {};
    // Stop — jangan load UI, jangan fetch ke localhost:3000
} else {
// ── JARVIS ENABLED — load full chat UI ──

(function() {
'use strict';

// ── Config ──────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000';
const API_CHAT = API_BASE + '/api/chat';
const API_HEALTH = API_BASE + '/health';
const API_MODEL = API_BASE + '/api/model';
const API_TOKENS = API_BASE + '/api/tokens';

// ── State ───────────────────────────────────────────────────
let chatHistory = [];          // [{role, content}]
let sessions = [{ id: 's1', title: 'New Chat', messages: [] }];
let activeSessionId = 's1';
let isLoading = false;
let currentModel = 'openai/gpt-oss-20b';
let currentDrawModel = 'openai/gpt-oss-20b';
let tokenUsage = { prompt: 0, completion: 0, total: 0, requests: 0 };
let healthInfo = null;
let sidebarCollapsed = false;
let sidebarToggleBtn, miniModelBadge, miniStatusDot;

// ── SMC Object Cache ("Buku Catatan") ─────────────────────
// Lookup per-ID dari SMCEngine via jarvis_get_object_info(id)
// Saat LLM sebut #7, JS bisa cari data lengkap OB #7 di sini
let smcObjectCache = {};   // {7: {id:7, type:"OBS", zone_low:80107, ...}, ...}

// ── DOM References ──────────────────────────────────────────
let overlay, chatContainer, msgArea, inputEl, sendBtn;
let sidebarEl, sessionListEl, modelSelectEl, tokenDisplayEl;
let newChatBtn, statusDot, statusText;

// ── Initialize ──────────────────────────────────────────────
function init() {
    // Create overlay container
    overlay = document.createElement('div');
    overlay.id = 'jarvis-overlay';
    overlay.innerHTML = buildHTML();
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; z-index: 100;
        pointer-events: none; display: none;
    `;
    document.body.appendChild(overlay);

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = buildCSS();
    document.head.appendChild(style);

    // Get DOM refs
    chatContainer = overlay.querySelector('#jarvis-chat');
    msgArea = overlay.querySelector('#jarvis-messages');
    inputEl = overlay.querySelector('#jarvis-input');
    sendBtn = overlay.querySelector('#jarvis-send');
    sidebarEl = overlay.querySelector('#jarvis-sidebar');
    sessionListEl = overlay.querySelector('#jarvis-session-list');
    modelSelectEl = overlay.querySelector('#jarvis-model-select');
    tokenDisplayEl = overlay.querySelector('#jarvis-token-count');
    newChatBtn = overlay.querySelector('#jarvis-new-chat');
    statusDot = overlay.querySelector('#jarvis-status-dot');
    statusText = overlay.querySelector('#jarvis-status-text');
    sidebarToggleBtn = overlay.querySelector('#jarvis-sidebar-toggle');
    miniModelBadge = overlay.querySelector('#jarvis-mini-model');
    miniStatusDot = overlay.querySelector('#jarvis-mini-status');

    // Event listeners
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    newChatBtn.addEventListener('click', handleNewChat);
    modelSelectEl.addEventListener('change', handleModelChange);
    sidebarToggleBtn.addEventListener('click', toggleSidebar);

    // Suggestion chips
    overlay.querySelectorAll('[data-prompt]').forEach(chip => {
        chip.addEventListener('click', () => {
            inputEl.value = chip.dataset.prompt;
            handleSend();
        });
    });

    // Fetch health
    fetchHealth();
    setInterval(fetchHealth, 30000);

    // Start position sync loop
    requestAnimationFrame(syncPosition);

    // Keyboard shortcut: Ctrl+B to toggle sidebar
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            toggleSidebar();
        }
    });

    console.log('[JARVIS-CHAT] UI initialized');
}

// ── WASM Ready Guard ──────────────────────────────────────
// Module.ccall exists BEFORE WASM is fully initialized!
// We must check Module.calledRun to know WASM is actually ready.
let wasmReady = false;

function isWasmReady() {
    if (wasmReady) return true;
    // Emscripten sets Module.calledRun = true after WASM init completes
    if (typeof Module !== 'undefined' && Module.calledRun) {
        wasmReady = true;
        return true;
    }
    // Alternative: try accessing _jarvis_is_visible directly in WASM exports
    if (typeof Module !== 'undefined' && Module.asm && Module.asm._jarvis_is_visible) {
        wasmReady = true;
        return true;
    }
    return false;
}

// ── Safe C Call — won't crash if WASM not ready ──
function safeCcall(name, retType, argTypes, args) {
    if (!isWasmReady()) return null;
    try {
        return Module.ccall(name, retType, argTypes, args);
    } catch (e) {
        // WASM not ready or function not found — silent fail
        return null;
    }
}

// ── Extract #ID references from isyarat commands ──
// Parses lines like "#7 OB Bullish BOS: 80107→80214" and extracts [7]
// Also handles "#3 BOS Bullish: level=80214" → [3]
// Also handles FIB/EW: "#FIB Ret Bullish: #966->#959" → [966, 959]
// Returns array of unique integer IDs
function extractRefIds(semanticCommands) {
    const ids = new Set();
    if (!semanticCommands || !Array.isArray(semanticCommands)) return [];

    for (const cmd of semanticCommands) {
        // Match #N anywhere in the line (including after -> and > connectors)
        // v9PRO: Changed from (?:^|\s)#(\d+) to #(\d+) to catch #966->#959 and #1000>#1001
        const matches = cmd.match(/#(\d+)/g);
        if (matches) {
            for (const m of matches) {
                const num = parseInt(m.replace(/.*#/, ''), 10);
                if (num > 0) ids.add(num);
            }
        }
    }
    return Array.from(ids).sort((a, b) => a - b);
}

// ── Lookup single object from SMCEngine buku catatan ──
// Returns the object data from cache or queries WASM
function jarvisLookupObject(id) {
    // Check cache first
    if (smcObjectCache[id]) return smcObjectCache[id];

    // Query WASM
    const infoJson = safeCcall('jarvis_get_object_info', 'string', ['number'], [id]);
    if (infoJson) {
        try {
            const objData = JSON.parse(infoJson);
            if (!objData.error) {
                smcObjectCache[id] = objData;
                return objData;
            }
        } catch(e) {}
    }
    return null;
}

// ── Position Sync — Read ImGui window rect, position overlay ──
function syncPosition() {
    if (!isWasmReady()) {
        requestAnimationFrame(syncPosition);
        return;
    }

    try {
        const visible = safeCcall('jarvis_is_visible', 'number', [], []);
        if (!visible) {
            overlay.style.display = 'none';
            requestAnimationFrame(syncPosition);
            return;
        }

        // Read normalized coords from C++
        const cx = safeCcall('jarvis_get_win_x', 'number', [], []);
        const cy = safeCcall('jarvis_get_win_y', 'number', [], []);
        const cw = safeCcall('jarvis_get_win_w', 'number', [], []);
        const ch = safeCcall('jarvis_get_win_h', 'number', [], []);

        // Validate coords
        if (cx === null || cy === null || cw === null || ch === null ||
            cw <= 0 || ch <= 0) {
            requestAnimationFrame(syncPosition);
            return;
        }

        // Convert to screen pixels
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const left = cx * screenW;
        const top = cy * screenH;
        const width = cw * screenW;
        const height = ch * screenH;

        // Position overlay over ImGui content area
        overlay.style.display = 'block';
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';

    } catch (e) {
        // Module not ready yet — silent
    }

    requestAnimationFrame(syncPosition);
}

// ── v9PRO: FIB/EW Direct Execution ──────────────────────────
// C++ semantic parser (JarvisSemanticParser.h) only recognizes:
//   OB, BOS, CHOCH, FVG, Entry, SL, TP, Line
// It does NOT recognize #FIB or #EW isyarat patterns.
//
// Solution: Server9pro.js already parses FIB/EW into tool_commands
// with full data (prices, levels, timestamps, etc.).
// We intercept these from the server response and execute them
// directly via jarvis_execute_draw (which calls JarvisExecuteDrawActions).
//
// The C++ JarvisExecuteDrawActions already supports:
//   chart_draw_fibonacci  → JarvisDrawFibonacci()
//   chart_draw_elliott    → JarvisDrawElliott()
// So we just need to map server arguments to C++ expected format.
function executeFibEwToolCommands(data) {
    if (!data || !data.tool_commands || !isWasmReady()) return;

    const fibEwCommands = data.tool_commands.filter(cmd =>
        cmd.tool === 'chart_draw_fibonacci' || cmd.tool === 'chart_draw_elliott'
    );

    if (fibEwCommands.length === 0) return;

    const drawActions = [];

    for (const cmd of fibEwCommands) {
        const args = cmd.arguments || {};

        if (cmd.tool === 'chart_draw_fibonacci') {
            // ── Map server FIB args → C++ JarvisFibParams ──
            // C++ expects: swing_low_index, swing_low_price, swing_high_index, swing_high_price
            // Server sends: start_price, end_price, ref_ids, direction, type, levels, ...

            let lowPrice, highPrice, lowCandleIdx, highCandleIdx;

            // v9PRO FIX: Use ref_ids from server args for reliable #ID lookup
            // Priority: args.ref_ids > extractFibRefIds (fallback)
            const fibIds = args.ref_ids || extractFibRefIds(data.semantic_commands);

            if (fibIds.length >= 2) {
                const startCache = smcObjectCache[fibIds[0]];
                const endCache = smcObjectCache[fibIds[1]];

                // Get prices from cache (most accurate, from C++ WASM directly)
                const startPrice = startCache ? startCache.price : args.start_price;
                const endPrice = endCache ? endCache.price : args.end_price;

                if (startPrice <= endPrice) {
                    lowPrice = startPrice;
                    highPrice = endPrice;
                    lowCandleIdx = (startCache && startCache.candle_index > 0) ? startCache.candle_index : (args.start_candle_idx || 0);
                    highCandleIdx = (endCache && endCache.candle_index > 0) ? endCache.candle_index : (args.end_candle_idx || 0);
                } else {
                    lowPrice = endPrice;
                    highPrice = startPrice;
                    lowCandleIdx = (endCache && endCache.candle_index > 0) ? endCache.candle_index : (args.end_candle_idx || 0);
                    highCandleIdx = (startCache && startCache.candle_index > 0) ? startCache.candle_index : (args.start_candle_idx || 0);
                }
            } else {
                // Fallback: use server prices and candle_idx
                if (args.start_price <= args.end_price) {
                    lowPrice = args.start_price;
                    highPrice = args.end_price;
                    lowCandleIdx = args.start_candle_idx || 0;
                    highCandleIdx = args.end_candle_idx || 0;
                } else {
                    lowPrice = args.end_price;
                    highPrice = args.start_price;
                    lowCandleIdx = args.end_candle_idx || 0;
                    highCandleIdx = args.start_candle_idx || 0;
                }
            }

            // Build C++ compatible arguments
            const cppArgs = {
                swing_low_index: lowCandleIdx,
                swing_low_price: lowPrice,
                swing_high_index: highCandleIdx,
                swing_high_price: highPrice
            };

            drawActions.push({
                tool: 'chart_draw_fibonacci',
                arguments: cppArgs,
                result: { success: true }
            });

            console.log(`[JARVIS-CHAT] FIB-DRAW: ${args.direction} ${args.type} low(${lowCandleIdx},${lowPrice}) → high(${highCandleIdx},${highPrice}) ref_ids=[${fibIds.join(',')}]`);
        }

        if (cmd.tool === 'chart_draw_elliott') {
            // ── Map server EW args → C++ JarvisElliottParams ──
            // C++ expects: points[].candle_index, points[].price
            // Server sends: waves[].label, waves[].ref_id, waves[].price, waves[].candle_idx, waves[].timestamp

            const waves = args.waves || [];
            const points = [];

            for (const w of waves) {
                let candleIdx = w.candle_idx || 0;
                let price = w.price || 0;

                // v9PRO FIX: Use ref_id from server for reliable #ID lookup
                // The server now includes ref_id in each wave object.
                // This is MUCH safer than positional mapping from extractEwRefIds()
                // because the server sorts waves by timestamp, changing array order.
                if (w.ref_id && smcObjectCache[w.ref_id]) {
                    const cacheObj = smcObjectCache[w.ref_id];
                    if (cacheObj.candle_index > 0) {
                        candleIdx = cacheObj.candle_index;
                    }
                    // Also use the accurate price from C++ WASM
                    if (cacheObj.price > 0) {
                        price = cacheObj.price;
                    }
                } else if (!w.ref_id) {
                    // Fallback: legacy path without ref_id — use extractEwRefIds
                    const ewRefIds = extractEwRefIds(data.semantic_commands);
                    if (ewRefIds.length > 0 && points.length < ewRefIds.length) {
                        const cacheObj = smcObjectCache[ewRefIds[points.length]];
                        if (cacheObj && cacheObj.candle_index > 0) {
                            candleIdx = cacheObj.candle_index;
                        }
                    }
                }

                // Fallback: try timestamp-based lookup
                if (candleIdx === 0 && w.timestamp) {
                    candleIdx = findCandleIndexByTimestamp(w.timestamp);
                }

                points.push({
                    candle_index: candleIdx,
                    price: price
                });
            }

            if (points.length < 3) {
                console.warn(`[JARVIS-CHAT] EW-DRAW: Need at least 3 points, got ${points.length}. Skipping.`);
                continue;
            }

            drawActions.push({
                tool: 'chart_draw_elliott',
                arguments: { points: points },
                result: { success: true }
            });

            console.log(`[JARVIS-CHAT] EW-DRAW: ${args.direction} ${args.degree || ''} ${args.isABC ? 'ABC' : '5-wave'} with ${points.length} points`);
        }
    }

    // Execute all FIB/EW draw actions via the C++ bridge
    if (drawActions.length > 0) {
        console.log(`[JARVIS-CHAT] FIB/EW: Executing ${drawActions.length} draw actions via direct bridge`);
        safeCcall('jarvis_execute_draw', null, ['string'], [JSON.stringify(drawActions)]);
    }
}

// ── Extract FIB #ID references from semantic_commands ──
// "#FIB Ret Bullish: #966->#959" → [966, 959]
function extractFibRefIds(semanticCommands) {
    if (!semanticCommands || !Array.isArray(semanticCommands)) return [];
    const ids = [];
    for (const cmd of semanticCommands) {
        const m = cmd.match(/#FIB\s+(?:Ret|Ext)\s+(?:Bullish|Bearish):\s*(#\d+(?:\s*(?:->|→)\s*#\d+)+)/i);
        if (m) {
            const numMatches = m[1].match(/#(\d+)/g);
            if (numMatches) {
                for (const nm of numMatches) {
                    ids.push(parseInt(nm.replace(/.*#/, ''), 10));
                }
            }
        }
    }
    return ids;
}

// ── Extract EW #ID references from semantic_commands ──
// "#EW Bullish: #1000>#1001>#1002>#1003>#1004>#1005" → [1000, 1001, 1002, 1003, 1004, 1005]
function extractEwRefIds(semanticCommands) {
    if (!semanticCommands || !Array.isArray(semanticCommands)) return [];
    const ids = [];
    for (const cmd of semanticCommands) {
        const m = cmd.match(/#EW\s+(?:Bullish|Bearish)(?:\s+ABC)?:\s*(#\d+(?:\s*>\s*#\d+)+)/i);
        if (m) {
            const numMatches = m[1].match(/#(\d+)/g);
            if (numMatches) {
                for (const nm of numMatches) {
                    ids.push(parseInt(nm.replace(/.*#/, ''), 10));
                }
            }
        }
    }
    return ids;
}

// ── Find candle index by timestamp (binary search) ──
// Used as fallback when candle_index is not available from smcObjectCache
function findCandleIndexByTimestamp(timestamp) {
    if (!timestamp || !isWasmReady()) return 0;
    try {
        const candleCtx = safeCcall('jarvis_get_candle_context', 'string', [], []);
        if (!candleCtx) return 0;
        // C++ might return candle data we can search through
        // But this is expensive — only use as fallback
        // For now, return 0 and let C++ handle it
        return 0;
    } catch (e) {
        return 0;
    }
}

// ── Chat Handler ────────────────────────────────────────────
async function handleSend() {
    const msg = inputEl.value.trim();
    if (!msg || isLoading) return;

    inputEl.value = '';
    isLoading = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    // Add user message to UI
    addMessage('user', msg);

    // Build request body
    const session = sessions.find(s => s.id === activeSessionId);
    const history = (session?.messages || []).slice(-8).map(m => ({ role: m.role, content: m.content }));

    const body = { message: msg, history };

    // Get chart status from C++ (safe — won't crash if WASM not ready)
    try {
        const chartStatus = safeCcall('jarvis_get_chart_status', 'string', [], []);
        if (chartStatus) body.chart_status = JSON.parse(chartStatus);

        const toolData = safeCcall('jarvis_get_tool_data', 'string', [], []);
        if (toolData) body.tool_data = JSON.parse(toolData);

        // ── Semantic Engine: Update environment + get compact context ──
        // This ensures the LLM gets the latest OBJ data for @# commands
        safeCcall('jarvis_update_env_from_smc', null, [], []);

        // ── v5: Clear buku catatan cache karena SMCEngine sudah re-scan ──
        // ID mungkin berubah/shift setelah update, jadi cache lama tidak valid
        smcObjectCache = {};
        console.log('[JARVIS-CHAT] SMC buku catatan cache cleared (env updated)');

        const envContext = safeCcall('jarvis_get_env_context', 'string', [], []);
        if (envContext) body.env_context = envContext;

        const candleContext = safeCcall('jarvis_get_candle_context', 'string', [], []);
        if (candleContext) body.candle_context = candleContext;

        // v8.1: JarvisIsyaratBridge REMOVED — was redundant, server builds objectMap from WASM env_context
    } catch (e) {
        console.log('[JARVIS-CHAT] Chart data not available:', e);
    }

    // Show typing indicator
    showTyping();

    try {
        const res = await fetch(API_CHAT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        hideTyping();

        // Add AI response
        addMessage('assistant', data.response || 'No response', data.actions || []);

        // ── UNIFIED DRAW EXECUTION ──
        // Phase 10v4: ONE execution path — no more double-execution!
        //
        // Priority: semantic_commands > actions
        // If server returns semantic_commands, use the AUTO FUNCTION CALL engine
        // (jarvis_execute_semantic_batch now converts @# commands → chart_draw_* JSON
        //  and calls JarvisBridge_ExecuteDrawActions() — the PROVEN render path)
        //
        // v9PRO: FIB/EW commands are NOT recognized by C++ semantic parser,
        // so we intercept them from tool_commands and execute via jarvis_execute_draw
        //
        // If server returns tool_call actions (backward compat), use the old path
        // But we should NEVER have both at the same time anymore.

        const hasSemanticCmds = data.semantic_commands && data.semantic_commands.length > 0;
        const hasDrawActions = data.actions && data.actions.length > 0;
        const hasToolCommands = data.tool_commands && data.tool_commands.length > 0;

        if (hasSemanticCmds && isWasmReady()) {
            // ── SEMANTIC AUTO FUNCTION CALL (PRIMARY PATH) ──
            // This is the new approach: LLM outputs simple @# text,
            // engine auto-converts to chart_draw_* function calls
            try {
                const batchCmd = data.semantic_commands.join('\n');

                // ── PRE-LOOKUP: Tanya SMCEngine buku catatan per #ID ──
                // Sebelum execute, JS lookup semua ID yang direferensikan
                // supaya JarvisDraw punya data presisi (bukan tebakan)
                const refIds = extractRefIds(data.semantic_commands);
                if (refIds.length > 0) {
                    console.log(`[JARVIS-CHAT] AFC: Pre-looking up ${refIds.length} objects from SMCEngine: #${refIds.join(', #')}`);
                    for (const id of refIds) {
                        const infoJson = safeCcall('jarvis_get_object_info', 'string', ['number'], [id]);
                        if (infoJson) {
                            try {
                                const objData = JSON.parse(infoJson);
                                if (!objData.error) {
                                    smcObjectCache[id] = objData;
                                    console.log(`[JARVIS-CHAT] AFC: #${id} = ${objData.type} ${objData.kind || ''} zone=${objData.zone_low || ''}→${objData.zone_high || ''} t_swing=${objData.t_swing || ''} t_break=${objData.t_break || ''} candle_idx=${objData.candle_index || ''}`);
                                } else {
                                    console.warn(`[JARVIS-CHAT] AFC: #${id} not found in SMCEngine buku catatan`);
                                }
                            } catch(e) {
                                console.warn(`[JARVIS-CHAT] AFC: #${id} parse error:`, e);
                            }
                        }
                    }
                    console.log(`[JARVIS-CHAT] AFC: Buku catatan cache now has ${Object.keys(smcObjectCache).length} objects`);
                }

                console.log(`[JARVIS-CHAT] AFC: Executing ${data.semantic_commands.length} semantic commands via auto function call engine`);
                const result = safeCcall('jarvis_execute_semantic_batch', 'string', ['string'], [batchCmd]);
                console.log(`[JARVIS-CHAT] AFC result: ${result}`);
            } catch (e) {
                console.log('[JARVIS-CHAT] AFC error:', e);
            }

            // ── v9PRO: FIB/EW DIRECT EXECUTION ──
            // C++ semantic parser doesn't recognize #FIB/#EW patterns.
            // Server already parsed them into tool_commands with full data.
            // We execute them directly via jarvis_execute_draw (JarvisExecuteDrawActions).
            try {
                executeFibEwToolCommands(data);
            } catch (e) {
                console.log('[JARVIS-CHAT] FIB/EW execution error:', e);
            }
        }
        // ── HYBRID NATIVE TOOL EXECUTION ──
        if (hasToolCommands && isWasmReady()) {
            try {
                // Eksekusi native tools (seperti chart_add_indicator) secara independen
                const nativeDrawActions = data.tool_commands.filter(cmd => 
                    cmd.tool && (cmd.tool.startsWith('chart_draw_') || 
                                 cmd.tool === 'chart_add_symbol' || 
                                 cmd.tool === 'chart_add_indicator')
                ).map(cmd => ({
                    tool: cmd.tool,
                    arguments: cmd.arguments,
                    result: { success: true }
                }));

                if (nativeDrawActions.length > 0) {
                    console.log(`[JARVIS-CHAT] Native Tools: Executing ${nativeDrawActions.length} actions`);
                    
                    // Pisahkan action non-draw agar dieksekusi secara manual via JS bridge
                    // Ini memastikan kompatibilitas mundur jika WASM belum di-recompile
                    const pureDrawActions = [];
                    for (const action of nativeDrawActions) {
                        if (action.tool === 'chart_add_indicator') {
                            const ind = action.arguments.indicator_name || action.arguments.indicator;
                            const period = action.arguments.period || 14;
                            safeCcall('jarvis_add_indicator', 'void', ['string', 'number'], [ind, period]);
                        } else if (action.tool === 'chart_add_symbol') {
                            const sym = action.arguments.symbol;
                            safeCcall('jarvis_add_symbol', 'void', ['string'], [sym]);
                        } else {
                            pureDrawActions.push(action);
                        }
                    }

                    // Sisa aksi draw (chart_draw_*) dikirim ke execute_draw
                    if (pureDrawActions.length > 0) {
                        safeCcall('jarvis_execute_draw', null, ['string'], [JSON.stringify(pureDrawActions)]);
                    }
                }
            } catch (e) {
                console.log('[JARVIS-CHAT] Native Tools exec error:', e);
            }
        }

        if (hasDrawActions && isWasmReady()) {
            // ── LEGACY TOOL CALL PATH (BACKWARD COMPAT) ──
            // Only used if server returns raw tool_call actions in actions[] array
            try {
                const actionsWithDraw = data.actions.filter(a =>
                    a.result && a.result.success &&
                    (a.tool.startsWith('chart_draw_') ||
                     a.tool === 'chart_add_symbol' ||
                     a.tool === 'chart_add_indicator')
                );
                if (actionsWithDraw.length > 0) {
                    console.log(`[JARVIS-CHAT] Legacy: Executing ${actionsWithDraw.length} tool_call actions`);
                    safeCcall('jarvis_execute_draw', null, ['string'], [JSON.stringify(actionsWithDraw)]);
                }
            } catch (e) {
                console.log('[JARVIS-CHAT] Draw exec error:', e);
            }
        }

        // Update token usage
        if (data.token_usage) {
            tokenUsage = data.token_usage;
            updateTokenDisplay();
        }

    } catch (err) {
        hideTyping();
        addMessage('system', 'Connection error: ' + err.message);
    } finally {
        isLoading = false;
        sendBtn.disabled = false;
        sendBtn.textContent = '\u27A4';
        inputEl.focus();
    }
}

// ── Message Rendering ───────────────────────────────────────
function addMessage(role, content, actions) {
    const session = sessions.find(s => s.id === activeSessionId);
    if (session) {
        session.messages.push({ role, content, timestamp: new Date() });
        // Update title from first message
        if (session.messages.length === 1 && role === 'user') {
            session.title = content.substring(0, 25) + (content.length > 25 ? '...' : '');
            updateSessionList();
        }
    }

    // Hide welcome screen
    const welcome = msgArea.querySelector('#jarvis-welcome');
    if (welcome) welcome.style.display = 'none';

    const msgEl = document.createElement('div');
    msgEl.className = 'jmsg ' + (role === 'user' ? 'jmsg-user' : role === 'system' ? 'jmsg-system' : 'jmsg-ai');

    let html = '';

    if (role === 'assistant') {
        html += '<div class="jmsg-avatar">🤖</div>';
    }

    html += '<div class="jmsg-body">';
    html += '<div class="jmsg-role">' + (role === 'user' ? 'You' : role === 'system' ? '⚠️' : 'Jarvis') + '</div>';
    html += '<div class="jmsg-text">' + formatContent(content) + '</div>';

    // Action badges
    if (actions && actions.length > 0) {
        html += '<div class="jmsg-actions">';
        for (const a of actions) {
            const isDraw = a.result?.is_draw_tool;
            const isRead = a.result?.is_read_tool;
            const icon = isDraw ? '🎨' : isRead ? '📊' : '⚡';
            const label = isDraw ? 'Drawn on Chart' : isRead ? 'Chart Data' : 'Chart Action';
            const toolLabel = formatToolName(a.tool);
            html += `<div class="jaction ${isDraw ? 'jaction-draw' : ''}">
                <span class="jaction-icon">${icon}</span>
                <span class="jaction-label">${label}</span>
                <span class="jaction-tool">${toolLabel}</span>
                ${a.result?.message ? `<span class="jaction-detail">— ${a.result.message}</span>` : ''}
            </div>`;
        }
        html += '</div>';
    }

    html += '</div>';
    msgEl.innerHTML = html;
    msgArea.appendChild(msgEl);
    scrollToBottom();
}

function formatContent(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function formatToolName(tool) {
    const names = {
        chart_add_symbol: 'Change Symbol',
        chart_add_indicator: 'Add Indicator',
        chart_analyze_swing: 'Swing Analysis',
        chart_get_key_levels: 'Key Levels',
        chart_analyze_smc: 'SMC Analysis',
        chart_draw_line: 'Draw Line',
        chart_draw_fibonacci: 'Draw Fibonacci',
        chart_draw_elliott: 'Draw Elliott',
        chart_draw_ob: 'Draw OB',
        chart_draw_bos: 'Draw BOS/CHOCH',
        chart_draw_smc_all: 'Draw All SMC'
    };
    return names[tool] || tool;
}

function showTyping() {
    const el = document.createElement('div');
    el.id = 'jarvis-typing';
    el.className = 'jmsg jmsg-ai';
    el.innerHTML = '<div class="jmsg-avatar">🤖</div><div class="jmsg-body"><div class="jmsg-role">Jarvis</div><div class="jtyping"><span>.</span><span>.</span><span>.</span></div></div>';
    msgArea.appendChild(el);
    scrollToBottom();
}

function hideTyping() {
    const el = msgArea.querySelector('#jarvis-typing');
    if (el) el.remove();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        msgArea.scrollTop = msgArea.scrollHeight;
    });
}

// ── Sidebar Toggle ──────────────────────────────────────────
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;

    if (sidebarCollapsed) {
        sidebarEl.classList.add('jsidebar-collapsed');
        sidebarToggleBtn.classList.add('jtoggle-active');
        // Update mini badge with current model tier
        updateMiniBadge();
    } else {
        sidebarEl.classList.remove('jsidebar-collapsed');
        sidebarToggleBtn.classList.remove('jtoggle-active');
    }
}

function updateMiniBadge() {
    if (!miniModelBadge) return;
    const tier = modelSelectEl ? modelSelectEl.value : 'LIGHT';
    const labels = { LIGHT: 'LIGHT', DRAW: 'DRAW', HEAVY: 'HEAVY' };
    miniModelBadge.textContent = labels[tier] || 'LIGHT';
}

// ── New Chat ────────────────────────────────────────────────
function handleNewChat() {
    const id = 's' + Date.now();
    sessions.unshift({ id, title: 'New Chat', messages: [] });
    activeSessionId = id;
    updateSessionList();
    renderMessages();
    inputEl.focus();
}

// ── Model Switch ────────────────────────────────────────────
async function handleModelChange() {
    const tier = modelSelectEl.value;
    let modelParam = '';
    if (tier === 'HEAVY') modelParam = 'heavy';
    else if (tier === 'DRAW') modelParam = 'qwen';
    else modelParam = 'light';

    try {
        const res = await fetch(API_MODEL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelParam })
        });
        const data = await res.json();
        currentModel = data.active_model || currentModel;
        currentDrawModel = data.draw_model || currentDrawModel;
    } catch (e) {
        console.log('[JARVIS-CHAT] Model switch error:', e);
    }
}

// ── Session List ────────────────────────────────────────────
function updateSessionList() {
    if (!sessionListEl) return;
    sessionListEl.innerHTML = sessions.map(s => `
        <div class="jsession ${s.id === activeSessionId ? 'jsession-active' : ''}"
             data-sid="${s.id}">
            <span class="jsession-icon">💬</span>
            <span class="jsession-title">${s.title}</span>
            ${sessions.length > 1 ? '<span class="jsession-del" data-del="' + s.id + '">✕</span>' : ''}
        </div>
    `).join('');

    sessionListEl.querySelectorAll('[data-sid]').forEach(el => {
        el.addEventListener('click', () => {
            activeSessionId = el.dataset.sid;
            updateSessionList();
            renderMessages();
        });
    });
    sessionListEl.querySelectorAll('[data-del]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const delId = el.dataset.del;
            sessions = sessions.filter(s => s.id !== delId);
            if (sessions.length === 0) {
                sessions = [{ id: 's1', title: 'New Chat', messages: [] }];
            }
            if (activeSessionId === delId) {
                activeSessionId = sessions[0].id;
            }
            updateSessionList();
            renderMessages();
        });
    });
}

function renderMessages() {
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session) return;

    msgArea.innerHTML = '';

    if (session.messages.length === 0) {
        msgArea.innerHTML = buildWelcomeHTML();
        msgArea.querySelectorAll('[data-prompt]').forEach(chip => {
            chip.addEventListener('click', () => {
                inputEl.value = chip.dataset.prompt;
                handleSend();
            });
        });
        return;
    }

    for (const m of session.messages) {
        addMessage(m.role, m.content, m.actions);
    }
}

// ── Health / Token ──────────────────────────────────────────
async function fetchHealth() {
    try {
        const res = await fetch(API_HEALTH);
        healthInfo = await res.json();
        currentModel = healthInfo.model || currentModel;
        currentDrawModel = healthInfo.draw_model || currentDrawModel;
        tokenUsage = healthInfo.token_usage || tokenUsage;

        if (statusDot && statusText) {
            if (healthInfo.ai_ready) {
                statusDot.className = 'jdot jdot-green';
                statusText.textContent = 'AI Ready';
                if (miniStatusDot) miniStatusDot.className = 'jdot jdot-green';
            } else {
                statusDot.className = 'jdot jdot-yellow';
                statusText.textContent = 'Mock';
                if (miniStatusDot) miniStatusDot.className = 'jdot jdot-yellow';
            }
        }
        updateTokenDisplay();
        updateMiniBadge();
    } catch (e) {
        if (statusDot && statusText) {
            statusDot.className = 'jdot jdot-red';
            statusText.textContent = 'Offline';
            if (miniStatusDot) miniStatusDot.className = 'jdot jdot-red';
        }
    }
}

function updateTokenDisplay() {
    if (!tokenDisplayEl) return;
    const t = tokenUsage.total;
    if (t >= 1000000) tokenDisplayEl.textContent = (t/1000000).toFixed(1) + 'M';
    else if (t >= 1000) tokenDisplayEl.textContent = (t/1000).toFixed(1) + 'K';
    else tokenDisplayEl.textContent = t;
}

// ── HTML Builder ────────────────────────────────────────────
function buildHTML() {
    return `
    <div id="jarvis-chat" class="jchat">
        <!-- SIDEBAR -->
        <div id="jarvis-sidebar" class="jsidebar">
            <div class="jsidebar-header">
                <div class="jlogo">
                    <span class="jlogo-icon">🤖</span>
                    <span class="jlogo-text">Jarvis AI</span>
                </div>
                <button id="jarvis-new-chat" class="jbtn-new">+ New Chat</button>
            </div>

            <div class="jsidebar-model">
                <select id="jarvis-model-select" class="jmodel-select">
                    <option value="LIGHT">⚡ LIGHT — Chat ringan</option>
                    <option value="DRAW">🎨 DRAW — Gambar S/R</option>
                    <option value="HEAVY">🧠 HEAVY — Analisa SMC</option>
                </select>
            </div>

            <div id="jarvis-session-list" class="jsession-list"></div>

            <div class="jsidebar-footer">
                <div class="jstatus">
                    <span id="jarvis-status-dot" class="jdot jdot-yellow"></span>
                    <span id="jarvis-status-text">Loading...</span>
                </div>
                <div class="jtokens">🎯 <span id="jarvis-token-count">0</span> tokens</div>
            </div>
        </div>

        <!-- MAIN CHAT -->
        <div class="jmain">
            <!-- TOP BAR: toggle + mini info -->
            <div class="jtopbar">
                <button id="jarvis-sidebar-toggle" class="jbtn-toggle" title="Toggle Sidebar (Ctrl+B)">
                    <span class="jtoggle-icon">☰</span>
                </button>
                <div class="jmini-info">
                    <span id="jarvis-mini-status" class="jdot jdot-yellow"></span>
                    <span id="jarvis-mini-model" class="jmini-model">LIGHT</span>
                </div>
                <div class="jtopbar-spacer"></div>
            </div>

            <div id="jarvis-messages" class="jmessages">
                ${buildWelcomeHTML()}
            </div>

            <div class="jinput-area">
                <div class="jinput-wrap">
                    <input id="jarvis-input" class="jinput" type="text"
                           placeholder="Ask Jarvis about trading..."
                           autocomplete="off" />
                    <button id="jarvis-send" class="jbtn-send">➤</button>
                </div>
                <div class="jinput-hint">Jarvis can make mistakes. Verify trading decisions.</div>
            </div>
        </div>
    </div>`;
}

function buildWelcomeHTML() {
    return `
    <div id="jarvis-welcome" class="jwelcome">
        <div class="jwelcome-icon">✨</div>
        <div class="jwelcome-title">Welcome to Jarvis AI</div>
        <div class="jwelcome-sub">Your trading chart assistant. Analyze markets, draw SMC, get insights.</div>
        <div class="jchips">
            <button class="jchip" data-prompt="Analisa BTCUSDT">📈 Analisa BTC</button>
            <button class="jchip" data-prompt="Gambar SMC structure di chart">🎨 Gambar SMC</button>
            <button class="jchip" data-prompt="Pasang RSI di BTCUSDT">📊 Pasang RSI</button>
            <button class="jchip" data-prompt="Ganti ke XAUUSD">🔄 Ganti XAUUSD</button>
            <button class="jchip" data-prompt="Cari support resistance">🎯 Cari S/R</button>
            <button class="jchip" data-prompt="Gambar Order Block di chart">🧱 Gambar OB</button>
            <button class="jchip" data-prompt="Gambar Fibonacci di chart">📐 Gambar FIB</button>
        </div>
    </div>`;
}

// ── CSS Builder ─────────────────────────────────────────────
function buildCSS() {
    return `
    /* ── OVERLAY CONTAINER ── */
    #jarvis-overlay {
        pointer-events: none;
    }
    #jarvis-chat {
        pointer-events: auto;
        width: 100%; height: 100%;
        display: flex;
        background: #0d0d14;
        border-radius: 0 0 6px 6px;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e0e0e0;
    }

    /* ── SIDEBAR ── */
    .jsidebar {
        width: 180px; min-width: 180px;
        background: #0a0a12;
        border-right: 1px solid #1a1a28;
        display: flex; flex-direction: column;
        overflow: hidden;
        transition: width 0.25s ease, min-width 0.25s ease, opacity 0.2s ease;
    }
    .jsidebar-collapsed {
        width: 0 !important; min-width: 0 !important;
        opacity: 0; overflow: hidden;
        border-right: none;
    }
    .jsidebar-header {
        padding: 10px;
        border-bottom: 1px solid #1a1a28;
    }
    .jlogo {
        display: flex; align-items: center; gap: 6px;
        margin-bottom: 10px;
    }
    .jlogo-icon { font-size: 18px; }
    .jlogo-text {
        font-weight: 700; font-size: 13px;
        color: #10b981; letter-spacing: 0.5px;
    }
    .jbtn-new {
        width: 100%; padding: 7px 0;
        background: #10b981; color: #fff;
        border: none; border-radius: 6px;
        font-weight: 600; font-size: 12px;
        cursor: pointer; transition: background 0.2s;
    }
    .jbtn-new:hover { background: #059669; }

    .jsidebar-model {
        padding: 8px 10px;
        border-bottom: 1px solid #1a1a28;
    }
    .jmodel-select {
        width: 100%; padding: 5px 8px;
        background: #111120; color: #ccc;
        border: 1px solid #2a2a3a; border-radius: 5px;
        font-size: 10px; cursor: pointer;
        outline: none;
    }
    .jmodel-select:focus { border-color: #10b981; }

    .jsession-list {
        flex: 1; overflow-y: auto; padding: 6px;
    }
    .jsession {
        display: flex; align-items: center; gap: 6px;
        padding: 6px 8px; border-radius: 6px;
        cursor: pointer; font-size: 11px;
        color: #888; transition: all 0.15s;
        margin-bottom: 2px;
    }
    .jsession:hover { background: #15152a; color: #ccc; }
    .jsession-active { background: #1a1a30; color: #10b981; }
    .jsession-icon { font-size: 10px; }
    .jsession-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jsession-del {
        opacity: 0; font-size: 9px; padding: 2px 4px;
        border-radius: 3px; transition: opacity 0.15s;
    }
    .jsession:hover .jsession-del { opacity: 0.6; }
    .jsession-del:hover { opacity: 1 !important; color: #f87171; }

    .jsidebar-footer {
        padding: 8px 10px;
        border-top: 1px solid #1a1a28;
        font-size: 10px; color: #666;
    }
    .jstatus { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
    .jdot { width: 6px; height: 6px; border-radius: 50%; }
    .jdot-green { background: #10b981; box-shadow: 0 0 4px #10b981; }
    .jdot-yellow { background: #f59e0b; }
    .jdot-red { background: #ef4444; }
    .jtokens { color: #555; }

    /* ── MAIN CHAT ── */
    .jmain {
        flex: 1; display: flex; flex-direction: column;
        overflow: hidden; min-width: 0;
    }

    /* ── TOP BAR ── */
    .jtopbar {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 10px;
        background: #0a0a12;
        border-bottom: 1px solid #1a1a28;
        min-height: 32px;
    }
    .jbtn-toggle {
        width: 28px; height: 28px;
        background: #111125; border: 1px solid #222240;
        color: #888; border-radius: 6px;
        cursor: pointer; display: flex;
        align-items: center; justify-content: center;
        transition: all 0.2s; font-size: 13px;
        padding: 0;
    }
    .jbtn-toggle:hover {
        background: #1a1a30; color: #10b981;
        border-color: #10b981;
    }
    .jtoggle-active .jtoggle-icon {
        color: #10b981;
    }
    .jtoggle-icon {
        line-height: 1; transition: color 0.2s;
    }
    .jmini-info {
        display: flex; align-items: center; gap: 5px;
        font-size: 10px; color: #666;
    }
    .jmini-model {
        padding: 2px 6px; border-radius: 4px;
        background: #111125; border: 1px solid #222240;
        font-weight: 600; font-size: 9px;
        letter-spacing: 0.5px; color: #10b981;
    }
    .jtopbar-spacer { flex: 1; }
    .jmessages {
        flex: 1; overflow-y: auto; padding: 12px;
        scroll-behavior: smooth;
    }
    .jmessages::-webkit-scrollbar { width: 4px; }
    .jmessages::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
    .jmessages::-webkit-scrollbar-track { background: transparent; }

    /* ── WELCOME ── */
    .jwelcome {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100%; text-align: center; padding: 20px;
    }
    .jwelcome-icon { font-size: 36px; margin-bottom: 12px; }
    .jwelcome-title { font-size: 18px; font-weight: 700; color: #10b981; margin-bottom: 6px; }
    .jwelcome-sub { font-size: 12px; color: #777; margin-bottom: 20px; max-width: 280px; }
    .jchips {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 6px; max-width: 300px; width: 100%;
    }
    .jchip {
        padding: 8px 10px; border-radius: 8px;
        background: #111125; border: 1px solid #222240;
        color: #aaa; font-size: 11px;
        cursor: pointer; transition: all 0.2s;
        text-align: left;
    }
    .jchip:hover { border-color: #10b981; color: #10b981; background: #0a1a15; }

    /* ── MESSAGES ── */
    .jmsg {
        display: flex; gap: 8px; margin-bottom: 12px;
        animation: jfadeIn 0.25s ease;
    }
    @keyframes jfadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .jmsg-user { justify-content: flex-end; }
    .jmsg-user .jmsg-body {
        max-width: 80%;
        background: #1e3a5f;
        border-radius: 12px 12px 4px 12px;
        padding: 8px 12px;
    }
    .jmsg-user .jmsg-role { color: #60a5fa; }
    .jmsg-ai .jmsg-body {
        max-width: 85%;
        background: #151525;
        border: 1px solid #1e1e35;
        border-radius: 12px 12px 12px 4px;
        padding: 8px 12px;
    }
    .jmsg-ai .jmsg-role { color: #10b981; }
    .jmsg-system .jmsg-body {
        max-width: 85%;
        background: #2a1010;
        border: 1px solid #3a1515;
        border-radius: 8px; padding: 8px 12px;
    }
    .jmsg-system .jmsg-role { color: #f87171; }
    .jmsg-avatar {
        width: 24px; height: 24px;
        background: #0a1a15; border: 1px solid #10b981;
        border-radius: 6px; display: flex;
        align-items: center; justify-content: center;
        font-size: 12px; flex-shrink: 0; margin-top: 2px;
    }
    .jmsg-role {
        font-size: 10px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.5px;
        margin-bottom: 3px;
    }
    .jmsg-text {
        font-size: 12px; line-height: 1.5;
        color: #ddd; word-break: break-word;
    }
    .jmsg-text strong { color: #fff; }

    /* ── ACTION BADGES ── */
    .jmsg-actions { margin-top: 8px; }
    .jaction {
        display: flex; align-items: center; gap: 5px;
        padding: 5px 8px; border-radius: 6px;
        background: #0a1a15; border: 1px solid #153025;
        font-size: 10px; margin-bottom: 3px;
    }
    .jaction-draw { border-color: #10b981; background: #051a12; }
    .jaction-icon { font-size: 10px; }
    .jaction-label { color: #10b981; font-weight: 600; }
    .jaction-tool { color: #aaa; }
    .jaction-detail { color: #666; font-size: 9px; }

    /* ── TYPING ── */
    .jtyping {
        display: flex; gap: 4px; padding: 4px 0;
    }
    .jtyping span {
        width: 5px; height: 5px; border-radius: 50%;
        background: #10b981; animation: jdot 1.4s infinite;
    }
    .jtyping span:nth-child(2) { animation-delay: 0.2s; }
    .jtyping span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes jdot {
        0%, 60%, 100% { opacity: 0.3; }
        30% { opacity: 1; }
    }

    /* ── INPUT ── */
    .jinput-area {
        padding: 8px 12px;
        border-top: 1px solid #1a1a28;
        background: #0d0d14;
    }
    .jinput-wrap {
        display: flex; gap: 6px;
        background: #111125; border: 1px solid #222240;
        border-radius: 10px; padding: 2px 4px 2px 10px;
        transition: border-color 0.2s;
    }
    .jinput-wrap:focus-within { border-color: #10b981; }
    .jinput {
        flex: 1; background: none; border: none;
        color: #e0e0e0; font-size: 12px;
        padding: 6px 0; outline: none;
        font-family: inherit;
    }
    .jinput::placeholder { color: #444; }
    .jbtn-send {
        width: 30px; height: 30px;
        background: #10b981; color: #fff;
        border: none; border-radius: 8px;
        font-size: 14px; cursor: pointer;
        transition: background 0.2s;
        display: flex; align-items: center; justify-content: center;
    }
    .jbtn-send:hover { background: #059669; }
    .jbtn-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .jinput-hint {
        font-size: 9px; color: #333;
        margin-top: 4px; text-align: center;
    }
    `;
}

// ── Auto-init when Module is FULLY ready ──────────────────────
// CRITICAL: Module.ccall exists BEFORE WASM finishes initializing!
// We must wait for Module.calledRun === true to avoid crashes.
function waitForModule() {
    if (typeof Module !== 'undefined' && Module.calledRun) {
        wasmReady = true;
        init();
        // Initialize semantic engine after WASM is ready
        safeCcall('jarvis_init_semantic', null, [], []);
        console.log('[JARVIS-CHAT] Semantic engine initialized');
    } else {
        setTimeout(waitForModule, 200);
    }
}

// Also hook into Emscripten's onRuntimeInitialized as backup
if (typeof Module !== 'undefined') {
    const origInit = Module.onRuntimeInitialized;
    Module.onRuntimeInitialized = function() {
        wasmReady = true;
        if (origInit) origInit();
        // Don't double-init — waitForModule will handle it
    };
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForModule);
} else {
    waitForModule();
}

})();

} // end else JARVIS_ENABLED
