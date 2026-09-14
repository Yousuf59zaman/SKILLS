Set taskShell = CreateObject("WScript.Shell")
Set taskFiles = CreateObject("Scripting.FileSystemObject")
taskDirectory = taskFiles.GetParentFolderName(WScript.ScriptFullName)
taskShell.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & taskDirectory & "\browser-shared-chrome.ps1""", 0, False
