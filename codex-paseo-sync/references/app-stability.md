# App stability: whole-window blank / reload / OOM / startup

Scope: whole-window blank, reload-loop, OOM-pressure, and post-reboot startup triage only.
Terminal-popup-only questions go to [terminal-visibility.md](terminal-visibility.md).
Gateway internals live in the separate gateway skill. Stopped catalog / native DRAFT
repair stays stopped under [repair-continuity.md](repair-continuity.md) (read-only).

## Evidence rules (decision-changing)

- Protocol is not pixels. `connected` / `initialized` route counts, process
  `Responding` state, and sparse UIA reads never prove rendering.
  User direct observation / user-supplied unoccluded screenshot is the
  authoritative rendering evidence.
- Do not use a visible-window gate: minimized/hidden vs visible-but-blank
  renderer are distinct; presence of a window does not equal healthy content.
  Occluded `CopyFromScreen` reads are unreliable; do not claim blank/healthy
  from them. Privacy-safe CLI proof is at most an unoccluded exact-target
  thumbnail plus window-ownership check — otherwise report transport-only
  with the rendering limit stated.

## Memory (verified 2026-10-19, this PC)

- Windows `2004` telemetry `UserData/MemoryExhaustionInfo/SystemInfo` commit
  charge vs commit limit at the incident time is the exhaustion evidence.
  Post-crash free RAM or a later lower commit reading never disproves the peak.
- At the incident on this PC, system-managed `F:` allocation was `15374MiB`
  (near `F:` volume/8); automatic sizing alone did not prove adequate commit
  headroom.
- Fixed `32GiB F:` pagefile read back allocated LIVE only after the
  `2026-10-19` reboot on this PC; user then confirmed BOTH frontends normal.
  Dated local result — never a mandatory setting for another PC, and never
  reapply pagefile/UAC/reboot/stack/GPU changes as a blank remedy without
  explicit user authorization.

## Gateway limits

- Bounded reconnect queue, current defaults (verify against current source
  before applying elsewhere): `1000ms` hold, max `16`, `503 Retry-After: 1`,
  `/check` immediate; model turns are never replayed. `1012 Service-Restart`
  is connection behavior, not whole-window root-cause proof.
- Native overflow trigger and renderer-side origin stay unknown — do not
  invent. `partition_alloc` classifies renderer `e0000008` as OOM; the
  triggering allocation is unknown.

## Crash tail and startup

- Private bounded crash-tail file only (fixed size, genuine entries);
  report aggregates, never raw text.
- Absent-only startup: `Ensure-Backend` boots a hidden owned backend only;
  `Open-Shared-Apps` opens absent frontends only and never focuses/reloads
  already-running ones. Catalog crash-reopen is was-open-now-gone only.
  Manual `codex-app` force paths are user-invoked, never background.
- Honest heal-budget diagnosis: KeepAlive/pulse heal at most 3/hour, then
  `backoff` observe-only. A missing backend after reboot with an exhausted
  budget is the expected observe state — not proof of broken registration.
  The authorized path is a finite guarded `Ensure-Backend` normal start after
  fresh no-port / no-owned-live-process / no-manual-pause / no-switch-fence /
  no-foreign-listener checks pass. Do not clear the budget, do not kill or
  restart an existing backend, no `ForceManual`, no rollout enabling.

## Desktop startup policy-read modal after a Desktop update (observed 2026-10-25, this PC)

- Conditional path only: after a Desktop update, Desktop shows an org-settings /
  policy-read modal while the inspector reports `waiting_for_Desktop` with a ready
  backend. That was this shared-mode symptom; equivalent standalone startup errors
  may present differently, so do not treat it as a mandatory prerequisite.
- Cause on this PC: an obsolete User `CODEX_CLI_PATH` pinned an old CLI line that
  rejects the real Desktop startup flags (usage error, exit 2, non-JSON stdout).
  The real startup command always includes the `app-server` base args
  (`-c features.code_mode_host=true app-server --analytics-default-enabled`) before
  `--print-startup-config --startup-client-info <client-info JSON, one argv element>`;
  top-level probes without `app-server` are invalid and prove nothing.
  The observed old line (0.163) failed while the observed Desktop-bundled line (0.164)
  accepted the same argv and returned a valid shape. Dated observed versions —
  never future version requirements.
- `requirements: null` in the startup-config response is valid for the installed
  schema; non-null data must satisfy that installed Desktop schema. Do not fabricate
  a policy, disable a gate, or downgrade to evade requirements. Edge reachability
  (DNS/TLS/edge responses) alone never rules out a real startup-policy failure.
- Fix applied in this case within the authorized task (no auth changes; existing
  host/UI permission rules still apply): privately back up the old User variable
  value, and only after equivalent-argv incompatibility is proven (same full
  `app-server` argv fails on the override line while the bundled line accepts it),
  remove the obsolete User `CODEX_CLI_PATH` (plus the current process copy) and add
  `CODEX_CLI_PATH` to the existing transient-env clearing list inside the
  absent-Desktop branch of `Open-Shared-Apps.ps1` (comment + one array entry only;
  `bin/codex-app.ps1` launcher unedited). Valid custom overrides stay. Auth bytes
  unchanged; no sessions copied or reset; no provider/default changes; no broad
  restart. The user then confirmed Desktop opens normally. Dated observed case —
  never a standing requirement for another PC. The older broader-repair STOP stands
  unchanged.

## Windows Computer Use approval / duplicate TOML key (observed 2026-10-29, this PC)

- **Symptom and sequence:** After otherwise working Codex/Paseo sessions and manual account-switch tests, Paseo reported `failed to load workspace requirements: invalid configuration at ...config.toml:251:23`. Codex Desktop subsequently displayed `ChatGPT configuration could not be loaded` / `duplicate key` at the same location. This is a **shared Codex configuration parse failure**, not evidence that the just-completed switch, port ownership, or backend shutdown caused it. Do not use an account switch to fix a TOML syntax error.
- **Observed on-disk cause:** At 2026-10-29 07:55:53 UTC, both `%USERPROFILE%\.codex\config.toml` and the legacy `%USERPROFILE%\.codex\computer-use\config.toml` had been modified. The former already contained `[computer_use.windows]` with an array-valued `always_allowed_app_ids = [...]`; a trailing `[computer_use.windows.always_allowed_app_ids]` Boolean-map table was then added for an approved Windows application. TOML disallows declaring the same key first as an array and then as a table. The legacy approval file was valid but contained zero remaining entries, consistent with a completed migration.
- **Installed writer evidence:** The packaged Windows Desktop `OpenAI.Codex` version `26.1023.6123.0`, within its installed `app/resources/app.asar`, parses `computer_use.windows.always_allowed_app_ids` as a Boolean map and emits a dedicated table with quoted application IDs set to `true`. Its table replacement matcher updates that table if present; when the file contains only the old array, the writer can append the table instead, producing this conflict. This evidence is **build-specific**; re-inspect the currently installed writer and schema after updates instead of hardcoding the October format forever.
- **Verified least-change repair:** Preserve the original complete config as an exact byte backup; validate it and any candidate with a full TOML parser (Python `tomllib` is available on this PC). Convert **only** the legacy array into exactly one `[computer_use.windows.always_allowed_app_ids]` table, each existing approved ID quoted and assigned `true`. Do not invent IDs, grant new approvals, remove old approvals, change other keys, or expose application IDs/credentials in reports. Validate a deep semantic comparison excluding the representation change, original and replacement file hashes, and an atomic backed-up replacement. Do not restore a months-old config, lock down its ACL/read-only bit, auto-repair unknown formats, reset auth, or restart/kill an owned backend just to recover parsing.
- **Actual repair evidence:** On 2026-10-29 08:29:26 UTC the candidate with two preserved original approvals was atomically installed; post-repair TOML parse and the packaged native Codex `features list` command returned successfully (exit 0, no config diagnostic). Two isolated simulations of the installed writer's table replacement also parsed successfully. The earlier array→table replacement changed only representation, preserved the other parsed config fields, and did not modify production auth or shared backend. Three later natural checks showed stable `owned-live` ports and a ready generation-matched backend with Paseo initialized. Desktop's window was present but its backend initialization remained unverified at those checks; CLI parse success is **not** proof of a usable Desktop GUI or live chat delivery.
- **Future diagnosis:** First obtain the exact file, line and error, preserve privacy, pin installed app build, capture sanitized modification timestamps and hash, then parse the whole TOML **read-only**. Inspect the installed Computer Use writer and the legacy migration file only as needed, without copying raw app IDs into the chat. A healthy bridge can coexist with a broken frontend config. For user-visible stale startup dialogs, use normal `Retry` or the user's normal Desktop close/reopen after the config is valid; do not repeat force switches or interrupt active turns. Any repair needs a fresh backup and exact candidate proof. Never promise that future upstream writers cannot introduce new incompatibilities.
- **Durable local evidence:** `%USERPROFILE%\.codex\tmp\codex-ghost-prevention-20261029\CONFIG-COMPAT-FOLLOWUP-20261029.md` (sanitized; no account credentials or approved-app identifiers). The earlier broad 2026-10-19 repair remains stopped.

## Report (aggregate only)

Live generation/state, both frontend init counts, pending queue, commit
limit/charge, `2004` count since boot (measured), crash-tail mtime
unchanged/changed, supervisor mode/note, plus user rendering confirmation.
No raw logs, auth, identifiers, process IDs, handles, chat titles, or
session IDs. No generic config-reset / GPU-flag / cache-deletion advice.
