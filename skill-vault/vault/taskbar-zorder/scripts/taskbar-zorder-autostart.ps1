param(
    [ValidateSet('Install', 'Status', 'Uninstall')]
    [string] $Mode = 'Install',

    [ValidateRange(10, 60000)]
    [int] $IntervalMs = 50,

    [string] $TaskName = 'Taskbar Z-Order Watcher'
)

$ErrorActionPreference = 'Stop'

$watcherScript = Join-Path $PSScriptRoot 'taskbar-zorder.ps1'
if (-not (Test-Path -LiteralPath $watcherScript)) {
    throw "Watcher script is missing: $watcherScript"
}

function Get-StablePowerShellHost {
    $candidates = [Collections.Generic.List[string]]::new()
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\pwsh.exe'))
    $candidates.Add('C:\Program Files\PowerShell\7\pwsh.exe')

    if ($PSVersionTable.PSEdition -eq 'Core') {
        $candidates.Add((Join-Path $PSHOME 'pwsh.exe'))
    }

    $candidates.Add((Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Get-Item -LiteralPath $candidate).FullName
        }
    }

    throw 'No supported PowerShell executable was found.'
}

function Get-WatcherProcesses {
    $escapedScript = [regex]::Escape($watcherScript)
    @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ProcessId -ne $PID -and
                $_.CommandLine -match $escapedScript -and
                $_.CommandLine -match '(?i)-Mode\s+KeepTaskbarLowered'
            }
    )
}

function Stop-WatcherProcesses {
    foreach ($process in @(Get-WatcherProcesses)) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-AutostartStatus {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $taskInfo = if ($task) {
        Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    } else {
        $null
    }
    $watchers = @(Get-WatcherProcesses)
    $processes = @(
        foreach ($watcher in $watchers) {
            Get-Process -Id $watcher.ProcessId -ErrorAction SilentlyContinue
        }
    )
    $taskbar = @(& $watcherScript -Mode Status)

    [pscustomobject] @{
        TaskName             = $TaskName
        TaskExists           = [bool] $task
        TaskState            = if ($task) { $task.State } else { 'Missing' }
        TriggerType          = if ($task) { $task.Triggers.CimClass.CimClassName } else { $null }
        TriggerEnabled       = if ($task) { $task.Triggers.Enabled } else { $false }
        TriggerUser          = if ($task) { $task.Triggers.UserId } else { $null }
        HiddenTask           = if ($task) { $task.Settings.Hidden } else { $false }
        ExecutionTimeLimit   = if ($task) { $task.Settings.ExecutionTimeLimit } else { $null }
        MultipleInstances    = if ($task) { $task.Settings.MultipleInstances } else { $null }
        RestartCount         = if ($task) { $task.Settings.RestartCount } else { $null }
        RestartInterval      = if ($task) { $task.Settings.RestartInterval } else { $null }
        LastTaskResult       = if ($taskInfo) { '0x{0:X}' -f $taskInfo.LastTaskResult } else { $null }
        WatcherCount         = $watchers.Count
        WatcherPIDs          = @($watchers.ProcessId)
        HiddenWatcherWindows = @($processes | ForEach-Object { $_.MainWindowHandle -eq 0 })
        TaskbarTopmost       = @($taskbar.Topmost)
        TaskbarStyle         = @($taskbar.ExStyle)
        TaskbarRect          = @($taskbar.Rect)
    }
}

function Install-Autostart {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powerShellHost = Get-StablePowerShellHost
    $arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watcherScript`" -Mode KeepTaskbarLowered -IntervalMs $IntervalMs"

    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 300
    }
    Stop-WatcherProcesses

    $actionParameters = @{
        Execute          = $powerShellHost
        Argument         = $arguments
        WorkingDirectory = $PSScriptRoot
    }
    $action = New-ScheduledTaskAction @actionParameters
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
    $principalParameters = @{
        UserId    = $identity
        LogonType = 'Interactive'
        RunLevel  = 'Limited'
    }
    $principal = New-ScheduledTaskPrincipal @principalParameters
    $settingsParameters = @{
        Hidden                     = $true
        StartWhenAvailable         = $true
        AllowStartIfOnBatteries    = $true
        DontStopIfGoingOnBatteries = $true
        ExecutionTimeLimit         = [TimeSpan]::Zero
        MultipleInstances          = 'IgnoreNew'
        RestartCount               = 999
        RestartInterval            = (New-TimeSpan -Minutes 1)
    }
    $settings = New-ScheduledTaskSettingsSet @settingsParameters
    $definitionParameters = @{
        Action      = $action
        Trigger     = $trigger
        Principal   = $principal
        Settings    = $settings
        Description = 'Keeps the Windows taskbar non-topmost and at the bottom of Z-order after user logon. Runs hidden.'
    }
    $definition = New-ScheduledTask @definitionParameters

    Register-ScheduledTask -TaskName $TaskName -InputObject $definition -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 250
        $task = Get-ScheduledTask -TaskName $TaskName
        $watchers = @(Get-WatcherProcesses)
        if ($task.State -eq 'Running' -and $watchers.Count -eq 1) {
            return Get-AutostartStatus
        }
    }

    throw "Scheduled Task '$TaskName' did not reach a single-watcher running state."
}

function Uninstall-Autostart {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
    Stop-WatcherProcesses

    [pscustomobject] @{
        TaskName       = $TaskName
        TaskExists     = [bool] (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)
        WatcherCount   = @(Get-WatcherProcesses).Count
        RestoreCommand = "& '$watcherScript' -Mode RestoreTaskbar"
    }
}

switch ($Mode) {
    'Install' { Install-Autostart }
    'Status' { Get-AutostartStatus }
    'Uninstall' { Uninstall-Autostart }
}
