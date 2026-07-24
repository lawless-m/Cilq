# Claude Browser Bridge Extension

Chrome/Edge browser extension that creates a real-time communication bridge between your browser and Claude Code via a local WebSocket server.

## Features

- **Real-time Console Capture**: Automatically captures `console.log`, `console.warn`, `console.error`, and `console.info`
- **JavaScript Error Tracking**: Captures uncaught exceptions and unhandled promise rejections
- **Remote Script Execution**: Execute JavaScript in the browser from Claude Code
- **DOM Inspection**: Query and inspect any element on the page
- **Screenshot Capture**: Take screenshots of the current page or specific elements
- **Page Event Monitoring**: Tracks page loads, tab switches, and navigation
- **Automatic Reconnection**: Reconnects to bridge server if connection is lost

## Installation

### Prerequisites

1. Bridge server must be running on `localhost:3141`
2. Chrome or Edge browser

### Load as Unpacked Extension

1. Open Chrome/Edge and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`

2. Enable "Developer mode" (toggle in top-right corner)

3. Click "Load unpacked"

4. Select the `extension` folder from this project

5. The extension icon should appear in your browser toolbar

## Usage

### Connecting to Bridge Server

1. Make sure the bridge server is running:
   ```bash
   cd bridge-server/ClaudeBrowserBridge
   dotnet run
   ```

2. Click the extension icon in your browser toolbar

3. Click "Connect to Claude"

4. The status should change to "Connected" with a green indicator

### Testing the Connection

1. With the extension connected, click "Test Connection"

2. You should see an alert with the current page title

3. Check the bridge server console for incoming messages

### Disconnecting

Click the "Disconnect" button in the popup to close the WebSocket connection.

## How It Works

### Architecture

```
Browser Tab
    ↓
Content Script (content.js)
    ↓
Background Service Worker (background.js)
    ↓
WebSocket Connection
    ↓
Bridge Server (localhost:3141)
    ↓
Claude Code
```

### Components

#### Content Script (`content.js`)
- Injected into every web page
- Captures console logs and errors
- Executes commands from Claude Code
- Inspects DOM elements
- Sends page events to background script

#### Background Service Worker (`background.js`)
- Manages WebSocket connection to bridge server
- Routes messages between content scripts and server
- Handles connection lifecycle (connect, disconnect, reconnect)
- Manages tab events and state

#### Popup UI (`popup.html`, `popup.js`)
- Connection status indicator
- Connect/disconnect controls
- Current tab information
- Test connection button

## Message Protocol

### From Extension → Server

**Console Log**
```json
{
  "type": "console",
  "level": "log",
  "message": "Hello, World!",
  "timestamp": 1234567890,
  "url": "https://example.com"
}
```

**JavaScript Error**
```json
{
  "type": "error",
  "message": "Uncaught TypeError: ...",
  "source": "https://example.com/script.js",
  "lineNumber": 42,
  "columnNumber": 10,
  "stackTrace": "...",
  "timestamp": 1234567890,
  "url": "https://example.com"
}
```

**Page Load**
```json
{
  "type": "page_load",
  "url": "https://example.com",
  "title": "Example Page",
  "timestamp": 1234567890
}
```

**Script Result**
```json
{
  "type": "script_result",
  "success": true,
  "result": "Document Title",
  "timestamp": 1234567890
}
```

### From Server → Extension

**Execute Script**
```json
{
  "type": "execute_script",
  "script": "document.getElementById('myId').innerHTML",
  "timestamp": 1234567890
}
```

**Inspect Element**
```json
{
  "type": "inspect_element",
  "selector": "#pagination",
  "timestamp": 1234567890
}
```

**Take Screenshot**
```json
{
  "type": "take_screenshot",
  "selector": "#my-element",
  "fullPage": false,
  "timestamp": 1234567890
}
```

## Development

### File Structure

```
extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Background service worker
├── content.js             # Content script
├── popup.html             # Popup UI
├── popup.js               # Popup controller
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Debugging

#### Background Service Worker
1. Go to `chrome://extensions/`
2. Find "Claude Browser Bridge"
3. Click "Service Worker" link under the extension
4. This opens DevTools for the background script

#### Content Script
1. Open DevTools on any web page (F12)
2. Content script logs appear in the Console
3. Look for "Claude Browser Bridge content script loaded"

#### Popup
1. Right-click the extension icon
2. Select "Inspect popup"
3. This opens DevTools for the popup

### Testing Script Execution

Open any webpage, open the console, and try:

```javascript
// Check if bridge is loaded
window.__claudeBridge

// Execute a script
window.__claudeBridge.executeScript('document.title')

// Inspect an element
window.__claudeBridge.inspectElement('#some-element')
```

## Security Considerations

- Extension only connects to `localhost:3141`
- WebSocket connection is not encrypted (local only)
- Content script can execute arbitrary JavaScript (by design, for debugging)
- Only use on trusted development environments
- Do not use on sensitive pages or production sites

## Troubleshooting

### Extension Not Connecting

1. Verify bridge server is running:
   ```bash
   curl http://localhost:3141/api/browser/health
   ```

2. Check browser console for WebSocket errors

3. Check bridge server console for connection attempts

### Content Script Not Working

1. Refresh the page after installing/updating extension
2. Check if content script is injected:
   ```javascript
   window.__claudeBridge
   ```

3. Check DevTools console for errors

### Messages Not Appearing in Bridge Server

1. Check browser console for message sending errors
2. Verify WebSocket connection is active
3. Check bridge server logs

## Known Limitations

- Service worker may sleep after 30 seconds of inactivity
- WebSocket connection will close when service worker sleeps
- Extension will auto-reconnect when service worker wakes up
- Some sites with strict CSP may block content script functionality

## Future Enhancements

- [ ] Screenshot capture implementation
- [ ] Network request monitoring
- [ ] DOM mutation observer controls
- [ ] Performance profiling
- [ ] React/Vue DevTools-like inspection
- [ ] Session recording/playback

## License

Private project
