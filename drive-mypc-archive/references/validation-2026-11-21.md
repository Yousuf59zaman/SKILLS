# Validation — 2026-11-21 (local + remote, sanitized)

Scope: `drive-mypc-archive` skill helper + CODEXENCE 19-Nov path-mirrored publish. No secrets, no private bodies.

## Offline fixture (local only, no Drive upload)

- Fixture root: `%TEMP%\opencode\drive-mypc-fixture\src` with `DemoFolder/hello.txt`, `DemoFolder/Sub/nested.txt`, `lone.txt`.
- Helper: `scripts/Invoke-MyPcArchive.ps1` with `-SourceRoot <fixture>\src`, `-Date 2026-11-21`, `-StagingDir <fixture>\staging`.
- Results:
  - `DemoFolder-2026-11-21.tar.zst` 815 bytes, SHA `72af3dce...254bc76546`; `tar -tf` lists `DemoFolder/`, `hello.txt`, `Sub/nested.txt`, plus `BACKUP-INFO.md/BACKUP-HISTORY.md`.
  - `lone.txt-2026-11-21.tar.zst` 749 bytes, SHA `843e8447...8696e6b3`; `tar -tf` lists `lone.txt` + metadata.
  - Sidecars same-stem, top-level names only, restore steps, proof limits, no private bodies.
  - Second run same Date: `REUSE_LOCAL_ARCHIVE` + `REUSE_SIDECAR` (idempotent, no rebuild).
  - Single-file receipt `destFolder` = parent (folder rule verified).
- Mapping (`ConvertTo-MyPcDrivePath`):
  - `E:\Documents\ChatGPT\Agent-Hub` -> `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Agent-Hub` PASS
  - `E:\Documents\CODEXENCE` -> `My PC (Usuf-Desktop)/E_Drive/Documents/CODEXENCE` PASS
  - `E:\Documents\ChatGPT\Software Business` -> `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Software Business` PASS
  - `E:\Documents\Upwork` -> `My PC (Usuf-Desktop)/E_Drive/Documents/Upwork` PASS
  - `gdrive:OtherDrive/Foo` rejected PASS; `E:\Documents\..\Windows` traversal rejected PASS.
- Script syntax: `ParseFile` 0 errors for helper + `E:\Documents\CODEXENCE\scripts\backup-mypc-archives.ps1`.
