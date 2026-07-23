# FB Second Brain queue contract

The queue root is `C:\Users\User\.openclaw\workspace\.queue\fb-second-brain`.

- `pending/`: ready or backoff-delayed jobs
- `processing/`: the one job currently claimed by the lock owner
- `failed/`: jobs that exhausted retries; keep these and their payloads for inspection
- `payloads/<job-id>/`: durable copies of Telegram attachments
- `events.jsonl`: append-only queue audit events
- `worker-lock.json`: exclusive worker lease; stale locks are recovered

Run all commands from the OpenClaw workspace. The script prints JSON.

```powershell
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs status
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs begin-run --owner main-cron
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs claim-next --lock-token <token>
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs complete --lock-token <token> --job-id <id> --verified true --verification-note "Fresh snapshot shows the new outgoing item."
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs fail --lock-token <token> --job-id <id> --error "Concise failure reason"
node C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\queue-worker.mjs end-run --lock-token <token>
```

## Posting rules

- Use only the visible OpenClaw browser profile `openclaw`; do not use `chrome`, an extension relay, headless mode, standalone Playwright/Puppeteer, cookies, or extracted credentials.
- Use the claimed job's `post_manifest.browser_handoff` as the exact target, attachments, message, and verification cue.
- Take a fresh snapshot before each browser action. Refs expire after navigation, search, send, modal changes, and uploads.
- If a Messenger chat-history PIN prompt appears, run `powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\User\.openclaw\workspace\skills\fb-second-brain\scripts\messenger-pin-helper.ps1 -Action Submit -BrowserProfile openclaw` and continue only when it reports verified success. Never print, retrieve, copy, log, or ask Yousuf for the raw PIN.
- A blocking login or one-time code, a missing/unreadable PIN helper or encrypted store, an unverified PIN submission, an ambiguous group match, a missing attachment, an upload failure, or an unverified send is a failure, never a completion. Never use a one-time-code or destructive no-restore flow.
- Retry one transient browser action after 3-5 seconds. If it still fails, record `fail` and continue the queue.
- Call `complete` immediately after verification so an external side effect is not left unrecorded.
- Continue claiming sequentially until `claimed` is false. A backoff-delayed pending job does not prevent later eligible jobs from being claimed.
- Always release the lock. If the process dies, the next run recovers the stale lease and any unverified processing job.

## Notification rules

Return exactly `NO_REPLY` when the queue is empty or another worker owns the lock. In that case the entire final response must be only those eight characters: no explanation, prefix, suffix, whitespace-only line, quote, or code fence. When work occurred, return one short summary such as `Messenger queue: 3 sent, 1 retry scheduled, 0 permanently failed.` Never expose message contents, contact identifiers, paths, auth data, or browser-session details in the summary.
