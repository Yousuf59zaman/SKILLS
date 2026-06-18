---
name: basha-command-bridge-gpt
description: Build, repair, or recreate a private ChatGPT Custom GPT that controls a Windows PC through an authenticated local command bridge. Use when the user asks to make a "local command bridge GPT", "home/office PC GPT", a Custom GPT with filesystem/command capabilities, Cloudflare tunnel-backed ChatGPT Actions, or to reduce ChatGPT action Allow/Deny prompts with non-consequential OpenAPI metadata.
---

# Basha Command Bridge GPT

## Core Workflow

Create a local FastAPI bridge, expose it through Cloudflare Tunnel, configure a private ChatGPT Custom GPT Action, and verify real command/file operations.

Use the bundled scaffold when starting from scratch:

```powershell
python "<skill-dir>\scripts\scaffold_bridge.py" --target "<project-dir>" --gpt-name "Basha Commander"
```

The scaffold copies `assets/bridge-template`, creates `.env` with a fresh `BRIDGE_SECRET`, and writes GPT instruction text under `custom-gpt/`.

## Bridge Setup

Run these from the scaffolded project:

```powershell
.\scripts\setup.ps1
.\scripts\start-bridge.ps1 -Detached
.\scripts\test-bridge.ps1
```

If the test fails, fix the bridge before touching ChatGPT. Never paste or reveal `BRIDGE_SECRET` in chat; use it only in the ChatGPT Action auth field.

Expose the bridge:

```powershell
.\scripts\install-cloudflared.ps1
.\scripts\start-tunnel.ps1 -Quick -Detached
```

For a durable setup, prefer a named Cloudflare Tunnel/hostname or token instead of a quick `trycloudflare.com` URL. Quick tunnel URLs change after restart and may make ChatGPT ask for domain consent again.

Verify the public schema before importing:

```powershell
$url = (Get-Content .\.tunnel-url -Raw).Trim()
$schema = Invoke-RestMethod "$url/openapi.json"
$schema.paths.'/commands/start'.post.'x-openai-isConsequential'
Invoke-WebRequest "$url/privacy" -UseBasicParsing
```

The consequential flag must be `False` for every operation. The template server sets this in custom OpenAPI and adds `/privacy` outside the schema.

## ChatGPT Configuration

Use the Browser skill for ChatGPT editor work when available. If sign-in blocks progress, ask the user to sign in.

In the GPT editor:

1. Create or open the GPT.
2. Set a distinct name, description, and the desired model/capabilities.
3. Paste the generated `custom-gpt/*-instructions.md`.
4. Add an Action by importing `<public-url>/openapi.json`.
5. Set privacy policy to `<public-url>/privacy`.
6. Set Authentication to API Key, Auth Type `Bearer`, value from `.env` `BRIDGE_SECRET`.
7. Save with visibility `Only me` unless the user explicitly asks otherwise.

If editing an existing action, use the UI's `Import from URL` flow again. Directly filling the schema textarea may not mark the GPT as dirty in React, so the `Update` button may stay ineffective.

## Permission Prompts

To reduce Allow/Deny prompts, ensure the imported schema includes:

```json
"x-openai-isConsequential": false
```

If ChatGPT still asks once for a new GPT/domain, that is platform-level consent and cannot be guaranteed away by the bridge. Click `Allow` only when the user has already authorized this setup. Stable hostname plus reimported non-consequential schema is the best available mitigation.

## Final Tests

Test in the live GPT, not only the builder:

```text
Use the Basha Command Bridge action now. Run PowerShell command: Write-Output no-confirm-test. Return stdout only.
```

Expected result: the GPT talks to the tunnel and returns `no-confirm-test`. Check `logs/audit.jsonl` for `command_start` and `command_finish` with `status: succeeded`.

Also test filesystem capability with a temp file: create, read, delete, then verify `Test-Path` is `False`.

## Operational Notes

Keep the bridge local host bound (`127.0.0.1`) and require Bearer auth. Do not weaken auth to solve connectivity issues.

If the tunnel URL changes, update `.tunnel-url`/`BRIDGE_PUBLIC_BASE_URL`, re-import the schema in the GPT action, update privacy URL if needed, and save the GPT again.

When finishing, report the GPT URL, project path, whether the bridge/tunnel are running, test results, and any remaining limitation around quick tunnel durability or one-time ChatGPT consent.
