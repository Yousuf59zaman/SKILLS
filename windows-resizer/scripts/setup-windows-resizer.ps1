param(
  [string]$Version = "",
  [string]$InstallDir = "$env:LOCALAPPDATA\Programs\AltSnap",
  [string[]]$InspectProcess = @(),
  [switch]$NoDownload,
  [switch]$NoStartup,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$InspectProcess = @(
  $InspectProcess |
    ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_.Length -gt 0 }
)

function Get-OfficialAltSnapRelease {
  param([string]$RequestedVersion)

  $headers = @{ "User-Agent" = "windows-resizer-skill" }
  if ([string]::IsNullOrWhiteSpace($RequestedVersion)) {
    return Invoke-RestMethod -Uri "https://api.github.com/repos/RamonUnch/AltSnap/releases/latest" -Headers $headers
  }

  return Invoke-RestMethod -Uri "https://api.github.com/repos/RamonUnch/AltSnap/releases/tags/$RequestedVersion" -Headers $headers
}

function Select-AltSnapAsset {
  param($Release)

  $asset = $Release.assets | Where-Object { $_.name -match "bin_x64\.zip$" } | Select-Object -First 1
  if (-not $asset -and $env:PROCESSOR_ARCHITECTURE -match "ARM64") {
    $asset = $Release.assets | Where-Object { $_.name -match "bin_ARM64\.zip$" } | Select-Object -First 1
  }
  if (-not $asset) {
    $asset = $Release.assets | Where-Object { $_.name -match "bin\.zip$" } | Select-Object -First 1
  }
  if (-not $asset) {
    throw "Could not find a portable AltSnap binary zip asset in release $($Release.tag_name)."
  }
  return $asset
}

function Read-TextWithBom {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    return [System.Text.Encoding]::Unicode.GetString($bytes)
  }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    return [System.Text.Encoding]::UTF8.GetString($bytes)
  }
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Write-TextPreservingBom {
  param(
    [string]$Path,
    [string]$Text
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.Encoding]::Unicode)
    return
  }
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($true))
}

function Set-IniValue {
  param(
    [string]$Text,
    [string]$Name,
    [string]$Value
  )

  $escaped = [regex]::Escape($Name)
  if ($Text -match "(?m)^$escaped=") {
    return [regex]::Replace($Text, "(?m)^$escaped=.*$", "$Name=$Value")
  }
  if ($Text -match "(?m)^\[Advanced\]\s*$") {
    return [regex]::Replace($Text, "(?m)^(\[Advanced\]\s*)$", "`$1`r`n$Name=$Value", 1)
  }
  return $Text.TrimEnd() + "`r`n[Advanced]`r`n$Name=$Value`r`n"
}

function Install-AltSnap {
  param(
    [string]$TargetDir,
    [string]$RequestedVersion,
    [switch]$SkipDownload
  )

  if (-not $SkipDownload) {
    $release = Get-OfficialAltSnapRelease -RequestedVersion $RequestedVersion
    $asset = Select-AltSnapAsset -Release $release
    $tempRoot = Join-Path $env:TEMP ("AltSnapInstall_" + [guid]::NewGuid().ToString("N"))
    $zipPath = Join-Path $tempRoot $asset.name
    $extractDir = Join-Path $tempRoot "extract"

    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    Get-Process -Name AltSnap -ErrorAction SilentlyContinue | Stop-Process -Force
    Copy-Item -Path (Join-Path $extractDir "*") -Destination $TargetDir -Recurse -Force

    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    if ($resolvedTemp.StartsWith((Resolve-Path -LiteralPath $env:TEMP).Path, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
  }

  $exe = Join-Path $TargetDir "AltSnap.exe"
  $ini = Join-Path $TargetDir "AltSnap.ini"
  if (-not (Test-Path -LiteralPath $exe)) { throw "AltSnap.exe not found at $exe" }
  if (-not (Test-Path -LiteralPath $ini)) { throw "AltSnap.ini not found at $ini" }

  $text = Read-TextWithBom -Path $ini
  $text = Set-IniValue -Text $text -Name "ResizeAll" -Value "1"
  $text = Set-IniValue -Text $text -Name "IgnoreMinMaxInfo" -Value "3"
  Write-TextPreservingBom -Path $ini -Text $text

  return [pscustomobject]@{
    InstallDir = $TargetDir
    Executable = $exe
    Config = $ini
    ResizeAll = (Select-String -LiteralPath $ini -Pattern "^ResizeAll=" -ErrorAction SilentlyContinue).Line
    IgnoreMinMaxInfo = (Select-String -LiteralPath $ini -Pattern "^IgnoreMinMaxInfo=" -ErrorAction SilentlyContinue).Line
  }
}

function Ensure-AltSnapStartup {
  param(
    [string]$Executable,
    [string]$WorkingDirectory
  )

  $startupDir = [Environment]::GetFolderPath("Startup")
  $linkPath = Join-Path $startupDir "AltSnap.lnk"
  $wsh = New-Object -ComObject WScript.Shell
  $link = $wsh.CreateShortcut($linkPath)
  $link.TargetPath = $Executable
  $link.WorkingDirectory = $WorkingDirectory
  $link.Description = "AltSnap - Alt drag/resize windows"
  $link.Save()
  return $linkPath
}

function Get-VisibleWindowsForProcess {
  param([string[]]$ProcessNames)

  if (-not ("WindowsResizerWin32" -as [type])) {
    Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WindowsResizerWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  public const int GWL_STYLE = -16;
  public const int GWL_EXSTYLE = -20;
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
  }

  $targetProcesses = Get-Process | Where-Object { $ProcessNames -contains $_.ProcessName }
  $targetIds = @($targetProcesses | Select-Object -ExpandProperty Id)
  $rows = New-Object System.Collections.Generic.List[object]

  [WindowsResizerWin32]::EnumWindows({
    param($hwnd, $lparam)
    if (-not [WindowsResizerWin32]::IsWindowVisible($hwnd)) { return $true }
    [uint32]$procId = 0
    [void][WindowsResizerWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    if ($targetIds -notcontains [int]$procId) { return $true }

    $len = [WindowsResizerWin32]::GetWindowTextLength($hwnd)
    $sb = New-Object System.Text.StringBuilder ([Math]::Max(256, $len + 1))
    [void][WindowsResizerWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
    $rect = New-Object WindowsResizerWin32+RECT
    [void][WindowsResizerWin32]::GetWindowRect($hwnd, [ref]$rect)
    $style = [int64][WindowsResizerWin32]::GetWindowLongPtr($hwnd, [WindowsResizerWin32]::GWL_STYLE)
    $exstyle = [int64][WindowsResizerWin32]::GetWindowLongPtr($hwnd, [WindowsResizerWin32]::GWL_EXSTYLE)
    $process = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue

    $rows.Add([pscustomobject]@{
      Process = $process.ProcessName
      ProcessId = [int]$procId
      Hwnd = ("0x{0:X}" -f $hwnd.ToInt64())
      Title = $sb.ToString()
      X = $rect.Left
      Y = $rect.Top
      Width = $rect.Right - $rect.Left
      Height = $rect.Bottom - $rect.Top
      HasSizeBox = [bool]($style -band 0x00040000)
      Style = ("0x{0:X}" -f $style)
      ExStyle = ("0x{0:X}" -f $exstyle)
    }) | Out-Null
    return $true
  }, [IntPtr]::Zero) | Out-Null

  return $rows
}

$install = Install-AltSnap -TargetDir $InstallDir -RequestedVersion $Version -SkipDownload:$NoDownload
$startupShortcut = $null
if (-not $NoStartup) {
  $startupShortcut = Ensure-AltSnapStartup -Executable $install.Executable -WorkingDirectory $install.InstallDir
}

if (-not $NoStart -and -not (Get-Process -Name AltSnap -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $install.Executable -WorkingDirectory $install.InstallDir -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

$result = [ordered]@{
  AltSnapRunning = [bool](Get-Process -Name AltSnap -ErrorAction SilentlyContinue)
  Install = $install
  StartupShortcut = $startupShortcut
}

if ($InspectProcess.Count -gt 0) {
  $result.VisibleWindows = @(Get-VisibleWindowsForProcess -ProcessNames $InspectProcess)
}

[pscustomobject]$result | ConvertTo-Json -Depth 6
