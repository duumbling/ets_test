@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.." || (
  echo Cannot locate ETS2 Navigator project directory.
  pause
  exit /b 1
)
echo.
echo ====================================================
echo ETS2 NAVIGATOR - ROAD MAP EXPORT
echo ====================================================
echo All extraction runs on this PC. No game archives are uploaded.
echo.
where py >nul 2>&1
if errorlevel 1 (
  echo Python launcher not found: https://www.python.org/downloads/windows/
  goto :missing
)
where git >nul 2>&1
if errorlevel 1 (
  echo Git not found: https://git-scm.com/downloads/win
  goto :missing
)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24+ not found: https://nodejs.org/
  goto :missing
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd not found. Reinstall Node.js: https://nodejs.org/
  goto :missing
)
echo Starting exporter. If this is your first run, Visual Studio C++ Build Tools are required.
echo.
py "tools\build_real_map.py" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo Export failed. Please copy the last error lines for troubleshooting.
) else (
  echo.
  echo Map exported successfully. Open https://duumbling.github.io/ets_test/
  echo Import the JSON file only once: it will be saved in this browser.
)
echo.
pause
exit /b %EXITCODE%
:missing
echo.
echo Install the missing tool and run this file again.
pause
exit /b 1
