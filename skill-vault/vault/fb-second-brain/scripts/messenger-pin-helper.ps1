[CmdletBinding()]
param(
  [ValidateSet('Status', 'Submit')]
  [string]$Action = 'Status',

  [ValidateSet('openclaw', 'openclaw2')]
  [string]$BrowserProfile = 'openclaw',

  [string]$TargetId,

  [string]$SecretPath = 'C:\Users\User\.openclaw\secrets\messenger-chat-history-pin.dpapi'
)

$ErrorActionPreference = 'Stop'

function Focus-BrowserTarget {
  param([string]$Profile)
  if ([string]::IsNullOrWhiteSpace($TargetId)) { return }
  & openclaw browser --json --browser-profile $Profile focus $TargetId 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The dedicated Messenger browser tab is unavailable.'
  }
}

function Write-Result {
  param([hashtable]$Value)
  $Value | ConvertTo-Json -Compress
}

function Get-BrowserSnapshot {
  param([string]$Profile)
  Focus-BrowserTarget -Profile $Profile
  $raw = & openclaw browser --json --browser-profile $Profile snapshot --efficient 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to snapshot the visible browser profile '$Profile'."
  }
  return ($raw | Out-String | ConvertFrom-Json)
}

function Test-MessengerLocation {
  param($Snapshot)
  try {
    $uri = [Uri]([string]$Snapshot.url)
    return (
      $uri.Scheme -eq 'https' -and
      $uri.Host -match '(?i)(^|\.)facebook\.com$' -and
      $uri.AbsolutePath -match '(?i)^/messages(?:/|$)'
    )
  } catch {
    return $false
  }
}

function Find-PinRef {
  param($Snapshot)
  if (-not $Snapshot.refs) { return $null }
  foreach ($property in $Snapshot.refs.PSObject.Properties) {
    $value = $property.Value
    if ([string]$value.role -match '(?i)textbox' -and [string]$value.name -match '(?i)\bPIN\b') {
      return $property.Name
    }
  }
  return $null
}

function Get-StableMessengerSnapshot {
  param([string]$Profile)
  $last = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    $last = Get-BrowserSnapshot -Profile $Profile
    if ((Test-MessengerLocation -Snapshot $last) -and ($last.refs -or (Find-PinRef -Snapshot $last))) {
      return $last
    }
    if ($attempt -lt 4) { Start-Sleep -Seconds 1 }
  }
  return $last
}

function Read-SecurePin {
  if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
    throw 'Messenger chat-history credential is not installed in the local encrypted store.'
  }
  $encrypted = [System.IO.File]::ReadAllText($SecretPath).Trim()
  if ([string]::IsNullOrWhiteSpace($encrypted)) {
    throw 'Messenger chat-history credential store is empty.'
  }
  try {
    return ConvertTo-SecureString $encrypted
  } catch {
    throw 'Messenger chat-history credential cannot be decrypted in this execution context.'
  }
}

$before = Get-StableMessengerSnapshot -Profile $BrowserProfile
if (-not (Test-MessengerLocation -Snapshot $before)) {
  throw 'Messenger page could not be verified before chat-history credential handling.'
}

$pinRef = Find-PinRef -Snapshot $before
if (-not $pinRef) {
  Write-Result @{
    ok = $true
    needed = $false
    submitted = $false
    credential_required = $false
    browser_profile = $BrowserProfile
  }
  exit 0
}

$securePin = Read-SecurePin
if ($Action -eq 'Status') {
  Write-Result @{
    ok = $true
    needed = $true
    submitted = $false
    installed = $true
    decryptable = $true
    credential_required = $true
    browser_profile = $BrowserProfile
  }
  exit 0
}

$bstr = [IntPtr]::Zero
$plainPin = $null
try {
  Focus-BrowserTarget -Profile $BrowserProfile
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePin)
  $plainPin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  & openclaw browser --json --browser-profile $BrowserProfile type $pinRef $plainPin --submit 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The visible browser rejected the stored Messenger chat-history credential submission.'
  }
} finally {
  $plainPin = $null
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Start-Sleep -Milliseconds 1200
$after = Get-StableMessengerSnapshot -Profile $BrowserProfile
if (Find-PinRef -Snapshot $after) {
  throw 'Messenger still shows the PIN prompt after stored credential submission.'
}

Write-Result @{
  ok = $true
  needed = $true
  submitted = $true
  verified = $true
  browser_profile = $BrowserProfile
}
