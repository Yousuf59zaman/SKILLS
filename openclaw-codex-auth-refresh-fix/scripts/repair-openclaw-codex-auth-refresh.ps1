param(
  [string]$OpenClawDir = "$env:USERPROFILE\.openclaw",
  [switch]$RunSmoke
)

$ErrorActionPreference = "Stop"

function Add-Result {
  param([string]$Step, [object]$Data)
  [pscustomobject]@{ step = $Step; data = $Data }
}

function Stop-OpenClawAppServers {
  $owned = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*\.openclaw\npm\node_modules\@openclaw\codex*" -and
    $_.CommandLine -like "*app-server*" -and
    ($_.Name -match "^(node|node\.exe|codex|codex\.exe)$")
  }
  $ids = @($owned | ForEach-Object { [int]$_.ProcessId })
  foreach ($procId in $ids) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Milliseconds 800
  return $ids.Count
}

function Ensure-Property {
  param([object]$Object, [string]$Name, [object]$Value)
  if ($Object.PSObject.Properties.Name -contains $Name) {
    $Object.$Name = $Value
  } else {
    Add-Member -InputObject $Object -NotePropertyName $Name -NotePropertyValue $Value
  }
}

function Repair-BridgePatch {
  $dist = Join-Path $OpenClawDir "npm\node_modules\@openclaw\codex\dist"
  $files = @(Get-ChildItem -LiteralPath $dist -Filter "shared-client-*.js" -File -ErrorAction SilentlyContinue)
  $patched = 0
  foreach ($file in $files) {
    $textRaw = Get-Content -LiteralPath $file.FullName -Raw
    $text = if ($null -eq $textRaw) { "" } else { [string]$textRaw }
    if ($text -notmatch "async function refreshCodexAppServerAuthTokens") { continue }
    $new = $text -replace "forceOAuthRefresh:\s*true", "forceOAuthRefresh: false"
    if ($new -ne $text) {
      Set-Content -LiteralPath $file.FullName -Value $new -Encoding UTF8
      $patched++
    }
  }
  return [pscustomobject]@{ filesChecked = $files.Count; filesPatched = $patched }
}

function Repair-OpenClawJson {
  $path = Join-Path $OpenClawDir "openclaw.json"
  $json = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  $removedFallback = $false
  $removedModelEntry = $false

  $json.agents.defaults.model.primary = "openai-codex/gpt-5.5"
  if ($json.agents.defaults.model.PSObject.Properties.Name -contains "fallbacks") {
    $before = @($json.agents.defaults.model.fallbacks)
    $json.agents.defaults.model.fallbacks = @($before | Where-Object { $_ -ne "openai-codex/gpt-5.4" -and $_ -ne "openai/gpt-5.5" })
    $removedFallback = $before.Count -ne @($json.agents.defaults.model.fallbacks).Count
  }
  if ($json.agents.defaults.models -and $json.agents.defaults.models.PSObject.Properties.Name -contains "openai-codex/gpt-5.4") {
    $json.agents.defaults.models.PSObject.Properties.Remove("openai-codex/gpt-5.4")
    $removedModelEntry = $true
  }
  $json.agents.defaults.thinkingDefault = "xhigh"
  $m = $json.agents.defaults.models."openai-codex/gpt-5.5"
  if ($m -and $m.params) { $m.params.fastMode = $false }

  $json | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $path -Encoding UTF8
  return [pscustomobject]@{
    primary = "openai-codex/gpt-5.5"
    removedFallback = $removedFallback
    removedModelEntry = $removedModelEntry
    thinkingDefault = "xhigh"
    fastMode = $false
  }
}

function Repair-AuthStores {
  $targets = @("clawdbot_agent", "openclaw_agent", "moltbot_agent", "main-cron")
  $stores = foreach ($target in $targets) {
    $dir = Join-Path $OpenClawDir "agents\$target\agent"
    $profilesPath = Join-Path $dir "auth-profiles.json"
    $statePath = Join-Path $dir "auth-state.json"
    if (Test-Path -LiteralPath $profilesPath) {
      $profiles = Get-Content -LiteralPath $profilesPath -Raw | ConvertFrom-Json
      $count = 0
      if ($profiles.PSObject.Properties.Name -contains "profiles" -and $profiles.profiles) {
        $count = @($profiles.profiles.PSObject.Properties | Where-Object { $_.Value.provider -eq "openai-codex" }).Count
      }
      [pscustomobject]@{ target = $target; dir = $dir; profilesPath = $profilesPath; statePath = $statePath; profiles = $profiles; count = $count }
    }
  }
  $source = @($stores | Sort-Object count -Descending | Select-Object -First 1)[0]
  if (-not $source -or $source.count -le 0) {
    return [pscustomobject]@{ source = $null; copiedProfiles = 0; targets = @() }
  }

  $srcProps = @($source.profiles.profiles.PSObject.Properties | Where-Object { $_.Value.provider -eq "openai-codex" })
  $srcState = if (Test-Path -LiteralPath $source.statePath) { Get-Content -LiteralPath $source.statePath -Raw | ConvertFrom-Json } else { $null }
  $srcOrder = if ($srcState -and $srcState.order -and $srcState.order.PSObject.Properties.Name -contains "openai-codex") {
    @($srcState.order."openai-codex")
  } else {
    @($srcProps | ForEach-Object { $_.Name })
  }
  $srcOrder = @($srcOrder | Where-Object { $_ })

  $results = foreach ($store in $stores) {
    if (!(Test-Path -LiteralPath $store.dir)) { New-Item -ItemType Directory -Path $store.dir | Out-Null }
    $profilesObj = if (Test-Path -LiteralPath $store.profilesPath) {
      Get-Content -LiteralPath $store.profilesPath -Raw | ConvertFrom-Json
    } else {
      [pscustomobject]@{ version = $source.profiles.version; profiles = [pscustomobject]@{} }
    }
    Ensure-Property $profilesObj "profiles" $(if ($profilesObj.profiles) { $profilesObj.profiles } else { [pscustomobject]@{} })
    $removed = 0
    foreach ($prop in @($profilesObj.profiles.PSObject.Properties)) {
      if ($prop.Value.provider -eq "openai-codex") {
        $profilesObj.profiles.PSObject.Properties.Remove($prop.Name)
        $removed++
      }
    }
    foreach ($prop in $srcProps) {
      Add-Member -InputObject $profilesObj.profiles -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
    }
    $profilesObj | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $store.profilesPath -Encoding UTF8

    $stateObj = [pscustomobject]@{
      version = $(if ($srcState) { $srcState.version } else { 1 })
      order = [pscustomobject]@{}
      lastGood = [pscustomobject]@{}
      usageStats = [pscustomobject]@{}
    }
    Add-Member -InputObject $stateObj.order -NotePropertyName "openai-codex" -NotePropertyValue $srcOrder -Force
    if ($srcOrder.Count -gt 0) {
      Add-Member -InputObject $stateObj.lastGood -NotePropertyName "openai-codex" -NotePropertyValue ([string]$srcOrder[0]) -Force
    }
    $stateObj | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $store.statePath -Encoding UTF8
    [pscustomobject]@{ target = $store.target; removedExisting = $removed; copied = $srcProps.Count; orderCount = $srcOrder.Count; usageStatsCleared = $true }
  }
  return [pscustomobject]@{ source = $source.target; copiedProfiles = $srcProps.Count; targets = @($results) }
}

function Repair-JsonNode {
  param([object]$Node, [string]$KeyName, [ref]$Stats)
  if ($null -eq $Node) { return $Node }
  if ($Node -is [string]) {
    $new = $Node.Replace("openai-codex/gpt-5.4", "openai-codex/gpt-5.5").Replace("openai/gpt-5.5", "openai-codex/gpt-5.5")
    if ($new -eq "gpt-5.4") { $new = "gpt-5.5" }
    if ($KeyName -match "^(?i:provider)$" -and $new -eq "openai") { $new = "openai-codex" }
    if ($new -ne $Node) { $Stats.Value.routeValuesRewritten++ }
    return $new
  }
  if ($Node -is [array]) {
    $out = @()
    foreach ($item in @($Node)) {
      if ($KeyName -match "(?i)^fallbacks?$|fallbackModels|fallbackRoute") {
        if (($item -is [string]) -and ($item -in @("openai-codex/gpt-5.4", "openai/gpt-5.5", "gpt-5.4"))) {
          $Stats.Value.staleFallbackEntriesRemoved++
          continue
        }
      }
      $out += Repair-JsonNode $item $KeyName $Stats
    }
    return $out
  }
  if ($Node -isnot [pscustomobject]) { return $Node }
  foreach ($prop in @($Node.PSObject.Properties)) {
    $name = [string]$prop.Name
    if ($name -match "(?i)^(authProfile(Id|Override|OverrideSource|OverrideCompactionCount|Source|Pinned)?|auth_profile(_id)?|profileOverride)$") {
      $Node.PSObject.Properties.Remove($name)
      $Stats.Value.authPinKeysRemoved++
      continue
    }
    if ($name -in @("openai-codex/gpt-5.4", "openai/gpt-5.5", "gpt-5.4")) {
      $Node.PSObject.Properties.Remove($name)
      $Stats.Value.staleRouteKeysRemoved++
      continue
    }
    $Node.$name = Repair-JsonNode $prop.Value $name $Stats
  }
  return $Node
}

function Repair-LiveMetadata {
  $targets = @("clawdbot_agent", "openclaw_agent", "moltbot_agent", "main-cron")
  $files = @()
  foreach ($target in $targets) {
    $sessionDir = Join-Path $OpenClawDir "agents\$target\sessions"
    $sessions = Join-Path $sessionDir "sessions.json"
    if (Test-Path -LiteralPath $sessions) { $files += Get-Item -LiteralPath $sessions }
    if (Test-Path -LiteralPath $sessionDir) {
      $files += Get-ChildItem -LiteralPath $sessionDir -File -Filter "*.codex-app-server.json" -ErrorAction SilentlyContinue
    }
    $model = Join-Path $OpenClawDir "agents\$target\agent\models.json"
    if (Test-Path -LiteralPath $model) { $files += Get-Item -LiteralPath $model }
  }
  $cron = Join-Path $OpenClawDir "cron\jobs.json"
  if (Test-Path -LiteralPath $cron) { $files += Get-Item -LiteralPath $cron }

  $stats = [pscustomobject]@{
    filesScanned = 0
    filesChanged = 0
    authPinKeysRemoved = 0
    staleRouteKeysRemoved = 0
    staleFallbackEntriesRemoved = 0
    routeValuesRewritten = 0
    gpt54ModelCacheEntriesRemoved = 0
  }
  foreach ($file in ($files | Sort-Object FullName -Unique)) {
    $stats.filesScanned++
    $text = Get-Content -LiteralPath $file.FullName -Raw
    try { $json = $text | ConvertFrom-Json } catch { continue }
    $json = Repair-JsonNode $json "" ([ref]$stats)
    if ($file.Name -eq "models.json" -and $json.providers) {
      foreach ($providerProp in @($json.providers.PSObject.Properties)) {
        $provider = $providerProp.Value
        if ($provider.PSObject.Properties.Name -contains "models" -and $provider.models -is [array]) {
          $before = @($provider.models).Count
          $provider.models = @($provider.models | Where-Object {
            -not (($_.PSObject.Properties.Name -contains "id" -and [string]$_.id -match "^gpt-5\.4") -or ($_.PSObject.Properties.Name -contains "name" -and [string]$_.name -match "gpt-5\.4"))
          })
          $stats.gpt54ModelCacheEntriesRemoved += ($before - @($provider.models).Count)
        }
      }
    }
    $newRaw = $json | ConvertTo-Json -Depth 100
    $newText = if ($null -eq $newRaw) { "" } else { [string]$newRaw }
    if ($newText.TrimEnd() -ne $text.TrimEnd()) {
      Set-Content -LiteralPath $file.FullName -Value $newText -Encoding UTF8
      $stats.filesChanged++
    }
  }
  return $stats
}

function Clear-StaleLocks {
  $locks = Get-ChildItem -LiteralPath $OpenClawDir -Recurse -File -Filter "*.lock" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "(?i)oauth|auth|refresh|profile|openai|codex" -and ((Get-Date) - $_.LastWriteTime).TotalSeconds -gt 120 }
  $count = @($locks).Count
  foreach ($lock in $locks) { Remove-Item -LiteralPath $lock.FullName -Force }
  return $count
}

function Invoke-Smoke {
  param([string]$Agent)
  $key = "agent:${Agent}:smoke-codex-auth-refresh-fix-$(Get-Date -Format yyyyMMddHHmmss)"
  $message = "NON_SECRET_SMOKE_TEST: reply exactly SMOKE_OK and nothing else."
  $raw = & openclaw agent --agent $Agent --session-key $key --message $message --thinking xhigh --json --timeout 300 2>&1
  $exit = $LASTEXITCODE
  $text = ($raw | Out-String)
  return [pscustomobject]@{
    agent = $Agent
    exitCode = $exit
    ok = ($exit -eq 0)
    containsSmokeOk = ($text -match "SMOKE_OK")
    mentionsCodex55 = ($text -match "openai-codex/gpt-5\.5|gpt-5\.5")
    mentionsAuthTimeout = ($text -match "auth refresh request timed out after 10s")
    mentionsMissingApiKey = ($text -match "Missing API key")
    mentionsFallbackExhausted = ($text -match "fallback chain exhausted|No fallback model succeeded|All models failed")
  }
}

Push-Location $OpenClawDir
try {
  $results = @()
  $results += Add-Result "gateway-stop" (& openclaw gateway stop 2>&1 | Out-String).Trim()
  $results += Add-Result "app-server-kill" @{ killed = Stop-OpenClawAppServers }
  $results += Add-Result "bridge-patch" (Repair-BridgePatch)
  $results += Add-Result "openclaw-json" (Repair-OpenClawJson)
  $results += Add-Result "auth-store-alignment" (Repair-AuthStores)
  $results += Add-Result "live-metadata" (Repair-LiveMetadata)
  $results += Add-Result "stale-locks" @{ removed = Clear-StaleLocks }
  $results += Add-Result "config-validate" ((& openclaw config validate --json | ConvertFrom-Json).valid)
  $results += Add-Result "gateway-start" (& openclaw gateway start 2>&1 | Out-String).Trim()
  Start-Sleep -Seconds 8
  $health = & openclaw gateway health --json --timeout 60000 | ConvertFrom-Json
  $status = & openclaw gateway status --json | ConvertFrom-Json
  $results += Add-Result "gateway-health" @{
    ok = $health.ok
    rpcOk = $status.rpc.ok
    version = $status.gateway.version
    heartbeatSeconds = $health.heartbeatSeconds
    eventLoopDegraded = $health.eventLoop.degraded
  }
  if ($RunSmoke) {
    $smokes = @()
    foreach ($agent in @("clawdbot_agent", "openclaw_agent", "moltbot_agent")) {
      $smokes += Invoke-Smoke $agent
    }
    $results += Add-Result "smoke-tests" $smokes
  }
  $results | ConvertTo-Json -Depth 20
} finally {
  Pop-Location
}
