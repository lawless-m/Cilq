@echo off
REM Claude Browser Bridge - Restart Service Script
REM Run as Administrator

echo.
echo Claude Browser Bridge - Restart Service
echo ========================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

set SERVICE_NAME=ClaudeBrowserBridge

echo Checking if service exists...
sc query %SERVICE_NAME% >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Service is not installed
    echo Run install-service.bat first
    pause
    exit /b 1
)

echo Stopping service...
sc stop %SERVICE_NAME%
timeout /t 3 /nobreak >nul

echo Starting service...
sc start %SERVICE_NAME%

if %errorLevel% neq 0 (
    echo.
    echo ERROR: Failed to start service
    pause
    exit /b 1
)

echo.
echo SUCCESS: Service restarted
echo.
pause
