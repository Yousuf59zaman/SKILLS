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
6. Treat memory duplication and Messenger delivery duplication separately. If the memory entry already exists but no matching pending/processing/failed queue job or verified `sent` log exists, `prepare-drop` must skip a second memory append and backfill the missing queue job. Legacy memory entries that identify an attachment only by its workspace-relative saved path still count as memory duplicates. A matching active queue job returns `already_queued`; a verified prior send returns `duplicate_skipped`.
7. For eligible media, `prepare-drop` copies every attachment into `.queue/fb-second-brain/payloads`, writes a durable pending job, and returns both its internal job ID and stable monotonic `queue_number`. A link job keeps its canonical URL in JSON. The incoming Telegram turn must not open Messenger.
8. For text-only, verified-delivery duplicate, private, memory-only, or privacy-blocked media, do not create a new queue job. A memory-only duplicate with no active job and no verified send must still be backfilled into the queue. `prepare-drop.mjs` logs the non-sent media result immediately when appropriate.
9. Reply briefly with the chosen memory file and its entry number, then report the stable queue serial from `queue_number`. For a new job use a format such as `Saved as #59 in funny-posts.md; queued as queue item #3 for meme boi.` For `already_queued`, say `already queued as queue item #3`. Never substitute the internal job ID for the human-facing queue item number. Say `queued`, not `posted`; the cron worker owns the later FB result.

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

Read `references/queue-contract.md` before operating the worker. Run it once daily at `18:30 Asia/Dhaka`; one run drains every currently eligible queue item sequentially. The scheduled worker must use agent `main-cron`, model `opencode-go/gpt-5.6-luna`, thinking `high`, the single fallback `opencode-go/minimax-m3`, and the OpenClaw-owned browser profile `openclaw`.

### Authoritative scripted cron entrypoint

Routine cron runs execute `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\run-scripted-messenger-queue.ps1`. This audited wrapper uses the DPAPI helpers, attaches only to the OpenClaw-owned browser context, preserves the exclusive queue/verification contract, and never exposes credentials. The numbered procedure below is manual recovery guidance.

1. Acquire the exclusive queue lock with `queue-worker.mjs begin-run`. If it reports `busy`, return `NO_REPLY` and stop. Check queue status; if empty, release the lock and return `NO_REPLY`.
2. Before claiming any job, open `https://www.facebook.com/messages/` in the visible `openclaw` profile and run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-login-helper.ps1 -Action Login -BrowserProfile openclaw`. It no-ops when already logged in and otherwise submits the Windows-user-bound encrypted local login without echoing it.
3. If the login helper returns `two_factor_required`, do not claim or fail any job. Release the queue lock and return exactly `Messenger login needs 2-step verification. Queue retained; please complete it in the openclaw browser.` so cron delivery notifies Yousuf. If encrypted login is missing, unreadable, or unverified, leave the queue untouched, release the lock, and report only a safe generic login failure.
4. If Messenger shows the chat-history restore PIN dialog, run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-pin-helper.ps1 -Action Submit -BrowserProfile openclaw`. Never retrieve, print, copy, log, or ask Yousuf for the raw PIN; never use a one-time code or destructive no-restore option.
5. Repeatedly call `claim-next`. Process exactly one claimed item at a time; never post jobs concurrently. Follow its `post_manifest.browser_handoff` using only the visible OpenClaw browser. Snapshot before every action and obtain fresh refs after navigation or any page-changing action.
6. Search the exact target group, open the unique matching conversation, attach all queued local files, wait until every upload is visibly ready, add only `message_text` when non-empty, and send once.
7. Take a fresh snapshot. Only when the new outgoing text/link/attachment is visibly present may you call `complete --verified true`. Completion logs `sent` and then removes the queue JSON and copied payload.
8. On a posting or verification failure, call `fail` with the concise error. The worker retries with backoff up to five attempts and then retains the job and payload in `failed/`. Continue to the next eligible job.
9. Always call `end-run` in a finally-style cleanup. On an empty run, return exactly `NO_REPLY`; otherwise return one concise count summary for cron delivery.

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
- Never use ad-hoc headless automation, launch a standalone Puppeteer/Playwright browser, read stored cookies, or extract credentials. The audited scripted runner may attach bundled Playwright over CDP to the existing OpenClaw-owned `openclaw` context only.
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
  "post_text": "Optional Messenger caption/text after removing the save command; omit when none",
  "category": "Required OpenClaw-agent-selected category",
  "memory_file": "Required OpenClaw-agent-selected memory-relative destination",
  "tags": ["..."],
  "attachment_paths": ["C:\\absolute\\path.ext"],
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

Use `post_text` only for meaningful accompanying text Yousuf intends to send with the media; never copy the bare `save` command into Messenger. Use `dry_run: true` for producer tests; it writes neither memory nor queue data. For live inputs, never mark `privacy_reviewed` true until the content has actually passed a privacy check.

## Testing

Run `node scripts/self-test.mjs` for the isolated regression matrix and `node scripts/agent-routing-contract-test.mjs` for the agent-only routing contract. These tests create temporary workspaces, never touch the production memory/queue, and never send a Messenger message. After code or cron changes, also run the skill validator, confirm the production queue is unlocked, and confirm the single cron job still uses `main-cron` + Luna + `high` + the single MiniMax M3 fallback. Test login submission and 2-step detection only with an isolated network-free browser form; never log out the live Facebook session or expose the credential. A live Messenger PIN prompt may be cleared only with `messenger-pin-helper.ps1`.

## Categories

Active category keys are `story-post`, `meme-template`, `funny`, `caption-song`, `travel`, `food-health`, `gift-shopping`, `relationship`, `ghotona-kobita`, `perform`, `favorite`, and `others`. `relationship` shares the `Gift-shopping-biye boi` Messenger destination with `gift-shopping` while preserving a relationship-specific memory home. `favorite` is valid only when no specific active topic matches and Yousuf explicitly expresses love/like/favorite intent. `others` is the last fallback for unmatched eligible non-sensitive media. Use `private`, `tech`, `learning`, `career`, `openclaw`, `personal`, or `unknown` for memory-only material; these must never fall through to Favorite or Others.

Within multi-file categories, choose the narrowest retrieval home: one-liners to `punchlines.md`; office banter to `office-funny-prompts.md`; friend roasts to `friend-group-funny-prompts.md`; crush/flirty/dating/proposal lines to `crush-lines.md`; audio to `audio.md`; song hooks to `song-boi.md`; restaurants/dishes to `food-to-try.md`; poems to `kobita-boi.md`; incidents to `ghotona-boi.md`; and shoot/recreate concepts to `perform-book.md`.

## Browser posting contract

`post-to-fb-group.mjs` is a guard and handoff generator, not a hidden browser driver. Routine Telegram turns enqueue that handoff. Only the cron worker follows it with the OpenClaw browser tool/CLI, preserving visible-session ownership, login checks, fresh snapshots, and message verification.
