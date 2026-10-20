# Video downloads: 720p cap, iPhone Photos, Instagram

Verified project policy on 2026-10-20. Confirm live code and settings before assuming it remains current.

## Owner's selected output policy

- **All pasted YouTube/Instagram/Facebook video links:** return at most **720p**, measured by the shorter edge, not by height alone. Landscape typical `1280 x 720`; portrait Reels/Shorts typical `720 x 1280`. Smaller originals are **not** upscaled.
- Default and persisted `settings.video` is `'720'`; older saved `best` or `1080` choices are overridden on startup. Only the 720p video-choice button is offered; stale higher-quality callback data cannot change this setting.
- Return iPhone Photos-friendly **MP4 / H.264 / yuv420p / AAC** (or H.264 video with no audio). Prefer a native, compatible, <=720p source to avoid CPU-heavy transcoding; do not forcibly re-encode every file.
- Return file size and *measured final* `width x height` in the Telegram video caption and job summary. File size varies with duration, bitrate and codec. A 720p limit is not a fixed MB guarantee.
- Preserve portrait/landscape aspect ratio. A limited source or source-available resolution may be smaller than 720p.
- Limit affects **link downloads**, not arbitrary user-uploaded files or manual file conversions. Do not silently redefine the latter.

## Source and processing implementation

- `studio-v2/main.mjs`: fixed 720 default/preference, 720-only settings UI, final Telegram caption `tools.bytes(size)` plus width/height. `sendVideo` with `supports_streaming` falls back to `sendDocument` for Telegram 400 when appropriate.
- `studio-v2/services.mjs`: `iphoneDownloadSelection('720')` prefers H.264 MP4 video + AAC M4A inside `[width<=1280][height<=1280]`, sorts toward `res:720`, and keeps other source-format fallback. **Fallback may download >720p** when no matching stream exists; never tell the user that network bytes are always <=720p.
- After `yt-dlp`, `convert(... action:'inspect')` runs `ffprobe` in the existing isolated worker. Confirm H.264/AAC/yuv420p, dimensions and `min(width,height) <= 720`. If not satisfied, run `action:'convert', target:'mp4', max_short_edge:720` using the worker, inspect final output again, and reject if still noncompliant. A transcode can take minutes and may grow file size despite lower resolution.
- `studio-v2/toolbox/worker.py`: `max_short_edge` uses FFmpeg scale with `min(1,720/min(iw,ih))`; even dimensions, original aspect ratio and no upscaling. The new cap is limited to the download operation; general file conversion settings remain.
- Preserve existing URL host allowlist, no-playlist/live guard, process argument arrays, max-transfer sizes, cancellation, owner restrictions, Docker isolation and cleanup.

## Troubleshooting a Photos import failure

1. Verify the Telegram result actually finished downloading and check Photos > Recently Saved / Videos / Recently Added. A Telegram "saved" toast does not prove the file reached Photos.
2. MP4 is a container, **not** a codec: an earlier YouTube short was downloaded in AV1 + Opus within MP4 and would not import into the user's iPhone Photos, while a converted H.264 + AAC MP4 imported successfully.
3. For a problem file, inspect actual `ffprobe` metadata; do not infer codec, resolution or corruption from filename/MB. Check Photos permission in iOS Settings and consider Telegram iOS bugs if the verified compatible output still fails.
4. If necessary, try Telegram File > Share > Save to Files, then Files > Share > Save Video. Keep the original until verified.
5. As of this reference, the end-to-end latest **fixed-720p** Telegram-to-iPhone Photos test has **not** been independently verified; earlier manual MP4 conversion imported successfully.

## Instagram upstream access errors

- An Instagram Reel may fail at metadata extraction with "This content isn't available to everyone: It can't be seen by certain audiences." Reproduce anonymously with the host `bin/yt-dlp.exe`; this is *not* an MP4 or Photos error.
- The bot now recognizes this restricted-access error and gives a short Bangla explanation without offering pointless Retry. A different public Reel was reported to download successfully by the user.
- Ask whether the Reel opens in the user's own Instagram account. Respect private/region/age/access restrictions; do not guess that version updates or repeated retries will resolve them.
- **Never** read browser cookies/session files, enable account login, request password, or send authentication data to chat without a separate explicit user-approved, local-only setup. Authenticated access still cannot override permissions.

## Relevant tests and evidence

From `G:\TelegramVideoBot`:
- `node studio-v2/tests/download-720p-regression.mjs`: synthetic `1080x1920 -> 720x1280`, `1920x1080 -> 1280x720`, `480x854 -> 480x854`, verified compatible MP4.
- `node studio-v2/tests/iphone-link-smoke.mjs`: real public YouTube Shorts link yielded 720x1280 H.264/AAC without transcode in the test; source availability can change.
- `node studio-v2/tests/iphone-compatibility.mjs` and `node studio-v2/tests/instagram-access-test.mjs`: codec and restricted-access handling.
- `node studio-v2/tests/ui-test.mjs`: **16 mocked Telegram UI checks** after fixed 720p; earlier check counts in release metadata are historical.
- The current release record `studio-v2/release.json` names `fixed720pDownloadPatch`, `iphoneCompatibilityPatch`, and `instagramAccessMessagingPatch`. Read them locally; do not publish its private runtime state.
