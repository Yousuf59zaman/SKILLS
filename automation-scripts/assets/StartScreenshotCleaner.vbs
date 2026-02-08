Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File ""C:\Users\ORANGEBD\Scripts\AutoSortScreenshots.ps1""", 0, False
Set WshShell = Nothing
