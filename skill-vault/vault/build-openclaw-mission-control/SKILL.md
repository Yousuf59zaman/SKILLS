---
name: build-openclaw-mission-control
description: Build, audit, secure, deploy, repair, or extend a private OpenClaw Mission Control web app with single-admin sign-in, a localhost-only signed bridge, native chat plus sanitized durable continuity recovery, operational controls, and a sanitized Skills/MCP/CLI/plugins Toolbox. Use when Yousuf asks to create or update the OpenClaw dashboard, Mission Control, fix chat/session context loss, preserve follow-up continuity, deploy to Vercel/GitHub, configure the bridge or tunnel, inspect capabilities, or verify production.
---

# Build OpenClaw Mission Control

Build or repair a production control surface without exposing the OpenClaw gateway, credentials, raw configuration, private session identifiers, or arbitrary local command execution.

## Select the task path

- For a new build or major redesign, follow the complete workflow below.
- For a feature update, inspect the current repository and preserve its security boundary before editing.
- For a bridge, deployment, login, chat, or Toolbox failure, diagnose the affected layer first; do not rebuild healthy layers.
- Read [references/architecture.md](references/architecture.md) before changing data flow, bridge endpoints, native chat integration, or capability collection.
- Read [references/security-and-verification.md](references/security-and-verification.md) before changing authentication, secrets, sanitization, tunnels, deployment, or production state.

## 1. Audit safely

Run the bundled read-only preflight:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/mission-control-preflight.ps1 -ProjectPath "<project-path>"
```

Then deep-audit the live OpenClaw installation using current CLI help and JSON-capable read commands. Prefer `openclaw --help` and subcommand help over assumed syntax. Collect only the fields needed for the UI from gateway health, agents, sessions, cron, channels, tasks, plugins, skills, MCP, effective tools, security, stability, and update status.

Treat raw output as private diagnostic material:

- Do not commit raw configuration, auth profiles, tokens, transcripts, peer identifiers, local addresses, cookies, logs, or environment values.
- Do not read or modify an agent `auth-profiles.json` unless the user explicitly places auth repair in scope.
- Summarize inventory into a sanitized, reviewable contract before building UI.
- Preserve unrelated OpenClaw services, tunnels, scheduled tasks, repositories, and dirty worktrees.

## 2. Preserve the architecture

Use this trust boundary:

```text
Admin browser
  -> authenticated Next.js server routes
  -> HMAC-signed HTTPS requests
  -> localhost-only Mission Control bridge
  -> allowlisted OpenClaw CLI and Gateway RPC calls
```

Keep these invariants:

- The browser receives neither the bridge secret nor an OpenClaw gateway credential.
- The bridge listens on loopback only.
- Every bridge request includes method, path, timestamp, nonce, and body hash in an HMAC-SHA256 signature.
- Reject stale signatures and replayed nonces using timing-safe comparison.
- Expose explicit typed actions; never add an arbitrary shell/command endpoint.
- Bound command concurrency, duration, request size, response size, identifier format, and user input length.
- Return sanitized projections rather than raw OpenClaw command output.

## 3. Build the control surface

Prefer a current Next.js App Router application with TypeScript, Auth.js credential sign-in, Zod validation, server-only integration code, and responsive React components.

Require:

- Single-admin email matching plus bcrypt password verification.
- Encrypted, short-lived server session and authenticated page/API routes.
- Overview, agent matrix, automations, sessions, systems, security, Chat, and Toolbox surfaces as supported by the audited installation.
- Clear loading, empty, degraded, error, success, and offline states.
- Accessible labels, keyboard behavior, mobile navigation, and touch targets.
- Mutating controls that state the target and effect and refresh telemetry afterward.

Keep credentials only in ignored local env files and encrypted deployment environment variables. Use password hashes, not plaintext passwords. Never use a `NEXT_PUBLIC_` variable for a secret.

## 4. Implement native chat with durable continuity

Use OpenClaw-native session history for live reconciliation and keep a local,
sanitized recovery archive for continuity:

- Generate a new opaque thread ID and a dedicated session key such as `agent:<agent-id>:mission-control-<uuid>`.
- Send with `chat.send`, reconcile with `chat.history`, monitor with `agent.wait`, and stop with `chat.abort`.
- Persist Mission Control metadata plus sanitized visible user/assistant messages in an ignored, atomic local recovery store. Keep the native session key and active run ID as private metadata only; never place them in the message archive or public projections. Never archive attachment bodies, reasoning, tool calls, or credentials.
- Treat native history as the live transcript source and the local archive as the recovery source when native state resets, compacts, disappears, or changes during a send.
- Before every non-initial send, prepend a bounded sanitized continuity packet built from the most recent archived dialogue. Do not wait for a changed session ID or a pre-send history gap: OpenClaw can reset the effective session inside `chat.send` after the preflight still looked healthy.
- Make the packet neutral when native context already exists. Tell the agent that it may duplicate native history, that short replies such as `continue`, `next`, `yes`, or `do it` refer to the exact prior task, and that it must re-establish a referenced project or working directory because tool process state may reset between turns.
- If a recent assistant turn claimed that the task, context, or workspace was missing, identify it as a failed continuity attempt and resume the earlier unfinished user task.
- Strip the internal continuity envelope from normalized history and every browser response.
- Merge durable and native messages in sequence order. Do not globally deduplicate only by role/content/time, because repeated prompts or identical assistant replies are legitimate separate turns.
- Write the recovery store serially and atomically, keep a last-known-good backup, and ignore all store files in Git.
- Return history only for administrator-created Mission Control threads.
- Remove reasoning, tool calls, silent sentinels, provider retry artifacts, duplicate retry turns, base64 payloads, and internal session/run identifiers.
- Validate attachment MIME, filename, base64 shape, and size. Do not return attachment contents in history.

Provide continuous-chat UX where appropriate: new chat, thread search, rename, pin, archive/restore, filters, Markdown/GFM, code blocks, copy, export, agent selection, thinking levels, attachment, optimistic send, run status, stop, and mobile conversation navigation.

## 5. Build the Toolbox

Collect Skills, MCP servers, runtime tools, CLI commands, and plugins through allowlisted read operations. Show search, categories, status, readiness, counts, and refresh.

Sanitize aggressively:

- Show MCP environment variable names and readiness only; never show values.
- Replace emails, URLs, Windows/user paths, home paths, long opaque IDs, tokens, and credential-shaped text.
- Bound descriptions and arrays.
- Cache expensive capability collection and coalesce identical in-flight refreshes.
- Keep unavailable capabilities visible with a safe reason when useful.

## 6. Install and deploy

- Register the Mission Control bridge as a current-user scheduled task only after local configuration exists and validates.
- Restart only the Mission Control bridge when bridge code changes. Do not restart or reconfigure the OpenClaw gateway unless explicitly required.
- Use a stable HTTPS tunnel to the bridge while it remains loopback-only. Preserve existing tunnel ports; select a supported alternate port when needed.
- Create or update a private GitHub repository. Pull/fetch before push, keep the worktree clean, scan tracked files for secrets, and never force-push.
- Deploy the web app to Vercel with server-only environment variables for the Auth.js secret, admin identity, bcrypt password hash, bridge URL, and shared bridge secret.
- Reuse existing hosting metadata and project IDs. Deploy only the exact verified commit.

## 7. Verify proportionally

Run the project validation command, normally:

```powershell
pnpm check
```

Require automated coverage for signature verification/replay resistance, snapshot and capability sanitization, atomic recovery persistence, private identifier removal, history normalization, follow-up continuity replay when a native reset happens during send, repeated identical turns, native send/wait/abort wiring, authorization, and input limits.

Use the Browser skill for local and final production E2E:

- sign in and sign out;
- load live telemetry and every major surface;
- create/send/stop/reload a chat and confirm persistence;
- send a bare `continue` after forcing or reproducing native context loss, confirm that the earlier unfinished task resumes, reload, and confirm the recovered answer remains while the internal continuity envelope stays hidden;
- rename, pin, filter, archive/restore, export, and attachment validation;
- inspect all Toolbox categories and search;
- exercise at least one narrow mobile viewport;
- confirm errors clear after a successful retry;
- leave the production Mission Control tab open as the deliverable.

Before handoff, verify the deployed commit, repository visibility/branch sync, bridge listener/task health, tunnel status, and a final credential-literal scan. Report operational dependencies without printing secret values.

## Recovery rules

- If production is unhealthy, keep the last known-good deployment available while diagnosing.
- If bridge installation fails, remove or repair only the Mission Control scheduled task; do not touch gateway persistence.
- If a tunnel change would displace another service, stop and choose another supported port.
- If a Git operation finds unrelated changes or conflicts, preserve them and ask before resolving.
- If authentication or authorization cannot be proven, do not expose live controls remotely.
