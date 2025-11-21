# Claude Browser Bridge

A comprehensive system for real-time browser debugging and interaction with Claude Code. Enables bidirectional communication between web browsers and Claude for interactive development, debugging, and testing.

## Overview

This project consists of three main components:

1. **Bridge Server** (C# / ASP.NET Core) - WebSocket and HTTP API server running on localhost
2. **Browser Extension** (JavaScript) - Chrome/Edge extension for capturing browser state
3. **Claude Code Integration** (Future) - MCP server or native tool integration

## Architecture

```
┌─────────────────┐
│  Browser Tab    │
│  (Content      │
│   Script)      │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Extension      │
│  (Background    │
│   Worker)       │
└────────┬────────┘
         │
         ↓ WebSocket
┌─────────────────┐
│  Bridge Server  │
│  (localhost:    │
│   3141)         │
└────────┬────────┘
         │
         ↓ HTTP API
┌─────────────────┐
│  Claude Code    │
│  (via MCP or    │
│   native tools) │
└─────────────────┘
```

## Quick Start

### 1. Start the Bridge Server

```bash
cd bridge-server/ClaudeBrowserBridge
dotnet run
```

Server will start on `http://localhost:3141`

### 2. Load the Browser Extension

1. Open Chrome/Edge and go to `chrome://extensions/` or `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder
5. Click the extension icon and click "Connect to Claude"

### 3. Test the Connection

```bash
# Check server health
curl http://localhost:3141/api/browser/health

# List active connections
curl http://localhost:3141/api/browser/connections

# Execute JavaScript in browser
curl -X POST http://localhost:3141/api/browser/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "document.title"}'
```

## Features

### Current (Phase 1-2)

✅ **Real-time WebSocket Communication**
- Bidirectional messaging between browser and server
- Automatic reconnection
- Connection state management

✅ **Console Log Capture**
- `console.log`, `console.warn`, `console.error`, `console.info`
- Streamed in real-time to bridge server
- Includes timestamps and URLs

✅ **JavaScript Error Tracking**
- Uncaught exceptions
- Unhandled promise rejections
- Full stack traces

✅ **Remote Script Execution**
- Execute arbitrary JavaScript from Claude
- Return results to server
- Error handling

✅ **DOM Inspection**
- Query elements by selector
- Get HTML, computed styles, bounding boxes
- Element properties (id, class, tagName)

✅ **Screenshot Capture**
- Full page or specific elements
- Base64 encoded PNG

✅ **Page Event Monitoring**
- Page loads
- Tab switches
- Navigation events

✅ **HTTP REST API**
- `/api/browser/health` - Server health check
- `/api/browser/connections` - List active connections
- `/api/browser/execute` - Execute JavaScript
- `/api/browser/inspect` - Inspect elements
- `/api/browser/screenshot` - Take screenshots

### Planned (Phase 3-4)

⏳ **Network Request Monitoring**
- HTTP request/response capture
- Headers, body, timing
- Filter by URL patterns

⏳ **MCP Server Integration**
- Native Claude Code tools
- `browser.inspect()`, `browser.execute()`, etc.
- Real-time event streaming to Claude workspace

⏳ **Advanced State Inspection**
- React DevTools-like component inspection
- Vue DevTools integration
- LocalStorage/SessionStorage monitoring

⏳ **Session Recording/Playback**
- Record user interactions
- Replay for debugging
- Export/import sessions

⏳ **Performance Profiling**
- Page load metrics
- JavaScript execution time
- Memory usage tracking

## Use Cases

### 1. Real-Time Debugging

**User**: "The pagination isn't showing"

**Claude**: *uses extension to inspect DOM*
```
I can see #pagination exists but has no innerHTML.
The updatePaginationControls() function isn't being called.
Let me check where it should be called...
```

### 2. Interactive Development

**User**: "Add a red border to all buttons"

**Claude**: *executes via extension*
```javascript
document.querySelectorAll("button")
  .forEach(b => b.style.border = "2px solid red")
```

**User**: *sees changes instantly*

**Claude**: "Here's the CSS to make that permanent..."

### 3. Form Testing

**Claude**: "I'll test the translation submission"
```javascript
document.getElementById("textarea-0").value = "Test translation"
document.getElementById("save-btn-0").click()
```

*Captures network request and response*

**Claude**: "The save succeeded, HTTP 200 returned"

## Project Structure

```
Cilq/
├── bridge-server/               # C# Bridge Server
│   ├── ClaudeBrowserBridge/
│   │   ├── Controllers/
│   │   ├── Models/
│   │   ├── Services/
│   │   ├── Program.cs
│   │   └── appsettings.json
│   └── README.md
│
├── extension/                   # Browser Extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── icons/
│   └── README.md
│
├── claude-code-integration/     # (Future) MCP Server
│   └── ...
│
├── start.txt                    # Original project specification
└── README.md                    # This file
```

## Documentation

- [Bridge Server Documentation](bridge-server/README.md)
- [Browser Extension Documentation](extension/README.md)
- [Original Project Spec](start.txt)

## Development Status

| Component | Status | Progress |
|-----------|--------|----------|
| Bridge Server | ✅ Complete | 100% |
| Browser Extension | ✅ Complete | 100% |
| MCP Integration | ⏳ Planned | 0% |
| Network Monitoring | ⏳ Planned | 0% |
| Session Recording | ⏳ Planned | 0% |

## Technology Stack

### Bridge Server
- .NET 9.0
- ASP.NET Core
- WebSockets
- Kestrel web server

### Browser Extension
- Manifest V3
- JavaScript (vanilla)
- Chrome Extension APIs
- WebSocket API

### Future: Claude Code Integration
- Node.js or C#
- MCP (Model Context Protocol)
- File-based command queue (fallback)

## Requirements

- .NET 9.0 SDK or later
- Chrome or Edge browser
- Windows, macOS, or Linux

## Security

- Server binds to `localhost` only (127.0.0.1)
- WebSocket connections restricted to localhost
- CORS configured for browser extensions only
- No encryption (localhost traffic only)
- **Not for production use** - development only

## Troubleshooting

### Bridge Server Won't Start

```bash
# Check if port 3141 is available
netstat -ano | findstr :3141  # Windows
lsof -i :3141                 # macOS/Linux

# Kill process using port if needed
```

### Extension Won't Connect

1. Verify server is running: `curl http://localhost:3141/`
2. Check browser console for WebSocket errors
3. Try disconnecting and reconnecting
4. Reload the extension

### Console Logs Not Appearing

1. Refresh the page after connecting extension
2. Check that content script is injected: `window.__claudeBridge`
3. Look for errors in browser DevTools console

## Known Issues

- Service worker may sleep after 30s of inactivity (Chrome limitation)
- WebSocket will auto-reconnect when service worker wakes
- Some CSP-strict sites may block content script functionality
- Screenshot API only captures visible viewport

## Contributing

This is a private development project.

## Future Enhancements

See [start.txt](start.txt) for the full roadmap and planned features.

## License

Private project
