# Read-only diagnostics for the existing Windows broadband-to-ZTE-4G watchdog.
# This script NEVER changes adapters, routes, firewall rules, tasks, or scheduled jobs.
param([switch]$ProbeBroadband,[switch]$IncludeTasks)
$ErrorActionPreference = 'Continue'
$root = 'C:\ProgramData\ChatGPT-NetworkFailover'
$now = Get-Date
$adapters = @('Ethernet 2', 'Ethernet 3')
$adapterInfo = @(
    foreach($name in $adapters) {
        $a = Get-NetAdapter -Name $name -ErrorAction SilentlyContinue
        $i = Get-NetIPInterface -InterfaceAlias $name -AddressFamily IPv4 -ErrorAction SilentlyContinue
        $ip = @(Get-NetIPAddress -InterfaceAlias $name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object { $_.AddressState -eq 'Preferred' -and $_.IPAddress -notlike '169.254.*' } |
            ForEach-Object { $_.IPAddress })
        [pscustomobject][ordered]@{
            Name = $name
            Found = ($null -ne $a)
            Status = if($a){[string]$a.Status}else{'Missing'}
            InterfaceGuid = if($a){$a.InterfaceGuid.ToString()}else{''}
            InterfaceIndex = if($a){[int]$a.ifIndex}else{$null}
            IPv4 = $ip
            IPv4Metric = if($i){[int]$i.InterfaceMetric}else{$null}
            AutomaticMetric = if($i){[string]$i.AutomaticMetric}else{''}
        }
    }
)
$routes = @(
    Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -in $adapters } |
    Select-Object InterfaceAlias, NextHop, RouteMetric, InterfaceMetric
)
$firewall = @(
    foreach($name in @('ChatGPT-Strict4G-Out','ChatGPT-Strict4G-In')) {
        $rule = Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
        $scope = if($rule){@(($rule | Get-NetFirewallInterfaceFilter -ErrorAction SilentlyContinue).InterfaceAlias)}else{@()}
        [pscustomobject][ordered]@{
            Name = $name
            Found = ($null -ne $rule)
            Enabled = if($rule){[string]$rule.Enabled}else{'Not found or not readable'}
            Action = if($rule){[string]$rule.Action}else{''}
            Direction = if($rule){[string]$rule.Direction}else{''}
            InterfaceAlias = $scope
        }
    }
)
$statusFile = Join-Path $root 'status.json'
$status = $null
$statusError = ''
if(Test-Path -LiteralPath $statusFile) {
    try { $status = Get-Content -LiteralPath $statusFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
    catch { $statusError = $_.Exception.Message }
} else { $statusError = 'status.json missing or inaccessible' }
$ageSeconds = $null
if($status -and $status.LastCheck){
    try { $ageSeconds = [math]::Round((([datetimeoffset]$now)-([datetimeoffset]::Parse([string]$status.LastCheck))).TotalSeconds,1) }
    catch { $statusError = 'Could not parse status timestamp: '+$_.Exception.Message }
}
$eventLogFile = Join-Path $root 'events.log'
$events = if(Test-Path -LiteralPath $eventLogFile) {
    @(Get-Content -LiteralPath $eventLogFile -Tail 12 -ErrorAction SilentlyContinue)
} else {@('No readable event log')}
$taskList = @()
$taskQuery = 'Skipped by default: run -IncludeTasks from an elevated local PowerShell if needed'
if($IncludeTasks) {
    $taskQuery = 'Explicit scheduled-task query requested'
    try {
        $taskList = @(
            foreach($taskName in @('ChatGPT-Broadband-4G-Watchdog','ChatGPT-StrictStandby-Recovery')){
                Get-ScheduledTask -TaskName $taskName -ErrorAction Stop |
                    Select-Object TaskName,TaskPath,State
            }
        )
    } catch {
        $taskQuery = 'Permission or query error: '+$_.Exception.Message
    }
}
$probe = 'Not requested (use -ProbeBroadband)'
if($ProbeBroadband) {
    $primary = @($adapterInfo | Where-Object {$_.Name -eq 'Ethernet 2'})
    $source = if($primary.Count -and $primary[0].IPv4.Count){$primary[0].IPv4[0]}else{''}
    if($source){
        try {
            $raw = & "$env:WINDIR\System32\curl.exe" -4 --interface $source --noproxy '*' --connect-timeout 3 --max-time 7 -s -o NUL -w '%{http_code}|%{local_ip}' 'https://www.google.com/generate_204'
            $probe = [pscustomobject]@{Result=([string]$raw).Trim();ExitCode=$LASTEXITCODE}
        } catch { $probe = 'Probe error: '+$_.Exception.Message }
    } else { $probe = 'Primary source address missing' }
}
[pscustomobject][ordered]@{
    CapturedAt = $now.ToString('o')
    ReadOnly = $true
    Device = $env:COMPUTERNAME
    Adapters = $adapterInfo
    DefaultRoutes = $routes
    Firewall = $firewall
    WatchdogStatus = $status
    StatusAgeSeconds = $ageSeconds
    StatusError = $statusError
    ScheduledTasks = $taskList
    TaskQuery = $taskQuery
    LatestEvents = $events
    PrimaryHTTPSProbe = $probe
    Warning = 'No mobile-health test is performed: strict standby deliberately blocks direct mobile traffic. A real failover/failback test requires local supervision.'
} | ConvertTo-Json -Depth 8
