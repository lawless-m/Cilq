// Claude Browser Bridge - Popup UI Controller

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const testBtn = document.getElementById('testBtn');
  const currentUrl = document.getElementById('currentUrl');
  const currentTitle = document.getElementById('currentTitle');
  const messageBox = document.getElementById('messageBox');

  // Show message in the popup (replaces alert())
  function showMessage(text, type = 'info') {
    messageBox.textContent = text;
    messageBox.className = `message ${type}`;
    messageBox.classList.remove('hidden');

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        messageBox.classList.add('hidden');
      }, 5000);
    }
  }

  function hideMessage() {
    messageBox.classList.add('hidden');
  }

  // Get current tab info
  async function updateTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentUrl.textContent = tab.url ? new URL(tab.url).hostname : '-';
        currentTitle.textContent = tab.title || '-';
      }
    } catch (error) {
      console.error('Failed to get tab info:', error);
    }
  }

  // Update connection status
  async function updateStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'get_connection_status'
      });

      const isConnected = response && response.connected;

      if (isConnected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
        connectBtn.classList.add('hidden');
        disconnectBtn.classList.remove('hidden');
        testBtn.disabled = false;
      } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        connectBtn.classList.remove('hidden');
        disconnectBtn.classList.add('hidden');
        testBtn.disabled = true;
      }
    } catch (error) {
      console.error('Failed to get connection status:', error);
      statusDot.classList.remove('connected');
      statusText.textContent = 'Error';
    }
  }

  // Connect button
  connectBtn.addEventListener('click', async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      hideMessage();

      // Send message to background to connect
      await chrome.runtime.sendMessage({ action: 'connect' });

      // Wait a moment for connection
      setTimeout(async () => {
        await updateStatus();
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Claude';
      }, 1000);

    } catch (error) {
      console.error('Failed to connect:', error);
      showMessage('Failed to connect to bridge server. Make sure it is running on localhost:3141', 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect to Claude';
    }
  });

  // Disconnect button
  disconnectBtn.addEventListener('click', async () => {
    try {
      disconnectBtn.disabled = true;
      hideMessage();

      // Send message to background to disconnect
      await chrome.runtime.sendMessage({ action: 'disconnect' });

      await updateStatus();
      disconnectBtn.disabled = false;

    } catch (error) {
      console.error('Failed to disconnect:', error);
      disconnectBtn.disabled = false;
    }
  });

  // Test button
  testBtn.addEventListener('click', async () => {
    try {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      hideMessage();

      // Test by getting page title via content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Check if it's a chrome:// or extension:// page
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('extension://'))) {
        showMessage('Cannot inject content script into browser system pages. Please navigate to a regular webpage (http:// or https://) and try again.', 'error');
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'execute_script',
        script: 'document.title'
      });

      if (response && response.success) {
        showMessage(`Test successful! Page title: "${response.result}"`, 'success');
      } else {
        showMessage(`Test failed: ${response ? response.error : 'Unknown error'}`, 'error');
      }

    } catch (error) {
      console.error('Test failed:', error);

      if (error.message.includes('Receiving end does not exist')) {
        showMessage('Content script not loaded. Please refresh the page (F5) and try again.', 'error');
      } else {
        showMessage(`Test failed: ${error.message}`, 'error');
      }
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test Connection';
    }
  });

  // Initialize
  await updateTabInfo();
  await updateStatus();

  // Update status periodically
  setInterval(updateStatus, 2000);
});
