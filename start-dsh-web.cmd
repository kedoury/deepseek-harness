@echo off
setlocal EnableExtensions
title DeepSeek Harness
cd /d "%~dp0"

set "NODE_HOME=%USERPROFILE%\.grok\tools\node-v22.23.2-win-x64"
if exist "%NODE_HOME%\node.exe" set "PATH=%NODE_HOME%;%PATH%"
set "PATH=%APPDATA%\npm;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install Node.js 22.19+ or 24+ first.
  pause
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm not found. Enabling pnpm 11.7.0 via corepack...
  corepack enable >nul 2>&1
  corepack prepare pnpm@11.7.0 --activate
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo Failed to enable pnpm. Please install pnpm 11.7.0.
    pause
    exit /b 1
  )
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call pnpm install
  if errorlevel 1 (
    echo pnpm install failed.
    pause
    exit /b 1
  )
)

if not exist "apps\web\dist\index.html" (
  echo Building, first run may take a few minutes...
  call pnpm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

set "DSH_PORT="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dsh-web-port.ps1"`) do set "DSH_PORT=%%P"
if not defined DSH_PORT (
  echo Failed to prepare a listen port.
  pause
  exit /b 1
)

echo Starting DeepSeek Harness Web UI on port %DSH_PORT%...
echo Browser will open automatically. Close this window to stop.
echo.
call pnpm dsh web --port %DSH_PORT%
echo.
echo Server stopped.
pause
endlocal
