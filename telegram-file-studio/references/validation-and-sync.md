# Verification, release evidence and Agent Sync

## Test the skill itself

Run `node scripts/test-inspector.mjs` from this skill. Tests create only synthetic temporary projects, never use live credentials, and validate secret-safe reporting and malformed configuration handling. Run the installed skill validator and package the whole folder as `skill.zip`.

Run the read-only inspector against the real authorized project before reporting current health. Its source hash comparisons identify drift, not automatic corruption: legitimate newer work also changes hashes.

## Test application changes

Inspect each script before executing, especially after a version change. From `G:\TelegramVideoBot`:

```powershell
node --check bot.js
node --check studio-v2/main.mjs
node --check studio-v2/services.mjs
node studio-v2/tests/integration.mjs
node studio-v2/tests/extra-tests.mjs
node studio-v2/tests/ui-test.mjs
node studio-v2/tests/batch-regression.mjs
```

These use synthetic fixtures and real local conversion tools; UI tests mock Telegram rather than sending messages. The integration run creates fixture/output folders under `studio-v2/tests/work`. `tests/validate.py` separately checks produced contents/geometry/archives in the converter environment; inspect current invocation and directory expectations. File existence and exit code alone do not prove a correct output. Render representative image/PDF results when layout matters.

`studio-v2/live-test.mjs` uses real Telegram: upload synthetic input, retrieve it through local API, resize to 512 x 512 PNG, send result and home menu, delete its temporary input, record evidence. This is a messaging action; do not run it during passive inspection or skills publishing. Never count a mock multipart upload as a successful real Telegram send.

Test the callback payload size, private-owner rejection, contextual compatibility, custom dimensions, cancel, next-job recovery, batch isolation, result reuse, expiry and settings persistence when touching the UI or queue. A mock command test must include Telegram `bot_command` entities; omitting them previously caused a false command-dispatch failure.

## Dated evidence

The inspected `studio-v2/release.json` records release 2.0.0 on 2026-10-18:

- 68 converter tests and separate validation of 68 produced outputs.
- 5 extra checks, 13 UI checks, 3 batch regression checks.
- Total 89 automated checks (68 + 5 + 13 + 3); do not add the 68 output validations again as separate feature tests.
- Real Telegram retrieval and 512 x 512 PNG resize/upload succeeded; output was 12623 bytes.
- Resize fit/crop/pad and rendered Word-to-PDF were visually reviewed.
- Source SHA-256 hashes and converter image digest were recorded in the local release report.

These are historical recorded results. Do not say they passed again unless actually rerun. No real near-2000-MB conversion/transfer was established by those small tests.

### Subsequent 2026-10-20 download changes

- **iPhone Photos:** a manually converted H.264/AAC MP4 did save successfully to the user's iPhone Photos; an earlier MP4 with AV1/Opus had not. The automatic fixed-720p output has not yet been independently confirmed on-device.
- **Compatibility selection:** the downloader now prefers native H.264/AAC and inspects the actual output, transcoding only if needed. A real YouTube Shorts download produced 720 x 1280 H.264/AAC without fallback conversion.
- **Hard 720p policy:** synthetic 1080 x 1920 -> 720 x 1280, 1920 x 1080 -> 1280 x 720, and 480 x 854 -> unchanged. The live saved setting was inspected as `video: '720'` after bot restart.
- **Telegram UI:** 16 mocked UI tests passed after limiting the menu to 720p and blocking legacy higher-quality callback selections. Final video captions report actual file size and dimensions.
- **Instagram:** a Reel returned upstream audience-restricted metadata access; another public Reel was reported working by the user. Five classifier cases plus a mocked restricted-error UI passed; no Instagram authentication/cookies were used.
- Consult `studio-v2/release.json` for versioned `iphoneCompatibilityPatch`, `instagramAccessMessagingPatch` and `fixed720pDownloadPatch`. Treat all tests as dated, not universal guarantees.

## Publish only what the user requested

Load the existing `agent-sync/SKILL.md` first. The known Codex root is `%USERPROFILE%\.codex\skills`; default peers are `%USERPROFILE%\.claude\skills`, `%USERPROFILE%\.gemini\antigravity\skills`, `%USERPROFILE%\.vscode\skills` and `%USERPROFILE%\.config\opencode\skills`. Verify actual paths each run.

The configured repository was `Yousuf59zaman/SKILLS`, default branch `main`, public when inspected. Verify the remote, branch and visibility. Never publish tokens, API hashes, account IDs unnecessarily, private documents, cache/session files, credentials, binaries or font files.

### Pull first and preserve dirty work

Inspect `git status`, branch, remote and ahead/behind. If the publishing clone has existing unrelated edits, leave it alone and use a fresh clean clone/worktree outside the active skill roots. Run a fast-forward-only pull from `main` before adding the new skill. Never stash, discard, force-reset or commit unrelated work without authorization.

Run the mandatory Agent Sync GitHub compare/dry-run using that clean clone as `--github-worktree`. Report existing differences and ambiguity. A fresh clone's filesystem timestamps are not evidence its files are semantically newer; the existing sync implementation uses Git commit times for GitHub entries.

### Scope skills-only synchronization

For a request to add this skill, do not run `agent-sync all`: that also installs tools and changes MCP/PATH configuration. Use the **skills** track. If unrelated same-name skills differ, preserve them using missing-only mode rather than choosing a winner:

```powershell
node "$env:USERPROFILE\.codex\skills\agent-sync\scripts\agent-sync.mjs" skills --apply --create-missing-roots --no-content-sync --github-worktree "<clean-SKILLS-clone>"
```

Keep the GitHub comparison enabled. Install this validated skill in the authorized source root before this command. Verify the new skill's file hashes match across all five targets. Report unrelated remaining differences instead of saying every pre-existing skill is identical.

### Publish a reviewed, narrow change

For full-union publishing, follow the agent-sync decision gate and exact flags in that skill; do not select an ambiguous newest version automatically. Direct push requires the user's explicit main/direct-push authorization; otherwise use its safe branch workflow and report the branch.

For an explicitly requested **new-skill-only** push, the blanket publisher can also merge unrelated pre-existing skills. After running the scoped sync above, copy only `telegram-file-studio/` into the clean pulled clone. Inspect the exact diff, run validation and secret scanning, stage only that directory, commit it, pull fast-forward again and push to the authorized branch. Do not pass blanket `git add .` or claim a full-union merge occurred. If the remote moved incompatibly or policy blocks main, stop and report the conflict; do not force-push.

Verify local HEAD equals the remote branch commit, confirm the added skill through GitHub, and report the commit, branch, five-agent installation status, any untouched differences and the downloadable `skill.zip`. The bundle is not automatically installed in ChatGPT's skill library merely because local coding agents received it.
