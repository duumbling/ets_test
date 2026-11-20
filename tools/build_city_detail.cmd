@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.." || exit /b 1
echo.
echo ETS2 NAVIGATOR - DETAILED CITY MAP
echo Reads existing ETS2 parser cache, no need to rescan installed game.
echo This export can use substantial RAM and disk space.
echo.
where py >nul 2>&1
if errorlevel 1 (
 echo Python 3 not installed: https://python.org/
 goto :fail
)
where npx.cmd >nul 2>&1
if errorlevel 1 (
 echo Node.js/npm missing: https://nodejs.org/
 goto :fail
)
py tools\build_city_detail.py %*
if errorlevel 1 goto :fail
echo.
echo Import ets2-city-detail.json.gz on the Navigator site.
echo.
pause
exit /b 0
:fail
echo Detailed map export failed. Copy the final lines of the error output.
pause
exit /b 1
