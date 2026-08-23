/**
 * User Action Tracker
 * Track user interactions: button clicks, indicator adds, tool selections, etc
 * Helps identify what user was doing before crash
 */

function setupUserActionTracker() {
  if (!window.debugLogger) {
    console.error('❌ debugLogger not initialized!');
    return;
  }

  const logger = window.debugLogger;

  // ===== 1. TRACK BUTTON CLICKS =====
  document.addEventListener('click', (evt) => {
    const target = evt.target.closest('button, [data-action], [data-tool]');
    if (target) {
      const action = target.dataset.action || target.dataset.tool || target.textContent.trim();
      const id = target.id || target.className || 'unnamed';
      
      logger.logUserAction('button_click', {
        element_id: id,
        action: action.substring(0, 100),
        timestamp: new Date().toISOString()
      });
    }
  }, true);

  // ===== 2. TRACK INDICATOR ADDS =====
  window.addIndicator = function(indicatorName, params = {}) {
    logger.logUserAction('indicator_add', { 
      name: indicatorName,
      params,
      timestamp: new Date().toISOString()
    });
  };

  // ===== 3. TRACK DRAWING TOOL SELECTION =====
  window.selectDrawingTool = function(toolName) {
    logger.logUserAction('drawing_tool_select', { 
      tool: toolName,
      timestamp: new Date().toISOString()
    });
  };

  // ===== 4. TRACK INDICATOR REMOVAL =====
  window.removeIndicator = function(indicatorId) {
    logger.logUserAction('indicator_remove', { 
      indicator_id: indicatorId,
      timestamp: new Date().toISOString()
    });
  };

  // ===== 5. TRACK TIMEFRAME CHANGE =====
  window.setTimeframe = function(timeframe) {
    logger.logUserAction('timeframe_change', { 
      timeframe,
      timestamp: new Date().toISOString()
    });
  };

  // ===== 6. TRACK SYMBOL CHANGE =====
  window.setSymbol = function(symbol) {
    logger.logUserAction('symbol_change', { 
      symbol,
      timestamp: new Date().toISOString()
    });
  };

  // ===== 7. TRACK CHART ZOOM =====
  let lastZoomTime = 0;
  window.zoomChart = function(direction, amount = 1) {
    const now = Date.now();
    if (now - lastZoomTime > 200) { // Throttle to avoid spam
      logger.logUserAction('chart_zoom', { 
        direction,
        amount,
        timestamp: new Date().toISOString()
      });
      lastZoomTime = now;
    }
  };

  // ===== 8. TRACK CHART PAN =====
  let lastPanTime = 0;
  window.panChart = function(dx, dy) {
    const now = Date.now();
    if (now - lastPanTime > 200) { // Throttle
      logger.logUserAction('chart_pan', { 
        dx: dx.toFixed(1),
        dy: dy.toFixed(1),
        timestamp: new Date().toISOString()
      });
      lastPanTime = now;
    }
  };

  // ===== 9. TRACK INPUT FOCUS =====
  document.addEventListener('focus', (evt) => {
    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA') {
      logger.logUserAction('input_focus', {
        element_id: evt.target.id || evt.target.name,
        placeholder: evt.target.placeholder,
        timestamp: new Date().toISOString()
      });
    }
  }, true);

  // ===== 10. TRACK KEY COMMANDS =====
  document.addEventListener('keydown', (evt) => {
    // Log important shortcuts only
    if (evt.ctrlKey || evt.cmdKey) {
      let shortcut = '';
      if (evt.key === 'z') shortcut = 'Ctrl+Z (Undo)';
      else if (evt.key === 'y') shortcut = 'Ctrl+Y (Redo)';
      else if (evt.key === 's') shortcut = 'Ctrl+S (Save)';
      else if (evt.key === 'Delete') shortcut = 'Delete';
      
      if (shortcut) {
        logger.logUserAction('keyboard_shortcut', {
          shortcut,
          timestamp: new Date().toISOString()
        });
      }
    }
  }, true);

  // ===== 11. TRACK CONTEXT MENU =====
  document.addEventListener('contextmenu', (evt) => {
    const target = evt.target.closest('[data-action]') || evt.target;
    logger.logUserAction('context_menu', {
      element: target.id || target.className,
      timestamp: new Date().toISOString()
    });
  }, true);

  // ===== 12. TRACK WINDOW EVENTS =====
  window.addEventListener('beforeunload', () => {
    logger.logUserAction('page_unload', {
      timestamp: new Date().toISOString()
    });
    logger.saveLog();
  });

  window.addEventListener('focus', () => {
    logger.logUserAction('window_focus', {
      timestamp: new Date().toISOString()
    });
  });

  window.addEventListener('blur', () => {
    logger.logUserAction('window_blur', {
      timestamp: new Date().toISOString()
    });
  });

  console.log(
    `%c✅ User Action Tracker activated`,
    'color: green; font-weight: bold;'
  );
}

// Auto-setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(setupUserActionTracker, 500);
  });
} else {
  setTimeout(setupUserActionTracker, 500);
}
