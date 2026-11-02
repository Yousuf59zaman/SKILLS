#Requires -Version 7.0
# MuseTaskCore.ps1 — private implementation for Invoke-MuseTask.ps1. Dot-source only; no top-level execution.
# Public surface stays fixed: pinned model/agent below, native opencode.exe only, no model/exe override.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:PinnedMuseModel = 'opencode-go/muse-spark-1.3-contributor'
$script:PinnedMuseAgent = 'build'

function Get-MuseProp($obj, [string]$name) {
  if ($null -eq $obj) { return $null }
  $pp = $obj.PSObject.Properties[$name]
  if ($null -eq $pp) { return $null }
  return $pp.Value
}

function Sanitize-MuseText([string]$s, [int]$max = 500) {
  if ([string]::IsNullOrEmpty($s)) { return '' }
  $r = $s -replace '(?i)bearer\s+[\w\-.~+/=]+', 'bearer ***'
  $r = $r -replace 'sk-[A-Za-z0-9\-_]+', 'sk-***'
  $r = $r -replace '(?i)(api[_-]?key\s*[:=]\s*)[^\s;,}]+', '$1***'
  if ($r.Length -gt $max) { return $r.Substring(0, $max) + '…' }
  return $r
}

function Get-MuseErrorText($ErrorObject, $Event, [string]$FallbackType = '') {
  $cand = $null
  if (($ErrorObject -is [string]) -and ($ErrorObject -ne '')) { $cand = $ErrorObject }
  else {
    $m = Get-MuseProp $ErrorObject 'message'
    if (($m -is [string]) -and ($m -ne '')) { $cand = $m }
    else {
      $d = Get-MuseProp (Get-MuseProp $ErrorObject 'data') 'message'
      if (($d -is [string]) -and ($d -ne '')) { $cand = $d }
      else {
        $em = Get-MuseProp $Event 'message'
        if (($em -is [string]) -and ($em -ne '')) { $cand = $em }
        else { $cand = $FallbackType }
      }
    }
  }
  return (Sanitize-MuseText ([string]$cand) 500)
}

function Resolve-MuseExe {
  $cands = @()
  $bundled = Join-Path $env:APPDATA 'npm\node_modules\opencode-ai\bin\opencode.exe'
  if (-not [string]::IsNullOrWhiteSpace($bundled)) { $cands += $bundled }
  $onPath = Get-Command -Name 'opencode.exe' -ErrorAction SilentlyContinue
  if (($null -ne $onPath) -and -not [string]::IsNullOrWhiteSpace($onPath.Source)) { $cands += $onPath.Source }
  foreach ($c in $cands) {
    if (($c -like '*.exe') -and (Test-Path -LiteralPath $c -PathType Leaf)) { return $c }
  }
  throw 'opencode native executable (opencode.exe) not found. Refusing to pass prompts through a .cmd/.ps1 shell shim (Windows batch argument interpolation risk). Repair the opencode install; PATH and profiles were not modified.'
}

function Invoke-MuseChildRun {
  param([string]$Exe, [string[]]$CliArgs, [string]$StderrFile, [ref]$ExitCode)
  & $Exe @CliArgs 2>$StderrFile | ForEach-Object { "$_" }
  $ExitCode.Value = $LASTEXITCODE
}

function Invoke-MuseChildExport {
  param([string]$Exe, [string]$SessionId, [string]$WorkDir, [string]$ExportFile, [string]$StderrFile)
  Push-Location -LiteralPath $WorkDir
  try {
    # NOTE: `opencode export` takes no --dir flag, so cwd is set to the task directory.
    # --sanitize redacts private transcript text; model/role/id metadata is preserved.
    & $Exe @('export', $SessionId, '--sanitize') 2>$StderrFile > $ExportFile
    return $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

function Confirm-MuseChildStderr {
  param([string]$StderrFile)
  if ([string]::IsNullOrWhiteSpace($StderrFile)) { return }
  if (-not (Test-Path -LiteralPath $StderrFile -PathType Leaf)) { return }
  $t = Get-Content -LiteralPath $StderrFile -Raw -ErrorAction SilentlyContinue
  if ([string]::IsNullOrWhiteSpace($t)) { return }
  foreach ($ln in ($t -split "`r?`n")) {
    if ($ln -match '^\s*(error|exception|fatal)(\s|:|$)') {
      throw ('opencode child terminal error: ' + (Sanitize-MuseText $ln.Trim() 500))
    }
  }
}

function Add-MuseStreamEvent {
  param([Parameter(Mandatory = $true)]$Event, [Parameter(Mandatory = $true)][hashtable]$State)
  $out = @()
  $o = $Event
  foreach ($cand in @((Get-MuseProp $o 'sessionID'), (Get-MuseProp $o 'sessionId'), (Get-MuseProp $o 'session_id'))) {
    $s = [string]$cand
    if ([string]::IsNullOrWhiteSpace($s)) { continue }
    if ([string]::IsNullOrWhiteSpace($State.RunSessionId)) { $State.RunSessionId = $s }
    elseif ($State.RunSessionId -ne $s) {
      $State.SeenError = 'conflicting session identity in child events.'
      return @('[muse:error] conflicting session identity in child events.')
    }
  }
  $sessId = [string](Get-MuseProp (Get-MuseProp $o 'session') 'id')
  if (-not [string]::IsNullOrWhiteSpace($sessId)) {
    if ([string]::IsNullOrWhiteSpace($State.RunSessionId)) { $State.RunSessionId = $sessId }
    elseif ($State.RunSessionId -ne $sessId) {
      $State.SeenError = 'conflicting session identity in child events.'
      return @('[muse:error] conflicting session identity in child events.')
    }
  }
  $otype = [string](Get-MuseProp $o 'type')
  $errObj = Get-MuseProp $o 'error'
  if (($otype -like '*error*') -or ($null -ne $errObj)) {
    $State.SeenError = Get-MuseErrorText -ErrorObject $errObj -Event $o -FallbackType $otype
    $out += ('[muse:error] ' + $State.SeenError)
    return $out
  }
  $part = Get-MuseProp $o 'part'
  $partType = [string](Get-MuseProp $part 'type')
  $mid = $null
  foreach ($k in @('messageID', 'messageId', 'message_id')) {
    $v = Get-MuseProp $part $k
    if (($v -is [string]) -and -not [string]::IsNullOrWhiteSpace($v)) { $mid = $v; break }
  }
  # Attribute EVERY current-run event type (step/reasoning/text/tool) so each
  # current-run assistant message is attested; tool payloads are never scanned.
  if ($null -ne $mid) { [void]$State.Ids.Add($mid) }
  $txt = $null
  if ($partType -eq 'text') {
    $pt = Get-MuseProp $part 'text'
    if (($pt -is [string]) -and ($pt -ne '')) { $txt = $pt }
    else {
      $pd = Get-MuseProp $part 'delta'
      if (($pd -is [string]) -and ($pd -ne '')) { $txt = $pd }
    }
  } elseif ($otype -like '*text*') {
    $tt = Get-MuseProp $o 'text'
    $td = Get-MuseProp $o 'delta'
    if (($tt -is [string]) -and ($tt -ne '')) { $txt = $tt }
    elseif (($td -is [string]) -and ($td -ne '')) { $txt = $td }
    if ($null -eq $mid) {
      foreach ($k in @('messageID', 'messageId', 'message_id')) {
        $v = Get-MuseProp $o $k
        if (($v -is [string]) -and -not [string]::IsNullOrWhiteSpace($v)) { $mid = $v; break }
      }
    }
  }
  if ($null -ne $txt) {
    if ($null -ne $mid) { [void]$State.Ids.Add($mid) }
    [void]$State.Text.Append($txt)
    $out += $txt
    return $out
  }
  $isTool = ($partType -eq 'tool') -or ($otype -like '*tool*')
  if ($isTool) {
    if ($null -ne $mid) { [void]$State.Ids.Add($mid) }
    $tname = Get-MuseProp $part 'tool'
    if (($tname -isnot [string]) -or [string]::IsNullOrWhiteSpace($tname)) { $tname = Get-MuseProp $o 'tool' }
    if (($tname -isnot [string]) -or [string]::IsNullOrWhiteSpace($tname)) { $tname = Get-MuseProp $o 'name' }
    if (($tname -isnot [string]) -or [string]::IsNullOrWhiteSpace($tname)) { $tname = $otype }
    # Status comes ONLY from part.state.status (string). Never stringify a state object.
    $tstat = Get-MuseProp (Get-MuseProp $part 'state') 'status'
    if (($tstat -isnot [string]) -or [string]::IsNullOrWhiteSpace($tstat)) { $tstat = '' }
    $out += ('[muse:tool] ' + (Sanitize-MuseText $tname 120) + $(if ($tstat -ne '') { ' [' + (Sanitize-MuseText $tstat 40) + ']' } else { '' }))
  }
  return $out
}

function Test-MuseCurrentAttestation {
  param(
    [Parameter(Mandatory = $true)][string]$ExportJson,
    [Parameter(Mandatory = $true)][System.Collections.Generic.HashSet[string]]$CurrentIds
  )
  $obj = $ExportJson | ConvertFrom-Json -ErrorAction Stop
  $msgs = Get-MuseProp $obj 'messages'
  if ($null -eq $msgs) { throw 'attestation: export has no messages array.' }
  $byId = @{}
  foreach ($m in @($msgs)) {
    $info = Get-MuseProp $m 'info'
    if ($null -eq $info) { continue }
    if ([string](Get-MuseProp $info 'role') -ne 'assistant') { continue }
    $id = Get-MuseProp $info 'id'
    if (($id -isnot [string]) -or [string]::IsNullOrWhiteSpace($id)) { continue }
    $byId[$id] = $info
  }
  if ($CurrentIds.Count -eq 0) { throw 'attestation: no current-run assistant message ids.' }
  foreach ($cid in $CurrentIds) {
    if (-not $byId.ContainsKey($cid)) { throw "attestation: current-run message is not an assistant message in export." }
    $info = $byId[$cid]
    $mid = Get-MuseProp $info 'modelID'
    $pidn = Get-MuseProp $info 'providerID'
    if (($mid -isnot [string]) -or ($pidn -isnot [string]) -or [string]::IsNullOrWhiteSpace($mid) -or [string]::IsNullOrWhiteSpace($pidn)) {
      throw 'attestation: current-run message is missing model metadata.'
    }
    if ("$pidn/$mid" -ne $script:PinnedMuseModel) {
      throw "attestation: current-run message used an unexpected model (expected $script:PinnedMuseModel)."
    }
  }
}

function Invoke-MuseTaskMain {
  [CmdletBinding()]
  param(
    [string]$Prompt = '',
    [string]$PromptFile = '',
    [string]$WorkingDirectory = '',
    [string]$SessionId = '',
    [string[]]$Files = @(),
    [bool]$AutoApprove = $false
  )
  $message = ''
  if (-not [string]::IsNullOrWhiteSpace($PromptFile)) {
    if (-not (Test-Path -LiteralPath $PromptFile -PathType Leaf)) { throw "PromptFile not found: $PromptFile" }
    $message = Get-Content -LiteralPath $PromptFile -Raw -Encoding utf8
  } else {
    $message = $Prompt
  }
  if ([string]::IsNullOrWhiteSpace($message)) { throw 'Empty prompt: no response requested.' }
  if ([string]::IsNullOrWhiteSpace($WorkingDirectory)) { $WorkingDirectory = (Get-Location).Path }
  if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) { throw "WorkingDirectory not found: $WorkingDirectory" }
  $workDir = (Resolve-Path -LiteralPath $WorkingDirectory).Path
  $exe = Resolve-MuseExe
  $cliArgs = @('run', $message, '--model', $script:PinnedMuseModel, '--agent', $script:PinnedMuseAgent, '--dir', $workDir, '--format', 'json')
  foreach ($f in $Files) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Attached file not found: $f" }
    $cliArgs += @('--file', $f)
  }
  $explicitSession = ''
  if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
    $explicitSession = $SessionId.Trim()
    $cliArgs += @('--session', $explicitSession)
  }
  if ($AutoApprove) { $cliArgs += '--auto' }

  $hadVar = Test-Path 'env:OPENCODE_MUSE_WORKER'
  $oldVar = if ($hadVar) { $env:OPENCODE_MUSE_WORKER } else { $null }
  $env:OPENCODE_MUSE_WORKER = '1'
  $errFile = Join-Path ([System.IO.Path]::GetTempPath()) ('muse-run-err-' + [System.Guid]::NewGuid().ToString('N') + '.log')
  try {
    $state = @{
      Text         = (New-Object System.Text.StringBuilder)
      Ids          = (New-Object System.Collections.Generic.HashSet[string])
      RunSessionId = $explicitSession
      SeenError    = ''
    }
    $code = 0
    Invoke-MuseChildRun -Exe $exe -CliArgs $cliArgs -StderrFile $errFile -ExitCode ([ref]$code) | ForEach-Object {
      $line = "$_"
      if ([string]::IsNullOrWhiteSpace($line)) { return }
      $o = $null
      try { $o = $line | ConvertFrom-Json -ErrorAction Stop } catch {
        if (($line -match 'permission requested') -and ($line -match 'auto-rejecting')) { Write-Output '[muse:warning] noninteractive OpenCode automatically rejected an approval request; interactive authorization is needed.' }
        return
      }
      foreach ($ln in (Add-MuseStreamEvent -Event $o -State $state)) { Write-Output $ln }
    }
    if ($code -ne 0) {
      $tail = ''
      if (Test-Path -LiteralPath $errFile) {
        $tail = Sanitize-MuseText ((Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue) ?? '') 2000
      }
      throw "opencode run exited $code. $tail"
    }
    if ($state.SeenError -ne '') { throw "opencode reported error: $($state.SeenError)" }
    Confirm-MuseChildStderr -StderrFile $errFile
    if ($state.Text.Length -eq 0) { throw 'opencode returned no assistant text (no-response).' }
    if ([string]::IsNullOrWhiteSpace($state.RunSessionId)) { throw 'opencode returned no session id; cannot validate model.' }
    if ($state.Ids.Count -eq 0) { throw 'opencode returned no current-run assistant message ids; cannot validate model.' }
    $exportFile = Join-Path ([System.IO.Path]::GetTempPath()) ('muse-export-' + [System.Guid]::NewGuid().ToString('N') + '.json')
    try {
      $xcode = Invoke-MuseChildExport -Exe $exe -SessionId $state.RunSessionId -WorkDir $workDir -ExportFile $exportFile -StderrFile $errFile
      if ($xcode -ne 0) {
        $etail = ''
        if (Test-Path -LiteralPath $errFile) {
          $etail = Sanitize-MuseText ((Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue) ?? '') 500
        }
        throw "opencode export exited $xcode. $etail"
      }
      $exportRaw = Get-Content -LiteralPath $exportFile -Raw -Encoding utf8
      if ([string]::IsNullOrWhiteSpace($exportRaw)) { throw 'opencode export returned empty data.' }
      Test-MuseCurrentAttestation -ExportJson $exportRaw -CurrentIds $state.Ids
    } finally {
      Remove-Item -LiteralPath $exportFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output ("MUSE_MODEL=" + $script:PinnedMuseModel)
    Write-Output ("MUSE_SESSION=" + $state.RunSessionId)
  } finally {
    if ($hadVar) { $env:OPENCODE_MUSE_WORKER = $oldVar } else { Remove-Item 'env:OPENCODE_MUSE_WORKER' -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
  }
}
