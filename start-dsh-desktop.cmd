@echo off
setlocal EnableExtensions
title DeepSeek Harness
cd /d "%~dp0"

set "DSH_DESKTOP_EXE=%USERPROFILE%\.grok\worktrees\github-deepseek-harness\desk\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts\win-unpacked\DeepSeek Harness.exe"

if not exist "%DSH_DESKTOP_EXE%" (
  echo Desktop build was not found:
  echo %DSH_DESKTOP_EXE%
  pause
  exit /b 1
)

echo Starting DeepSeek Harness...
start "" "%DSH_DESKTOP_EXE%"
endlocal
