---
name: drive-mypc-archive
description: "Requested-only private archive backups to My PC (Usuf-Desktop) ONLY via letter_Drive mirrored tar.zst + same-stem .md pairs. Use when Yousuf asks to save, back up, archive, mirror, or publish a file/folder to My PC (Usuf-Desktop) Drive. Never other Drives/Shared Drives, no auto schedule, no unsolicited uploads, no config/credential access, no deletes/sync/permission changes."
---

# Drive MyPC Archive (My PC Usuf-Desktop ONLY)

Requested-only helper for owner-private dated immutable archive pairs under `My PC (Usuf-Desktop)` only.

## When to use

- Yousuf explicitly asks to save/back up/archive/mirror a local file or folder to `My PC (Usuf-Desktop)` Drive.
- Do NOT use for other Drives, Shared Drives, public sharing, scheduled/automatic backups, or unrelated cloud tasks.

## Hard boundaries

- Destination root fixed: `gdrive:My PC (Usuf-Desktop)/` ONLY. Reject any other remote. A local folder literally named `Shared` is fine; only non-My-PC remotes are rejected.
- No automatic background schedule, no unsolicited uploads, no `rclone config` reads/prints, no secrets in logs/sidecars.
- No deletes, no `sync`, no `move`, no permission changes, no account changes. Exact `copyto --immutable --checksum` + exact stat/hash validation only.
- Dated pairs never overwrite: every NEW save gets a FRESH stem (`<SafeBase>-<Date>-<HHmmss>-<rand>-<srchash>`, or explicit `-SnapshotSuffix`); an exact frozen pair is resumed ONLY via explicit `-ResumeStem` bound to its receipt (source + destination + checksum). Same stem + different hash = fail closed. `-LocalOnly` and `-Upload`/`-Publish` together fail before any action.
- Staging must be disjoint from the source and from the tar base (refused before anything is created).
- Immediate child reparse points (junctions/symlink dirs) are auto-excluded from the tar and recorded; metadata lives under `_ARCHIVE_META/` so a backed-up `BACKUP-INFO.md` can never collide.
- Sidecars list safe general structure only, derived from the FINAL tar (never from the loose dir): top-level names, entry count, sizes, hashes, restore steps. Never paste private bodies, credentials, mail, IDs, or full recursive private listings.
- Remote preflight checks BOTH exact file names (size+MD5) BEFORE writing either; collision fails with nothing written; equality reuses as no-op; after copy BOTH are stat/hash-validated exactly (no wildcards). Missing destination folders are created by the copy; any other remote error fails closed.
- Explicit owner request for a backup under My PC already authorizes that save; the helper computes the canonical remote from the path, no manual `-Remote` needed (a supplied one must match or it fails).

## Routing convention (letter_Drive, capitalization matches existing E_Drive)

- Local `E:\Documents\ChatGPT\Agent-Hub` -> Drive `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Agent-Hub`.
- Generic: `<L>:\a\b` -> `My PC (Usuf-Desktop)/<L>_Drive/a/b` with `<L>` uppercased and literal `_Drive` (capital D), slashes forward.
- Folder source: mirrored `.tar.zst + .md` pair goes INSIDE the corresponding folder.
- Single-file source: mirrored pair goes in the corresponding PARENT folder (sidecar states the parent folder and the single archived file explicitly).
- Fresh dated stems: `<SafeBase>-<Date>-<HHmmss>-<rand>-<srchash>` (or `<SafeBase>-<Date>-<SnapshotSuffix>` when given). Resume an exact frozen pair with `-ResumeStem <stem>`; never hand-edit a pair.

See `references/routing.md` for mapping table and CODEXENCE 19-Nov-2026 worked example.

## Procedure (explicit request only)

1. Resolve local source; helper computes the canonical mapping and mirrored folder. Disjointness is enforced before anything is created.
2. `rclone lsjson` exact-name preflight happens inside the helper (size+MD5, before writing either).
3. Stage first (always a fresh frozen pair, local only):
   `pwsh -NoProfile -File scripts/Invoke-MyPcArchive.ps1 -SourcePath 'E:\...' -StagingDir 'D:\...\...' -SourceRoot 'E:\Documents' -LocalOnly`
   Inspect `<stem>-receipt.json`, `<stem>-members.txt`, archive SHA-256/MD5, sidecar top listing (from the final tar).
4. Only when Yousuf explicitly approves publish for those exact stems, upload them:
   `pwsh -NoProfile -File scripts/Invoke-MyPcArchive.ps1 -SourcePath 'E:\...' -StagingDir 'D:\...\...' -ResumeStem '<stem>' -Upload`
   Helper preflights BOTH exact remote names (size+MD5) before writing either, copies with `--immutable --checksum`, then exactly validates BOTH. A `<stem>-upload.json` is written only after validation.
5. Record sanitized result (paths, stems, sizes, hashes, Drive IDs/URLs when available); never expose rclone config or credentials.

## Helper

- `scripts/Invoke-MyPcArchive.ps1` — tested reusable entrypoint (fresh timestamp stems, explicit `-ResumeStem` frozen-pair retry, folder-vs-parent destination, tar.zst + tar-derived sidecar, junction excludes, exact preflight + `--immutable --checksum` upload + exact validation).

## Validation

- Offline fixture mapping + archive/sidecar end-to-end proven (local only, mock rclone, no Drive writes); corrected 2026-11-21 for silent-reuse/overwrite/staging/junction/inventory defects, re-validated offline.
- CODEXENCE 19-Nov-2026 remote 4 pairs verified: Archive_Backups source `check` 4/4 PASS vs local staging; E_Drive mirrored `check` 4/4 archives + 4/4 sidecars PASS; sizes match manifest; folder/file IDs captured for review. See CODEXENCE CURRENT/handoff for receipts.
- Legacy date-pinned runner `E:\Documents\CODEXENCE\scripts\backup-archives-to-gdrive.ps1` remains historical for completed 2026-11-19 only; new saves must use this skill/helper.

## CODEXENCE normal entrypoint

- New normal: this skill + helper. Legacy 19-Nov runner is historical-only, not for new dates.
- Keep original Nov-19 readback/recovery docs intact (`Reports/ARCHIVE-BACKUP-AND-RESTORE.md`, `D:\.../ARCHIVE-STATUS.json`, `BACKUP-HISTORY.md`, `_receipts/`).
