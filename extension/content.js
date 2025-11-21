// Claude Browser Bridge - Content Script
// Injected into every page to capture DOM, console logs, and execute commands

(function() {
  'use strict';

  console.log('Claude Browser Bridge content script loaded');

  // Capture console logs
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };

  function captureConsole(level, args) {
    const message = Array.from(args).map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    // Send to background script
    chrome.runtime.sendMessage({
      action: 'forward_to_server',
      data: {
        type: 'console',
        level: level,
        message: message,
        timestamp: Date.now(),
        url: window.location.href
      }
    });
  }

  // Override console methods
  console.log = function(...args) {
    captureConsole('log', args);
    originalConsole.log.apply(console, args);
  };

  console.warn = function(...args) {
    captureConsole('warn', args);
    originalConsole.warn.apply(console, args);
  };

  console.error = function(...args) {
    captureConsole('error', args);
    originalConsole.error.apply(console, args);
  };

  console.info = function(...args) {
    captureConsole('info', args);
    originalConsole.info.apply(console, args);
  };

  // Capture JavaScript errors
  window.addEventListener('error', (event) => {
    chrome.runtime.sendMessage({
      action: 'forward_to_server',
      data: {
        type: 'error',
        message: event.message,
        source: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stackTrace: event.error ? event.error.stack : null,
        timestamp: Date.now(),
        url: window.location.href
      }
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    chrome.runtime.sendMessage({
      action: 'forward_to_server',
      data: {
        type: 'error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stackTrace: event.reason && event.reason.stack ? event.reason.stack : null,
        timestamp: Date.now(),
        url: window.location.href
      }
    });
  });

  // Send page load information
  function sendPageLoad() {
    chrome.runtime.sendMessage({
      action: 'forward_to_server',
      data: {
        type: 'page_load',
        url: window.location.href,
        title: document.title,
        timestamp: Date.now()
      }
    });
  }

  // Send on initial load
  if (document.readyState === 'complete') {
    sendPageLoad();
  } else {
    window.addEventListener('load', sendPageLoad);
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);

    try {
      switch (message.action) {
        case 'execute_script':
          executeScript(message.script, sendResponse);
          break;

        case 'inspect_element':
          inspectElement(message.selector, sendResponse);
          break;

        case 'get_dom':
          getDom(sendResponse);
          break;

        case 'get_page_info':
          getPageInfo(sendResponse);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }

    return true; // Keep message channel open for async response
  });

  // Execute arbitrary JavaScript
  function executeScript(script, sendResponse) {
    try {
      // Create a unique ID for this execution
      const executionId = 'claudeBridge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      let timeoutId;
      let responded = false;

      // Listen for result BEFORE injecting script
      const messageHandler = (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'CLAUDE_BRIDGE_RESULT') return;
        if (event.data.executionId !== executionId) return;

        if (responded) return;
        responded = true;

        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);

        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }

        if (event.data.success) {
          sendResponse({ success: true, result: event.data.result });
        } else {
          sendResponse({ success: false, error: event.data.error });
        }
      };

      window.addEventListener('message', messageHandler);

      // Inject script into page context (to avoid CSP issues)
      const scriptElement = document.createElement('script');
      scriptElement.textContent = `
        (function() {
          try {
            const result = (${script});
            window.postMessage({
              type: 'CLAUDE_BRIDGE_RESULT',
              executionId: '${executionId}',
              success: true,
              result: result
            }, '*');
          } catch (error) {
            window.postMessage({
              type: 'CLAUDE_BRIDGE_RESULT',
              executionId: '${executionId}',
              success: false,
              error: error.message
            }, '*');
          }
        })();
      `;

      // Execute script
      (document.head || document.documentElement).appendChild(scriptElement);

      // Timeout after 5 seconds
      timeoutId = setTimeout(() => {
        if (responded) return;
        responded = true;

        window.removeEventListener('message', messageHandler);
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }
        sendResponse({ success: false, error: 'Script execution timeout' });
      }, 5000);

    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }

  // Inspect a specific element
  function inspectElement(selector, sendResponse) {
    try {
      const element = document.querySelector(selector);

      if (!element) {
        sendResponse({
          success: false,
          error: `Element not found: ${selector}`
        });
        return;
      }

      // Get computed styles
      const computedStyles = window.getComputedStyle(element);
      const styles = {};

      // Get important style properties
      const importantProps = [
        'display', 'position', 'width', 'height',
        'margin', 'padding', 'border', 'background',
        'color', 'font-size', 'font-family',
        'opacity', 'visibility', 'z-index'
      ];

      importantProps.forEach(prop => {
        styles[prop] = computedStyles.getPropertyValue(prop);
      });

      // Get bounding box
      const rect = element.getBoundingClientRect();
      const boundingBox = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };

      sendResponse({
        success: true,
        html: element.outerHTML,
        innerHTML: element.innerHTML,
        computedStyles: styles,
        boundingBox: boundingBox,
        tagName: element.tagName,
        className: element.className,
        id: element.id
      });

    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  // Get full DOM
  function getDom(sendResponse) {
    sendResponse({
      success: true,
      html: document.documentElement.outerHTML
    });
  }

  // Get page information
  function getPageInfo(sendResponse) {
    sendResponse({
      success: true,
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      referrer: document.referrer,
      cookies: document.cookie,
      localStorage: getLocalStorage(),
      sessionStorage: getSessionStorage()
    });
  }

  function getLocalStorage() {
    try {
      return { ...localStorage };
    } catch (e) {
      return null;
    }
  }

  function getSessionStorage() {
    try {
      return { ...sessionStorage };
    } catch (e) {
      return null;
    }
  }

  // Monitor DOM mutations (optional - can be enabled/disabled)
  let mutationObserver = null;

  function startMutationObserver() {
    if (mutationObserver) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      // Throttle mutation events
      const mutationSummary = {
        type: 'dom_mutation',
        count: mutations.length,
        timestamp: Date.now(),
        url: window.location.href
      };

      chrome.runtime.sendMessage({
        action: 'forward_to_server',
        data: mutationSummary
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: false
    });
  }

  function stopMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }

  // Expose helper functions to window for debugging
  window.__claudeBridge = {
    version: '1.0.0',
    inspectElement: (selector) => {
      return new Promise((resolve) => {
        inspectElement(selector, resolve);
      });
    },
    executeScript: (script) => {
      return new Promise((resolve) => {
        executeScript(script, resolve);
      });
    }
  };

})();
