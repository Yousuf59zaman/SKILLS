[CmdletBinding()]
param(
  [ValidateSet('Status', 'Login')]
  [string]$Action = 'Status',

  [ValidateSet('openclaw', 'openclaw2')]
  [string]$BrowserProfile = 'openclaw',

  [string]$SecretPath = 'C:\Users\User\.openclaw\secrets\messenger-login.dpapi.json'
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

function Find-Ref {
  param(
    $Snapshot,
    [string]$RolePattern,
    [string]$NamePattern
  )
  if (-not $Snapshot.refs) { return $null }
  foreach ($property in $Snapshot.refs.PSObject.Properties) {
    $value = $property.Value
    if ([string]$value.role -match $RolePattern -and [string]$value.name -match $NamePattern) {
      return $property.Name
    }
  }
  return $null
}

function Test-TwoFactor {
  param($Snapshot)
  $visibleState = $Snapshot | ConvertTo-Json -Depth 20 -Compress
  return $visibleState -match '(?i)(two[- ]?(factor|step)|2[- ]?step|authentication code|login code|security code|enter (the )?code|check your notifications|approve (this|the) login|code generator|we sent (a )?code)'
}

function Test-LoginError {
  param($Snapshot)
  $visibleState = $Snapshot | ConvertTo-Json -Depth 20 -Compress
  return $visibleState -match '(?i)(incorrect password|password.{0,30}incorrect|invalid password|couldn.t log you in|login error|try again later)'
}

function Convert-SecureValue {
  param([string]$Encrypted)
  try {
    return ConvertTo-SecureString $Encrypted
  } catch {
    throw 'Messenger login credential cannot be decrypted by the current Windows user.'
  }
}

function Invoke-SecureType {
  param(
    [System.Security.SecureString]$SecureValue,
    [string]$Ref,
    [bool]$Submit
  )
  $bstr = [IntPtr]::Zero
  $plainValue = $null
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ($Submit) {
      & openclaw browser --json --browser-profile $BrowserProfile type $Ref $plainValue --submit 2>&1 | Out-Null
    } else {
      & openclaw browser --json --browser-profile $BrowserProfile type $Ref $plainValue 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) {
      throw 'The visible browser rejected a stored Messenger login credential field.'
    }
  } finally {
    $plainValue = $null
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
  throw 'Messenger login credentials are not installed in the local encrypted store.'
}

$store = Get-Content -Raw -LiteralPath $SecretPath | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($store.email_dpapi) -or [string]::IsNullOrWhiteSpace($store.password_dpapi)) {
  throw 'Messenger login credential store is incomplete.'
}

$secureEmail = Convert-SecureValue -Encrypted $store.email_dpapi
$securePassword = Convert-SecureValue -Encrypted $store.password_dpapi

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
if (Test-TwoFactor -Snapshot $before) {
  Write-Result @{
    ok = $false
    status = 'two_factor_required'
    two_factor_required = $true
    notify_yousuf = $true
    browser_profile = $BrowserProfile
  }
  exit 2
}

$emailRef = Find-Ref -Snapshot $before -RolePattern '(?i)textbox' -NamePattern '(?i)(email|phone|mobile number)'
$passwordRef = Find-Ref -Snapshot $before -RolePattern '(?i)textbox' -NamePattern '(?i)password'

if (-not $emailRef -and -not $passwordRef) {
  Write-Result @{
    ok = $true
    status = 'already_logged_in'
    already_logged_in = $true
    login_attempted = $false
    two_factor_required = $false
    browser_profile = $BrowserProfile
  }
  exit 0
}

if (-not $emailRef -or -not $passwordRef) {
  throw 'Messenger login form is incomplete or ambiguous; queue processing must stop safely.'
}

Invoke-SecureType -SecureValue $secureEmail -Ref $emailRef -Submit $false
Invoke-SecureType -SecureValue $securePassword -Ref $passwordRef -Submit $true

Start-Sleep -Seconds 4
$after = Get-BrowserSnapshot -Profile $BrowserProfile

if (Test-TwoFactor -Snapshot $after) {
  Write-Result @{
    ok = $false
    status = 'two_factor_required'
    two_factor_required = $true
    notify_yousuf = $true
    login_attempted = $true
    browser_profile = $BrowserProfile
  }
  exit 2
}

if (Test-LoginError -Snapshot $after) {
  throw 'Messenger login failed with the encrypted local credential; queue processing must stop safely.'
}

$remainingEmail = Find-Ref -Snapshot $after -RolePattern '(?i)textbox' -NamePattern '(?i)(email|phone|mobile number)'
$remainingPassword = Find-Ref -Snapshot $after -RolePattern '(?i)textbox' -NamePattern '(?i)password'
if ($remainingEmail -or $remainingPassword) {
  throw 'Messenger login was not verified after encrypted credential submission.'
}

Write-Result @{
  ok = $true
  status = 'login_verified'
  already_logged_in = $false
  login_attempted = $true
  login_verified = $true
  two_factor_required = $false
  browser_profile = $BrowserProfile
}
