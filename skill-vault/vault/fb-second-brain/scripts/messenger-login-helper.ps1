[CmdletBinding()]
param(
  [ValidateSet('Status', 'Login')]
  [string]$Action = 'Status',

  [ValidateSet('openclaw', 'openclaw2')]
  [string]$BrowserProfile = 'openclaw',

  [string]$TargetId,

  [string]$SecretPath = 'C:\Users\User\.openclaw\secrets\messenger-login.dpapi.json'
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

function Test-TwoFactor {
  param($Snapshot)
  # Messenger conversations are untrusted page content.  A chat message that
  # mentions a "security code" must never be mistaken for a login challenge.
  if (Test-MessengerLocation -Snapshot $Snapshot) { return $false }
  $visibleState = $Snapshot | ConvertTo-Json -Depth 20 -Compress
  return $visibleState -match '(?i)(two[- ]?(factor|step)|2[- ]?step|authentication code|login code|security code|enter (the )?code|check your notifications|approve (this|the) login|code generator|we sent (a )?code)'
}

function Test-LoginError {
  param($Snapshot)
  # Only inspect a non-Messenger login surface for login errors.  Conversation
  # text is not trusted control state.
  if (Test-MessengerLocation -Snapshot $Snapshot) { return $false }
  $visibleState = $Snapshot | ConvertTo-Json -Depth 20 -Compress
  return $visibleState -match '(?i)(incorrect password|password.{0,30}incorrect|invalid password|couldn.t log you in|login error|try again later)'
}

function Test-AuthenticatedMessenger {
  param($Snapshot)
  if (-not (Test-MessengerLocation -Snapshot $Snapshot)) { return $false }
  $searchRef = Find-Ref -Snapshot $Snapshot -RolePattern '(?i)(textbox|combobox)' -NamePattern '(?i)Search Messenger'
  $composerRef = Find-Ref -Snapshot $Snapshot -RolePattern '(?i)textbox' -NamePattern '(?i)^Write to '
  return [bool]($searchRef -or $composerRef)
}

function Get-StableMessengerSnapshot {
  param([string]$Profile)
  $last = $null
  for ($attempt = 1; $attempt -le 6; $attempt++) {
    $last = Get-BrowserSnapshot -Profile $Profile
    $emailRef = Find-Ref -Snapshot $last -RolePattern '(?i)textbox' -NamePattern '(?i)(email|phone|mobile number)'
    $passwordRef = Find-Ref -Snapshot $last -RolePattern '(?i)textbox' -NamePattern '(?i)password'
    if ((Test-TwoFactor -Snapshot $last) -or ($emailRef -and $passwordRef) -or (Test-AuthenticatedMessenger -Snapshot $last)) {
      return $last
    }
    if ($attempt -lt 6) { Start-Sleep -Seconds 1 }
  }
  return $last
}

function Convert-SecureValue {
  param([string]$Encrypted)
  try {
    return ConvertTo-SecureString $Encrypted
  } catch {
    throw 'Messenger login credential cannot be decrypted in this execution context.'
  }
}

function Read-SecureCredentialStore {
  if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
    throw 'Messenger login credentials are not installed in the local encrypted store.'
  }
  $store = Get-Content -Raw -LiteralPath $SecretPath | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($store.email_dpapi) -or [string]::IsNullOrWhiteSpace($store.password_dpapi)) {
    throw 'Messenger login credential store is incomplete.'
  }
  return [pscustomobject]@{
    Email = Convert-SecureValue -Encrypted $store.email_dpapi
    Password = Convert-SecureValue -Encrypted $store.password_dpapi
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
    Focus-BrowserTarget -Profile $BrowserProfile
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

$before = Get-StableMessengerSnapshot -Profile $BrowserProfile
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
  if (-not (Test-AuthenticatedMessenger -Snapshot $before)) {
    throw 'Messenger page or authenticated session could not be verified safely.'
  }
  Write-Result @{
    ok = $true
    status = 'already_logged_in'
    already_logged_in = $true
    login_attempted = $false
    credential_required = $false
    two_factor_required = $false
    browser_profile = $BrowserProfile
  }
  exit 0
}

if (-not $emailRef -or -not $passwordRef -or -not (Test-MessengerLocation -Snapshot $before)) {
  throw 'Messenger login form is incomplete, ambiguous, or outside Messenger; queue processing must stop safely.'
}

$credential = Read-SecureCredentialStore
if ($Action -eq 'Status') {
  Write-Result @{
    ok = $true
    status = 'login_required_credentials_ready'
    installed = $true
    decryptable = $true
    credential_required = $true
    browser_profile = $BrowserProfile
  }
  exit 0
}

Invoke-SecureType -SecureValue $credential.Email -Ref $emailRef -Submit $false
Invoke-SecureType -SecureValue $credential.Password -Ref $passwordRef -Submit $true

Start-Sleep -Seconds 4
$after = Get-StableMessengerSnapshot -Profile $BrowserProfile
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
if (-not (Test-AuthenticatedMessenger -Snapshot $after)) {
  if (Test-LoginError -Snapshot $after) {
    throw 'Messenger login failed with the encrypted local credential; queue processing must stop safely.'
  }
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
