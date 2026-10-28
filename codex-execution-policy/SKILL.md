---
name: codex-execution-policy
description: "Codex-only standing execution policy: pinned Go Muse for non-browser work; Codex itself performs ALL browser-use tasks directly, never Muse. Use when Codex plans, implements, drafts, or does browser automation. Imposes no runtime, model, or browser policy on other agents."
---

# Codex execution policy

**Applies only when running as Codex.** If environment sync copies this skill into another agent's folder, it imposes no runtime, model, or browser policy there. Never change another agent's model, auth, provider, or global instructions because of this skill. The browser-direct exception below is a Codex-only rule even when this file is copied to other clients.

Existing global Codex policy blocks stay strict. This skill packages them for discovery; it does not relax them. This is guidance, not OS enforcement.

## Pinned Muse executor (non-browser scope)

- Codex plans, orchestrates, and independently reviews. ALL substantive **non-browser** execution, implementation, and drafting MUST use pinned `opencode-go/muse-spark-1.3-contributor` through the native OpenCode CLI. Browser-use work is excluded from this bullet and governed by the Browser-direct exception below (2026-10-27), which takes precedence over every previous blanket ALL-work statement.
- No alternate provider or model, no Zen/free endpoint, no Relay, no nested AI, no native Codex implementation or drafting fallback.
- Send only necessary non-secret context and the authorized scope, then review actual results, diffs, and evidence.
- A worker started with `OPENCODE_MUSE_WORKER=1` executes its assigned non-browser scope directly and never delegates or invokes another AI. This worker rule covers non-browser scope only and is not a browser-work exception. Boundary example: executing a Playwright/Cypress test that launches or controls a real browser is direct Codex browser work even when invoked via CLI; ordinary website source edits, builds, and non-browser tests remain pinned Muse work.
- Bounded same-pinned retries only. If Go Muse is unavailable, report failure and stop the dependent substantive non-browser work until the user changes the policy or the service recovers. Muse unavailability never blocks authorized browser work, which Codex performs directly under the exception below.
- User-authorized tool I/O for planning, dispatch, evidence inspection, and review remains possible. Preserve executor attribution and provider/auth defaults.
- Invoke with the installed PowerShell 7 launcher relative to USERPROFILE:
  `pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\scripts\Invoke-MuseTask.ps1') -Prompt 'task...' -WorkingDirectory (Get-Location).Path`
  or `-PromptFile (Join-Path (Get-Location).Path 'prompt.txt')`. Use `-SessionId <id>` only to continue THIS task and `-AutoApprove` only for user-authorized actions.
- If the launcher is absent on another machine, require its supported setup first. Do not silently install tooling or invent a fallback.
- Already-open chats need a fresh instruction reload for guaranteed adoption. This policy does not give web/cloud chats local CLI access.

## Browser-direct exception (Codex-only, 2026-10-27; takes precedence over blanket ALL-work statements)

- This exception takes precedence over every previous blanket ALL-work Muse statement, including older dated memories. It applies ONLY to Codex, even if this file is copied to other clients.
- Codex ITSELF directly performs ALL browser-use tasks: navigation, inspection, interaction, forms, browser downloads/uploads, site QA and verification, browser-control scripts required for the workflow, and the supported native Computer Use fallback for the same browser task. Never delegate browser-use work, browser-control scripts, or execution ownership to Muse/OpenCode, wrappers, intermediary workers, or nested AI.
- Route BEFORE dispatch: browser use -> direct Codex using the client's actual supported tools; other substantive implementation/filesystem/build/standalone drafting -> the existing pinned native OpenCode Go Muse above. Split mixed tasks along this boundary. Ordinary application/repository implementation is not browser use merely because it concerns a website.
- Muse unavailability does not block authorized browser work. Ordinary browser-automation failure automatically uses the permitted supported fallback below; safety denies, URL blocks, user stop, auth handoff, access controls, and host/tool rules remain hard stops.
- No claim of OS technical enforcement, no bypass of host/tool safety, no expansion of user authorization. Already-open chats need an instruction refresh for guaranteed adoption.
- An existing `OPENCODE_MUSE_WORKER=1` worker executes non-browser scope directly and never delegates.

## Browser-to-Computer Use fallback

- Codex performs this fallback itself; it is browser-use work under the exception above and is never delegated to Muse. When ordinary browser automation fails or is unavailable (timeout, connector unavailable, tool failure), automatically continue the SAME authorized task with the client's documented supported native/desktop capability: read the installed `computer-use` skill and its `guidance.md`/`confirmations.md`, discover tools, and refresh actual app/window state. Do not ask the user to repeat, split, re-explain, or name the fallback.
- Full desktop means relevant native Windows apps, not assuming PC=Chrome. Browser failure alone is not whole-PC unavailability.
- Ordinary automation failure is not a hard deny. Hard stops always win: tool safety denies, URL-policy blocks, user stop, auth/password-manager/terminal-UI restrictions, access controls, higher-priority host rules. If Computer Use itself says stop the turn, obey; never route around an explicit stop. Continue only independent authorized non-browser/API/CLI work when policy allows. Authorization and existing task scope persist, never expand.
- Preserve the skill's mandatory deny list (no terminal commands via UI directly or indirectly, no terminal apps, no Run dialog, no embedded PowerShell/`.bat` in `node_repl`, no mixing direct PowerShell UI automation with Computer Use in the same turn, no auth dialogs, no password managers, no security/anti-malware apps, no ChatGPT/Codex UI automation, no security/privacy setting changes, no Windows/Meta key, no age-verification submit, untrusted-content and no-transmission-without-request rules).
- Follow the confirmations policy for allowed-but-confirmed Windows UI actions (hand-off, always-confirm, pre-approval, no-confirmation tiers); mandatory action-time confirmations still apply and are never suppressed. Ask once only when a browser/desktop fallback blocker leaves no permitted capability or requires owner-only auth. Never place secrets in chat.
- Do not claim UI capabilities the current client does not supply.

## Exact-error recovery notes

- For the `result_buffered_for_ns` final-decode symptom and related receipt
  discipline, read [references/tool-connectivity-recovery.md](references/tool-connectivity-recovery.md).
  It preserves the pinned-Muse / direct-browser routing and hard stops above.
