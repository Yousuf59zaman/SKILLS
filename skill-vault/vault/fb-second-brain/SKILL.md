---
name: fb-second-brain
description: Save Yousuf's text, images, videos, audio, and links into the narrowest topical OpenClaw memory file, then durably queue eligible non-duplicate lifestyle or humor media for sequential posting to the matching one of nine Facebook Messenger second-brain groups by main-cron. Use when Yousuf says or implies save, remember, post, share, drop, archive, bookmark, second brain, "save this", "save kore rakho", "eta save koro", or asks to file incoming Telegram content. Also use for testing, repairing, draining, or operating this Messenger queue. Text-only and private, Tech, Learning, Career, OpenClaw, relationship, personal, and operational content must remain memory-only.
---

# FB Second Brain

Extend `memory-routing`; do not replace it. Treat memory as the source of truth and Messenger as an optional second copy for eligible media.

## Required source

Read `C:\Users\User\.openclaw\workspace\memory\fb-messenger-groups.md` before routing. It is authoritative for active group names, memory-only topics, and private files. Do not modify it during an ordinary save.

## Workflow

1. Inspect the incoming Telegram message and every attachment. Determine whether it is text, image, video, audio, or a link. A URL counts as media.
2. Analyze media with the available vision/audio/link-reading tools when needed. Use Yousuf's accompanying words as the strongest routing context.
3. Run `scripts/classify-topic.mjs` or import `classifyTopic`. Pass an explicit category or memory file when human/agent analysis is more reliable than the deterministic fallback.
4. If the classifier returns `needs_review: true`, inspect the narrowest likely memory files and choose the destination before writing. Never use a generic fallback merely to avoid deciding.
5. Run `scripts/dedupe-check.mjs` or `checkDuplicate` against the target memory file and `memory/fb_second_brain_log.jsonl`. Compare canonical URLs, normalized titles, attachment paths, and SHA-256 hashes.
6. If the item is new, run `scripts/save-to-memory.mjs` or `saveToMemory`. If it is a duplicate, do not add another entry unless Yousuf supplied genuinely new context; if so, append a clearly labeled update. Always preserve exact text and links. For media, include the required metadata JSON block.
7. Only after the memory write succeeds, use `scripts/prepare-drop.mjs`. For eligible media it copies every attachment into `.queue/fb-second-brain/payloads`, writes a durable pending job, and returns the job ID. A link job keeps its canonical URL in JSON. The incoming Telegram turn must not open Messenger.
8. For text-only, duplicate, private, memory-only, or privacy-blocked media, do not enqueue. `prepare-drop.mjs` logs the non-sent media result immediately when appropriate.
9. Reply briefly with the chosen memory file, target group (if any), duplicate decision, and queue result. Say `queued`, not `posted`; the cron worker owns the later FB result.

Use `scripts/prepare-drop.mjs` as the normal deterministic entry point. A live eligible result has `status: "queued"`, a `queue.job_id`, and a browser handoff stored inside the durable queue job.

## Queue drain (main-cron only)

Read `references/queue-contract.md` before operating the worker. Run it once daily at `18:30 Asia/Dhaka`; one run drains every currently eligible queue item sequentially. The scheduled worker must use agent `main-cron`, model `opencode-go/minimax-m3`, thinking `high`, and the visible managed browser profile `openclaw`.

1. Acquire the exclusive queue lock with `queue-worker.mjs begin-run`. If it reports `busy`, return `NO_REPLY` and stop.
2. Repeatedly call `claim-next`. Process exactly one claimed item at a time; never post jobs concurrently.
3. Follow the claimed job's `post_manifest.browser_handoff` using only OpenClaw's visible browser. Snapshot before every action and obtain fresh refs after navigation or any page-changing action.
4. Confirm Facebook is already logged in. If Messenger shows the chat-history restore PIN dialog, immediately run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-pin-helper.ps1 -Action Submit -BrowserProfile openclaw`. The helper reads the Windows-user-bound encrypted local credential, submits it without echoing it, and verifies that the PIN prompt disappeared. Never retrieve, print, copy, log, or ask Yousuf for the raw PIN; never use a one-time code or destructive no-restore option. If the helper is missing, cannot decrypt, or cannot verify submission, fail and retain the job.
5. Search the exact target group, open the unique matching conversation, attach all queued local files, wait until every upload is visibly ready, add only `message_text` when non-empty, and send once.
6. Take a fresh snapshot. Only when the new outgoing text/link/attachment is visibly present may you call `complete --verified true`. Completion logs `sent` and then removes the queue JSON and copied payload.
7. On a posting or verification failure, call `fail` with the concise error. The worker retries with backoff up to five attempts and then retains the job and payload in `failed/`. Continue to the next eligible job.
8. Always call `end-run` in a finally-style cleanup. On an empty run, return exactly `NO_REPLY`; otherwise return one concise count summary for cron delivery.

## Non-negotiable rules

- Never post text-only content to Messenger.
- Never post a duplicate. A duplicate may receive a memory update only when it adds useful information.
- Never bypass the durable queue for a routine incoming Telegram save.
- Never delete a pending or processing job before a fresh Messenger snapshot verifies the send. Failed jobs keep their copied payloads.
- Never run two queue drains concurrently; the exclusive lock is mandatory.
- Never post any path listed as memory-only in the routing table. In particular, block banking, service-login, spam, private office, relationship, personal tracking, daily-report, automation, and collector artifacts.
- Treat Tech, Learning, Career, AI, OpenClaw, backend, frontend, system-design, jobs, business, personal, and relationship topics as memory-only unless Yousuf explicitly changes the routing table.
- Send banter/roast media to `meme boi` only after removing real names, private facts, or identifying details. Keep `office-moments.md` private.
- Preserve exact capitalization of the nine group names.
- Never write to `openclaw.json`, auth/profile files, or `memory/fb-messenger-groups.md` as part of this workflow.
- Never use headless browser automation, standalone Puppeteer/Playwright, stored cookies, or extracted browser credentials.
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
  "category": "Optional explicit category",
  "memory_file": "Optional memory-relative destination",
  "tags": ["..."],
  "attachment_paths": ["C:\\absolute\\path.ext"],
  "has_new_info": false,
  "privacy_reviewed": false,
  "dry_run": false
}
```

Use `dry_run: true` for producer tests; it writes neither memory nor queue data. For live inputs, never mark `privacy_reviewed` true until the content has actually passed a privacy check.

## Testing

Run `node scripts/self-test.mjs` for the isolated regression matrix. It creates and removes temporary workspaces, never touches the production memory/queue, and never sends a Messenger message. After code or cron changes, also run the skill validator, confirm the production queue is unlocked, confirm the single cron job still uses `main-cron` + `opencode-go/minimax-m3` + `high`, and use an empty-queue cron smoke run when safe. A live Messenger PIN prompt may be cleared only with `messenger-pin-helper.ps1`; verify the prompt disappears and never send a message during that check. Treat login, OTP, helper failure, or an unreadable encrypted store as a blocked integration check.

## Categories

Active category keys are `story-post`, `meme-template`, `funny`, `caption-song`, `travel`, `food-health`, `gift-shopping`, `ghotona-kobita`, and `perform`. Use `private`, `tech`, `learning`, `career`, `openclaw`, `relationship`, `personal`, or `unknown` for memory-only material.

Within multi-file categories, choose the narrowest retrieval home: one-liners to `punchlines.md`; office banter to `office-funny-prompts.md`; friend roasts to `friend-group-funny-prompts.md`; audio to `audio.md`; song hooks to `song-boi.md`; restaurants/dishes to `food-to-try.md`; poems to `kobita-boi.md`; incidents to `ghotona-boi.md`; and shoot/recreate concepts to `perform-book.md`.

## Browser posting contract

`post-to-fb-group.mjs` is a guard and handoff generator, not a hidden browser driver. Routine Telegram turns enqueue that handoff. Only the cron worker follows it with the OpenClaw browser tool/CLI, preserving visible-session ownership, login checks, fresh snapshots, and message verification.
