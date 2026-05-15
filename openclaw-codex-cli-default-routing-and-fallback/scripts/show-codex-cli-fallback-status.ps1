[CmdletBinding()]
param(
  [string]$LogPath,
  [int]$Recent = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-LogPath {
  param(
    [string]$RequestedPath
  )

  if (-not [string]::IsNullOrWhiteSpace($RequestedPath)) {
    if (-not (Test-Path -LiteralPath $RequestedPath)) {
      throw "Provided log path does not exist: $RequestedPath"
    }
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }

  $candidateDirs = @(
    "C:\tmp\openclaw",
    (Join-Path $env:TEMP "openclaw")
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  $logs = foreach ($dir in $candidateDirs) {
    Get-ChildItem -Path $dir -File -Filter "openclaw-*.log" -ErrorAction SilentlyContinue
  }

  $latest = $logs | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) {
    throw "No openclaw-*.log found in: $($candidateDirs -join ', ')"
  }

  return $latest.FullName
}

function Strip-Ansi {
  param(
    [AllowNull()]
    [string]$Text
  )

  if ($null -eq $Text) {
    return ""
  }
  return ($Text -replace "$([char]27)\[[0-9;]*[A-Za-z]", "")
}

function Get-DisplayText {
  param(
    [string]$Line
  )

  $trimmed = $Line.Trim()
  if (-not $trimmed.StartsWith("{")) {
    return (Strip-Ansi -Text $trimmed)
  }

  try {
    $obj = $trimmed | ConvertFrom-Json -ErrorAction Stop
    $parts = @()
    foreach ($prop in $obj.PSObject.Properties) {
      if ($prop.Name -in @("_meta", "time")) {
        continue
      }
      if ($null -eq $prop.Value) {
        continue
      }
      $text = [string]$prop.Value
      if ([string]::IsNullOrWhiteSpace($text)) {
        continue
      }
      $parts += $text
    }
    if ($parts.Count -gt 0) {
      return (Strip-Ansi -Text ($parts -join " "))
    }
  } catch {
    # Keep original line when JSON parse fails.
  }

  return (Strip-Ansi -Text $trimmed)
}

function Get-TimeLabel {
  param(
    [string]$RawLine,
    [string]$DisplayText
  )

  if ($RawLine -match '"time":"(?<iso>[^"]+)"') {
    try {
      return ([DateTimeOffset]::Parse($Matches.iso).ToString("yyyy-MM-dd HH:mm:ss zzz"))
    } catch {
      return $Matches.iso
    }
  }

  if ($DisplayText -match '^(?<h>\d{2}:\d{2}:\d{2})\s') {
    return $Matches.h
  }

  return ""
}

$resolvedLogPath = Resolve-LogPath -RequestedPath $LogPath

$patterns = @(
  @{ Type = "BrowserServiceFail"; Regex = "browser failed: Can't reach the OpenClaw browser control service" },
  @{ Type = "CliExecCodex"; Regex = "cli exec: provider=codex-cli" },
  @{ Type = "ArgSplitError"; Regex = "unexpected argument '" },
  @{ Type = "AnnounceDeliveryFail"; Regex = "cron announce delivery failed|Subagent completion direct announce failed" },
  @{ Type = "ChannelDeliveryOk"; Regex = "telegram sendMessage ok|discord sendMessage ok|message sendMessage ok" },
  @{ Type = "BrowserRequestOk"; Regex = "res .*browser\.request" }
)

$events = New-Object System.Collections.Generic.List[object]
$lineIndex = 0

Get-Content -Path $resolvedLogPath | ForEach-Object {
  $lineIndex++
  $raw = $_
  $display = Get-DisplayText -Line $raw
  foreach ($p in $patterns) {
    if ($display -match $p.Regex) {
      $events.Add([PSCustomObject]@{
          Index = $lineIndex
          Time  = Get-TimeLabel -RawLine $raw -DisplayText $display
          Type  = $p.Type
          Text  = $display
        })
      break
    }
  }
}

$counts = @{}
foreach ($p in $patterns) {
  $counts[$p.Type] = 0
}
foreach ($e in $events) {
  $counts[$e.Type]++
}

$firstFail = $events | Where-Object { $_.Type -eq "BrowserServiceFail" } | Select-Object -First 1
$firstCliAfterFail = $null
$firstDeliveryAfterCli = $null

if ($firstFail) {
  $firstCliAfterFail = $events | Where-Object {
    $_.Type -eq "CliExecCodex" -and $_.Index -gt $firstFail.Index
  } | Select-Object -First 1
}

if ($firstCliAfterFail) {
  $firstDeliveryAfterCli = $events | Where-Object {
    $_.Type -eq "ChannelDeliveryOk" -and $_.Index -gt $firstCliAfterFail.Index
  } | Select-Object -First 1
}

$fallbackWorked = ($null -ne $firstFail -and $null -ne $firstCliAfterFail -and $null -ne $firstDeliveryAfterCli)

Write-Output "LogPath: $resolvedLogPath"
Write-Output ("Totals: BrowserServiceFail={0}, CliExecCodex={1}, ArgSplitError={2}, AnnounceDeliveryFail={3}, ChannelDeliveryOk={4}, BrowserRequestOk={5}" -f `
    $counts.BrowserServiceFail, `
    $counts.CliExecCodex, `
    $counts.ArgSplitError, `
    $counts.AnnounceDeliveryFail, `
    $counts.ChannelDeliveryOk, `
    $counts.BrowserRequestOk)

if ($fallbackWorked) {
  Write-Output "Status: SUCCESS (browser failure -> codex-cli exec -> channel delivery ok)"
} elseif ($firstFail -and -not $firstCliAfterFail) {
  Write-Output "Status: PARTIAL (browser failure detected, but no codex-cli execution found after that failure)"
} elseif ($firstFail -and $firstCliAfterFail -and -not $firstDeliveryAfterCli) {
  Write-Output "Status: PARTIAL (codex-cli execution found after browser failure, but no delivery success after that)"
} else {
  Write-Output "Status: NO_FAILOVER_WINDOW_DETECTED"
}

if ($counts.ArgSplitError -gt 0) {
  Write-Output "Hint: Argument-splitting errors detected. Use scripts/invoke-codex-exec-resume-safe.ps1."
}

Write-Output ""
Write-Output "Recent matched events:"
$events | Select-Object -Last $Recent | Format-Table Time, Type, Text -AutoSize
