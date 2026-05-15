---
name: openclaw-update-gateway-sync
description: Update OpenClaw to the latest npm release and force-sync the running gateway app version in one workflow. Use when the user asks to "update OpenClaw", "update gateway app", "sync gateway/app version", "fix version mismatch", or wants one-step update + restart + verification on Windows.
---

# OpenClaw Update Gateway Sync

# Workflow

1. Run the bundled script.
2. Stop the gateway service cleanly.
3. Kill any stale listener process still bound to the gateway port.
4. Clear stale npm temp folders that can cause Windows rename lock failures.
5. Update `openclaw` globally to `latest`.
6. Start the gateway service again.
7. Verify the CLI version and the live gateway app version match.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update-openclaw-and-sync-gateway.ps1
```

Optional:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update-openclaw-and-sync-gateway.ps1 -Port 18789
powershell -ExecutionPolicy Bypass -File scripts\update-openclaw-and-sync-gateway.ps1 -SkipUpdate
```

## Verification

After script completion, report:

1. `cli_before` and `cli_after`
2. `gateway_before` and `gateway_after`
3. Whether `version_match` is `true`
4. Whether stale listener PIDs were killed

Use `openclaw status --json` for live gateway version confirmation (`gateway.self.version`).

## Script

`scripts/update-openclaw-and-sync-gateway.ps1`
