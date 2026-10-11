# Read-only validation. Does not start, stop, install, or reconfigure anything.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$errors = New-Object 'System.Collections.Generic.List[string]'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    [pscustomobject]@{ Configured = $false; Errors = @('Windows is required.') } | ConvertTo-Json
    exit 1
}
$root = Join-Path $env:LOCALAPPDATA 'DesktopCommander-Autostart'
$launcher = Join-Path $root 'Start-Remote.cmd'
$startup = [Environment]::GetFolderPath('Startup')
$link = if ($startup) { Join-Path $startup 'Desktop Commander Remote.lnk' } else { $null }
$launcherExists = Test-Path -LiteralPath $launcher -PathType Leaf
$linkExists = if ($link) { Test-Path -LiteralPath $link -PathType Leaf } else { $false }
$npx = Get-Command npx.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $npx) {
    $fallback = Join-Path $env:APPDATA 'npm\npx.cmd'
    if (Test-Path -LiteralPath $fallback -PathType Leaf) { $npx = @{ Source = $fallback } }
}
$npxAvailable = [bool]$npx
$autoYes = $false
$guardPresent = $false
$shortcutValid = $false
$target = $null
$arguments = $null
$workingDirectory = $null
$windowStyle = $null
$agentPids = @()
if (-not $launcherExists) { $errors.Add('Launcher is missing.') }
if (-not $linkExists) { $errors.Add('Startup shortcut is missing.') }
if (-not $npxAvailable) { $errors.Add('npx.cmd is not available.') }
if ($launcherExists) {
    $content = Get-Content -LiteralPath $launcher -Raw
    $autoYes = $content.Contains('call npx.cmd --yes @wonderwhy-er/desktop-commander@latest remote')
    $guardPresent = $content.Contains('Get-CimInstance Win32_Process') -and $content.Contains(':already_running')
    if (-not $autoYes) { $errors.Add('Expected npm --yes command is absent.') }
    if (-not $guardPresent) { $errors.Add('Expected duplicate guard is absent.') }
}
if ($linkExists) {
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $saved = $wsh.CreateShortcut($link)
        $target = $saved.TargetPath
        $arguments = $saved.Arguments
        $workingDirectory = $saved.WorkingDirectory
        $windowStyle = $saved.WindowStyle
        $dq = [char]34
        $expected = '/d /c ' + $dq + $dq + $launcher + $dq + ' --run' + $dq
        $shortcutValid = ($target -ieq (Join-Path $env:SystemRoot 'System32\cmd.exe')) -and ($arguments -ceq $expected) -and ($workingDirectory -ieq $root) -and ($windowStyle -eq 1)
        if (-not $shortcutValid) { $errors.Add('Startup shortcut does not match the expected visible launcher.') }
    } catch { $errors.Add('Cannot read Startup shortcut: ' + $_.Exception.Message) }
}
try {
    $sid = (Get-Process -Id $PID).SessionId
    $agentPids = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'node.exe' -and $_.SessionId -eq $sid -and
        $_.CommandLine -match 'desktop-commander' -and $_.CommandLine -match '\sremote(?:\s|$)'
    } | ForEach-Object { [int]$_.ProcessId })
} catch { $errors.Add('Cannot inspect same-session remote processes: ' + $_.Exception.Message) }
$configured = $launcherExists -and $linkExists -and $npxAvailable -and $autoYes -and $guardPresent -and $shortcutValid -and ($errors.Count -eq 0)
[pscustomobject]@{
    Configured = [bool]$configured
    UserProfile = $env:USERPROFILE
    Launcher = $launcher
    LauncherExists = [bool]$launcherExists
    StartupShortcut = $link
    ShortcutExists = [bool]$linkExists
    ShortcutValid = [bool]$shortcutValid
    ShortcutTarget = $target
    ShortcutArguments = $arguments
    WorkingDirectory = $workingDirectory
    WindowStyle = $windowStyle
    NpxAvailable = $npxAvailable
    NpxPath = if ($npx) { $npx.Source } else { $null }
    NpmAutoYes = $autoYes
    DuplicateGuardPresent = $guardPresent
    RemoteAlreadyRunning = ($agentPids.Count -gt 0)
    MatchingNodeProcessIds = $agentPids
    LoginLaunchTested = $false
    StartupPolicyOrTaskManagerDisableStateChecked = $false
    Errors = @($errors.ToArray())
} | ConvertTo-Json -Depth 4
if ($configured) { exit 0 } else { exit 1 }
