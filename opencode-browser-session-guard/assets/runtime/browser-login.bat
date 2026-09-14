@echo off
REM Use the SAME supervised browser for login. Leave it running afterwards.
call "%~dp0browser-shared-chrome.bat"
if errorlevel 1 exit /b %ERRORLEVEL%
echo Shared Chrome is ready. Open its window to sign in, then leave it running.
