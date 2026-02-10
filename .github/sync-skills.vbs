' Run sync-skills.ps1 hidden (double-click friendly).
On Error Resume Next

Dim shell, ps1, cmd
Set shell = CreateObject("WScript.Shell")

ps1 = shell.ExpandEnvironmentStrings("%USERPROFILE%\.codex\skills\.github\sync-skills.ps1")
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"

shell.Run cmd, 0, False

