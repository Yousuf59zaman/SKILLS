@echo off
title Auto-Shutdown
color 0C

echo ==========================================
echo    AUTO-SHUTDOWN UTILITY
echo ==========================================
echo.
echo This will close all applications and
echo shutdown your PC (3-second countdown).
echo.
echo Press any key to continue...
echo (or close this window to cancel)
pause >nul

echo.
echo Starting shutdown sequence...
echo.

powershell -ExecutionPolicy Bypass -File "C:\Users\ORANGEBD\Scripts\AutoShutdown.ps1"
