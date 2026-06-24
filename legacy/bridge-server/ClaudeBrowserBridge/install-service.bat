@echo off
REM Claude Browser Bridge - Windows Service Installation Script
REM Run as Administrator

echo.
echo Claude Browser Bridge - Service Installation
echo ===========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Get the current directory (where the EXE is located)
set SERVICE_PATH=%~dp0publish\ClaudeBrowserBridge.exe
set SERVICE_NAME=ClaudeBrowserBridge
set SERVICE_DISPLAY=Claude Browser Bridge
set SERVICE_DESC=Real-time browser debugging bridge for Claude Code

echo Checking if service already exists...
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% equ 0 (
    echo Service already exists. Stopping and removing...
    sc stop %SERVICE_NAME%
    timeout /t 2 /nobreak >nul
    sc delete %SERVICE_NAME%
    timeout /t 2 /nobreak >nul
)

echo.
echo Installing service...
echo Service Path: %SERVICE_PATH%
echo Service Name: %SERVICE_NAME%
echo.

REM Create the service
sc create %SERVICE_NAME% binPath= "%SERVICE_PATH%" DisplayName= "%SERVICE_DISPLAY%" start= auto

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to create service
    echo Make sure the executable exists at: %SERVICE_PATH%
    pause
    exit /b 1
)

REM Set service description
sc description %SERVICE_NAME% "%SERVICE_DESC%"

REM Configure service recovery options (restart on failure)
sc failure %SERVICE_NAME% reset= 86400 actions= restart/5000/restart/10000/restart/30000

REM Start the service
echo.
echo Starting service...
sc start %SERVICE_NAME%

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to start service
    echo Check Windows Event Viewer for details
    pause
    exit /b 1
)

echo.
echo SUCCESS: Claude Browser Bridge service installed and started
echo.
echo Service is now running on http://localhost:3141
echo.
echo Useful commands:
echo   - Check status:  sc query %SERVICE_NAME%
echo   - Stop service:  sc stop %SERVICE_NAME%
echo   - Start service: sc start %SERVICE_NAME%
echo   - Remove:        uninstall-service.bat
echo.
pause
