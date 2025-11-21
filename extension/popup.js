// Claude Browser Bridge - Popup UI Controller

document.addEventListener('DOMContentLoaded', async () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const testBtn = document.getElementById('testBtn');
  const currentUrl = document.getElementById('currentUrl');
  const currentTitle = document.getElementById('currentTitle');

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

      // Get background page and call connect
      const backgroundPage = await chrome.runtime.getBackgroundClient();

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
      alert('Failed to connect to bridge server. Make sure it is running on localhost:3141');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect to Claude';
    }
  });

  // Disconnect button
  disconnectBtn.addEventListener('click', async () => {
    try {
      disconnectBtn.disabled = true;

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

      // Test by getting page title via content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'execute_script',
        script: 'document.title'
      });

      if (response.success) {
        alert(`Test successful! Page title: "${response.result}"`);
      } else {
        alert(`Test failed: ${response.error}`);
      }

    } catch (error) {
      console.error('Test failed:', error);
      alert(`Test failed: ${error.message}`);
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
