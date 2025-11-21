// Claude Browser Bridge - Background Service Worker
// Manages WebSocket connection to local bridge server and routes messages between tabs and server

const BRIDGE_URL = 'ws://localhost:3141/ws';
const RECONNECT_INTERVAL = 5000;

let ws = null;
let connectionId = null;
let reconnectTimer = null;
let isConnected = false;

// Connection state
chrome.runtime.onInstalled.addListener(() => {
  console.log('Claude Browser Bridge installed');
  chrome.storage.local.set({ connected: false });
});

// Initialize WebSocket connection
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    console.log('WebSocket already connected or connecting');
    return;
  }

  console.log('Connecting to bridge server...');

  try {
    // Generate or reuse connection ID
    if (!connectionId) {
      connectionId = `ext_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    ws = new WebSocket(`${BRIDGE_URL}?connectionId=${connectionId}`);

    ws.onopen = () => {
      console.log('Connected to bridge server');
      isConnected = true;
      chrome.storage.local.set({ connected: true });

      // Update icon
      chrome.action.setIcon({ path: 'icons/icon48.png' });
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

      // Clear reconnect timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Send initial connection message
      sendToServer({
        type: 'connection_established',
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      });
    };

    ws.onclose = () => {
      console.log('Disconnected from bridge server');
      isConnected = false;
      chrome.storage.local.set({ connected: false });

      // Update icon
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336' });

      // Attempt to reconnect
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      isConnected = false;
      chrome.storage.local.set({ connected: false });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received from server:', message);
        handleServerMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    scheduleReconnect();
  }
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  isConnected = false;
  chrome.storage.local.set({ connected: false });
  chrome.action.setBadgeText({ text: '' });
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_INTERVAL);
}

function sendToServer(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn('Cannot send message: WebSocket not connected');
  }
}

// Handle messages from server
async function handleServerMessage(message) {
  switch (message.type) {
    case 'execute_script':
      await executeScriptInTab(message);
      break;

    case 'inspect_element':
      await inspectElementInTab(message);
      break;

    case 'take_screenshot':
      await takeScreenshotInTab(message);
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
}

// Execute script in active tab
async function executeScriptInTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      sendToServer({
        type: 'script_result',
        success: false,
        error: 'No active tab found',
        timestamp: Date.now()
      });
      return;
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'execute_script',
      script: message.script
    });

    sendToServer({
      type: 'script_result',
      success: true,
      result: response.result,
      tabId: tab.id.toString(),
      timestamp: Date.now()
    });

  } catch (error) {
    sendToServer({
      type: 'script_result',
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
}

// Inspect element in active tab
async function inspectElementInTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'inspect_element',
      selector: message.selector
    });

    sendToServer({
      type: 'inspect_result',
      success: true,
      selector: message.selector,
      html: response.html,
      computedStyles: response.computedStyles,
      boundingBox: response.boundingBox,
      tabId: tab.id.toString(),
      timestamp: Date.now()
    });

  } catch (error) {
    sendToServer({
      type: 'inspect_result',
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
}

// Take screenshot
async function takeScreenshotInTab(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      return;
    }

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });

    sendToServer({
      type: 'screenshot_result',
      success: true,
      dataUrl: dataUrl,
      tabId: tab.id.toString(),
      timestamp: Date.now()
    });

  } catch (error) {
    sendToServer({
      type: 'screenshot_result',
      success: false,
      error: error.message,
      timestamp: Date.now()
    });
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);

  if (message.action === 'forward_to_server') {
    sendToServer(message.data);
    sendResponse({ success: true });
  } else if (message.action === 'get_connection_status') {
    sendResponse({ connected: isConnected });
  } else if (message.action === 'connect') {
    connect();
    sendResponse({ success: true });
  } else if (message.action === 'disconnect') {
    disconnect();
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isConnected) {
    sendToServer({
      type: 'tab_updated',
      tabId: tabId.toString(),
      url: tab.url,
      title: tab.title,
      timestamp: Date.now()
    });
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (isConnected) {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    sendToServer({
      type: 'tab_activated',
      tabId: activeInfo.tabId.toString(),
      url: tab.url,
      title: tab.title,
      timestamp: Date.now()
    });
  }
});

// Auto-connect on startup
chrome.storage.local.get(['autoConnect'], (result) => {
  if (result.autoConnect !== false) {
    connect();
  }
});

// Export functions for popup
self.connect = connect;
self.disconnect = disconnect;
self.getConnectionStatus = () => isConnected;
