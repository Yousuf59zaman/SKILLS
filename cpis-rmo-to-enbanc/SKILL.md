---
name: cpis-rmo-to-enbanc
description: Route authorized CPIS claims from Records Officer (RMO) through their claim-type workflow to Board En Banc, with OTP login, live action-metadata checks, attachments, dispute stops, SER drafting, and final verification.
---

# CPIS RMO to Board En Banc

Use this skill only when the user asks to inspect or route specific CPIS docket numbers from Records Officer toward Board En Banc. It supports SPC, MC, DC, and OPC claims. It does not authorize migration, raffle, Clerk of Court, finance, dispute resolution, or unrelated claim changes unless the user separately asks for them.

## Before acting

1. Confirm the exact docket list, target endpoint, and any attachment path from the current request. Never infer adjacent dockets.
2. Read [references/workflow.md](references/workflow.md) before a live routing run.
3. Prefer the authenticated CPIS web APIs over browser clicking. Use the browser only when the API cannot complete or visually verify a required step.
4. Use the current user-specified host. Default to `https://dev-cpis.orangebd.com`; do not fall back to an old `172.*` host unless the user explicitly requests it.
5. Require explicit authorization before any routing mutation. Read-only status/action/history checks do not need another confirmation.
6. Keep credentials and OTPs out of files, commands shown to the user, logs, screenshots, and final responses. Load them from process environment variables.

## Execution contract

- Fetch live action metadata immediately before every write. The live decision/target response is authoritative; labels, screenshots, and this reference are expected-path guidance only.
- Require exactly one expected decision and exactly one intended target. Stop rather than guessing when metadata differs.
- Re-fetch claim state after every action and verify the newest history entry before continuing.
- Treat each docket independently. If a request times out or returns an uncertain response, inspect current state/history before retrying so a successful action is not duplicated.
- At Legal Assistant, stop that docket before DMO endorsement or SER creation when an active conflict/dispute is reported. Tell the user the docket and live flags; do not resolve or bypass it without a new explicit request.
- Never write directly to the database, forge internal IDs, or call an action unavailable to the assigned desk.
- Preserve other QA activity: if a claim moved between read and write, refresh and continue only when the new live state still matches the authorized flow.

## API helper

Source [scripts/CpisApi.ps1](scripts/CpisApi.ps1) for OTP-backed sessions, claim/action/history inspection, attachment upload, workflow actions, and SER draft saving. The helper contains no credentials and must remain that way.

After all requested dockets finish, verify Board En Banc assignment from live claim state and newest history, then report completed, stopped, and unchanged dockets separately.
