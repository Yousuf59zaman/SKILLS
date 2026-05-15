---
name: openclaw-browser-blocker-recovery
description: Recover OpenClaw browser tool outages on Windows caused by stale browser refs and gateway device-store rename crashes. Use when logs show "Can't reach the OpenClaw browser control service", repeated Element "e*" not found or selector errors, "parse/handle error ... EPERM ... rename ... .openclaw\\devices\\*.tmp to *.json", or "gateway closed (1000)" after browser actions.
---

# OpenClaw Browser Blocker Recovery

## Overview

Apply deterministic recovery for OpenClaw browser/gateway instability on Windows. Clean device pairing temp files, move CDP port, patch runtime rename retry behavior, restart services, and run browser smoke tests.

## Workflow

1. Confirm current symptom and health.
2. Run the bundled recovery script.
3. Validate gateway/browser status and browser tool actions.
4. Report residual risks and whether runtime patches were applied.

## Run Recovery

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\reapply-openclaw-browser-recovery.ps1
```

Optional flags:

- `-CdpPort 18801` (default `18801`)
- `-BrowserProfile openclaw` (default `openclaw`)
- `-SkipRuntimePatch` to skip JS runtime patching
- `-SkipBrowserStart` to skip browser launch/smoke test

## Validate

Check:

- `openclaw gateway status --json` shows `rpc.ok: true`
- `openclaw browser status --json` shows `running: true` and `cdpReady: true`
- Browser CLI flow succeeds:
  - `openclaw browser --json open https://example.com`
  - `openclaw browser --json snapshot --efficient --limit 120`
  - `openclaw browser --json click <fresh-ref>`

If stale refs still fail, always take a fresh snapshot after navigation before clicking refs.

## Files Patched by Script

The script patches rename retry behavior in installed OpenClaw runtime files when needed:

- `dist/daemon-cli.js`
- `dist/pairing-token-Byh6drgn.js`
- `dist/pairing-token-DGufCZxz.js`
- `dist/skill-commands-Bkz9y-UT.js`
- `dist/skill-commands-D-jjc5h0.js`
- `dist/plugin-sdk/skill-commands-S7ihcbBn.js`

Backups are written as `*.bak-codex`.

## Resources

- `scripts/reapply-openclaw-browser-recovery.ps1`
- `references/signals-and-verification.md`
