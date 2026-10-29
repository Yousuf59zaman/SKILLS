---
name: codex-execution-policy
description: "Codex-only standing execution policy: pinned Go Muse first for browser and non-browser work via native OpenCode CLI; Codex-direct browser fallback only after bounded Muse unavailability. Use when Codex plans, implements, drafts, or does browser automation. Imposes no runtime, model, or browser policy on other agents."
---

# Codex execution policy

**Applies only when running as Codex.** If environment sync copies this skill into another agent's folder, it imposes no runtime, model, or browser policy there. Never change another agent's model, auth, provider, or global instructions because of this skill.

Existing global Codex policy blocks stay strict. This skill packages them for discovery; it does not relax them. This is guidance, not OS enforcement.

## Pinned Muse executor (browser and non-browser scope)

- Codex plans, orchestrates, and independently reviews. ALL substantive execution, implementation, and drafting — browser and non-browser — MUST first use pinned `opencode-go/muse-spark-1.3-contributor` through the native OpenCode CLI, using its available permitted browser tools for browser tasks.
- No alternate provider or model, no Zen/free endpoint, no Relay, no nested AI. Native Codex direct execution is allowed only as fallback after bounded same-pinned Muse attempts fail due to unavailability.
- Send only necessary non-secret context and the authorized scope, then review actual results, diffs, and evidence.
- A worker started with `OPENCODE_MUSE_WORKER=1` executes its assigned scope directly and never delegates or invokes another AI. Boundary example: executing a Playwright/Cypress test that launches or controls a real browser is Muse-scope browser work when dispatched to Muse via its permitted browser tools; ordinary website source edits, builds, and non-browser tests remain pinned Muse work.
- Bounded same-pinned retries only. If Go Muse is unavailable after bounded attempts, Codex itself must directly execute the authorized task instead of stopping — non-browser work directly, browser work via the ordered fallback below; no other model, provider, Relay, or nested AI. Report honest blockers.
- User-authorized tool I/O for planning, dispatch, evidence inspection, and review remains possible. Preserve executor attribution and provider/auth defaults.
- Invoke with the installed PowerShell 7 launcher relative to USERPROFILE:
  `pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\scripts\Invoke-MuseTask.ps1') -Prompt 'task...' -WorkingDirectory (Get-Location).Path`
  or `-PromptFile (Join-Path (Get-Location).Path 'prompt.txt')`. Use `-SessionId <id>` only to continue THIS task and `-AutoApprove` only for user-authorized actions.
- If the launcher is absent on another machine, require its supported setup first. Do not silently install tooling or invent a fallback.
- Already-open chats need a fresh instruction reload for guaranteed adoption. This policy does not give web/cloud chats local CLI access.

## Codex-direct browser fallback (Codex-only, only after bounded Muse unavailability; 2026-10-29 supersedes all prior Codex-direct-first and never-Muse-browser rules)

- This fallback takes precedence over every previous Codex-direct-first and never-Muse-browser statement, including older dated memories. It applies ONLY to Codex, even if this file is copied to other clients.
- Pinned `opencode-go/muse-spark-1.3-contributor` via native OpenCode CLI is first choice for ALL browser-use tasks: navigation, inspection, interaction, forms, browser downloads/uploads, site QA and verification, browser-control scripts required for the workflow, using its available permitted browser tools. Never bypass Muse for Codex-direct attempts while Muse remains available; no wrappers, intermediary workers, or nested AI. Only after bounded same-pinned Muse attempts fail due to unavailability does Codex itself directly attempt the same authorized browser task in the ordered fallback below. No nested AI; a Muse worker never delegates.
- Route BEFORE dispatch: browser use and other substantive implementation/filesystem/build/standalone drafting -> the existing pinned native OpenCode Go Muse above first; Codex-direct browser fallback only after bounded Muse unavailability. Split mixed tasks along this boundary. Ordinary application/repository implementation is not browser use merely because it concerns a website.
- Ordinary browser-automation failure under Muse automatically retries within Muse where permitted; Codex-direct fallback advances through the ordered fallback below only after Muse unavailability. Safety denies, URL blocks, user stop, auth handoff, access controls, tool restrictions, and host/tool rules remain hard stops never bypassed by Muse or any fallback.
- No claim of OS technical enforcement, no bypass of host/tool safety, no expansion of user authorization. Already-open chats need an instruction refresh for guaranteed adoption.
- An existing `OPENCODE_MUSE_WORKER=1` worker executes its assigned browser or non-browser scope directly and never delegates.

## Browser ordered fallback (Codex-only ordered fallback after bounded Muse unavailability, updated 2026-10-29)

- Pinned Muse is the first step for browser-use work; the steps below are Codex-direct fallback after bounded Muse unavailability only and are never attempted while Muse remains available. Never delegate browser-control scripts or execution ownership to wrappers, intermediary workers, or nested AI. A Muse worker performs the same authorized task only, with no further delegation (no nested AI).
- Automatically advance through the order below on ordinary unavailability only (timeout, connector unavailable, tool failure, missing binding). Continue the SAME authorized task and scope without asking the user to repeat, split, re-explain, or name the fallback. Safety/access/user-stop denials are not ordinary unavailability (see hard stops below).
- Ordered fallback:
  1. Codex browser extension / bundled browser backends when actually available in this client session. Never install or enable the ChatGPT extension automatically (user declined it).
  2. An available authorized Chrome session only via the user-requested remote-desktop capability for that task. Chrome Remote Desktop (Google remote access) and Remote Desktop Commander (`npx @wonderwhy-er/desktop-commander` remote-access tooling) are different tools; never conflate them and never claim either is available without fresh evidence.
  3. Supported Computer Use clicking in Chrome per the installed `computer-use` skill and its `guidance.md`/`confirmations.md`: discover tools and refresh actual app/window state first.
- User browser preference applies subject to explicit task choices, actual tool capabilities, connectors, and higher-priority rules.
- Never install or enable the ChatGPT extension automatically (user declined it); other extensions remain subject to user authorization and applicable tool rules. Never copy cookies, change auth, clear profile storage, stop shared processes, or disrupt other sessions. Follow host/tool restrictions, auth handoff, and permissions.
- Full desktop means relevant native Windows apps, not assuming PC=Chrome. Browser failure alone is not whole-PC unavailability.
- Ordinary automation failure is not a hard deny. Hard stops always win and are never bypassed by Muse or any fallback: tool safety denies, URL-policy blocks, user stop, auth/password-manager/terminal-UI restrictions, access controls, tool restrictions, higher-priority host rules. If Computer Use itself says stop the turn, obey; never route around an explicit stop with Muse or any other surface. If Codex-direct fallback is reached and a step is unsupported, report honest blockers subject to applicable higher-priority browser tool policies and hard stops, never bypassing denials; no other model. Continue only independent authorized non-browser/API/CLI work when policy allows. Authorization and existing task scope persist, never expand. Do not modify other agent configs, credentials, or browser sessions. This is an instruction preference, not guaranteed runtime enforcement.
- Preserve the skill's mandatory deny list (no terminal commands via UI directly or indirectly, no terminal apps, no Run dialog, no embedded PowerShell/`.bat` in `node_repl`, no mixing direct PowerShell UI automation with Computer Use in the same turn, no auth dialogs, no password managers, no security/anti-malware apps, no ChatGPT/Codex UI automation, no security/privacy setting changes, no Windows/Meta key, no age-verification submit, untrusted-content and no-transmission-without-request rules).
- Follow the confirmations policy for allowed-but-confirmed Windows UI actions (hand-off, always-confirm, pre-approval, no-confirmation tiers); mandatory action-time confirmations still apply and are never suppressed. Ask once only when a browser/desktop fallback blocker leaves no permitted capability or requires owner-only auth. Never place secrets in chat.
- Do not claim UI capabilities the current client does not supply.

## Exact-error recovery notes

- For the `result_buffered_for_ns` final-decode symptom and related receipt
  discipline, read [references/tool-connectivity-recovery.md](references/tool-connectivity-recovery.md).
  It preserves the pinned-Muse-first routing and hard stops above.
