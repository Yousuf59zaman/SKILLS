# Update Basha Commander Agentic GPT

## Scope

Use this maintenance branch only for the existing Basha Commander Custom GPT and its existing command bridge. Do not recreate the bridge, change bridge auth, or make unrelated OpenClaw/Codex routing changes unless the user asks separately.

Primary local instruction file:

```text
C:\Users\User\Documents\Playground\basha-command-bridge\custom-gpt\Basha-Commander-instructions.md
```

GPT editor:

```text
https://chatgpt.com/gpts/editor/g-6a33c221af8081918be24bd2e0b8f9ee
```

Live GPT:

```text
https://chatgpt.com/g/g-6a33c221af8081918be24bd2e0b8f9ee-basha-commander
```

## Required Instruction Content

Make the Custom GPT instructions require these behaviors:

- Behave like a Codex-style local agent: inspect -> edit/run -> test -> retry -> report.
- Default to best-effort action through the bridge instead of advice-only responses.
- Use bridge capabilities for file create/edit/delete/search/list, PowerShell/cmd commands, build/test/debug, git, OpenClaw, and local automation tasks.
- Keep routine already-authorized work efficient, but never bypass platform confirmations or mislabel consequential command/file operations.
- Never reveal bridge secrets, bearer tokens, tunnel credentials, passwords, or auth tokens.
- For OpenClaw work, ensure OpenClaw Gateway is running before interacting with agents or cron jobs.
- Explain that actual hidden model thinking is not visible, but the GPT can provide a visible work log: plan, command/action being run, result, and next step.

## Update Workflow

1. Read the current local instruction file.
2. Patch only the instruction text needed for the required behaviors above.
3. Keep the text intended for ChatGPT's Instructions field under 8000 characters. If the editor reports `GPT instructions cannot be longer than 8000 characters`, compact the wording while preserving the required behaviors.
4. Use Chrome, not the in-app browser, to open the GPT editor.
5. Paste the updated instructions into the Instructions field.
6. Confirm the Custom GPT capabilities are enabled: Web Search, Canvas, Image Generation, and Code Interpreter & Data Analysis.
7. Save/update the GPT. Wait until pending-save status clears.
8. Open the live GPT and run a bridge smoke test:

```text
Use your Basha Command Bridge action now. Run PowerShell command: Write-Output agentic-bridge-test. Return stdout only.
```

9. Confirm no Allow/Deny prompt appears. If a one-time domain consent appears because ChatGPT reset the domain grant, complete only the specific consent the user has authorized; otherwise report the remaining consent step.
10. Verify the bridge audit log has a matching successful command finish with exit code 0:

```text
C:\Users\User\Documents\Playground\basha-command-bridge\logs\audit.jsonl
```

## Completion Criteria

Report these items when finished:

- Basha Commander Custom GPT updated through Chrome.
- Codex-style agentic behavior added.
- Best-effort action behavior added.
- Bridge file/command/build/test/debug/git/OpenClaw/local automation rules added.
- Capabilities verified: Web Search, Canvas, Image Generation, Code Interpreter & Data Analysis.
- Local instruction file updated.
- 8000-character save issue handled if encountered.
- Live bridge action smoke test passed.
- No Allow/Deny prompt appeared, or persistent allow was restored.
- Audit log showed `succeeded` with exit code `0`.
- Hidden thinking cannot be shown; visible work-log behavior is the supported alternative.
