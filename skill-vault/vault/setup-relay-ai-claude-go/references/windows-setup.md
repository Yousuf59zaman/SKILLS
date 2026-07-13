# Windows setup reference

## Preflight

- Target Windows 10/11 x64 with administrator access.
- Relay AI requires Node `>=18`; prefer current Node 22 LTS x64.
- Detect Node/npm, Codex CLI, Relay AI, Appx Claude, legacy `%LOCALAPPDATA%\AnthropicClaude`, running processes, and stale Relay locks before changing anything.
- Back up non-secret config files. Preserve `%APPDATA%\Claude` without copying credential contents into logs.

## Install Relay AI

Install missing prerequisites, then pin Relay AI:

```powershell
npm install -g @openai/codex
npm install -g @jacobbd/relay-ai@0.4.0
relay-ai --ai --install --force
relay-ai --version
```

Require the final Relay version to be exactly `0.4.0`.

## Install Claude Desktop

1. Restore any interrupted Relay overlay with `relay-ai claude-app --restore` and close Claude processes.
2. Download the current x64 installer only from `https://claude.com/download` or Anthropic's current official redirect.
3. Check `Get-AuthenticodeSignature`; require `Status = Valid` and signer `Anthropic, PBC`.
4. Use the bootstrapper's own `--help` output to select supported flags. For Relay use, a signed current-user MSIX installation is sufficient.
5. Verify `Get-AppxPackage -Name Claude` returns `Status = Ok`, the installed `Claude.exe` signature is valid, and the UI opens with the prior profile/history.
6. Only then validate and remove the exact legacy `%LOCALAPPDATA%\AnthropicClaude` directory if it is a dead Squirrel remnant. Never remove `%APPDATA%\Claude`.

## Credential storage

Use the bundled credential script. It prompts with `Read-Host -AsSecureString`, passes the key to Node through redirected stdin, and stores it in:

- service: `relay-ai`
- account: `global:opencode`

Legacy accounts removed after live refresh:

- `relay-ai` / `relay-ai`
- `opencode-starter` / `opencode-starter`

Remove persistent overrides after validation so keyring remains authoritative:

- `OPENCODE_API_KEY`
- `RELAY_AI_KEY_GO`
- `RELAY_AI_KEY_ZEN`

Never print their values.

## Go catalog and favorites

Refresh first:

```powershell
relay-ai providers refresh-models go
```

Use every current live model when the count is at most 20. Order `glm-5.2` first, `qwen3.7-plus` second, and retain live catalog order for the rest. Stop if either required model is missing or the catalog exceeds Relay's 20-model favorites cap.

The 18-model baseline observed on 2026-07-13 was:

```text
minimax-m3, minimax-m2.7, minimax-m2.5, kimi-k2.7-code,
kimi-k2.6, kimi-k2.5, glm-5.2, glm-5.1, glm-5,
deepseek-v4-pro, deepseek-v4-flash, qwen3.7-max,
qwen3.7-plus, qwen3.6-plus, qwen3.5-plus,
mimo-v2.5-pro, mimo-v2.5, hy3-preview
```

Treat this as a reference, not a frozen catalog.

## Acceptance checks

- Relay version exactly `0.4.0`.
- Claude Appx status `Ok`; executable signature valid.
- New key read-back and live refresh succeed; no auth/quota error.
- Legacy keyring slots and persistent overrides are absent.
- Favorites match the live Go set with no missing, extra, or duplicate entries.
- Saved provider/model are `go` and `glm-5.2`.
- `relay-ai ui` opens.
- `relay-ai claude-app` launched through `⭐ Favorites Catalog` exposes all favorites and returns a live response.

