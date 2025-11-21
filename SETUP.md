# Setup Guide

Quick guide to get the Claude Browser Bridge up and running.

## Step 1: Install Prerequisites

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) or later
- Chrome or Edge browser

## Step 2: Start the Bridge Server

Open a terminal and run:

```bash
cd bridge-server/ClaudeBrowserBridge
dotnet run
```

You should see:
```
Claude Browser Bridge starting on http://localhost:3141
WebSocket endpoint: ws://localhost:3141/ws
HTTP API endpoint: http://localhost:3141/api/browser
Now listening on: http://127.0.0.1:3141
```

**Keep this terminal open** - the server needs to stay running.

## Step 3: Create Extension Icons (One-time)

The extension needs three icon files. You can:

**Option A: Use placeholders** - Create simple colored squares:
1. Use any image editor or online tool
2. Create three PNG files (any simple image will work):
   - `extension/icons/icon16.png` (16x16 pixels)
   - `extension/icons/icon48.png` (48x48 pixels)
   - `extension/icons/icon128.png` (128x128 pixels)

**Option B: Use online tool**:
1. Go to https://www.favicon-generator.org/
2. Upload any image or create one
3. Download and rename to icon16.png, icon48.png, icon128.png
4. Place in `extension/icons/` folder

**Option C: Skip for now** - The extension will load but show a default icon

## Step 4: Load the Extension

1. Open Chrome/Edge browser

2. Navigate to extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`

3. Enable **Developer mode** (toggle switch in top-right corner)

4. Click **"Load unpacked"** button

5. Navigate to and select the `extension` folder in this project

6. You should see "Claude Browser Bridge" in your extensions list

7. Click the extension icon (puzzle piece) in the toolbar

## Step 5: Connect to Bridge Server

1. Click the Claude Browser Bridge icon in your browser toolbar

2. A popup should appear showing:
   - Status: "Disconnected" (red dot)
   - Bridge Server: localhost:3141
   - Connect button

3. Click **"Connect to Claude"**

4. Status should change to "Connected" (green dot)

5. The bridge server terminal should show:
   ```
   WebSocket connection established: ext_1234567890_abc123
   ```

## Step 6: Test the Connection

### Test 1: Extension Test Button

1. In the extension popup, click **"Test Connection"**
2. You should see an alert with the current page title
3. ✅ Success!

### Test 2: Execute JavaScript via API

Open a new terminal (keep the server running) and run:

```bash
# Test health endpoint
curl http://localhost:3141/api/browser/health

# List connections
curl http://localhost:3141/api/browser/connections

# Execute JavaScript (make sure you're on a webpage first)
curl -X POST http://localhost:3141/api/browser/execute \
  -H "Content-Type: application/json" \
  -d "{\"script\": \"document.title\"}"
```

### Test 3: Console Log Capture

1. Open any webpage
2. Open browser DevTools (F12)
3. In the Console, type:
   ```javascript
   console.log("Hello from Claude Browser Bridge!")
   ```
4. Check the bridge server terminal - you should see the message arrive

## Step 7: Inspect Element Test

With a webpage open and the extension connected:

```bash
curl -X POST http://localhost:3141/api/browser/inspect \
  -H "Content-Type: application/json" \
  -d "{\"selector\": \"body\"}"
```

Check the server logs - you should see an inspection request sent.

## Troubleshooting

### "Connection failed" or "WebSocket error"

**Problem**: Extension can't connect to bridge server

**Solutions**:
1. Make sure the bridge server is running (`dotnet run` in bridge-server folder)
2. Check if port 3141 is available:
   ```bash
   # Windows
   netstat -ano | findstr :3141

   # Mac/Linux
   lsof -i :3141
   ```
3. Try accessing http://localhost:3141 in your browser - you should see JSON response

### "Content script not loaded"

**Problem**: Console logs aren't being captured

**Solutions**:
1. Refresh the webpage after connecting the extension
2. Check browser console for errors
3. Verify content script is loaded:
   ```javascript
   window.__claudeBridge  // Should return an object
   ```

### Extension shows "Error" status

**Problem**: Something went wrong with the connection

**Solutions**:
1. Click "Disconnect" then "Connect to Claude" again
2. Reload the extension:
   - Go to `chrome://extensions/`
   - Click the reload icon on Claude Browser Bridge
3. Restart the bridge server

### Service worker inactive

**Problem**: Extension stops working after a few minutes

**Cause**: Chrome puts service workers to sleep after ~30 seconds

**Solution**: This is normal - the extension will auto-reconnect when needed. You can also:
1. Go to `chrome://extensions/`
2. Click "Service Worker" under the extension
3. This keeps it active while DevTools is open

## Next Steps

Now that everything is working:

1. **Browse any website** - Console logs and errors are automatically captured
2. **Execute JavaScript remotely** - Use the `/api/browser/execute` endpoint
3. **Inspect elements** - Use the `/api/browser/inspect` endpoint
4. **Take screenshots** - Use the `/api/browser/screenshot` endpoint

See [README.md](README.md) for full documentation and use cases.

## Development Tips

### Debugging Background Script
```
chrome://extensions/ → Service Worker → Opens DevTools
```

### Debugging Content Script
```
Any webpage → F12 → Console → Look for "Claude Browser Bridge content script loaded"
```

### Debugging Popup
```
Right-click extension icon → Inspect popup
```

### Server Logs
```
All WebSocket messages and API calls appear in the server terminal
```

## Configuration

### Change Bridge Server Port

Edit `bridge-server/ClaudeBrowserBridge/appsettings.json`:

```json
{
  "BridgeServer": {
    "Port": 3141  // Change this
  }
}
```

Then update `extension/background.js`:

```javascript
const BRIDGE_URL = 'ws://localhost:3141/ws';  // Change this
```

## Quick Reference

| Component | Location | Command |
|-----------|----------|---------|
| Bridge Server | `bridge-server/ClaudeBrowserBridge/` | `dotnet run` |
| Extension | `extension/` | Load via `chrome://extensions/` |
| Health Check | Browser/Terminal | `http://localhost:3141/api/browser/health` |
| WebSocket | - | `ws://localhost:3141/ws` |

## Support

Check the logs:
- Bridge server: Terminal running `dotnet run`
- Background script: `chrome://extensions/` → Service Worker
- Content script: Browser DevTools → Console
- Extension popup: Right-click icon → Inspect popup
