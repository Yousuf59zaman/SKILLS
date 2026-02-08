@echo off
REM Run everything via PowerShell with a hidden window so no console stays visible
powershell -NoProfile -WindowStyle Hidden -Command ^
  "Start-Process 'C:\Users\ORANGEBD\AppData\Local\Programs\Microsoft VS Code\Code.exe';" ^
  "Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe';" ^
  "Start-Process 'C:\Users\ORANGEBD\AppData\Local\Figma\Figma.exe';" ^
  "Start-Process 'C:\Users\ORANGEBD\AppData\Local\AnthropicClaude\claude.exe';" ^
  "Start-Process 'wt.exe'"

exit /b
