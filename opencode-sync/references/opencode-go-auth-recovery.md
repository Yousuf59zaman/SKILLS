# OpenCode Go authentication and Desktop recovery

Use this workflow for expired-key/401 failures, Console reconnection, CLI updates, or a working CLI/Paseo connection with a failing OpenCode Desktop app. Keep changes within the requested products. Do not run the routing script's `--target all` audit/apply for an authentication-only request.

## Diagnose before changing credentials

- Confirm the actual inference error. An active Go subscription, a model list, and Paseo's provider `Ready` status do not establish that a model can reply. A generic `401` alone does not identify its cause.
- If the service explicitly reports `This API key has expired`, the stored key has expired. A Console login can establish a separate working authenticated connection; it does not renew that expired key. Do not report a key replacement unless one actually occurred.
- Inspect only the relevant installation, provider configuration, credential-source presence, and sanitized error fields. Keep keys, tokens, account/workspace identifiers, session handles, raw logs, and private chat content out of output and this skill.
- Preserve the selected model and unrelated Codex, Relay, OpenClaw, and Paseo/Codex bridge settings. This workflow does not resume a stopped bridge repair.

## Windows CLI update and Console login

Discover the executable and installation method first. Check installed help and current official documentation before reusing historical commands or versions. `opencode upgrade` is the standard update entrypoint; check its method and target before running it. A major-version migration is a separate change, not an automatic authentication repair.

For the verified npm installation under the current user's `%APPDATA%\npm`, PowerShell commands are:

```powershell
npm install -g --prefix "$env:APPDATA\npm" opencode-ai@latest
opencode --version
opencode console login
```

Use this prefix only when it matches the existing installation. It avoided the machine's default npm prefix pointing into protected `Program Files`; no administrator install or global npm-prefix change was needed. On other installation types, use their supported update method.

The login command opens the official Console device-authorization page. Match the requested application/code to the login just initiated, review its access scope, authorize within the current user's approval, and verify that the CLI finishes successfully. If the scope materially exceeds the authorized repair, present that exact scope before approval. The 2026-10-19 approval for `All workspaces` belongs to that repair; it is not standing approval for future access grants. If user login or credential entry is required, hand off that step without requesting secrets in chat.

Do not copy rotating OAuth access/refresh tokens between stores to simulate a login. If Console sign-in is unsupported, or the affected integration genuinely requires a replacement API key, use its supported credential-management flow within the authorized scope. Do not assume that Console login repairs every expired-key client.

### Version-specific lesson

On 2026-10-19, CLI 1.18.18 opened an obsolete `console.opencode.ai` device URL. Manual server-URL overrides produced a response-decoding failure or duplicated `/console/console/device` path. Updating the existing user-level npm installation to 1.19.3 made ordinary `opencode console login` open the correct page. This is historical evidence, not a requirement to pin 1.19.3 or to keep rewriting login URLs.

## Verify only the requested surfaces

### Direct CLI

Use a fresh disposable working directory and one tiny non-secret request with an explicitly selected available Go model. For example:

```powershell
opencode run --model opencode-go/glm-5.2 --format json "Reply exactly OPENCODE_GO_OK. Do not use tools, read files, or change anything."
```

Check an actual assistant reply, model/provider metadata where available, and the request outcome. A process starting, an exit code alone, or the marker appearing in the user's prompt is insufficient. Bound the request and do not resend an accepted request merely because its confirmation is uncertain.

### Paseo

```powershell
paseo provider diagnostic opencode --json
```

Read diagnostic output locally and report only the relevant version, availability/status, and model count. Diagnostics can contain commands, environment details, and private endpoints; do not dump them wholesale. When a reply test is requested, use a disposable new OpenCode agent/workspace and inspect its assistant response. Archive only the test records created for this check when appropriate; preserve existing chats.

Choose OpenCode when creating a new agent/workspace. The model menu inside an existing synced Codex chat remains scoped to Codex; it is not evidence that OpenCode is missing. Preserve those original Codex chats' provider and identity.

### OpenCode Desktop

Desktop runs its own background server. A successful global CLI or Paseo test does not prove that the running Desktop server loaded the new connection.

1. Inspect the actual app and selected model. Distinguish an old error retained in chat history from a newly failed request.
2. If the connection changed while Desktop was open, wait for affected work to be idle, close OpenCode Desktop gracefully, confirm its own app/server exits, and reopen it. Preserve sessions, tabs, drafts, and the selected model. Do not broadly kill `opencode`, Electron, Paseo, or other shared processes.
3. Create a separate harmless test conversation and send a no-tool marker request through the actual Desktop composer using the intended model. Verify the assistant's visible completed response. Do not claim Desktop success from a CLI command or backend receipt.

If restart does not resolve the failure, inspect Desktop's actual backend/credential source and use its supported connection flow. Do not delete caches, rewrite authentication databases, or rotate unrelated credentials as a first step.

## Verified recovery and reporting limits

The 2026-10-19 recovery established a working Console session after the CLI update. Independent GLM-5.2 response tests passed through direct CLI and a disposable Paseo OpenCode agent. Desktop initially still showed the expired-key failure; after its own graceful close/reopen, an actual Desktop-composer test with the user's selected Muse Spark 1.3 Contributor returned `OPENCODE_DESKTOP_OK`.

The expired legacy key entry was preserved. No new API key was created or substituted, no selected-model default was changed for this authentication repair, and the stopped Codex/Paseo bridge repair was not resumed. These are historical results, not current health guarantees. Report which surfaces were tested now and which remain unverified.

## Authoritative references

- [OpenCode CLI](https://opencode.ai/docs/cli/): current upgrade and Console commands; also check installed `--help`.
- [OpenCode Console API and device authorization](https://opencode.ai/v2/docs/console/api/): current device-flow and credential semantics.
- [Paseo CLI](https://paseo.sh/docs/cli): provider diagnostics and disposable agent/workspace operations.
