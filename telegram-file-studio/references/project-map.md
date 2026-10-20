# Project map and provenance

## Identity and environment

Snapshot initially inspected on 2026-10-18; feature and release evidence checked through 2026-10-20. Verify again before making changes. For current video-output behavior see [video-download-policy.md](video-download-policy.md).

- Application: Usuf File Studio, same bot username `usufvideodwnlderbot`.
- Authorized host observed: `Usuf-Desktop`, Windows; resolve the online device through the connector rather than hardcoding its UUID.
- Project: `G:\TelegramVideoBot`.
- Runtime: Node.js + grammY; host `yt-dlp.exe` and FFmpeg for video links.
- Telegram service: Docker Compose service `telegram-api`, image `aiogram/telegram-bot-api`, local mode, host `127.0.0.1:8081`, named data volume.
- Conversion image: `telegram-video-studio:2`. Worker code is bind-mounted, so the image contains dependencies, not the evolving worker.
- Display name and username are distinct. Do not rename the bot/account without a request.

## Files to inspect

| Path relative to project | Responsibility |
|---|---|
| `bot.js` | Thin entrypoint importing `startStudio` from `studio-v2/main.mjs`; redact top-level failures. |
| `studio-v2/main.mjs` | Owner authorization, contextual keyboards, callback routing, settings, file sessions, batch collection, queue, cancel/retry, profile and commands. Exports `createStudio` for tests and `startStudio` for live startup. |
| `studio-v2/services.mjs` | Format families, URL validation, filenames, disk checks, Telegram file intake, isolated conversion runs, downloader, old-job cleanup. |
| `studio-v2/toolbox/worker.py` | Image/PDF/document/data/media conversion and validation; per-job `job.json` to `result.json`; isolated outputs for each batch item. |
| `studio-v2/toolbox/Dockerfile` | Python-based converter dependencies, FFmpeg, LibreOffice, Pandoc, fonts; unprivileged user. |
| `runtime.mjs` | Local config validation, redaction, native command execution, Docker readiness, local API calls. |
| `supervisor.js` | Single-instance PID lock; start/check Docker; restart a stopped child after approximately 25 seconds; operational logging. |
| `setup.ps1`, `SETUP.cmd` | Resumable local-only credential entry and bootstrap; `-Reconfigure` is explicit, not the normal recovery path. |
| `bootstrap.mjs`, `enable-startup.ps1`, `start-hidden.vbs` | One-time cloud-to-local migration, readiness verification and hidden Windows sign-in launcher. |
| `check-status.mjs`, `check-status.ps1` | Existing live health report; output includes redacted log tail. Prefer this skill's inspector when sharing minimal diagnostics. |
| `studio-v2/tests/` | Synthetic fixtures, converter/output tests, UI tests, extra and batch regression tests. Also includes `download-720p-regression.mjs`, `iphone-link-smoke.mjs`, `iphone-compatibility.mjs` and `instagram-access-test.mjs` for the 2026-10-20 download policy. |
| `studio-v2/live-test.mjs` | Real Telegram upload/retrieval/resize/send test. Sends messages to owner and deletes its synthetic input message. Not read-only. |
| `studio-v2/release.json`, `engine-versions.txt` | Dated test evidence, deployed source hashes, observed engine versions; not evergreen guarantees. |

## Private runtime locations (do not publish)

`.env` contains `BOT_TOKEN`, `OWNER_ID`, `BOT_API_ROOT`. `.telegram-api.env` contains `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`. The values remain on the PC. Numeric user ID and Telegram API application ID are different identifiers; neither is the bot username.

`state/supervisor.pid` and `state/bot.pid` record running processes; verify process identity because stale PIDs can be reused. `state/local-api-ready.json` records migration identity. Settings, file references and work state also live under `state/`; inspect relevant source to determine the current filenames, without dumping private file references.

`downloads/studio/<UUID>/` is a job workspace. `logs/` contains operational logs. `backups/` contains old source. Do not recursively copy these into Git or a skill.

Windows autostart shortcut observed: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TelegramVideoBot.lnk`. It launches the hidden supervisor, not a second polling bot. Do not reset Docker globally: it also runs unrelated applications on this PC.

## File path boundary between Docker and Windows

In local mode, `getFile` returns an absolute Linux path beneath `/var/lib/telegram-bot-api/`. It is not a host Windows path or a public download URL. The service verifies the path and container ID, then uses `docker cp` into the specific job directory. Do not fetch `/file/bot<TOKEN>/...` from the cloud as a substitute.

A conversion worker receives only `/work` and read-only `/opt/worker.py`. It has no network, no capabilities, no new privileges, a read-only root, limited `/tmp`, 2 CPU cores, 2 GB RAM and 256 processes. The Dockerfile uses UID/GID 65534. Preserve these controls and the 2-hour deadline.

## Version snapshot, not an update recommendation

The inspected release was 2.0.0, deployed 2026-10-18. Observed host versions included Node 24.15.0, Docker 29.1.3, grammY 1.46.0 and yt-dlp 2026.08.19. The host FFmpeg downloader copy was 6.1.1; the conversion image separately recorded FFmpeg 7.1.5, LibreOffice 25.2.3.2, Pandoc 3.1.11.1 and Python packages in `engine-versions.txt`.

Do not call these the latest versions. Check actual installed versions and primary release documentation for update work. Test changed packages and rebuild deliberately; automatic engine updates were not enabled. Do not redistribute installed font files in the skill.
