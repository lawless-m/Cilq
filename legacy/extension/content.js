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

  // Execute predefined safe operations (CSP-compliant)
  function executeScript(script, sendResponse) {
    try {
      let result;

      // For strict CSP, we can only execute predefined safe operations
      // Parse the script string and execute known patterns
      const trimmed = script.trim();

      // Common patterns we support
      if (trimmed === 'document.title') {
        result = document.title;
      } else if (trimmed === 'document.URL' || trimmed === 'window.location.href') {
        result = document.URL;
      } else if (trimmed === 'document.readyState') {
        result = document.readyState;
      } else if (trimmed === 'document.documentElement.outerHTML') {
        result = document.documentElement.outerHTML;
      } else if (trimmed.startsWith('document.querySelector(')) {
        // Extract selector from document.querySelector('...')
        const match = trimmed.match(/document\.querySelector\(['"](.+?)['"]\)/);
        if (match) {
          const element = document.querySelector(match[1]);
          result = element ? element.outerHTML : null;
        } else {
          throw new Error('Invalid querySelector syntax');
        }
      } else if (trimmed.startsWith('document.querySelectorAll(')) {
        // Extract selector from document.querySelectorAll('...')
        const match = trimmed.match(/document\.querySelectorAll\(['"](.+?)['"]\)\.length/);
        if (match) {
          result = document.querySelectorAll(match[1]).length;
        } else {
          throw new Error('Invalid querySelectorAll syntax - use .length');
        }
      } else if (trimmed.startsWith('document.getElementById(')) {
        // Extract id from document.getElementById('...')
        const match = trimmed.match(/document\.getElementById\(['"](.+?)['"]\)/);
        if (match) {
          const element = document.getElementById(match[1]);
          result = element ? element.outerHTML : null;
        } else {
          throw new Error('Invalid getElementById syntax');
        }
      } else if (trimmed.includes('querySelectorAll') && trimmed.includes('img')) {
        // Get all image URLs
        const images = Array.from(document.querySelectorAll('img'));
        result = images.map(img => img.src);
      } else if (trimmed.includes('querySelectorAll') && trimmed.includes('.map(')) {
        // Support common array operations on querySelectorAll
        // Extract selector
        const selectorMatch = trimmed.match(/querySelectorAll\(['"](.+?)['"]\)/);
        if (selectorMatch) {
          const elements = Array.from(document.querySelectorAll(selectorMatch[1]));
          // For now, just return the elements as HTML array
          result = elements.map(el => el.outerHTML);
        } else {
          throw new Error('Invalid querySelectorAll syntax');
        }
      } else {
        // Unsupported operation for strict CSP
        sendResponse({
          success: false,
          error: 'Strict CSP: Only predefined operations supported. Use document.title, document.querySelector(), etc.'
        });
        return;
      }

      sendResponse({ success: true, result: result });

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
