# Signals and Verification

## Primary Failure Signals

- `[tools] browser failed: Can't reach the OpenClaw browser control service`
- `Do NOT retry the browser tool — it will keep failing`
- Browser-side errors like `(Error: ref is required)` or timeout after `20000ms`

## Codex CLI Fallback Signals

- `cli exec: provider=codex-cli model=gpt-5.3-codex`
- If broken command construction exists: `FailoverError: error: unexpected argument '...'
  found`
- Retry attempts with new `promptChars` values are normal during fallback

## Delivery Success Signals

- `telegram sendMessage ok chat=... message=...`
- Equivalent success lines from other channels (`sendMessage ok`)

## Browser Recovery Signals (Optional)

- `res ✓ browser.request ...`

This means browser control service became responsive again, but codex-cli fallback can still remain active for reliability.

## Why `unexpected argument` Happens

`codex exec resume` accepts at most one positional prompt argument.
If automation passes a multi-word prompt as unquoted shell tokens, tokens after the first can be treated as extra unexpected arguments.

Use stdin prompt mode instead:

```powershell
@'
Automation task text with multiple words
'@ | codex exec resume --last -m gpt-5.3-codex --skip-git-repo-check -
```

Or use this skill's wrapper script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\invoke-codex-exec-resume-safe.ps1 -Last -Prompt "..."
```

## Timezone Note

OpenClaw logs can mix display conventions:
- JSON event `time` fields are usually ISO-8601 UTC
- Human-readable dashboard/channel logs may be shown in local time

Always compare event order, not only wall-clock hour labels.
