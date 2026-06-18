---
name: openclaw-update-gateway-sync
description: Safely update OpenClaw to the latest npm release, force-sync the running gateway app version on Windows, and preserve the Codex no-approval gateway launcher policy while treating OpenClaw/Codex auth as a strict no-touch zone. Use when the user asks to "update OpenClaw", "update gateway app", "sync gateway/app version", "fix version mismatch", "stop Telegram/plugin approval prompts after updates", or wants one-step update + restart + verification without touching auth profiles, Codex multi-auth, auth order, auth state, OAuth tokens, or model probes.
---

# OpenClaw Update Gateway Sync

## Non-Negotiable Auth Lock

Treat authentication storage as production data. An OpenClaw update must never read, write, copy, hash, back up, reorder, sync, refresh, probe, test, clean, or repair any auth-related file or profile unless the user gives a fresh exact approval in the same conversation.

Required approval phrase for any auth action:

```text
I APPROVE AUTH CHANGE: <exact action>
```

General requests like "update", "fix", "test everything", "check all profiles", "sync", "repair", or "make it work" do not authorize auth access.

Do not touch:

- `~\.openclaw\agents\*\agent\auth-profiles.json`
- `~\.openclaw\agents\*\agent\auth-state.json`
- `~\.openclaw\**\auth-profiles.json*`
- `~\.openclaw\**\auth-state.json*`
- `~\.openclaw\**\models.json`
- `~\.codex\multi-auth\*`
- `~\.codex\auth.json`
- any file containing access tokens, refresh tokens, id tokens, OAuth material, API keys, auth order, auth state, or multi-auth accounts

Do not run:

- `openclaw models status --probe`
- `openclaw models auth *`
- `openclaw models login/logout`
- `openclaw models refresh`
- `codex-multi-auth *`
- any command that probes, refreshes, mutates, reorders, or tests auth profiles

If auth would be needed, stop and ask for the exact approval phrase. Do not work around this by reading hashes, making backups, or "just checking".

## Safe Workflow

1. Use only the bundled update script.
2. The script sets `OPENCLAW_AUTH_STORE_READONLY=1` for the process.
3. Stop the gateway service cleanly.
4. Kill stale listener processes still bound to the gateway port.
5. Clear stale npm temp folders that can cause Windows rename lock failures.
6. Update `openclaw` globally to `latest`.
7. Before starting the gateway, enforce the Codex no-approval launcher env in `~\.openclaw\gateway.cmd`:
   - `OPENCLAW_CODEX_APP_SERVER_MODE=yolo`
   - `OPENCLAW_CODEX_APP_SERVER_APPROVAL_POLICY=never`
   - `OPENCLAW_CODEX_APP_SERVER_SANDBOX=danger-full-access`
8. Start the gateway service again.
9. Recheck `gateway.cmd`; if OpenClaw regenerated it and the launcher env had to be changed after start, restart the gateway once so the running service inherits those variables.
10. Verify only CLI/gateway versions and gateway health.
11. Do not verify by probing models or profiles.

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
5. Whether `health_ok` is `true`
6. Whether the Codex no-approval launcher env was already present, was patched, and required a post-start gateway restart

Use only `openclaw gateway status --json` and `openclaw gateway health --json` for gateway verification. Do not use `openclaw models status`, `openclaw models status --probe`, or `openclaw models auth` unless the user explicitly approves that exact auth action.

## Post-Update Verification Checklist

Keep this checklist separate from the update script. Run only non-auth checks by default, and report what was checked:

- Confirm `openclaw --version`, gateway status, and gateway health all agree on the updated version.
- Confirm `~\.openclaw\gateway.cmd` still contains the three Codex no-approval launcher env lines listed in the Safe Workflow.
- Wait and retry gateway health for 2-3 minutes after restart before calling it failed; Discord/Telegram startup can temporarily delay health responses.
- Check gateway reachability, event-loop health, plugin load errors, and active/queued/running task counts.
- Check config validation and doctor lint without fix mode. Prefer non-interactive lint output if full/interative doctor hangs.
- Check security audit, secrets audit, cron scheduler status, and plugin version drift when those commands do not inspect auth stores.
- Confirm external non-bundled OpenClaw plugins such as `@openclaw/codex` and `@openclaw/discord` are compatible with the OpenClaw version. If they are pinned or outdated, update/pin them to the same release when the package manager command does not touch auth storage.
- Report warnings separately from blockers. Common non-blocking warnings include a stale WhatsApp plugin config entry and expected Discord DM pairing restrictions.

## Optional Cleanup And Hardening

Treat cleanup as a separate phase after the update is already healthy:

- Do not run `doctor --fix`, edit config, migrate secrets, delete generated caches, or change channel/tool security settings unless the user asked for that cleanup.
- Before touching secrets, API keys, OAuth material, token caches, `models.json`, auth profiles, auth state, or Codex multi-auth, require the exact auth approval phrase from the Non-Negotiable Auth Lock section.
- If plaintext secrets are reported, describe that secret migration is needed, but do not read or migrate values without approval.
- If generated `models.json` or similar auth-derived caches appear, do not read or delete them without approval.
- Cleanup items seen in the 2026.5.22 session: stale WhatsApp plugin config entry, stale direct OpenAI model refs in config/cron/session state, cron job errors, plaintext config secrets, open Discord/Telegram channel policy, broad exec/elevated tool access, generated `models.json`, and stale Codex app-server processes created by probes.
- Recommended hardening actions after approval and after confirming user intent: Discord DMs behind pairing, Discord groups allowlisted, Telegram users allowlisted, wildcard elevated access disabled, and exec access set to allowlist/on-miss.
- Do not invent cleanup steps for warnings that were not observed. Keep reports factual: passed checks, blockers, non-blocking warnings, and actions taken.

## Model Probe Safety

Model probes are auth tests, not update tests. Never run them during the default update flow.

During the 2026.5.22 session, the broad all-profile Codex probe produced repeated Codex harness failures, app-server startup timeouts, and stale app-server processes. If the user gives exact current approval for a probe action, avoid broad all-profile probes. Prefer a single-profile or serialized probe with long timeout:

```powershell
openclaw models status --probe --probe-provider openai-codex --probe-concurrency 1 --probe-timeout 180000
```

Stop broad probes that spawn multiple Codex app-server processes or repeatedly time out. Clean up only the non-auth stale processes you created, then report that deeper auth/profile testing requires separate approval.

## Codex Routing And Speed After Updates

If an update is followed by missing OpenAI API-key warnings, broken `openai-codex/gpt-5.4-mini` Codex OAuth routing, stale direct OpenAI session metadata, stale auth-state cooldown, or very slow Telegram/chat replies, use the `openclaw-codex-routing-speed` skill after the update workflow is complete.

Do not run that recovery workflow by default. It may require auth-profile reads, auth-order edits, or live profile tests, which need a fresh exact approval phrase in the current conversation:

```text
I APPROVE AUTH CHANGE: <exact action>
```

Safe non-auth speed checks may inspect config validation, gateway status/health, and sanitized runtime metadata. Auth-profile enumeration, per-profile `gpt-5.4-mini` tests, auth-state recovery, auth-order routing repair, refresh/login/logout, and model probes remain protected actions.

Speed recovery must preserve `thinkingDefault: "xhigh"` unless the user gives a fresh explicit approval to lower thinking. Do not set thinking to `off` as part of a post-update speed fix. Keep `fastMode` off by default; do not enable it as a routine update/speed fix. For OpenAI/Codex routes, `fastMode` should be treated as priority service-tier routing when explicitly enabled, not as a replacement for xhigh thinking.

## Telegram Bot Routing And Auth Drift

Use this section only after the normal update/sync flow is complete. It is for diagnosing regressions like wrong bot replies, double replies, or `Missing API key for provider "openai-codex"` in one Telegram bot while another bot still works.

Safe non-auth checks:

- Run `openclaw agents list --bindings` to verify each Telegram account routes to its intended agent, for example `default -> clawdbot_agent`, `openclaw -> openclaw_agent`, and `moltbot -> moltbot_agent`.
- Check `openclaw gateway status --json` and `openclaw gateway health --json --timeout 120000`; treat temporary handshake failures during startup as warmup lag if the service process is running and later RPC succeeds.
- Inspect sanitized logs for symptoms, not secrets: `Missing API key`, `provider auth state pre-warmed`, `gateway ready`, `telegram/network`, `fetch timeout`, `event-loop`, and `stalled session`.
- Distinguish causes: wrong/double bot replies are usually routing/session-fence runtime problems; `Missing API key for provider "openai-codex"` is usually auth routing or per-agent auth-store drift; slow/no replies can be Telegram network or event-loop saturation.
- If replies work for several messages and then later show a direct OpenAI API-key warning, check compaction logs. Budget compaction can fail independently from the main run if it leaks into direct OpenAI provider routing instead of the Codex-backed provider.

Canonical Yousuf-agent routing state after the 2026-05-27 repair:

- Chat/cron agents should use `openai-codex/gpt-5.4-mini`, not direct OpenAI refs.
- `openclaw.json` should keep `agents.defaults.model.primary` as `openai-codex/gpt-5.4-mini`, with no direct OpenAI fallback for these agents.
- `agents.defaults.models`, `models.providers`, and root `auth.order` should be keyed by `openai-codex` for this route; do not rewrite `openai-codex/*` to direct OpenAI refs.
- Cron jobs and Telegram/session stores should not contain stale direct OpenAI model refs or `modelProvider: "openai"` route pins for these agents.

Protected checks and repairs require exact auth approval. Ask for an action-specific phrase before reading or editing any `auth-profiles.json`, `auth-state.json`, session auth pins, cron auth pins, auth order, or profile material.

With exact approval, use this minimal per-agent repair pattern:

1. Compare only counts and masked IDs across affected agent stores; never print token values.
2. Ensure every affected agent that routes to `openai-codex` has the same available `openai-codex` profile set and provider order as an approved working source store.
3. Clear stale `authProfileOverride*` and `authProfile` pins from affected Telegram/session/cron entries so OpenClaw can rotate/select profiles normally.
4. Validate config, restart the gateway once, wait for readiness, and smoke test only affected agents.
5. After approved smoke tests, check and clear any new session auth pins created by the smoke run; OpenClaw may auto-create soft per-session auth preferences after selection.

Useful exact approval examples:

```text
I APPROVE AUTH CHANGE: read and repair OpenClaw openai-codex auth routing for the <agent> Telegram bot, including <agent> auth-profiles/auth-state files, session auth pins, config validation, gateway restart, and non-secret smoke test
```

```text
I APPROVE AUTH CHANGE: read and repair OpenClaw openai-codex auth routing for Moltbot, Clawdbot, and main-cron agents, including copying existing openai-codex auth profiles and auth order between OpenClaw agent auth-profiles/auth-state files as needed, clearing Telegram/session/cron auth pins for those agents, validating config, restarting gateway if needed, and running non-secret smoke tests
```

Smoke test guidance:

- Use `sessions.create` + `sessions.send` for direct, non-secret smoke tests against the affected agent IDs.
- Verify the transcript contains the expected token and reports `provider: "openai-codex"` with the intended model.
- Run smoke tests serially or with generous timeouts. Codex OAuth startup can take 1-2 minutes per run, and gateway status calls may time out while the event loop is saturated.
- Do not treat `modelProvider: "openai"` from an early `sessions.describe` as final if the run later completes through `openai-codex`; confirm from transcript or final session state.

## Incident Lessons To Preserve

These notes come from the OpenClaw 2026.5.22 Windows update/debug session and must guide future work:

- Updating the core package alone was not enough. The scheduled gateway stayed on the old runtime until the gateway was stopped, stale listeners were killed, and the gateway was started again.
- In that session, OpenClaw moved from `2026.4.23-beta.5` to `2026.5.22`; `@openclaw/codex` and `@openclaw/discord` also needed updating from `2026.5.20-beta.2` to `2026.5.22`.
- Windows npm updates can fail because stale `.openclaw-*` folders under `%APPDATA%\npm\node_modules` hold rename locks. Remove only those stale temp folders.
- Immediately after restart, Discord/Telegram startup caused temporary health timeouts. Wait 2-3 minutes and retry before diagnosing a real gateway failure.
- `openclaw doctor` interactive/full mode hung during the session. Use non-interactive lint/JSON checks for repeatable verification.
- The stale WhatsApp config warning was caused by a WhatsApp plugin entry without the plugin installed. Fix only if the user wants WhatsApp installed or stale config cleaned.
- Broad all-profile Codex probing overloaded the Codex app-server path and left stale processes. Serialized probing with `--probe-concurrency 1 --probe-timeout 180000` worked for a single approved probe.
- Generated model/auth caches such as `models.json` can contain sensitive auth-derived data. Avoid commands that create them; if one appears, ask for auth approval before reading or deleting it.
- Doctor reported stale shadow auth profiles in non-main agents. Do not inspect or repair those without exact auth approval.
- OpenClaw updates or service regeneration can remove local `gateway.cmd` edits. Always reapply the Codex no-approval launcher env before gateway start, recheck after start, and restart once if the post-start check changed the launcher.
- `Missing API key for provider "openai-codex"` can be agent-specific. In the 2026-05-27 repair, `openclaw_agent`, `moltbot_agent`, and `main-cron` had missing or stale per-agent auth routing while `clawdbot_agent` already had usable profiles.
- Per-agent session stores can keep stale `authProfileOverride*` pins even after profiles are repaired. Clear pins only with exact approval, and re-check after smoke tests because successful runs can create fresh soft pins.
- A smoke transcript with `provider: "openai-codex"` and the expected token is stronger evidence than a mid-run gateway status snapshot.
- Gateway health can be `ok` while still reporting event-loop/CPU degradation. Report degraded performance separately from repaired auth/routing.
- If Discord is intentionally disabled, verify it stays out of `channelOrder`/plugin load after restart. Do not assume old Discord timeout lines in historical logs describe the current running gateway.
- Current 2026-06-03 routing supersedes the 2026-05-27 `gpt-5.5` notes: Clawdbot/Openclaw/Moltbot/main-cron should route through `openai-codex/gpt-5.4-mini` by default. Direct OpenAI refs in `openclaw.json`, `cron/jobs.json`, session stores, model caches, runtime defaults, or compaction helpers are drift and should be repaired after exact auth approval when protected files are involved.
- The 2026-06-03 repair keeps the task-complexity router SIMPLE and COMPLEX routes on `openai-codex/gpt-5.4-mini`, adds `openai-codex-auth-state-recovery`, and preserves no fallback chain.
- After cleanup, config validation passed, gateway health/RPC passed, event loop was not degraded, and Telegram `default`, `moltbot`, and `openclaw` accounts were connected.
- `doctor --lint` may still warn about a gateway token SecretRef even when gateway RPC and secrets audit pass. Report it as a residual warning, not as proof of a broken gateway.
- If the user asks to "test everything", explicitly exclude auth/profile tests unless they give the exact auth approval phrase.
- If a task begins to drift into auth, stop immediately and explain the exact protected action needed.

## Script

`scripts/update-openclaw-and-sync-gateway.ps1`
