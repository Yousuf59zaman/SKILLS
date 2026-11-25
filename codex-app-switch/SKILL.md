---
name: codex-app-switch
description: Switch the shared Codex+Paseo backend to another codex-multi-auth account. Use when Yousuf says switch to account N, switch No koto, codex-app switch, or gives just a switch number like switch to 2.
---

# Codex app switch

Yousuf just says the account number (e.g. `switch to 2`). Run the 3 commands below **one by one, in order** — start the next only after the previous one finishes with exit 0. Never batch them into one call. If any guard throws, stop the sequence immediately and report; do not continue to the next command.

## The 3 commands (PowerShell, in this exact order)

**1. Stop Codex Desktop + shared backend:**

```powershell
& "$env:USERPROFILE\bin\codex-stop-all.cmd" -WaitSeconds 0
if ($LASTEXITCODE -ne 0) {
    throw "Stop failed. Do not switch."
}
```

**2. Account switch (replace N with the number Yousuf gave):**

```powershell
codex-multi-auth switch N
if ($LASTEXITCODE -ne 0) { throw "Account switch failed." }
```

**3. Boot backend + Desktop on the new account:**

```powershell
& "$env:USERPROFILE\bin\codex-app.ps1" -NoStop
```

## Rules learned from live runs (2026-11-02)

- **Step 1 may fail once with a stale-record refusal** (`A recorded owned process is still live` / `refuse:live-owner`) when the recorded backend PID was recycled by an unrelated app. Do NOT proceed while it fails. Read-only check first: gateway `http://127.0.0.1:19458/status` unreachable + no `Listen` rows on ports 19457/19458 + the recorded PID dead (verify with `Get-Process -Id`, never kill anything). If the blocker PID just died, retry step 1 once — it passes on retry. If it still refuses, stop and report; options are waiting (the KeepAlive loop auto-heals when the PID frees), a PC reboot, or explicit user approval for a record rebase.
- **Never kill unrelated processes** (a recycled PID may belong to another app such as `claude.exe`). Never edit private bridge records to force it.
- **Forced cancels:** the switch may report `Cancel phase incomplete (turns-unsettled)` — the running turn was cancelled and NEVER replayed. Tell Yousuf to re-issue that prompt manually if it was his.
- **Manual pause:** `codex-stop-all` publishes a boot-scoped pause; step 3 (`-NoStop`) resumes past it by design. Do not run `Ensure-Backend` or healer commands to work around a pause.
- **Do not use bare `codex-multi-auth switch` outside this sequence**, and never run a preparatory external app-server daemon stop — the sequence already stops the old runtime first (stop-old → switch → one new boot).
- **Verify at the end (read-only):** `codex-multi-auth list` shows `Pinned: account N (strict)` + `[current]`; gateway `/status` shows `backend.state=ready`; `initialized.desktop=1`. Paseo (`initialized.paseo≥1`) usually reconnects on its own within ~90s.
- **If Paseo stays disconnected after ~90s** while chats are idle (prove with `check-account-idle.mjs`, exit 0): close only the `Paseo` GUI processes, reopen via `Open-Shared-Apps.ps1`, wait 60s, re-check. Its provider connects on demand — zero connections with no open Codex chats is expected-quiet, not breakage.
- **Known pre-existing issues (do not touch without explicit approval):** history-recovery worker unelected (`worker-ownership/unknown`, 159-NUL owner file), catalog `syncing/bidir-pending` with `167/167 verified dup 0`, canonical-history pending rollout. Report them as unchanged, never freelance repairs (broad repair stays stopped per `codex-paseo-sync`).
- Reply briefly in Yousuf's language (Bangla/Banglish + English mix): which account is now current, backend state, both frontends, and anything he must re-issue or approve.
