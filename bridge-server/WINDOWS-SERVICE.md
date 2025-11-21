# Claude Browser Bridge - Windows Service Setup

Run the bridge server as a Windows Service so it's always available in the background.

## Quick Start

### Install as Windows Service

1. **Build and publish** (if not already done):
   ```bash
   cd bridge-server/ClaudeBrowserBridge
   dotnet publish -c Release -o publish
   ```

2. **Run installer as Administrator**:
   - Right-click `install-service.bat`
   - Select "Run as administrator"
   - Service will be installed and started automatically

3. **Verify service is running**:
   ```bash
   sc query ClaudeBrowserBridge
   ```

   Or test the API:
   ```bash
   curl http://localhost:3141/api/browser/health
   ```

## Service Management

### Check Service Status

```bash
sc query ClaudeBrowserBridge
```

### Start Service

```bash
sc start ClaudeBrowserBridge
```

Or run `restart-service.bat` as Administrator.

### Stop Service

```bash
sc stop ClaudeBrowserBridge
```

### Restart Service

Run `restart-service.bat` as Administrator, or:

```bash
sc stop ClaudeBrowserBridge
timeout /t 3
sc start ClaudeBrowserBridge
```

### Uninstall Service

Run `uninstall-service.bat` as Administrator, or:

```bash
sc stop ClaudeBrowserBridge
sc delete ClaudeBrowserBridge
```

## Service Configuration

### Service Details

| Property | Value |
|----------|-------|
| Service Name | ClaudeBrowserBridge |
| Display Name | Claude Browser Bridge |
| Description | Real-time browser debugging bridge for Claude Code |
| Startup Type | Automatic |
| Port | 3141 (localhost only) |

### Auto-Start on Boot

The service is configured to start automatically when Windows starts.

### Recovery Options

The service is configured to restart automatically on failure:
- First failure: Restart after 5 seconds
- Second failure: Restart after 10 seconds
- Subsequent failures: Restart after 30 seconds
- Reset fail count: After 24 hours

## Configuration Changes

After modifying `appsettings.json`:

1. **Publish changes**:
   ```bash
   cd bridge-server/ClaudeBrowserBridge
   dotnet publish -c Release -o publish
   ```

2. **Restart service**:
   - Run `restart-service.bat` as Administrator
   - Or use: `sc stop ClaudeBrowserBridge && sc start ClaudeBrowserBridge`

## Updating the Service

To update to a new version:

1. **Stop the service**:
   ```bash
   sc stop ClaudeBrowserBridge
   ```

2. **Publish new version**:
   ```bash
   cd bridge-server/ClaudeBrowserBridge
   dotnet publish -c Release -o publish
   ```

3. **Start the service**:
   ```bash
   sc start ClaudeBrowserBridge
   ```

Or simply run `restart-service.bat` as Administrator after publishing.

## Viewing Logs

### Windows Event Viewer

1. Open Event Viewer (eventvwr.msc)
2. Navigate to: **Windows Logs → Application**
3. Filter for Source: **ClaudeBrowserBridge** or **.NET Runtime**

### Service Logs

The service logs to the Windows Event Log. To view in PowerShell:

```powershell
Get-EventLog -LogName Application -Source ".NET Runtime" -Newest 20
```

Or view all logs from the service:

```powershell
Get-EventLog -LogName Application | Where-Object {$_.Message -like "*ClaudeBrowserBridge*"} | Select-Object -First 20
```

## Troubleshooting

### Service Won't Start

**Check Windows Event Viewer** for error messages:
```bash
eventvwr.msc
```
Look under Windows Logs → Application

**Common Issues:**

1. **Port 3141 already in use**:
   - Find process: `netstat -ano | findstr :3141`
   - Kill process: `taskkill /PID <pid> /F`

2. **Permission denied**:
   - Make sure you ran `install-service.bat` as Administrator
   - Service needs permission to bind to port

3. **.NET Runtime missing**:
   - Install .NET 9.0 Runtime: https://dotnet.microsoft.com/download/dotnet/9.0

### Service Crashes on Startup

1. **Check Event Viewer** for .NET Runtime errors
2. **Test manually** first:
   ```bash
   cd bridge-server/ClaudeBrowserBridge/publish
   ClaudeBrowserBridge.exe
   ```
3. **Check configuration** in `appsettings.json`

### Service Running but Not Accessible

1. **Verify service is running**:
   ```bash
   sc query ClaudeBrowserBridge
   ```

2. **Test API**:
   ```bash
   curl http://localhost:3141/api/browser/health
   ```

3. **Check firewall** (shouldn't affect localhost, but verify)

4. **Check port binding**:
   ```bash
   netstat -ano | findstr :3141
   ```

## Manual Service Commands

### Query Service Details

```bash
sc qc ClaudeBrowserBridge
```

### Query Service Status

```bash
sc query ClaudeBrowserBridge
```

### Change Startup Type

```bash
# Automatic
sc config ClaudeBrowserBridge start= auto

# Manual
sc config ClaudeBrowserBridge start= demand

# Disabled
sc config ClaudeBrowserBridge start= disabled
```

Note: Space after `=` is required!

### Configure Service Description

```bash
sc description ClaudeBrowserBridge "Real-time browser debugging bridge for Claude Code"
```

### Configure Failure Actions

```bash
sc failure ClaudeBrowserBridge reset= 86400 actions= restart/5000/restart/10000/restart/30000
```

## Benefits of Running as a Service

✅ **Always Available**: Starts automatically with Windows, no need to manually run

✅ **Background Operation**: Runs in the background, no console window

✅ **Auto Recovery**: Automatically restarts if it crashes

✅ **System Integration**: Managed through Windows Services (services.msc)

✅ **Logging**: Logs to Windows Event Log for centralized monitoring

## Alternative: Run as Console Application

If you prefer to run manually (for development):

```bash
cd bridge-server/ClaudeBrowserBridge
dotnet run
```

Or run the published executable:

```bash
cd bridge-server/ClaudeBrowserBridge/publish
ClaudeBrowserBridge.exe
```

## Viewing Service in Services Manager

1. Open Services: `services.msc`
2. Find "Claude Browser Bridge" in the list
3. Right-click for options:
   - Start/Stop/Restart
   - Properties (startup type, recovery, etc.)

## Security Notes

- Service runs under the Local System account
- Only binds to localhost (127.0.0.1)
- No external network access required
- Firewall rules not needed (localhost only)

## Files

| File | Purpose |
|------|---------|
| `install-service.bat` | Install and start service |
| `uninstall-service.bat` | Stop and remove service |
| `restart-service.bat` | Restart running service |
| `publish/` | Published application files |
| `appsettings.json` | Configuration file |

## See Also

- [Main README](../README.md)
- [Setup Guide](../SETUP.md)
- [Bridge Server Documentation](README.md)
