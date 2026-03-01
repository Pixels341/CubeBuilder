@echo off
echo ==============================================
echo 🧱 BUILDING HYTALE CLONE CLIENT               
echo ==============================================
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed! Check npm build errors above.
    pause
    exit /B
)

echo.
echo ==============================================
echo 🎮 STARTING LOCAL MULTIPLAYER SERVER             
echo ==============================================
node server.js
pause
