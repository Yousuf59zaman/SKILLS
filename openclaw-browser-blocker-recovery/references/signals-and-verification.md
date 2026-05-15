# Signals and Verification

## Primary Failure Signals

- `[tools] browser failed: Can't reach the OpenClaw browser control service`
- `Error: Element "e*" not found or not visible`
- `Error: Selector "e*" matched N elements`
- `parse/handle error: Error: EPERM: operation not permitted, rename ...\.openclaw\devices\pending.json*.tmp -> pending.json`
- `parse/handle error: Error: EPERM: operation not permitted, rename ...\.openclaw\devices\paired.json*.tmp -> paired.json`
- `gateway connect failed: Error: gateway closed (1000)`

## Why This Recovery Works

- Clears stale temp JSON files in `~/.openclaw/devices` that can trigger Windows rename collisions.
- Forces fresh `pending.json` + valid `paired.json` formatting.
- Moves CDP to a fresh port (`18801` by default) to reduce connection-port churn.
- Patches runtime atomic-write calls to retry on Windows lock errors (`EPERM`, `EACCES`, `EBUSY`, `EEXIST`).
- Restarts gateway/browser and validates live browser actions.

## Post-Recovery Checks

```powershell
openclaw gateway status --json
openclaw browser status --json
openclaw browser --json open https://example.com
openclaw browser --json snapshot --efficient --limit 120
```

Expected:

- `rpc.ok: true`
- `running: true`
- `cdpReady: true`
- snapshot returns refs without immediate gateway disconnect
