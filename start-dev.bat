@echo off
cd /d "%~dp0"
echo Starting D&D dev server...
echo.
echo When you see "Local: http://localhost:5173/", open that URL in your browser.
echo Keep this window open while using the app.
echo.
npm run dev
pause
