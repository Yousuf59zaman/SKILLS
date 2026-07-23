[CmdletBinding()]
param(
  [ValidateSet('Status', 'Submit')]
  [string]$Action = 'Status',

  [ValidateSet('openclaw', 'openclaw2')]
  [string]$BrowserProfile = 'openclaw',

  [string]$SecretPath = 'C:\Users\User\.openclaw\secrets\messenger-chat-history-pin.dpapi'
)

$ErrorActionPreference = 'Stop'

function Write-Result {
  param([hashtable]$Value)
  $Value | ConvertTo-Json -Compress
}

function Get-BrowserSnapshot {
  param([string]$Profile)
  $raw = & openclaw browser --json --browser-profile $Profile snapshot --efficient 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to snapshot the visible browser profile '$Profile'."
  }
  return ($raw | Out-String | ConvertFrom-Json)
}

function Find-PinRef {
  param($Snapshot)
  if (-not $Snapshot.refs) { return $null }
  foreach ($property in $Snapshot.refs.PSObject.Properties) {
    $value = $property.Value
    if ($value.role -eq 'textbox' -and [string]$value.name -match '(?i)\bPIN\b') {
      return $property.Name
    }
  }
  return $null
}

if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
  throw 'Messenger chat-history credential is not installed in the local encrypted store.'
}

$encrypted = [System.IO.File]::ReadAllText($SecretPath).Trim()
if ([string]::IsNullOrWhiteSpace($encrypted)) {
  throw 'Messenger chat-history credential store is empty.'
}

try {
  $securePin = ConvertTo-SecureString $encrypted
} catch {
  throw 'Messenger chat-history credential cannot be decrypted by the current Windows user.'
}

if ($Action -eq 'Status') {
  Write-Result @{
    ok = $true
    installed = $true
    decryptable = $true
    browser_profile = $BrowserProfile
  }
  exit 0
}

$before = Get-BrowserSnapshot -Profile $BrowserProfile
$pinRef = Find-PinRef -Snapshot $before
if (-not $pinRef) {
  Write-Result @{
    ok = $true
    needed = $false
    submitted = $false
    browser_profile = $BrowserProfile
  }
  exit 0
}

$bstr = [IntPtr]::Zero
$plainPin = $null
try {
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

Start-Sleep -Milliseconds 800
$after = Get-BrowserSnapshot -Profile $BrowserProfile
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
