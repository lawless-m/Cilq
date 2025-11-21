# Claude Browser Bridge Server

A C# ASP.NET Core bridge server that provides real-time WebSocket and HTTP API communication between browser extensions and Claude Code.

## Overview

This server acts as a localhost bridge, enabling bidirectional communication for:
- Real-time DOM inspection
- JavaScript execution in the browser
- Console log capture
- Network request monitoring
- Screenshot capture

## Architecture

- **WebSocket Server**: Real-time bidirectional communication on `ws://localhost:3141/ws`
- **HTTP REST API**: Query and command endpoints on `http://localhost:3141/api/browser`
- **Connection Manager**: Thread-safe management of multiple browser tab connections
- **Message Protocol**: JSON-based communication with typed message classes

## Prerequisites

- .NET 9.0 SDK or later
- Windows, macOS, or Linux

## Getting Started

### Build

```bash
cd ClaudeBrowserBridge
dotnet build
```

### Run

```bash
dotnet run
```

The server will start on `http://localhost:3141`

### Configuration

Edit `appsettings.json` to customize:

```json
{
  "BridgeServer": {
    "Port": 3141,
    "AllowedOrigins": [
      "chrome-extension://*"
    ],
    "MaxConnections": 10
  }
}
```

## API Endpoints

### Health Check
```
GET /api/browser/health
```
Returns server status and active connection count.

### List Connections
```
GET /api/browser/connections
```
Returns all active WebSocket connections.

### Get Connection Details
```
GET /api/browser/connections/{connectionId}
```
Returns details for a specific connection.

### Get Message History
```
GET /api/browser/connections/{connectionId}/history?limit=50
```
Returns recent messages from a connection.

### Execute JavaScript
```
POST /api/browser/execute
Content-Type: application/json

{
  "script": "document.title",
  "connectionId": "optional-connection-id",
  "tabId": "optional-tab-id"
}
```
Executes JavaScript in the browser. Broadcasts to all connections if `connectionId` is not specified.

### Inspect Element
```
POST /api/browser/inspect
Content-Type: application/json

{
  "selector": "#my-element",
  "connectionId": "optional-connection-id"
}
```
Requests DOM inspection for a specific selector.

### Take Screenshot
```
POST /api/browser/screenshot
Content-Type: application/json

{
  "selector": "#my-element",
  "fullPage": false,
  "connectionId": "optional-connection-id"
}
```
Requests a screenshot of the page or specific element.

## WebSocket Protocol

### Connection

Connect to `ws://localhost:3141/ws?connectionId={optional-id}`

If no `connectionId` is provided, a GUID will be generated.

### Message Format

All messages are JSON with this base structure:

```json
{
  "type": "message_type",
  "timestamp": 1234567890,
  "tabId": "optional-tab-id",
  "data": {}
}
```

### Message Types

#### From Browser → Server

**Page Load**
```json
{
  "type": "page_load",
  "url": "https://example.com",
  "timestamp": 1234567890,
  "dom": "<html>...</html>",
  "console": [],
  "errors": []
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

**Console Entry**
```json
{
  "type": "console",
  "level": "log",
  "message": "Hello, World!",
  "timestamp": 1234567890
}
```

#### From Server → Browser

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

## Project Structure

```
ClaudeBrowserBridge/
├── Controllers/
│   └── BrowserController.cs      # HTTP API endpoints
├── Models/
│   ├── BrowserMessage.cs          # Message protocol types
│   └── BridgeServerConfig.cs      # Configuration model
├── Services/
│   └── WebSocketConnectionManager.cs  # WebSocket connection handling
├── Program.cs                     # Application startup
├── appsettings.json               # Configuration
└── ClaudeBrowserBridge.csproj     # Project file
```

## Security

- Server binds to `localhost` only (127.0.0.1)
- CORS configured for browser extensions (`chrome-extension://`, `extension://`)
- Connection limit enforced (configurable)
- No HTTPS required since all traffic is localhost

## Development

### Running in Development Mode

```bash
dotnet run --environment Development
```

### Running Tests

```bash
dotnet test
```

### Publishing

```bash
dotnet publish -c Release
```

## Next Steps

1. Build the browser extension (Chrome/Edge)
2. Implement MCP server for Claude Code integration
3. Add session recording/playback
4. Add React/Vue DevTools-like inspection

## License

Private project
