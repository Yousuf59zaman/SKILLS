# Security and verification reference

## Secrets and identity

- Generate independent high-entropy Auth.js and bridge secrets.
- Store only a bcrypt password hash in application configuration.
- Keep the admin email, password hash, bridge URL, and secrets in ignored local files or encrypted Vercel environment variables.
- Never print secret values while checking configuration; report presence, length class, or readiness only.
- Do not commit `.env*`, cookies, sessions, chat metadata, tunnel state, deployment state, raw audits, or auth profiles.

## Authorization

- Validate credentials with a strict schema and normalized email comparison.
- Perform a bcrypt comparison even on malformed/unknown users to reduce obvious timing differences.
- Use a short-lived encrypted/JWT server session.
- Require the admin role independently in every control, chat, and capability API route.
- Redirect authenticated users away from the sign-in page and unauthenticated users away from protected pages.

## Data minimization

Build browser contracts from an allowlist. Do not attempt to redact an entire raw OpenClaw response and return the remainder.

At minimum, scrub:

- access tokens, secrets, cookies, credentials, and base64 bodies;
- gateway and native session keys;
- raw run IDs and peer/account identifiers;
- local filesystem paths and usernames;
- emails and private URLs;
- reasoning/tool-call blocks;
- provider retry diagnostics and long opaque strings.

Use HMAC-derived public references when a later action must map back to private state. Keep the mapping only in local bridge memory or metadata.

## Mutation safety

- Validate each action using a discriminated schema.
- Keep the bridge action switch explicit.
- Constrain IDs to a conservative character set and length.
- Constrain message length, attachment size/type, output size, and runtime.
- Make sends idempotent.
- Prevent a second send while the same thread is running.
- Refresh telemetry after successful mutation.
- Show a clear confirmation for actions with operational impact.

## Deployment checklist

- [ ] Repository is private and the expected branch is checked out.
- [ ] Worktree is clean except intended changes.
- [ ] Remote is fetched/pulled without force.
- [ ] No credential literals exist in tracked files or Git history being introduced.
- [ ] Local bridge binds only to loopback.
- [ ] Bridge secret is at least 32 random characters.
- [ ] Tunnel forwards only to the Mission Control bridge.
- [ ] Existing tunnel services/ports remain intact.
- [ ] Vercel variables are server-only.
- [ ] Deployment corresponds to the tested commit.
- [ ] Production health and sign-in work through the public alias.

## Automated tests

Include tests for:

1. valid/invalid/stale/replayed HMAC requests;
2. raw snapshot sanitization and opaque references;
3. capability descriptions, paths, URLs, email, IDs, and MCP env values;
4. atomic metadata plus sanitized recovery-message persistence, backup recovery, and public-field omission;
5. history normalization, continuity-envelope removal, duplicate retry removal, reasoning/tool suppression, and attachment-body omission;
6. continuity replay on every follow-up, including a reset that happens inside `chat.send` after healthy preflight history;
7. sequence-aware merging that preserves repeated identical prompts and assistant replies as separate turns;
8. native `chat.send`, `agent.wait`, `chat.history`, and `chat.abort` wiring;
9. auth and role rejection;
10. request, message, attachment, process, and output limits.

## Browser E2E matrix

| Surface | Verify |
| --- | --- |
| Sign-in | invalid rejection, valid redirect, persistent authenticated refresh, sign-out |
| Overview | live/degraded status, refresh, no raw identifiers |
| Controls | allowlisted action, success/error feedback, telemetry reconciliation |
| Chat | create, send, stop, persistence, rename, pin, filters, archive/restore, export, Markdown, attachment |
| Toolbox | all categories, counts, search, readiness, refresh, sanitizer output |
| Responsive | desktop and narrow mobile navigation, composer, dialogs, overflow |
| Recovery | bridge restart, transient timeout then successful retry, stale error removal, bare `continue` after native context loss, correct earlier-task resumption, reload persistence, hidden continuity envelope |

Use the in-app Browser skill against localhost first and the final production alias last. Finalize only the production deliverable tab.

## Operational recovery

- Roll back the web deployment independently from the local bridge when possible.
- Restart the Mission Control bridge after bridge-only changes; leave the OpenClaw gateway running.
- Preserve the last-known-good tunnel mapping while testing an alternate port.
- Back up local thread metadata before a schema migration.
- Never use destructive Git recovery or force-push to resolve deployment drift.
