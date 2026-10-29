# Tool-connectivity recovery notes

These notes cover exact tool-result decode failures only. They do not change
the pinned-Muse-first routing or any authorization boundary.

## Final-decode failure after an executed command

- Symptom: the outer tool result reports an unknown field
  `result_buffered_for_ns` while the expected shape carries
  `cell_id` / `content_items` / `error_text` / `code_mode_host_duration_ns`.
- The nested command may already have executed. Never assume failure means
  not-run.
- Pattern: capture the inner receipt with `notify(result)` followed by
  `await yield_control()`, then verify the effect read-only before any retry.
- A final-decode failure may follow an already-executed mutation, so verify
  before retry and never auto-resend a mutation.

## Connectivity fallback

- An ordinary connectivity failure triggers discovery of the supported
  MCP/native fallback inside the existing authorization only.
- Hard stops always win: tool safety denies, URL-policy blocks, user stop,
  auth/password-manager/terminal-UI restrictions, access controls, and
  higher-priority host rules. Never route around an explicit stop.
- A missing trusted CUA browser binding has no supported rebind API. Never
  synthesize identity or environment values to force a binding.

## Native CUA kernel-assets write failure (observed 2026-10-28)

- Symptom (exact, Codex direct check 2026-10-28): native CUA fails with
  `failed to write kernel assets: The system cannot find the path specified.
  (os error 3)` while Playwright works.
- Truthful limitation: no permanent fix is claimed. The dedicated CUA
  browser binding being unavailable is not a permission denial; settings
  were not weakened and no workaround is claimed for it.
- Safe boundaries: do not change host-managed pipes (for example,
  `SKY_CUA_NATIVE_PIPE_DIRECTORY` GUIDs differ per session; no stale
  full-config restore), do not synthesize identity or environment values,
  do not restart shared processes, do not bypass security. Root re-probe
  only; report the blocker and continue only independent authorized
  non-browser work when policy allows.
