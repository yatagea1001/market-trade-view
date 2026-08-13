// ================================================================
// jarvis_toolbar_config.js — Tool & category definitions (JS side)
// ----------------------------------------------------------------
// ADAPTASI DARI: DRAWING_TOOLS array di jarvis_toolbar.js lama
// + ToolsPalette_Tools.mqh (icon definitions)
//
// Berisi: kategori + tool + SVG icon + tooltip + categoryId
// Dipakai oleh jarvis_toolbar_render.js untuk generate HTML tombol.
//
// Cara copas dari MQL5:
//   - Lihat ToolsPalette_Tools.mqh baris 24-78 (icon definitions)
//   - Tiap SIconDefinition { fontName, charCode } di MQL5 → konversi ke SVG
//     (Wingdings glyph → SVG path atau Unicode emoji)
//   - Tiap AddTool() call di InitAllCategoriesAndTools() → entry di DRAWING_TOOLS
// ================================================================

// ── Categories (9 kategori) ─────────────────────────────────────
const CATEGORIES = [
    { id: 'cursors',      label: 'Cursors',      tooltip: 'Pointer & Crosshair',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7 16 2-7 7-2z"/></svg>' },
    { id: 'lines',        label: 'Lines',        tooltip: '8 line tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>' },
    { id: 'channels',     label: 'Channels',     tooltip: '3 channel tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>' },
    { id: 'pitchfork',    label: 'Pitchfork',    tooltip: '3 pitchfork tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="4" y2="20"/><line x1="12" y1="12" x2="20" y2="12"/></svg>' },
    { id: 'gann',         label: 'Gann',         tooltip: '3 gann tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="12"/><line x1="4" y1="20" x2="12" y2="4"/></svg>' },
    { id: 'fibonacci',    label: 'Fibonacci',    tooltip: '6 fibo tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>' },
    { id: 'shapes',       label: 'Shapes',       tooltip: '8 shape tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12"/></svg>' },
    { id: 'annotations',  label: 'Annotations',  tooltip: '12 annotation tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'delete',       label: 'Delete',       tooltip: 'Clear all shapes',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
      isAction: true },
    { id: 'pinned',       label: 'Pinned',       tooltip: 'Favorite tools',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"/></svg>',
      isAction: true, hiddenIfEmpty: true },
];

// ── Tools (35+ tools) ───────────────────────────────────────────
// Format: { id, label, tooltip, categoryId, svg, pngPath, toolId (C++ enum), clicks }
const DRAWING_TOOLS = [
    // ─── CURSORS ───────────────────────────────────────────────
    { id: 'pointer',    label: 'Pointer',    tooltip: 'Pointer (select & move)',
      categoryId: 'cursors', toolId: 1, clicks: 0,
      pngPath: 'assets/cursor.png',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7 16 2-7 7-2z"/></svg>' },
    { id: 'crosshair',  label: 'Crosshair',  tooltip: 'Crosshair (read-only)',
      categoryId: 'cursors', toolId: 2, clicks: 0,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>' },

    // ─── LINES (8 tools) ───────────────────────────────────────
    { id: 'trendline',  label: 'Trend',      tooltip: 'Trend Line',
      categoryId: 'lines', toolId: 3, clicks: 2,
      pngPath: 'assets/line.png',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>' },
    { id: 'hline',      label: 'H-Line',     tooltip: 'Horizontal Line',
      categoryId: 'lines', toolId: 4, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>' },
    { id: 'vline',      label: 'V-Line',     tooltip: 'Vertical Line',
      categoryId: 'lines', toolId: 5, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/></svg>' },
    { id: 'ray',        label: 'Ray',        tooltip: 'Ray (extend right)',
      categoryId: 'lines', toolId: 6, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><polyline points="14 4 20 4 20 10"/></svg>' },
    { id: 'extended',   label: 'Extended',   tooltip: 'Extended Line (both ways)',
      categoryId: 'lines', toolId: 7, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="21" x2="21" y2="3"/></svg>' },
    { id: 'infoline',   label: 'Info',       tooltip: 'Info Line',
      categoryId: 'lines', toolId: 8, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="12" cy="12" r="3"/></svg>' },
    { id: 'trendangle', label: 'Angle',      tooltip: 'Trend Angle',
      categoryId: 'lines', toolId: 9, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><path d="M4 20 A 16 16 0 0 0 12 12"/></svg>' },
    { id: 'crossline',  label: 'Cross',      tooltip: 'Cross Line (H+V)',
      categoryId: 'lines', toolId: 10, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>' },

    // ─── CHANNELS (3 tools) ────────────────────────────────────
    { id: 'parallel_ch',   label: 'Parallel',   tooltip: 'Parallel Channel',
      categoryId: 'channels', toolId: 11, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>' },
    { id: 'regression_ch', label: 'Regression', tooltip: 'Regression Channel',
      categoryId: 'channels', toolId: 12, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="8"/><line x1="3" y1="8" x2="21" y2="4"/><line x1="3" y1="16" x2="21" y2="12"/></svg>' },
    { id: 'stddev_ch',     label: 'StdDev',     tooltip: 'Standard Deviation Channel',
      categoryId: 'channels', toolId: 13, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="14" x2="21" y2="14"/></svg>' },

    // ─── PITCHFORK (3 tools) ───────────────────────────────────
    { id: 'pitchfork',  label: 'Pitchfork', tooltip: 'Andrews Pitchfork',
      categoryId: 'pitchfork', toolId: 14, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="4" y2="20"/><line x1="12" y1="12" x2="20" y2="12"/></svg>' },
    { id: 'schiff',     label: 'Schiff',    tooltip: 'Schiff Pitchfork',
      categoryId: 'pitchfork', toolId: 15, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="4" y2="20"/><line x1="12" y1="8" x2="20" y2="8"/></svg>' },
    { id: 'modschiff',  label: 'Mod Schiff',tooltip: 'Modified Schiff',
      categoryId: 'pitchfork', toolId: 16, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="12" x2="4" y2="20"/><line x1="12" y1="10" x2="20" y2="10"/></svg>' },

    // ─── GANN (3 tools) ────────────────────────────────────────
    { id: 'gann_line',  label: 'Gann Line', tooltip: 'Gann Line (1x1 angle)',
      categoryId: 'gann', toolId: 17, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>' },
    { id: 'gann_fan',   label: 'Gann Fan',  tooltip: 'Gann Fan (multi-angle)',
      categoryId: 'gann', toolId: 18, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="12"/><line x1="4" y1="20" x2="12" y2="4"/></svg>' },
    { id: 'gann_box',   label: 'Gann Box',  tooltip: 'Gann Box (square of 9)',
      categoryId: 'gann', toolId: 19, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="4" x2="20" y2="20"/></svg>' },

    // ─── FIBONACCI (6 tools) ───────────────────────────────────
    { id: 'fib_retrace', label: 'Fib Retrace', tooltip: 'Fibonacci Retracement',
      categoryId: 'fibonacci', toolId: 20, clicks: 2,
      pngPath: 'assets/fib.png',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>' },
    { id: 'fib_expand',  label: 'Fib Expand',  tooltip: 'Fibonacci Expansion',
      categoryId: 'fibonacci', toolId: 21, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="12" cy="12" r="2"/></svg>' },
    { id: 'fib_channel', label: 'Fib Channel', tooltip: 'Fibonacci Channel',
      categoryId: 'fibonacci', toolId: 22, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><line x1="4" y1="8" x2="4" y2="16"/></svg>' },
    { id: 'fib_time',    label: 'Fib Time',    tooltip: 'Fibonacci Time Zones',
      categoryId: 'fibonacci', toolId: 23, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="18" y1="3" x2="18" y2="21"/></svg>' },
    { id: 'fib_fan',     label: 'Fib Fan',      tooltip: 'Fibonacci Fan',
      categoryId: 'fibonacci', toolId: 24, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="20" y2="12"/><line x1="4" y1="20" x2="20" y2="20"/></svg>' },
    { id: 'fib_arcs',    label: 'Fib Arcs',     tooltip: 'Fibonacci Arcs',
      categoryId: 'fibonacci', toolId: 25, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 A 16 16 0 0 1 20 4"/><path d="M4 20 A 12 12 0 0 1 20 8"/><path d="M4 20 A 8 8 0 0 1 20 12"/></svg>' },

    // ─── SHAPES (8 tools) ──────────────────────────────────────
    { id: 'rectangle',  label: 'Rectangle', tooltip: 'Rectangle',
      categoryId: 'shapes', toolId: 26, clicks: 2,
      pngPath: 'assets/rect.png',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12"/></svg>' },
    { id: 'triangle',   label: 'Triangle',  tooltip: 'Triangle',
      categoryId: 'shapes', toolId: 27, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,4 20,20 4,20"/></svg>' },
    { id: 'ellipse',    label: 'Ellipse',   tooltip: 'Rotated Ellipse',
      categoryId: 'shapes', toolId: 28, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="5"/></svg>' },
    { id: 'circle',     label: 'Circle',    tooltip: 'Circle (center + border)',
      categoryId: 'shapes', toolId: 29, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>' },
    { id: 'arc',        label: 'Arc',       tooltip: 'Arc (Bezier)',
      categoryId: 'shapes', toolId: 30, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q 12 4 20 20"/></svg>' },
    { id: 'curve',      label: 'Curve',     tooltip: 'Bezier Curve',
      categoryId: 'shapes', toolId: 31, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q 8 4 20 12"/></svg>' },
    { id: 'path',       label: 'Path',      tooltip: 'Polyline Path',
      categoryId: 'shapes', toolId: 32, clicks: -1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4,20 8,8 14,16 20,4"/></svg>' },
    { id: 'rotrect',    label: 'Rot Rect',  tooltip: 'Rotated Rectangle',
      categoryId: 'shapes', toolId: 33, clicks: 3,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6,4 20,8 18,20 4,16"/></svg>' },

    // ─── ANNOTATIONS (12 tools) ────────────────────────────────
    { id: 'text',       label: 'Text',      tooltip: 'Text',
      categoryId: 'annotations', toolId: 34, clicks: 1,
      pngPath: 'assets/text.png',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'arrow_up',   label: '↑ Arrow',   tooltip: 'Arrow Up',
      categoryId: 'annotations', toolId: 35, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="4" x2="12" y2="20"/><polyline points="6 10 12 4 18 10"/></svg>' },
    { id: 'arrow_down', label: '↓ Arrow',   tooltip: 'Arrow Down',
      categoryId: 'annotations', toolId: 36, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="4" x2="12" y2="20"/><polyline points="6 14 12 20 18 14"/></svg>' },
    { id: 'thumb_up',   label: '👍',         tooltip: 'Thumb Up',
      categoryId: 'annotations', toolId: 37, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20 h4 V10 H2 z M6 10 L10 4 a2 2 0 0 1 4 1 v5 h6 a2 2 0 0 1 2 2 l-2 8 a2 2 0 0 1-2 2 H6"/></svg>' },
    { id: 'thumb_down', label: '👎',         tooltip: 'Thumb Down',
      categoryId: 'annotations', toolId: 38, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4 h4 v10 H2 z M6 14 L10 20 a2 2 0 0 0 4 -1 v-5 h6 a2 2 0 0 0 2 -2 l-2 -8 a2 2 0 0 0-2 -2 H6"/></svg>' },
    { id: 'price_lbl',  label: 'Price',     tooltip: 'Price Label',
      categoryId: 'annotations', toolId: 39, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="4,12 12,4 20,12 12,20"/></svg>' },
    { id: 'stop_sign',  label: 'Stop',      tooltip: 'Stop Sign',
      categoryId: 'annotations', toolId: 40, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8"/></svg>' },
    { id: 'check_mark', label: '✓',         tooltip: 'Check Mark',
      categoryId: 'annotations', toolId: 41, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 12 10 18 20 6"/></svg>' },
    { id: 'arrow',      label: 'Arrow',     tooltip: 'Arrow (line + head)',
      categoryId: 'annotations', toolId: 42, clicks: 2,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>' },
    { id: 'arrow_mk',   label: 'Arrow Mk',  tooltip: 'Arrow Marker',
      categoryId: 'annotations', toolId: 43, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><polyline points="9 12 12 9 15 12 12 15"/></svg>' },
    { id: 'note',       label: 'Note',      tooltip: 'Note',
      categoryId: 'annotations', toolId: 44, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>' },
    { id: 'price_note', label: 'P-Note',    tooltip: 'Price Note',
      categoryId: 'annotations', toolId: 45, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="3" x2="12" y2="21"/><rect x="6" y="6" width="12" height="6"/></svg>' },
    { id: 'callout',    label: 'Callout',   tooltip: 'Callout',
      categoryId: 'annotations', toolId: 46, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="12"/><polygon points="8,16 12,20 12,16"/></svg>' },
    { id: 'comment',    label: 'Comment',   tooltip: 'Comment',
      categoryId: 'annotations', toolId: 47, clicks: 1,
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="6" y1="14" x2="14" y2="14"/></svg>' },
];

// ── Helper: get tools by category ───────────────────────────────
function getToolsByCategory(categoryId) {
    return DRAWING_TOOLS.filter(t => t.categoryId === categoryId);
}

// ── Helper: get tool by id ──────────────────────────────────────
function getToolById(toolId) {
    return DRAWING_TOOLS.find(t => t.id === toolId);
}

// ── Helper: get tool by C++ enum toolId ─────────────────────────
function getToolByEnumId(enumId) {
    return DRAWING_TOOLS.find(t => t.toolId === enumId);
}

// ── Export ──────────────────────────────────────────────────────
window.JarvisToolbarConfig = {
    CATEGORIES,
    DRAWING_TOOLS,
    getToolsByCategory,
    getToolById,
    getToolByEnumId
};
