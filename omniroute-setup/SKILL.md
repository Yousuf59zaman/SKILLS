---
name: omniroute-setup
description: "Set up and wire the OmniRoute AI router (localhost:20128) into OpenCode, VS Code GitHub Copilot, Codex, and relay-ai (Claude/Codex/Antigravity desktop apps). Use when Yousuf asks to set up/repair/connect Omniroute, add it as a provider to opencode, Copilot, relay-ai, codex, or antigravity, or debug 'no provider / no response / popup' issues with Omniroute models."
---

# OmniRoute Setup

OmniRoute is the local AI router/gateway that aggregates many upstream model providers
(free `oc/*`, `aug/*` via the `auggie` CLI, `tllm/*`, etc.) behind one OpenAI-compatible
endpoint. This skill records how it is installed on this machine and how to wire it into
every coding tool so they can use the `auto/*` routing models.

Core facts:
- Server: OmniRoute runs on **D:\OmniRoute** (not on C: — C: has no space).
- Endpoint: `http://localhost:20128/v1` (OpenAI-compatible; also `/v1/responses`).
- Config/data dir: `C:\Users\User\.omniroute\` (`.env`, `storage.sqlite`, logs).
- Server must be running for every integration below. It auto-starts at login via
  `OmniRoute.vbs` in the Startup folder → `D:\OmniRoute\start-omniroute.bat`.

## 1. Server — start / repair / verify

```bash
# start daemon (uses the D: install)
cd /d/OmniRoute && node node_modules/omniroute/bin/omniroute.mjs serve --daemon --no-open
# verify
curl -sS http://localhost:20128/v1/models | head -c 200
# repair native module (needed if the server binds but HTTP requests time out)
cd /d/OmniRoute && node node_modules/omniroute/bin/omniroute.mjs runtime repair
# CLI (D: bin is on PATH)
omniroute providers list
```

Notes:
- `better-sqlite3` must be built for the installed Node ABI. If the server "starts" but
  `/v1/*` times out (curl HTTP 000), run `omniroute runtime repair`.
- The Startup `OmniRoute.vbs` launches `D:\OmniRoute\start-omniroute.bat`, which must call
  `omniroute.mjs serve --daemon --no-open` (not the old `omniroute.js` path).
- Omniroute does not validate inbound API keys on `/v1`; any Bearer (e.g. `omni-local`)
  is accepted. This matters for the relay-ai credential below.

## 2. OpenCode (opencode GUI / CLI)

Provider already configured in `C:\Users\User\.config\opencode\opencode.jsonc`:
- Provider id `omniroute`, `@ai-sdk/openai-compatible`, `baseURL: http://localhost:20128/v1`.
- Models: `auto/*`, `aug/*`, `oc/*`, `tllm/*`, `ddgw/*`.

Test through OpenCode CLI (same config the desktop app reads):
```bash
opencode run --model "omniroute/auto/best-coding" --format json "Return the exact word: WORKING"
# look for "type":"text" and "text":"WORKING" — exit 0 means the router answered.
```
Use `--format json` for machine-readable output; `--format default` renders ANSI/TUI and
prints nothing when piped without a TTY (a display quirk, not a failure).

## 3. VS Code GitHub Copilot (custom language model)

`C:\Users\User\AppData\Roaming\Code\User\chatLanguageModels.json` adds OmniRoute as a
Copilot "custom endpoint" provider (vendor `customendpoint`, apiType `chat`):
- url `http://localhost:20128/v1/chat/completions`, apiKey `omni-local` (harmless placeholder).
- Models `auto/best-coding`, `auto/best-fast`, `auto/best-reasoning`, plus `oc/deepseek-v4-flash-free`
  ("DeepSeek V4 Flash (Free)") — a direct free model that usually returns real text fast;
  add it as a selection when a concrete reliable model is preferred over the `auto/*` router.

Then in VS Code: **Copilot Chat → model picker → OmniRoute → Auto Best-Coding/Fast/Reasoning**.
Copilot Chat is a built-in of VS Code 1.130 (github.copilot-chat v0.58+); the marketplace
`github.copilot` core refuses to install by design — do not fight it.
Keep the existing `OpenCode Go` provider entry when editing the file.

## 4. Codex CLI / desktop (shared ~/.codex)

- `[model_providers.omniroute]` block in `C:\Users\User\.codex\config.toml`:
  `base_url = "http://localhost:20128/v1"`, `wire_api = "responses"` (Codex >= 0.144
  requires the Responses API; `wire_api = "chat"` is rejected), `env_key = "OMNIROUTE_API_KEY"`.
- Profiles from `omniroute setup-codex` (e.g. `~/.codex/auto-best-coding.config.toml`):
  ```bash
  node "D:\OmniRoute\node_modules\omniroute\bin\omniroute.mjs" setup-codex \
    --only auto/best-coding,auto/best-fast,auto/best-reasoning,auto/cheap,auto/claude-sonnet
  ```
- Use a profile:
  ```bash
  OMNIROUTE_API_KEY=omni-local codex -p auto-best-coding exec --skip-git-repo-check "task"
  ```
  (`wire_api = "responses"` — if you see "`wire_api = "chat"` is no longer supported",
  change it to `responses`.)

## 5. relay-ai provider registry (codex / claude / antigravity / desktop apps)

1. Add OmniRoute to `C:\Users\User\.relay-ai\providers.json` (backup first). Entry shape:
   ```json
   {
     "id": "omniroute",
     "templateId": "lmstudio",
     "name": "OmniRoute",
     "enabled": true,
     "authRef": "keyring:global:omniroute",
     "authType": "api",
     "api": { "url": "http://localhost:20128/v1", "npm": "@ai-sdk/openai-compatible" },
     "modelsCache": { "fetchedAt": "<now>", "models": [ { "id": "auto/best-coding", "name": "auto/best-coding", "upstreamModelId": "auto/best-coding" }, ... ] }
   }
   ```
   Populate `modelsCache` from `GET http://localhost:20128/v1/models` (`data[].id`).
2. **Credential (critical):** relay-ai drops providers with no API key at launch. Provide one
   via BOTH (file fallback makes it work in any shell):
   - env: `RELAY_AI_KEY_OMNIROUTE=omni-local` (user env)
   - file: `C:\Users\User\.relay-ai\secrets.json` → `{ "version":1, "accounts": { "global:omniroute": "omni-local" } }`
3. Verify:
   ```bash
   relay-ai providers list                       # shows OmniRoute + 99 models
   relay-ai claude --dry-run --provider omniroute --model auto/best-coding
   relay-ai codex --config --provider omniroute --model auto/best-coding
   # real one-shot (Claude CLI):
   relay-ai claude --provider omniroute --model auto/best-coding -p "Reply with exactly: OK" --output-format stream-json
   ```
4. Desktop apps (registry providers appear in their pickers):
   - Claude app: `relay-ai claude-app` (interactive TTY only) → pick **OmniRoute**.
   - ChatGPT/Codex app: `relay-ai chatgpt` (alias `codex-app`).
   - Antigravity desktop app: `relay-ai antigravity --provider omniroute --model auto/best-coding`
     (NOT `antigravity-ide`, which is the IDE). Injects models via a local Cloud Code gateway
     (port 5770); runs a Relay-managed isolated profile at `~/.relay-ai/antigravity/app-profile`.

## Verification (quick checklist)

```bash
curl -sS -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:20128/v1/models   # 200
relay-ai providers list                                                            # OmniRoute present
opencode run --model omniroute/auto/best-coding --format json "Return: WORKING"    # text:"WORKING"
relay-ai claude --dry-run --provider omniroute --model auto/best-coding            # Provider: OmniRoute
```

## Troubleshooting

- **OpenCode GUI: flashing terminal popup + no response.** Router churns through failed
  upstreams. Root cause seen: the `auggie` CLI (needed for `aug/*` models) is NOT installed,
  OpenRouter credits exhausted, and free `oc/*` models often return empty/reasoning-only
  content. Workarounds: use a reliably-returning model (`omniroute/oc/deepseek-v4-flash-free`
  or `oc/big-pickle`), or add a real paid upstream (ChatGPT OAuth / OpenAI key / install
  `auggie` + `auggie login`). The flashing console = failed Windows console-child spawns.
- **relay-ai claude-app does not show OmniRoute.** Cause: provider dropped because its
  credential resolved to nothing in that shell. Fix = the `secrets.json` file credential
  (step 5.2). Confirm via:
  `node <relay-ai>/dist/chunk-IYYLLN5T.js` probe of `fetchProviderCatalog()` +
  `providersForTarget(catalog,'claude-app')` → should list `zen, go, omniroute`.
- **relay-ai claude-app requires an interactive terminal.** It is a TTY picker; run it in a
  real terminal, not a piped/headless shell.
- **Codex rejects provider:** `wire_api = "chat"` → change to `responses`.
- **Server up but HTTP times out:** run `omniroute runtime repair` (better-sqlite3 ABI).
- **ChatGPT connect:** Omniroute's ChatGPT subscription path is the `codex` OAuth provider
  (dashboard → Providers → Codex/OpenAI → authorize). Import-token API needs an OmniRoute
  API key (create in dashboard). Not automatable headless.
