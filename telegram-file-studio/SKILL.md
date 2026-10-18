---
name: telegram-file-studio
description: Operate, troubleshoot, extend and safely update Yousuf's existing Usuf File Studio Telegram bot at G:\TelegramVideoBot on his authorized Windows PC. Use for the Telegram video downloader, image resize/edit/compression, file conversion, PDF/document/media tools, button menus, batch/queue/cancel, Docker Local Bot API, Windows silent startup, bot recovery, or saving and syncing this project's reusable knowledge. Trigger on references to Usuf File Studio, usufvideodwnlderbot, the 2 GB Telegram bot, or continuing this Telegram project. Use Remote Desktop Commander for PC work and the existing agent-sync skill for agent/GitHub synchronization.
---

# Telegram File Studio

Maintain the existing application; do not replace it with a demo or create another bot. Treat this bundle as an operational skill, not a complete application backup or a promise of universal conversion.

## Establish the current state

1. Use the authorized Remote Desktop Commander connection. Discover its actual tool schema; select the online device before reading files. Do not invent `functions.exec`, `ALL_TOOLS`, or MCP function names from old transcripts.
2. Resolve `G:\TelegramVideoBot` on that PC. Do not confuse remote Windows paths with the assistant's working container. If the path is absent, locate the project or ask; do not silently create an empty replacement.
3. Read the relevant current source and the project's `studio-v2/README.md` and `studio-v2/release.json`. Treat the dated reference snapshot as a starting point, not current health.
4. Run the bundled read-only inspector on the PC:
   ```powershell
   node "<this-skill>\scripts\inspect-studio.mjs" --project "G:\TelegramVideoBot"
   ```
   Add `--live` for read-only Docker and local Telegram `getMe` checks. It never starts/stops services, sends chat messages, prints secrets, or edits the project. Do not claim live health from the default offline inspection.
5. Identify the smallest requested task. For troubleshooting, read [runbook.md](references/runbook.md). For feature work, read [project-map.md](references/project-map.md) and [capabilities.md](references/capabilities.md). For tests, release evidence and publishing, read [validation-and-sync.md](references/validation-and-sync.md).

## Preserve these invariants

- Keep the same bot (`@usufvideodwnlderbot`), private-chat owner restriction, and existing locally stored credentials. Never ask the user to repost a token/hash or recreate credentials just because Docker is stopped.
- Never read secret values into a chat/tool response. Keep `.env`, `.telegram-api.env`, Telegram sessions/cookies, private user files, logs, caches, `state/`, binaries and backups out of skill packages and Git commits. Inspect credential shape/availability locally and report booleans only.
- Bind the Local Bot API to `127.0.0.1:8081`; retain `--local`. Do not expose it to LAN/public interfaces or use a third-party proxy for credentials.
- Preserve the network-disabled, non-root, resource-limited conversion workers. Never mount the whole project, home directory, Docker socket or credentials into a conversion worker. Do not enable macros or external SVG resources.
- Retain strict supported HTTPS link validation, argument-array subprocess spawning, output-path confinement, output-size checks, cancellation, workspace cleanup and secret redaction.
- Keep one supervisor and one polling bot. Do not start a second `npm start`/`node bot.js` beside a healthy supervisor. Never kill all Node, Docker, WSL or PowerShell processes to restart this bot.
- Describe startup accurately: automatic **after Windows sign-in**, not a Windows service guaranteed to start before login. The PC must remain powered and connected.
- Offer compatible conversions only. Do not promise arbitrary any-to-any conversion, perfect PDF-to-Word layout, OCR, recovered upscale detail or lossless preservation across unlike formats.

## Implement changes safely

1. Inspect the precise affected source; preserve unrelated local edits. Back up only the relevant source outside the skill package. Do not include credentials in source archives.
2. Keep the live bot serving while developing and running isolated tests. Avoid rebuilding the large engine image for a worker-only change: `worker.py` is mounted read-only at runtime.
3. Extend the existing contextual menus and conversion handlers together. Preserve Home/Back/Cancel, meaningful choices, short help, result size/dimensions, retry and original/result reuse. Offer original-resolution image intake as File/Document.
4. Retain the existing link-download flow and the conservative limits in [capabilities.md](references/capabilities.md). Changing a limit requires a tested resource and failure-handling decision, not simply a larger constant.
5. Run syntax checks, relevant converter/output checks and UI/cancel/queue regressions. Use synthetic fixtures. Run a real Telegram send test only within the user's authorized task; it changes their chat.
6. Deploy at an idle moment. Verify that the PID read from `state/bot.pid` is the actual project child by inspecting its executable/command line. Stop only that child and allow the existing supervisor to restart it. Recheck health and the menu.
7. Report what changed, what was tested, whether the bot is running, and any unverified boundaries. Explain normal next steps in Bangla unless the user asks otherwise.

## Recovery is not reinstallation

Use the current resumable `SETUP.cmd` only when actual startup/setup recovery is needed. It reuses valid credentials. Its bootstrap can reset command registrations to the original downloader commands; after bootstrap recovery, ensure the v2 command menu is restored. Do not run bootstrap merely to inspect a healthy v2 bot.

Preserve `state/local-api-ready.json`. It prevents unnecessary repeat migration from the Telegram cloud API. Do not repeatedly call cloud `logOut` for an already healthy local bot. Do not discard pending updates.

## Deliverables and synchronization

For a code task, update the live project and verify it; this skill alone does not deploy code. For a skill task, update this entire bundle, run `node scripts/test-inspector.mjs`, validate and package it as `skill.zip`.

When asked to sync/publish, load the user's **agent-sync** skill first. Pull `SKILLS/main` before publishing, inspect dirty worktrees and the mandatory GitHub comparison, and preserve unrelated changes. Use the skills track, not tools/MCP/PATH installation, unless those tracks were requested. Follow the scoped workflow in [validation-and-sync.md](references/validation-and-sync.md). Never force-push or include private runtime content.
