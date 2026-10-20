# Operations and troubleshooting

## Inspect before acting

Use the bundled inspector without `--live` first; add `--live` for read-only Docker and Telegram identity checks. It returns configuration validity flags, source presence and release hash comparisons, without credential values or file contents. Missing binaries/services require explanation, not blind reinstall.

The existing `node check-status.mjs` from the project is also useful, but it includes a log tail. Run it locally and retain redaction before sharing results. Confirm both a verified supervisor and bot child, a running Compose `telegram-api`, actual process `--local`, loopback port binding, converter image presence and Telegram responsiveness. A PID alone can be stale or reused.

Check active work before a restart. Do not poll `getUpdates` with a second client while the bot is polling. Do not run `live-test.mjs` as a health probe: it sends and removes Telegram test messages.

## Recover existing setup

Run `G:\TelegramVideoBot\SETUP.cmd` locally only when setup/startup recovery is needed. Current `setup.ps1` reuses valid files and delegates native process handling to `bootstrap.mjs`/`runtime.mjs`. Use `-Reconfigure` only when credentials actually need replacement and the user authorizes it.

For credentials that do not exist yet, guide local entry: BotFather API token, numeric owner user ID, then the separate Telegram API application ID/hash from the official application portal. Explain that a token contains digits, a colon and an opaque suffix; API hash is not a bot token. Never ask for a screenshot containing secrets or copy them into Git.

Bootstrap starts Docker, starts the local service, verifies the bot and installs the hidden startup shortcut. It uses `state/local-api-ready.json` to avoid repeated cloud `logOut`, and preserves pending updates when deleting a webhook. Preserve this marker. Recovery bootstrap currently registers original downloader commands, so restore/check the Studio v2 menu afterwards. Do not use bootstrap unnecessarily while a healthy Studio child is running.

## Failure patterns already encountered

### Invalid BotFather token format

This is input validation, not necessarily a revoked token. Trim accidental surrounding whitespace/quotes. Ask the user to copy only the token from their own BotFather conversation, not username/link/API hash or the whole message. Permit a bounded retry. If Telegram rejects a correctly shaped token, distinguish authentication failure from network failure without displaying the token.

### Docker Linux-engine named pipe missing

Docker Desktop was not running. The original PowerShell script used `$ErrorActionPreference = 'Stop'` and invoked `docker info ... 2>$null`; native stderr could terminate the script before its recovery branch. Silencing stderr did not fix control flow.

Keep the repaired design: capture native command output and exit status in Node, start Docker Desktop only if needed, poll readiness with a deadline, then continue using the saved credentials. Do not remove Docker data, reboot Windows, change unrelated containers, or make the user re-enter secrets.

### Settings saved into one line

The old PowerShell expression `@('BOT_TOKEN='+$token, 'OWNER_ID='+$userId, ...)` produced a concatenated one-line record. The repair uses separate interpolated strings and `WriteAllLines` with UTF-8 without BOM. Check key counts/line structure locally without printing values. The project contains the historical `repair-config.mjs`; inspect it before any use and do not automatically normalize unknown malformed content.

### Video downloads but merge fails

An old 2018 FFmpeg binary failed a real audio/video merge. It was replaced and the merge retested. Check the host `bin/ffmpeg.exe` used by yt-dlp separately from FFmpeg in the converter image. Do not assume a file existing means a compatible binary. Use the configured Node JavaScript runtime for yt-dlp rather than silently ignoring runtime warnings.

### Video links and iPhone Photos troubleshooting (2026-10-20)

Read [video-download-policy.md](video-download-policy.md) for the current **hard 720p link-output maximum** and precise flow. The current implementation prefers native H.264/AAC/yuv420p MP4 at up to 720p, then uses the isolated converter only if needed. The 720p limit is by shorter edge, so portrait is usually 720 x 1280. Inspect final dimensions and codec via ffprobe; filenames and file sizes alone do not establish compatibility or resolution. Captions include measured output width/height and MB.

If Telegram says "Saved to Photos" but iPhone Photos has no video, inspect Photos > Recently Saved, the iOS Photos permission and actual codec. A prior AV1/Opus MP4 failed on iPhone while its H.264/AAC converted MP4 successfully imported. Do not claim the latest automatically selected 720p output was end-to-end tested on that phone unless the user has confirmed it. If necessary, try File > Save to Files > Share > Save Video.

If Instagram reports "This content isn't available to everyone" at metadata extraction, it is an upstream audience/login-access restriction, not a codec or Photos issue. Public alternatives can work. The bot now shows a concise Bangla error and omits pointless retries; never automatically access browser cookies, credentials or restricted accounts.

### Telegram chat not found or no response

Check authorized owner matching without echoing credentials. The user must open their bot and press Start before a normal bot can reply in that private chat. Check owner restriction, private chat type, Telegram reachability, pending jobs and duplicate polling. Do not widen owner access to diagnose.

### Profile setup fails with BOT_SHARETEXT_INVALID

The observed grammY version's convenience methods accept strings, e.g. `setMyName('Usuf File Studio')`, `setMyDescription('...')`, `setMyShortDescription('...')`. Passing an object intended for a raw Bot API call caused the failure. Inspect installed declarations before changes; keep raw API parameter objects separate from wrapper signatures. Verify `/menu` command registration and the actual displayed profile.

### Local getFile returns a Linux path

Use validated `docker cp` from the specific Local Bot API container into the job directory. Do not treat the path as a Windows file or send an authenticated file URL to another service. Retain the `/var/lib/telegram-bot-api/` allowlist and path traversal checks.

### Conversion/cancel/batch problems

Check image presence, family compatibility, input limits, disk reserve, worker output contract and cancellation signals. Keep each batch member's derived files isolated so two PDFs exporting page images cannot overwrite each other. A cancelled job must not block the next queue item. Report timeout/memory/unsupported errors plainly; do not claim success merely because Docker started.

## Safe update and rollback

1. Read the exact files and existing changes. Back up the current entrypoint and affected source; preserve private state/config separately on the user's PC, never in a distributable skill.
2. Run syntax and synthetic converter/UI tests while the current bot stays online. Keep engine rebuilds deliberate; source-only worker edits do not need a rebuild.
3. At an idle moment, verify the recorded bot PID against its command line. Stop only that child. The existing supervisor waits about 25 seconds before restarting; do not race it with another manual bot launch.
4. Recheck the running process, Local Bot API, v2 commands and health. A real owner-chat test requires authorized messaging and a synthetic file; do not delete unrelated messages.
5. On regression, restore the just-created matching source backup and restart the verified child. Restoring the historical v1 downloader is an emergency rollback that removes Studio features; never do it silently.

Do not run historical one-shot `fixes.mjs`, `polish.mjs`, `qa-fixes.mjs`, `deploy.mjs`, `profile-fix.mjs`, `finalize.mjs` or other migration scripts blindly. They may not be idempotent and may target old exact strings. Inspect their effects first. Do not use force reset or global process termination as cleanup.
