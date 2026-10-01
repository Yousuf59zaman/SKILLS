# CPIS RMO → Board En Banc workflow

## Scope and defaults

- Workflow/admin base: `https://dev-cpis.orangebd.com`
- Data-tools base is not used for this routing flow.
- Passwords, admin email, and OTPs must be supplied at run time through environment variables or another secure user-authorized source. Never store them in the skill.
- Use the exact docket numbers authorized by the user.
- If the user supplies a supporting file, upload it at the Records Officer stage only after checking that the file exists and is within the server's accepted type/size. Do not duplicate an attachment already present unless asked.

## Expected desk paths

The target employee names below are known test-environment defaults. Live action metadata wins if the configuration changes.

### SPC and MC

| From | Login | Decision | Expected target |
|---|---|---|---|
| Records Officer | `rmo@cpis.ph` | Endorse | Brando Sword — Engineer I (GIS) |
| Engineer I (GIS) | `gvo3@cpis.ph` | Inspection | Isagani Efren — Inspection Officer |
| Inspection Officer | `tio@cpis.ph` | Endorse | Isagani Alen — Head of Technical Unit |
| Head of Technical Unit | `headtu@cpis.ph` | Reviewed | Tanyag mary — Head of Legal Unit |
| Head of Legal Unit | `headlu@cpis.ph` | Endorse | Daniel Mary — Legal Assistant |

### DC and OPC

| From | Login | Decision | Expected target |
|---|---|---|---|
| Records Officer | `rmo@cpis.ph` | Endorse | Daniel Mary — Legal Assistant |

DC/OPC may expose more than one RMO target. For this flow, choose the direct Legal Assistant target only when it is present in live metadata and the user asked for the DC/OPC direct path. Otherwise stop and report the available targets.

### Common path after first Legal Assistant arrival

| From | Login | Decision/context | Expected target |
|---|---|---|---|
| Legal Assistant | `leo@cpis.ph` | Endorse Document | Will Luna — Data Management Officer |
| Data Management Officer | `dmo@cpis.ph` | Endorse | Daniel Mary — Legal Assistant |
| Legal Assistant, saved SER | `leo@cpis.ph` | Endorse with `context=ser-draft` | Tanyag mary — Head of Legal Unit |
| Head of Legal Unit | `headlu@cpis.ph` | Endorse | melvin Justine — Board Secretary |
| Board Secretary | `bso@cpis.ph` | Approve SER | Nathan Philip — Board en Banc |

The SER page may visually say “Forward to Board Secretary” while live `context=ser-draft` action metadata routes first to Head of Legal Unit. Follow the live allowed route and record the mismatch as a QA observation; do not bypass Head Legal.

## Safe API sequence

1. Start an admin session at `/admin/login` and a workflow session at `/workflow/login`.
2. Retrieve the new workflow OTP from `/logs/email` using the admin session, then submit `/workflow/otp` with `otpDigits[0]` through `otpDigits[5]` in ordered form-data.
3. Load `/workflow/my-queue/{docket}` and resolve the claim ID.
4. Fetch `GET /workflow/claims/{claimId}/actions` immediately before an action.
5. At RMO, upload a user-approved file through `POST /workflow/claims/{claimId}/attachments` when required.
6. Submit the selected live decision to `POST /workflow/claims/action`.
7. Fetch `GET /workflow/claims/{claimId}/history`; verify decision, actor, and next designation before the next desk.
8. Repeat through the claim-type path to Legal Assistant.
9. At Legal Assistant, read `conflict_assessment`. Stop when any live state indicates an active conflict/dispute, including `has_conflict`, `has_dispute_decision`, or `is_dispute_ready`, unless the system clearly reports the dispute as resolved and the user authorized continuation.
10. If clear, complete Legal Assistant → DMO → Legal Assistant.
11. Save the SER draft at `POST /workflow/ser-draft/{claimId}/save` with all server-required fields and checklist items grounded in the claim/test context.
12. Fetch `GET /workflow/claims/{claimId}/actions?context=ser-draft`, then follow Legal Assistant → Head Legal → Board Secretary → Board En Banc.
13. Verify final Board En Banc assignment from live current state and the newest history entry. A successful `200` alone is not final verification.

## Stop and recovery rules

- Missing docket, attachment, OTP, expected decision, or exact target: stop that docket and report the live evidence.
- HTTP timeout/5xx after a write: do not retry immediately; inspect claim history and current desk first.
- Active Legal dispute: leave the claim at Legal Assistant and notify the user.
- Claim already beyond the expected desk: do not send it backward. Continue from its current stage only when that remains within the user's authorized destination.
- Claim already at Board En Banc: leave it unchanged and mark it verified.
- Other QA changes: re-read action metadata and current history; do not treat unrelated count changes as a defect.

## Completion report

Return a compact per-docket outcome:

- Board En Banc verified
- stopped at Legal Assistant due to dispute (include flags, not credentials)
- blocked by changed configuration/missing target
- already complete and left unchanged

Never include passwords, OTPs, cookies, session IDs, or raw email bodies.
