Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File ""C:\Users\ORANGEBD\Scripts\DownloadsOrganizer.ps1""", 0, False
Set WshShell = Nothing
