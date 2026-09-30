---
name: fb-second-brain
description: Save Yousuf's text, images, videos, audio, and links into the narrowest topical OpenClaw memory file, then durably queue eligible non-duplicate media for sequential posting to the matching one of eleven Facebook Messenger second-brain groups by main-cron. Relationship, wife, marriage, couple, and biye media uses Gift-shopping-biye boi while retaining its narrow relationship memory home. Nine groups are specific topical routes; Favorite boi and Others boi are ordered fallbacks. Use when Yousuf says or implies save, remember, post, share, drop, archive, bookmark, second brain, "save this", "save kore rakho", "eta save koro", or asks to file incoming Telegram content. Also use for testing, repairing, draining, or operating this Messenger queue. Text-only and genuinely private, Tech, Learning, Career, OpenClaw, personal, and operational content must remain memory-only.
---

# FB Second Brain

Extend `memory-routing`; do not replace it. Treat memory as the source of truth and Messenger as an optional second copy for eligible media.

## Required source

Read `C:\Users\User\.openclaw\workspace\memory\fb-messenger-groups.md` before routing. It is authoritative for active group names, memory-only topics, and private files. Do not modify it during an ordinary save.

## Workflow

1. Inspect the incoming Telegram message and every attachment. Determine whether it is text, image, video, audio, or a link. A real `http://` or `https://` URL always counts as link media when no local attachment exists, even if an upstream preview adapter mislabeled it as image, video, or text. Transport examples such as `MEDIA:https://example.com/image.jpg` are never user links and must be ignored.
2. Analyze media with the available vision/audio/link-reading tools when needed. Use Yousuf's accompanying words as the strongest routing context.
3. **You, the OpenClaw AI agent, are the only semantic classifier.** Inspect and understand the actual content, then choose both the exact `category` and the narrowest `memory_file` from the authoritative map. Never run `scripts/classify-topic.mjs`, never ask the producer/plugin to infer a topic, and never omit either field.
4. Apply the routing priority yourself: protected/memory-only first; then the nine specific topical groups; then `Favorite boi` only for explicit love/like/favorite intent; finally `Others boi` for otherwise unmatched eligible non-sensitive media. A specific topic always beats either fallback. Once you select an active memory file, its exact row in `memory/fb-messenger-groups.md` is the final Messenger destination; words in a caption/OCR/summary cannot override it. Example: if your semantic analysis selects `memory/funny-posts.md`, it always queues to `meme boi`, even when the joke mentions `biye`, `wife`, or `relationship`.
5. Call `scripts/prepare-drop.mjs` exactly once as the normal producer entry point. Do not manually edit the memory file or run `save-to-memory.mjs` first. `prepare-drop` does **not** classify topics: it validates your category/memory-file pair, dedupes, writes the topicwise memory entry, and durably enqueues eligible media. A missing or invalid pair returns `needs_review` and writes nothing; inspect again and correct the input rather than accepting a guessed route.
   - This call remains mandatory when the item appears earlier in the conversation, already exists in memory, or was previously described as saved. Never infer duplicate status from chat history; only the producer may return `already_queued` or `duplicate_skipped`.
   - Build and validate one JSON input file first, then invoke `prepare-drop.mjs` once with that file path. The exec host is Windows PowerShell: Bash heredocs such as `<<'JSON'`, stdin `--input -`, and inline JSON are invalid here. `--input` accepts only a JSON-file path. Do not probe the producer with malformed or partial input and do not rerun it in the same turn.
6. Deduplicate the COMPLETE bundle (ordered attachments, all links, and full public text), never one overlapping image/link or a similar title. Treat memory duplication and Messenger delivery duplication separately. If the memory entry already exists but no matching pending/processing/failed queue job or verified `sent` log exists, `prepare-drop` must skip a second memory append and backfill the missing queue job. A legacy path/hash may cover a bare single attachment in memory, but never proves that a new caption, additional attachment, or multi-part bundle already exists. A matching active queue job returns `already_queued`; a verified prior send returns `duplicate_skipped`.
7. Keep one inbound album/drop together as ONE queue item; do not combine unrelated turns. Preserve every received attachment in order, every album caption, and every real URL. Only the trusted current inbound envelope supplies forced attachments; loaded session history is not current media authority. A fresh text-only save must never inherit an older album. A partial download blocks the whole album. For eligible media, `prepare-drop` copies every attachment into `.queue/fb-second-brain/payloads`, writes a durable pending job, and returns both its internal job ID and stable monotonic `queue_number`. A job seals every attachment's ordinal/size/SHA-256, the full message-text digest, and ALL canonical URLs. Claim and pre-Send checks reject missing, changed, or omitted pieces. A link-only job retains every URL. The incoming Telegram turn must not open Messenger.
8. For text-only, verified-delivery duplicate, private, memory-only, or privacy-blocked media, do not create a new queue job. A memory-only duplicate with no active job and no verified send must still be backfilled into the queue. `prepare-drop.mjs` logs the non-sent media result immediately when appropriate.
9. Reply briefly with the chosen memory file and its entry number, then report the stable queue serial from `queue_number`. For a new job use a format such as `Saved as #59 in funny-posts.md; queued as queue item #3 for meme boi.` For `already_queued`, say `already queued as queue item #3`. Never substitute the internal job ID for the human-facing queue item number. Say `queued`, not `posted`; the cron worker owns the later FB result.
   - Once `prepare-drop` returns an accepted result, that producer call is the terminal side effect for the turn. Do not invoke any further tool, shell cleanup, queue inspection, or producer call. The runtime blocks all post-success tool calls so a model cannot delete or mutate the durable job after reporting it queued.

## Hardcore acknowledgement contract (mandatory)

The acknowledgement is a required, machine-checkable part of every producer turn. Never return a vague “saved”, “queued”, or “done”.

- Every memory acknowledgement must name the exact workspace-relative memory file path (for example `memory/funny-posts.md`) and the actual memory entry number. If multiple files were written, list every file and entry number.
- Every `queued` acknowledgement must contain, in the same response, the literal `queue item #N` from the producer's stable `queue_number`, the exact case-sensitive Messenger group name, and `queued`. Example: `Saved as #59 in memory/funny-posts.md; queued as queue item #3 for meme boi (not posted yet).`
- Every `already_queued` acknowledgement must contain the existing stable queue number and exact target group. Example: `Already saved in memory/funny-posts.md (#59); already queued as queue item #3 for meme boi (not posted yet).`
- A verified delivery duplicate must say that no new queue item was created and name the group.
- Text-only, memory-only, private, or privacy-blocked content must explicitly say that no queue item was created and Messenger was skipped, while still naming the memory file/entry when memory was written.
- Never substitute the internal job ID, a pending-job count, or a guessed counter for `queue_number`. Never say `queued` without both `queue item #N` and the exact group.
- Never say `posted` in the incoming Telegram acknowledgement. The producer queues; only the verified cron worker may report a send.
- If queue creation fails after memory save, identify the exact memory file/entry and state that queueing failed and requires retry. Do not claim completion.

Use `scripts/prepare-drop.mjs` as the normal deterministic entry point. A live eligible result is `queued` with a new job ID or `already_queued` with the existing job ID; `duplicate_skipped` is valid only when a matching verified `sent` event exists.

## Queue drain (main-cron only)

Read `references/queue-contract.md` before operating the worker. Run it once daily at `18:30 Asia/Dhaka`; one run drains every currently eligible queue item sequentially. The scheduled worker must use agent `main-cron`, model `opencode-go/muse-spark-1.3-contributor`, the runtime-clamped `ultra` thinking ceiling, ordered fallbacks `opencode-go/deepseek-v4-flash-vision-exp`, `opencode-go/gpt-5.6-luna`, `opencode-go/qwen3.7-plus`, and `opencode-go/minimax-m3`, and the OpenClaw-owned browser profile `openclaw`.

### Authoritative scripted cron entrypoint

The cron agent must run exactly one audited wrapper instead of reproducing the browser steps itself:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\run-scripted-messenger-queue.ps1
```

The wrapper opens one disposable Messenger tab in the existing OpenClaw-owned browser context, binds every helper/Playwright action to that exact target ID, and closes only that owned tab on exit. It performs login/PIN preflight in Windows PowerShell before acquiring the durable queue lock; DPAPI is accessed only when the corresponding form is visibly required. The Node worker then claims sequentially, rebuilds each cached manifest from the durable payload, requires the exact group composer, uses exactly one Send click, and completes only after fresh outgoing DOM evidence. It never launches a standalone browser, extracts cookies, or reads raw credentials. Ambiguous post-send verification is retained in `failed/` for manual review instead of being auto-retried and potentially duplicated.

The numbered procedure below is the manual recovery contract only; routine cron runs use the wrapper.

The runner attempts each job at most once per run. Before Send it waits for stable conversation history, not just a visible composer; verification includes only the new uninterrupted outgoing bundle after the last pre-Send row. After a job failure it may continue to a different pending job only after a full reload of its owned tab proves the exact conversation has an empty composer, no staged upload and no pending bubble in two fresh observations. Otherwise it pauses; three consecutive failures also pause the run. An uncertain job remains non-replayable. Work summaries include the pending backlog and a safe pause reason.

1. Check queue status. If empty or another unexpired worker lock exists, return `NO_REPLY` without opening Messenger.
2. Open one disposable `https://www.facebook.com/messages/` tab in the `openclaw` profile and keep its exact target ID. Run the login helper with `-TargetId`; it no-ops without decrypting when already logged in and reads the Windows-user-bound encrypted login only when a complete login form is visible.
3. If the login helper returns `two_factor_required`, do not acquire the lock, claim, or fail any job. Return exactly `Messenger login needs 2-step verification. Queue retained; please complete it in the openclaw browser.` If login is missing, unreadable, or unverified, leave the queue untouched and report only a safe generic failure.
4. If Messenger shows the chat-history restore PIN dialog, run the PIN helper with the same `-TargetId`. The encrypted PIN is not read when no PIN prompt is visible. Never retrieve, print, copy, log, or ask Yousuf for the raw PIN; never use a one-time code or destructive no-restore option.
5. Acquire the exclusive queue lock with `queue-worker.mjs begin-run`, then repeatedly call `claim-next --browser-profile openclaw`. Each claim rebuilds `post_manifest` from the durable payload. Process exactly one claimed item at a time; never post jobs concurrently.
6. Require the exact `Write to <target group>` composer, attach the refreshed durable paths, wait for the enabled exact Send control, add only `message_text` when non-empty, and click Send exactly once. Do not use Enter/click fallback chains.
7. Persist `mark-submit-started` BEFORE the one Send click. Take fresh post-submit DOM observations and verify ALL expected attachments, COMPLETE caption/every link, the same conversation, an empty composer, and either (a) an actual Sent/Delivered/Seen acknowledgement or (b) when Messenger omits that status, the exact structurally complete outgoing row keys surviving one full server-backed page reload in the exact conversation. An optimistic row, narration label such as “You sent”, disappearance after reload, moved thumbnail, or one image is insufficient. `complete` requires a structured `delivery_receipt` bound to the sealed bundle. Only then log `sent` and remove the queue JSON/copied payload. Messenger may render the single Send as adjacent outgoing rows; every piece must be verified.
8. A pre-submit failure follows normal backoff. A click failure or ambiguous post-submit result is non-retryable **manual review required**, not a permanent delivery failure, because delivery may have occurred; never replay it automatically. A persisted Send marker survives crashes and blocks replay. Use `retry-failed --queue-number N --confirmed-not-sent true --reason <review>` only after an operator proves no send occurred and the whole durable bundle can be rebuilt. If an independent read-only inspection proves the exact complete row persisted after a full reload, use the guarded `reconcile-failed` recovery with a matching full-bundle receipt; reconciliation records an already-committed send and never sends or requeues it.
9. Always call `end-run` and close only the owned browser target in finally-style cleanup. On an empty run, return exactly `NO_REPLY`; otherwise return one concise count summary for cron delivery.

## Non-negotiable rules

- Never post text-only content to Messenger.
- Never classify an eligible URL as text-only or block it for a missing image/video attachment. With no local attachment, normalize the item to `link`, retain the real canonical URL, and create/reuse its queue item. The protected/private, verified-sent-duplicate, and explicit do-not-post rules still win.
- Never post a verified delivery duplicate. A memory duplicate that was never queued or sent must be queued once; it may receive a memory update only when it adds useful information.
- Never bypass the durable queue for a routine incoming Telegram save.
- Never report an eligible media save as complete unless the result is `queued`, `already_queued`, or a verified prior send produced `duplicate_skipped`. `memory_saved_queue_failed` requires an explicit retry with the same input so the queue gap is backfilled.
- Every `queued` or `already_queued` Telegram reply must include `queue item #N`, using the returned `queue_number`. Text-only and memory-only saves must explicitly say that no queue item was created.
- Never delete a pending or processing job before a fresh Messenger snapshot verifies the send. Failed jobs keep their copied payloads.
- Never run two queue drains concurrently; the exclusive lock is mandatory.
- Never post any path listed as memory-only in the routing table. In particular, block banking, service-login, spam, private office, personal tracking, daily-report, automation, and collector artifacts.
- For every active media route, derive `fb_group` from the selected `memory_file` using the group map. Never queue an active file to a different group because a word in its title, OCR, summary, or caption matched another category. This applies to every sub-home in a row: `punchlines.md`/`office-funny-prompts.md`/`friend-group-funny-prompts.md` → `meme boi`; `audio.md`/`song-boi.md` → `caption-pose-song boi`; `food-to-try.md`/`health-fitness/` → `Food-Health-vlog`; and all relationship files → `Gift-shopping-biye boi`.
- Treat Tech, Learning, Career, AI, OpenClaw, backend, frontend, system-design, jobs, business, and personal topics as memory-only unless Yousuf explicitly changes the routing table.
- Relationship, crush, flirt/flirty, dating, lover, proposal, soulmate, wife, husband, couple, romantic, marriage, honeymoon, and biye media routes to `Gift-shopping-biye boi`. Use `memory/crush-lines.md` for crush/flirty/dating/proposal lines; otherwise keep the narrowest matching home among `memory/relationship-lines.md`, `memory/relationship-drama-prompts.md`, `memory/marriage-rules.md`, and `memory/wife-shopping-references.md`. Text-only relationship content remains memory-only under the global text-only rule; genuinely sensitive data or an explicit “keep private / do not post” instruction still blocks queueing.
- Send banter/roast media to `meme boi` only after removing real names, private facts, or identifying details. Keep `office-moments.md` private.
- Preserve exact capitalization of the eleven group names.
- Never write to `openclaw.json`, auth/profile files, or `memory/fb-messenger-groups.md` as part of this workflow.
- Never use ad-hoc headless automation, launch a standalone Puppeteer/Playwright browser, read stored cookies, or extract browser credentials. The audited queue wrapper may use bundled Playwright only to attach over CDP to the OpenClaw-owned `openclaw` context; it may not create a separate browser/profile or bypass the DPAPI helpers.
- Never put the Messenger login email/password in a prompt, memory file, queue job, cron configuration, source file, test, Git repository, or log. Only `messenger-login-helper.ps1` may access the DPAPI-encrypted local login store, and only long enough to submit it to the visible managed browser.
- Never ask Yousuf for the stored login during a cron run. A 2-step challenge is the only authentication condition that must produce the exact user notification above; leave every queue item pending and untouched.
- Never put the Messenger chat-history PIN in a prompt, memory file, queue job, cron configuration, source file, test, Git repository, or log. Only `messenger-pin-helper.ps1` may access the DPAPI-encrypted local store, and only long enough to submit it to the visible managed browser.
- Never ask Yousuf for the Messenger chat-history PIN during a browser task. If the encrypted helper fails, record the safe failure and retain the queue item without trying a one-time code or destructive no-restore flow.
- Do not log success before a fresh Messenger snapshot proves the message appeared.

## Script inputs

Every script supports `--input <json-file>`; `prepare-drop.mjs` is the normal entry point. The JSON object may contain:

```json
{
  "workspace": "C:\\Users\\User\\.openclaw\\workspace",
  "type": "image|video|audio|link|text",
  "title": "Short retrieval title",
  "text": "Exact user wording/context",
  "source": "Original URL or Telegram",
  "summary": "Agent-generated content summary",
  "post_text": "Optional reviewed COMPLETE public caption; omission preserves original text, empty string intentionally means no caption",
  "canonical_urls": ["https://example.org/first", "https://example.org/second"],
  "expected_attachment_count": 2,
  "inbound_bundle_complete": true,
  "category": "Required OpenClaw-agent-selected category",
  "memory_file": "Required OpenClaw-agent-selected memory-relative destination",
  "tags": ["..."],
  "attachment_paths": ["C:\\absolute\\first.jpg", "C:\\absolute\\second.jpg"],
  "has_new_info": false,
  "privacy_reviewed": false,
  "dry_run": false
}
```

For a live producer turn, first inspect the content and select its route yourself. Then write the complete JSON object—including both `category` and `memory_file`—to one unique temporary `.json` file. After confirming the file is valid JSON and every attachment path is absolute, make the single producer call:

```powershell
node "C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\prepare-drop.mjs" --input "C:\absolute\path\to\prepared-input.json"
```

Delete only that temporary input file after capturing the result. Never pass the JSON object itself as the `--input` value.

When the request says “meme template” (including “save to meme template”), set `category` to `meme-template`; do not broaden it to `funny`. Use `attachment_paths` as an array of absolute path strings. Object entries such as `{ "path": "..." }` are accepted defensively, but the string form is canonical.

Use `post_text` only for the COMPLETE meaningful public text, never a first-caption selection or AI summary. Without it the producer preserves original text and appends missing links. The intake guard ignores shortened AI captions on public multi-file albums. A privacy-reviewed office/friend route may supply redacted `post_text` plus `public_urls`; removed private URLs must never be restored from raw text. Never copy a bare `save` command into Messenger. Use `dry_run: true` for producer tests; it writes neither memory nor queue data. For live inputs, never mark `privacy_reviewed` true until the content has actually passed a privacy check.

## Testing

Run `node scripts/queue-reliability-test.mjs` for isolated malformed-file, cross-process lease, disk-write-failure, crash-recovery, recovered-notification, and duplicate-prevention cases. The suite never contacts Messenger; it creates only temporary synthetic jobs.

Run `node scripts/queue-batch-test.mjs` for real isolated FIFO jobs, no same-run replay after expired backoff, uncertain/dirty-context recovery, failure circuit breaking and independent-review evidence. Browser fixtures include split caption/album rows, outgoing toolbar layout, same-host reel previews, changing attachment URL signatures and partial persistence. `review-uncertain-messenger-job.mjs --queue-number N` performs read-only independent inspection; operator recovery may add `--reconcile` only to record the independently proved existing send, never to send or retry it.

Run `node scripts/audit-production-test.mjs` to verify read-only detection of missing durable schema-3 jobs and acceptance of only matching completion/reconciliation/invalidation events. These fixtures use an isolated temporary workspace and never operate the production queue.

Run `node scripts/bundle-regression-test.mjs` for full-bundle storage/sender/crash/reload-persistence/reconciliation tests, `node scripts/album-intake-test.mjs` for the actual Telegram handler→plugin→producer contract, and `node scripts/bundle-browser-fixture-test.mjs` for network-blocked real-renderer upload tests in one owned test tab. Re-run the album-handler test after OpenClaw updates; a missing runtime guard is a release failure. The tool-result-verifier smoke suite must also prove every model-requested tool is blocked after an accepted producer result. Run `node scripts/self-test.mjs` for the isolated regression matrix and `node scripts/agent-routing-contract-test.mjs` for the agent-only routing contract. Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-scripted-messenger-queue.ps1 -Preflight` for a no-claim/no-send wrapper check. These tests never send a Messenger message. After code or cron changes, also run the skill validator, inspect the production lock without taking it, and confirm the single cron job still uses `main-cron` + Muse + the `ultra` ceiling + the ordered DeepSeek Vision/Luna/Qwen/MiniMax fallbacks. Test login submission and 2-step detection only with an isolated network-free browser form; never log out the live Facebook session or expose the credential. A live Messenger PIN prompt may be cleared only with `messenger-pin-helper.ps1`.

## Categories

Active category keys are `story-post`, `meme-template`, `funny`, `caption-song`, `travel`, `food-health`, `gift-shopping`, `relationship`, `ghotona-kobita`, `perform`, `favorite`, and `others`. `relationship` shares the `Gift-shopping-biye boi` Messenger destination with `gift-shopping` while preserving a relationship-specific memory home. `favorite` is valid only when no specific active topic matches and Yousuf explicitly expresses love/like/favorite intent. `others` is the last fallback for unmatched eligible non-sensitive media. Use `private`, `tech`, `learning`, `career`, `openclaw`, `personal`, or `unknown` for memory-only material; these must never fall through to Favorite or Others.

Within multi-file categories, choose the narrowest retrieval home: one-liners to `punchlines.md`; office banter to `office-funny-prompts.md`; friend roasts to `friend-group-funny-prompts.md`; crush/flirty/dating/proposal lines to `crush-lines.md`; audio to `audio.md`; song hooks to `song-boi.md`; restaurants/dishes to `food-to-try.md`; poems to `kobita-boi.md`; incidents to `ghotona-boi.md`; and shoot/recreate concepts to `perform-book.md`.

## Browser posting contract

`post-to-fb-group.mjs` is a guard and handoff generator, not a hidden browser driver. Routine Telegram turns enqueue that handoff. Only the cron worker follows it with the OpenClaw browser tool/CLI, preserving visible-session ownership, login checks, fresh snapshots, and message verification.
