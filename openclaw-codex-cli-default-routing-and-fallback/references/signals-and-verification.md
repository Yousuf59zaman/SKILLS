# Signals and Verification

## Default Routing Signals (Codex CLI First)

- `defaultModel` and `resolvedDefault` are both `codex-cli/gpt-5.3-codex` in `openclaw models status --json`
- Alias `codex` resolves to `codex-cli/gpt-5.3-codex`
- Runtime logs for handled prompts show `{"subsystem":"agent/claude-cli"} cli exec: provider=codex-cli model=gpt-5.3-codex`
- Delivery logs show channel success after codex-cli execution (for example, Telegram `sendMessage ok`)

## Cron Exception Signals (Cron Uses codex-api by Default)

- `openclaw cron list --json` shows `payload.model: codex-api` for every cron job with `payload.kind = agentTurn`
- Daily Automation Start (`13432bb1-de70-477d-8193-849090592a8a`) has `schedule.expr: "4 11 * * *"` and `schedule.tz: "Asia/Dhaka"` (11:04 every day)
- Guard jobs (`Daily Automation Guard*`) use delivery mode `none` to avoid announce noise and unnecessary delivery-side failures
- Watchdog includes `Test-IsDeliveryOnlyCronError` and does not trigger codex fallback when the only error is `cron announce delivery failed`

## Primary Failure Signals

- `[tools] browser failed: Can't reach the OpenClaw browser control service`
- `Do NOT retry the browser tool - it will keep failing`
- Browser-side errors like `(Error: ref is required)` or timeout after `20000ms`

## Codex CLI Fallback Signals

- `cli exec: provider=codex-cli model=gpt-5.3-codex`
- Watchdog logs include `Cron failure detected` followed by `Triggering immediate codex-cli retry`
- If broken command construction exists: `FailoverError: error: unexpected argument '...' found`
- Retry attempts with new `promptChars` values are normal during fallback

Codex fallback should be tied to real cron execution failure (`lastStatus=error`), not delivery-only announce errors.

## Explicit Switch Signals (User Requested Only)

- Switch command/event explicitly indicates `g3` or `g3-flash`
- After temporary switch, explicit revert to `codex-cli/gpt-5.3-codex` is logged or confirmed by `openclaw models status --json`
- No silent/automatic switch to `g3` or `g3-flash` should occur on timeout/failure

## Delivery Success Signals

- `telegram sendMessage ok chat=... message=...`
- Equivalent success lines from other channels (`sendMessage ok`)

## Browser Recovery Signals (Optional)

- `res OK browser.request ...`

This means browser control service became responsive again, but codex-cli fallback can still remain active for reliability.

## Why `unexpected argument` Happens

`codex exec resume` accepts at most one positional prompt argument.
If automation passes a multi-word prompt as unquoted shell tokens, tokens after the first can be treated as extra unexpected arguments.

Use stdin prompt mode instead:

```powershell
$prompt = "Automation task text with multiple words"
$prompt | codex exec resume --last -m gpt-5.3-codex --skip-git-repo-check -
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
