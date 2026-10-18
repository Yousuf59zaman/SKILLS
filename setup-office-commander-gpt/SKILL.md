---
name: setup-office-commander-gpt
description: Build, repair, migrate, or verify a private Office Commander ChatGPT Custom GPT that controls a separate Windows office laptop through an authenticated local command bridge. Use for Office Commander bridge work involving Windows apps/processes, clipboard, screenshots, window control, Chrome automation, Google Workspace, GitHub, Figma, Postman, Custom GPT Actions, stable HTTPS tunnels, no-Allow/Deny metadata, account onboarding, or reproduction on another office PC while keeping Basha Commander and the home-PC bridge untouched.
---

# Setup Office Commander GPT

Build or repair the office-laptop GPT as a separate trust boundary. Preserve working components and verify every claimed capability through the live Custom GPT.

## Non-Negotiable Separation

- Confirm the target GPT is **Office Commander** before editing its instructions, Actions, or capabilities.
- Discover the Office GPT editor/live URLs from the current session or user-provided context. Do not substitute a Basha Commander URL or ID.
- Keep the Office bridge, runtime data, managed Chrome profile, tunnel, logs, and credentials separate from Basha Commander and the home PC.
- Stop if the only discoverable GPT or bridge is Basha Commander. Ask for the Office target instead of guessing.
- Never print, paste into chat, commit, or upload bearer tokens, OAuth callbacks, cookies, DPAPI blobs, API tokens, `.env.local`, `.runtime`, audit logs, or screenshots containing private data.

## Workflow

### 1. Audit Before Changing

1. Locate the authoritative Office bridge project. Prefer an existing `chatgpt-command-bridge` directory under the office user profile.
2. Inspect its routes, startup scripts, public URL, current process, tunnel, OpenAPI output, Custom GPT instructions, and audit log without exposing secrets.
3. Preserve the current bearer token and working account sessions unless the user explicitly requests rotation or logout.
4. Record unrelated dirty files and leave them untouched.

### 2. Enforce the Bridge Boundary

- Bind the Node bridge to `127.0.0.1`, never `0.0.0.0`.
- Require bearer authentication for every executable or data-bearing route.
- Expose only the privacy page and OpenAPI document without bearer auth.
- Reuse a stable HTTPS tunnel already configured for the Office bridge. Prefer the existing Tailscale Funnel; do not replace it merely to change providers.
- Keep `operationId` values stable after importing the schema into ChatGPT.
- Set `x-openai-isConsequential: false` on every Action operation that is intended to avoid recurring Allow/Deny prompts.
- Redact secrets from errors and audit structured events without command output, tokens, cookies, or private document content.

### 3. Provide the Office Integrations

Read [references/integration-contract.md](references/integration-contract.md) before adding, repairing, or testing adapters.

Expose one unified `officeIntegration` dispatcher for the Custom GPT. Support:

- Windows apps and processes.
- Clipboard read/write with restore during tests.
- Screenshot capture and cleanup.
- Window list, activate, move, and resize.
- Managed Chrome open, navigate, list, read, click, type, and screenshot.
- Gmail, Docs, Sheets, Calendar, Slides, Maps, and Drive through a dedicated Office Chrome profile.
- GitHub through authenticated GitHub CLI storage.
- Figma through a DPAPI-protected local token; allow the user to defer this connector.
- Postman through authenticated Postman CLI storage.

Do not claim a connector is configured merely because its executable exists. Test its authenticated status.

### 4. Keep Account Onboarding Local

- Use a dedicated managed Chrome profile for Office Google Workspace. Do not inspect cookies or browser storage.
- Use `gh auth` and the OS credential store for GitHub; never copy the resulting token into the skill or GPT.
- Use browser-based `postman login`. On Windows services with a constrained `PATH`, invoke the installed Postman JavaScript entrypoint with `process.execPath` instead of the npm PowerShell shim.
- Prompt for the Figma token only in a local hidden PowerShell prompt, protect it with Windows DPAPI, and store only the encrypted blob under the bridge runtime directory.
- Permit `-SkipFigma` or equivalent onboarding when the user says Figma will be connected later.

### 5. Configure the Custom GPT Through Chrome

1. Use the Chrome-control skill and the user's existing signed-in Chrome session.
2. Verify the editor heading and URL identify **Office Commander** before any write.
3. Keep the Instructions field below 8000 characters. Require inspect -> act -> verify -> retry -> report behavior, action-first execution, safe secret handling, and visible work logs.
4. Import the public `/openapi.json`, preserve API Key/Bearer authentication, and preserve the privacy URL.
5. Enable Web Search, Canvas, Image Generation, and Code Interpreter & Data Analysis when available.
6. Keep the GPT private (`Only me`) unless the user explicitly changes visibility.
7. Save and wait until pending-save state clears.

### 6. Verify End to End

Run the bundled verifier first:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-office-commander.ps1 -BridgeRoot "$env:USERPROFILE\chatgpt-command-bridge"
```

Add `-RequireFigma` only when Figma must be complete in the current task.

Then use a fresh Office Commander conversation and execute one exact `officeIntegration` call per message. Prefer low-impact checks:

- Windows app list filtered to a known app.
- Chrome status.
- Gmail open and Calendar open.
- GitHub status.
- Postman status.
- Figma status only when configured.

Confirm each response shows the Action domain was contacted, no Allow/Deny prompt appeared, and a matching external-IP audit event exists. For private Google apps, confirm the resulting tab stays on the intended Google host rather than redirecting to sign-in.

When Chrome work ends, preserve only the useful live verification tab and finalize the temporary tabs as required by the Chrome-control skill.

## Completion Criteria

Report only what is verified:

- Office bridge health and localhost binding.
- Stable public schema URL, bearer protection, unified dispatcher, and non-consequential metadata.
- Windows, Chrome, Google Workspace, GitHub, and Postman status.
- Figma configured or explicitly deferred.
- Custom GPT saved, private, and live-tested without an Allow/Deny prompt.
- External audit events observed.
- Basha Commander and the home-PC bridge remained untouched.

