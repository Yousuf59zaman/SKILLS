param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [string]$Date = (Get-Date).ToString('yyyy-MM-dd'),
  [Parameter(Mandatory=$true)][string]$StagingDir,
  [string]$SourceRoot = 'E:\Documents',
  [string]$SnapshotSuffix = '',
  [string]$ResumeStem = '',
  [string]$Remote = '',
  [string]$RclonePath = 'E:\Documents\CODEXENCE\scripts\tools\rclone.exe',
  [Alias('Publish')][switch]$Upload,
  [switch]$LocalOnly,
  [switch]$Force
)
# drive-mypc-archive helper: My PC (Usuf-Desktop) ONLY, requested-only, path-mirrored dated pairs.
# No auto schedule, no unsolicited uploads, no config reads, no deletes/sync/move/permission changes.
# Folder source -> pair INSIDE corresponding folder. Single-file source -> pair in corresponding PARENT.
# Every NEW save gets a FRESH stem (date + time + unique suffix + source hash); NOTHING is silently
# reused. An exact frozen pair is resumed ONLY via explicit -ResumeStem bound to its receipt.
$ErrorActionPreference = 'Stop'

if($LocalOnly -and $Upload){ throw 'Pass either -LocalOnly or -Upload/-Publish, never both.' }
if($Force){ Write-Warning 'Force is deprecated and ignored; new saves always use fresh stems, retries use -ResumeStem.' }
if($ResumeStem -and $SnapshotSuffix){ throw 'Pass either -SnapshotSuffix (new save) or -ResumeStem (exact retry), never both.' }
if($Date -notmatch '^\d{4}-\d{2}-\d{2}$'){ throw "Date must be YYYY-MM-DD, got: $Date" }

function Assert-MyPcRemote([string]$remote) {
  if([string]::IsNullOrWhiteSpace($remote)){ throw 'Remote destination is empty' }
  if($remote -notmatch '^gdrive:My PC \(Usuf-Desktop\)/'){ throw 'Remote must start with gdrive:My PC (Usuf-Desktop)/ — anything else is rejected' }
  if($remote -match '(^|/)\.\.(/|$)'){ throw 'Parent traversal rejected in remote path' }
  return $remote
}

function ConvertTo-MyPcDrivePath([string]$localPath) {
  # Generic drive:path routing letter_Drive with capitalization matching existing E_Drive.
  # E:\Documents\ChatGPT\Agent-Hub -> My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Agent-Hub
  if($localPath -notmatch '^([A-Za-z]):[\\/](.*)$'){ throw "LocalPath must be absolute drive path, got: $localPath" }
  $letter = $Matches[1].ToUpperInvariant()
  $rest = $Matches[2] -replace '\\','/'
  $rest = $rest.Trim('/')
  if($rest -match '(^|/)\.\.(/|$)'){ throw 'Parent traversal rejected' }
  $drivePart = "${letter}_Drive"
  $rel = if($rest){ "/$rest" } else { '' }
  $mapped = "My PC (Usuf-Desktop)/${drivePart}${rel}"
  if($mapped -notmatch '^My PC \(Usuf-Desktop\)/[A-Z]_Drive(/|$)'){ throw "Mapped path outside approved My PC root: $mapped" }
  return $mapped
}

function Get-AbsoluteResolved([string]$p) {
  $abs = [IO.Path]::GetFullPath($p)
  $cur = $abs
  $suffix = ''
  while(-not (Test-Path -LiteralPath $cur -PathType Any) -and $cur){
    $suffix = (Split-Path -Leaf $cur) + $(if($suffix){ '\' + $suffix } else { '' })
    $parent = Split-Path -Parent $cur
    if(($parent -eq $cur) -or (-not $parent)){ $cur = ''; break }
    $cur = $parent
  }
  if($cur -and (Test-Path -LiteralPath $cur)){
    $resolved = (Resolve-Path -LiteralPath $cur -ErrorAction Stop).Path
    if($suffix){ return (Join-Path $resolved $suffix) }
    return $resolved
  }
  return $abs
}

function Test-Within([string]$child, [string]$parent) {
  if($child -eq $parent){ return $true }
  return $child.StartsWith($parent + '\', [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-RemoteFileInfo([string]$rclone, [string]$remoteFile, [string]$expectLeaf) {
  # Exact single-file stat via lsjson --hash. Returns $null when absent.
  # Anything unexpected (a directory at that path, unparseable output, other errors) throws: fail closed.
  $out = & $rclone lsjson $remoteFile --hash --log-level ERROR 2>&1
  if($LASTEXITCODE -ne 0){
    $msg = ($out | Out-String)
    if($msg -match '(?i)(directory not found|object not found|couldn.t find|not found)'){
      return $null
    }
    throw "RCLONE_LSJSON_FAILED ${remoteFile}: $msg"
  }
  $json = ($out | Out-String)
  try { $items = $json | ConvertFrom-Json } catch { throw "RCLONE_LSJSON_PARSE_FAILED ${remoteFile}" }
  if($null -eq $items){ return $null }
  $arr = @($items)
  if($arr.Count -eq 0){ return $null }
  if(($arr.Count -eq 1) -and ($arr[0].IsDir -ne $true) -and ($arr[0].Name -eq $expectLeaf)){
    $md5 = $arr[0].Hashes.MD5
    if([string]::IsNullOrWhiteSpace($md5)){ throw "REMOTE_HASH_UNAVAILABLE ${remoteFile}: fail closed" }
    return @{ Size = [int64]$arr[0].Size; MD5 = ($md5.ToString().ToLowerInvariant()) }
  }
  throw "REMOTE_TYPE_CONFLICT ${remoteFile}: expected absent or exactly one file, refusing to overwrite"
}

$tar = 'C:\Windows\System32\tar.exe'

# Canonical source + destination (computed from path; a manual -Remote must match or it fails).
$src = (Resolve-Path -LiteralPath $SourcePath -ErrorAction Stop).Path
$isDir = (Get-Item -LiteralPath $src).PSIsContainer
$mapped = ConvertTo-MyPcDrivePath $src
if($isDir){
  $destFolder = "gdrive:$mapped"
} else {
  $mappedParent = ConvertTo-MyPcDrivePath (Split-Path -Parent $src)
  $destFolder = "gdrive:$mappedParent"
}
if($Remote -and ($Remote -ne $destFolder)){ throw "Remote mismatch: computed $destFolder. Manual -Remote is unnecessary; the owner request already authorizes the computed My-PC path." }
Assert-MyPcRemote $destFolder | Out-Null

# Refuse staging inside source (or source inside staging, or staging inside the tar base) BEFORE creating anything.
$stageAbs = Get-AbsoluteResolved $StagingDir
if(Test-Within $stageAbs $src){ throw "Refusing staging inside source: $StagingDir is under $src" }
if(Test-Within $src $stageAbs){ throw "Refusing source inside staging: $src is under $StagingDir" }
$srcRootResolved = $null
try { $srcRootResolved = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path } catch { $srcRootResolved = $null }
if($srcRootResolved -and ($src -eq $srcRootResolved -or $src.StartsWith($srcRootResolved + '\', [System.StringComparison]::OrdinalIgnoreCase))){
  $tarBase = $srcRootResolved
  $rel = if($src -eq $srcRootResolved){ '' } else { $src.Substring($srcRootResolved.Length + 1) -replace '\\','/' }
  if(-not $rel){
    $tarBase = Split-Path -Parent $srcRootResolved
    $rel = Split-Path -Leaf $srcRootResolved
  }
} else {
  $tarBase = Split-Path -Parent $src
  $rel = Split-Path -Leaf $src
}
$tarBaseAbs = Get-AbsoluteResolved $tarBase
if(Test-Within $stageAbs $tarBaseAbs){ throw "Refusing staging inside tar base: $StagingDir is under $tarBase" }

$baseRaw = (Get-Item -LiteralPath $src).Name
if([string]::IsNullOrWhiteSpace($baseRaw)){ $baseRaw = 'archive' }
$baseSafe = ($baseRaw -replace '[\\/:*?"<>|]','_').Trim()
if(-not $baseSafe){ $baseSafe = 'archive' }

if($ResumeStem){
  # ---- Explicit resume of an exact frozen pair. No rebuild, no silent reuse. ----
  $stem = $ResumeStem
  $receiptPath = Join-Path $StagingDir "$stem-receipt.json"
  if(-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)){ throw "Resume receipt not found (staging untouched): $receiptPath" }
  $rc = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  if($rc.stem -ne $stem){ throw "Receipt stem binding mismatch for $stem" }
  $rcSrcCanon = (Resolve-Path -LiteralPath $rc.source -ErrorAction Stop).Path
  if($rcSrcCanon -ne $src){ throw "Receipt source binding mismatch: receipt=$($rc.source) current=$src" }
  if($rc.destFolder -ne $destFolder){ throw "Receipt destination binding mismatch: receipt=$($rc.destFolder) current=$destFolder" }
  $archiveName = $rc.archive
  $sidecarName = $rc.sidecar
  $archivePath = Join-Path $StagingDir $archiveName
  $sidecarPath = Join-Path $StagingDir $sidecarName
  if(-not (Test-Path -LiteralPath $archivePath -PathType Leaf)){ throw "Resumed archive file missing: $archivePath" }
  if(-not (Test-Path -LiteralPath $sidecarPath -PathType Leaf)){ throw "Resumed sidecar file missing: $sidecarPath" }
  $shaCheck = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  if($shaCheck -ne $rc.sha256){ throw "Resumed archive checksum mismatch for $stem; refusing stale pair" }
  $sideText = Get-Content -LiteralPath $sidecarPath -Raw
  if($sideText -notmatch [regex]::Escape($rc.sha256)){ throw "Resumed sidecar checksum mismatch for $stem; refusing stale pair" }
  $sha = $rc.sha256
  $md5 = $rc.md5
  $bytes = [int64]$rc.bytes
  $localMd5 = (Get-FileHash -Algorithm MD5 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  if($localMd5 -ne $md5){ throw "Resumed archive MD5 mismatch for $stem; refusing stale pair" }
  $sideMd5 = (Get-FileHash -Algorithm MD5 -LiteralPath $sidecarPath).Hash.ToLowerInvariant()
  Write-Output "RESUMED_FROZEN_PAIR $stem"
} else {
  # ---- Brand-new save: always a FRESH stem. Never reuse an existing pair. ----
  if($SnapshotSuffix){
    $sfx = ($SnapshotSuffix -replace '[\\/:*?"<>|\s]+','-').Trim('-')
    if(-not $sfx){ throw 'SnapshotSuffix is empty after sanitizing' }
    if($sfx.Length -gt 40){ throw 'SnapshotSuffix too long (max 40 chars)' }
    $stem = "${baseSafe}-${Date}-${sfx}"
  } else {
    $time = (Get-Date).ToString('HHmmss')
    $rand = -join ((1..4) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hb = $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($src.ToLowerInvariant()))
    } finally { $hasher.Dispose() }
    $h6 = -join ($hb[0..2] | ForEach-Object { '{0:x2}' -f $_ })
    $stem = "${baseSafe}-${Date}-${time}-${rand}-${h6}"
  }
  $archiveName = "${stem}.tar.zst"
  $sidecarName = "${stem}.md"
  $receiptPath = Join-Path $StagingDir "$stem-receipt.json"
  $archivePath = Join-Path $StagingDir $archiveName
  $sidecarPath = Join-Path $StagingDir $sidecarName
  $partialPath = Join-Path $StagingDir "${stem}.partial.tar.zst"
  if((Test-Path -LiteralPath $receiptPath) -or (Test-Path -LiteralPath $archivePath -PathType Leaf) -or (Test-Path -LiteralPath $sidecarPath -PathType Leaf)){
    throw "PAIR_EXISTS $stem with different or same contents: dated pairs are immutable — use -ResumeStem $stem for the exact frozen pair or a new -SnapshotSuffix for new contents"
  }

  New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null
  if(Test-Path -LiteralPath $partialPath){ throw "Partial archive from earlier run; inspect before retry: $partialPath" }

  # Immediate child reparse points (junctions/symlinked dirs) are excluded to avoid duplicate traversal.
  # This reproduces the previously explicit unified-root alias exclusions generically.
  $excludes = @()
  if($isDir){
    Get-ChildItem -LiteralPath $src -Directory -Force | Where-Object {
      ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    } | ForEach-Object { $excludes += $_.Name }
  }

  $metaDir = Join-Path $StagingDir "_meta_$stem"
  New-Item -ItemType Directory -Path $metaDir -Force | Out-Null
  $metaSub = Join-Path $metaDir '_ARCHIVE_META'
  New-Item -ItemType Directory -Path $metaSub -Force | Out-Null
  @(
    '# Dated backup information (My PC mirror)',
    '',
    "- Snapshot stem: $stem",
    "- Snapshot date: $Date",
    "- Created: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) Asia/Dhaka (PC local clock)",
    "- Original path: $src",
    "- Mapped Drive path: $mapped",
    "- Mirrored destination folder: $destFolder",
    '- Compression: bsdtar tar.zst (Zstandard), no password, not client-side encrypted',
    '- Backup style: full live-source snapshot, not atomic image; ACLs/locks/VSS not guaranteed',
    "- Excluded child reparse points: $(if($excludes.Count){ $excludes -join ', ' } else { 'none' })",
    '- Metadata lives under _ARCHIVE_META/ so a backed-up file named BACKUP-INFO.md can never collide.',
    '- How to verify: tar -tf ARCHIVE.tar.zst; compare SHA-256 to sidecar',
    '- How to restore: tar -xf ARCHIVE.tar.zst -C NEW_EMPTY_DIRECTORY; compare before any selective copy',
    '- Privacy: owner-only My PC (Usuf-Desktop); archive NOT encrypted; never share without review'
  ) | Set-Content -LiteralPath (Join-Path $metaSub 'BACKUP-INFO.md') -Encoding UTF8
  @('# Backup history (scoped)', '', "- $stem : archive $archiveName created from $src") | Set-Content -LiteralPath (Join-Path $metaSub 'BACKUP-HISTORY.md') -Encoding UTF8

  $tarArgs = @('-a','-cf',$partialPath)
  foreach($ex in $excludes){ $tarArgs += @('--exclude', "$rel/$ex") }
  $tarArgs += @('-C',$tarBase,$rel,'-C',$metaDir,'_ARCHIVE_META/BACKUP-INFO.md','_ARCHIVE_META/BACKUP-HISTORY.md')
  & $tar @tarArgs 2>&1 | Out-File -LiteralPath (Join-Path $StagingDir "$stem-tar.log") -Encoding UTF8
  if($LASTEXITCODE -ne 0){ throw "TAR_CREATE_FAILED exit=$LASTEXITCODE" }
  & $tar -tf $partialPath '_ARCHIVE_META/BACKUP-INFO.md' '_ARCHIVE_META/BACKUP-HISTORY.md' 2>&1 | Out-Null
  if($LASTEXITCODE -ne 0){ throw 'TAR_META_FILES_MISSING' }
  if(Test-Path -LiteralPath $archivePath -PathType Leaf){ throw "PAIR_EXISTS race: $archivePath appeared during build; refusing overwrite" }
  Move-Item -LiteralPath $partialPath -Destination $archivePath -ErrorAction Stop
  Write-Output "CREATED_LOCAL_ARCHIVE $archiveName"

  $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  $md5 = (Get-FileHash -Algorithm MD5 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  $bytes = (Get-Item -LiteralPath $archivePath).Length

  # Member inventory is derived from the ACTUAL FINAL tar, never from the loose source dir.
  $membersFile = Join-Path $StagingDir "$stem-members.txt"
  & $tar -tf $archivePath 2>&1 | Out-File -LiteralPath $membersFile -Encoding UTF8
  if($LASTEXITCODE -ne 0){ throw "TAR_LIST_FAILED exit=$LASTEXITCODE" }
  $members = Get-Content -LiteralPath $membersFile
  $tarEntries = @($members).Count
  $prefix = "$rel/"
  $kids = @{}
  if(-not $isDir){
    if(@($members) -contains $rel){ $kids[$rel] = $true }
    else { throw "TAR_MEMBER_MISSING: single source file $rel not found in final archive" }
  } else {
    foreach($m in $members){
      $line = $m -replace '/+$',''
      if(($line -eq '_ARCHIVE_META') -or ($line -like '_ARCHIVE_META/*')){ continue }
      if($rel -and -not $line.StartsWith($prefix, [System.StringComparison]::Ordinal)){ continue }
      $rest2 = if($rel){ $line.Substring($prefix.Length) } else { $line }
      if(-not $rest2){ continue }
      $first = ($rest2 -split '/')[0]
      if($first){ $kids[$first] = $true }
    }
  }
  $kidLines = @($kids.Keys | Sort-Object | Select-Object -First 100 | ForEach-Object { "- $_" })
  if(-not $kidLines){ $kidLines = @('- (empty)') }

  if(Test-Path -LiteralPath $sidecarPath -PathType Leaf){ throw "PAIR_EXISTS race: $sidecarPath appeared during build; refusing overwrite" }
  $kindLine = if($isDir){ "Folder source: pair lives INSIDE the corresponding folder." } else { "Single-file source: pair lives in the corresponding PARENT folder." }
  $memberLine = if($isDir){ "Archive contains the full live-source tree under $rel/ plus _ARCHIVE_META/." } else { "Archive contains the single file $rel plus _ARCHIVE_META/." }
  @(
    "# $stem — path-mirrored archive sidecar",
    '',
    "Snapshot stem: $stem",
    "Snapshot date: $Date",
    "Archive file: $archiveName",
    "Original path: $src",
    "Mapped source path: $mapped",
    "Mirrored destination folder: $destFolder",
    $kindLine,
    "Mirrored Drive archive: $destFolder/$archiveName",
    "Mirrored Drive sidecar: $destFolder/$sidecarName",
    "Size: $bytes bytes",
    "SHA-256: $sha",
    "MD5: $md5",
    "Tar entries (actual final archive): $tarEntries",
    'Format: bsdtar tar.zst (Zstandard), no password, not client-side encrypted',
    '',
    '## Archive/member layout',
    '',
    "- $memberLine",
    '- _ARCHIVE_META/BACKUP-INFO.md at archive root (frozen creation note)',
    '- _ARCHIVE_META/BACKUP-HISTORY.md at archive root (frozen dated timeline)',
    "- Excluded child reparse points: $(if($excludes.Count){ $excludes -join ', ' } else { 'none' })",
    '',
    '## Useful immediate contents (from the final tar, safe general structure only, names only)',
    '',
    ($kidLines -join "`n"),
    '',
    'No per-file private bodies listed here. Full list via `tar -tf ARCHIVE.tar.zst` only on owner PC.',
    '',
    '## Restore instructions (never over originals)',
    '',
    '1. Verify SHA-256 against hash above.',
    '2. Create a NEW empty directory.',
    "3. Run: tar -xf $archiveName -C NEW_EMPTY_DIRECTORY",
    '4. Compare selectively; never blind-overwrite live sources.',
    '',
    '## Proof limits',
    '',
    '- PROVEN here: local tar metadata list + SHA-256/MD5. Remote upload/check must be recorded separately per copy.',
    '- NOT PROVEN: current liveness, full extract compare (unless separately receipted), production readiness.',
    '',
    'Privacy: owner-only My PC (Usuf-Desktop); archive NOT encrypted. No secrets in this sidecar.',
    'Destination enforced inside approved root My PC (Usuf-Desktop); anything else is rejected.',
    "Resume this exact frozen pair with: -ResumeStem $stem"
  ) | Set-Content -LiteralPath $sidecarPath -Encoding UTF8
  Write-Output "CREATED_SIDECAR $sidecarName"

  # Receipt is written LAST, only after the pair is fully built and verified — never prematurely.
  if(Test-Path -LiteralPath $receiptPath){ throw "PAIR_EXISTS race: $receiptPath appeared during build; refusing overwrite" }
  [ordered]@{
    stem = $stem; date = $Date; source = $src; sourceRoot = $srcRootResolved; mapped = $mapped
    destFolder = $destFolder; destArchive = "$destFolder/$archiveName"; destSidecar = "$destFolder/$sidecarName"
    archive = $archiveName; sidecar = $sidecarName; bytes = $bytes; sha256 = $sha; md5 = $md5
    tarEntries = $tarEntries; exclusions = @($excludes); tool = 'Invoke-MyPcArchive.ps1'
    createdAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
  $sideMd5 = (Get-FileHash -Algorithm MD5 -LiteralPath $sidecarPath).Hash.ToLowerInvariant()
}

$destArchive = "$destFolder/$archiveName"
$destSidecar = "$destFolder/$sidecarName"

if($Upload){
  if(-not (Test-Path -LiteralPath $RclonePath)){ throw "rclone not found at $RclonePath" }
  # Preflight BOTH exact names BEFORE writing either. Any collision fails closed.
  $preA = Get-RemoteFileInfo $RclonePath $destArchive $archiveName
  $preS = Get-RemoteFileInfo $RclonePath $destSidecar $sidecarName
  $needA = $true
  $needS = $true
  if($null -ne $preA){
    if(($preA.Size -eq $bytes) -and ($preA.MD5 -eq $md5)){ $needA = $false; Write-Output "REMOTE_REUSE_ARCHIVE $archiveName" }
    else { throw "REMOTE_COLLISION ${destArchive}: same name, different size/checksum — refusing overwrite" }
  }
  if($null -ne $preS){
    if(($preS.Size -eq (Get-Item -LiteralPath $sidecarPath).Length) -and ($preS.MD5 -eq $sideMd5)){ $needS = $false; Write-Output "REMOTE_REUSE_SIDECAR $sidecarName" }
    else { throw "REMOTE_COLLISION ${destSidecar}: same name, different size/checksum — refusing overwrite" }
  }
  if($needA){
    & $RclonePath copyto $archivePath $destArchive --immutable --checksum --log-level NOTICE --retries 4 --low-level-retries 10
    if($LASTEXITCODE -ne 0){ throw "RCLONE_UPLOAD_ARCHIVE_FAILED" }
  }
  if($needS){
    & $RclonePath copyto $sidecarPath $destSidecar --immutable --checksum --log-level NOTICE --retries 4 --low-level-retries 10
    if($LASTEXITCODE -ne 0){ throw "RCLONE_UPLOAD_SIDECAR_FAILED" }
  }
  # Exact stat/hash validation of BOTH (no wildcards).
  $postA = Get-RemoteFileInfo $RclonePath $destArchive $archiveName
  $postS = Get-RemoteFileInfo $RclonePath $destSidecar $sidecarName
  if(($null -eq $postA) -or ($postA.Size -ne $bytes) -or ($postA.MD5 -ne $md5)){ throw "REMOTE_VALIDATE_ARCHIVE_FAILED $destArchive" }
  if(($null -eq $postS) -or ($postS.Size -ne (Get-Item -LiteralPath $sidecarPath).Length) -or ($postS.MD5 -ne $sideMd5)){ throw "REMOTE_VALIDATE_SIDECAR_FAILED $destSidecar" }
  [ordered]@{
    stem = $stem; destArchive = $destArchive; destSidecar = $destSidecar
    archive = @{ size = $bytes; md5 = $md5 }; sidecar = @{ size = (Get-Item -LiteralPath $sidecarPath).Length; md5 = $sideMd5 }
    result = 'UPLOAD_VERIFIED'; checkedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $StagingDir "$stem-upload.json") -Encoding UTF8
  Write-Output "UPLOAD_VERIFIED_PAIR $archiveName + $sidecarName"
} else {
  Write-Output "LOCAL_ONLY (staged frozen pair $stem; publish later with -ResumeStem $stem -Upload)"
}
