# Canonical Upwork-Safe CV

Use exactly this PDF for every Upwork proposal that supports attachments:

- Canonical asset: `C:\Users\User\.codex\skills\upwork-application-pipeline\assets\Yousuf-Zaman-Upwork-Safe-CV.pdf`
- Required upload filename: `Yousuf-Zaman-Upwork-Safe-CV.pdf`
- SHA-256: `EA394684513097B013D072BD421970F525BF7A71DD27249BA4A2C6A30235A974`
- Size: 3,648,062 bytes
- Pages: 2
- Original source SHA-256: `BDF41D8AD5367B9C409A3F5B041D171CE6371514C09BA4AEC65FE4A05EE19224`

This is Yousuf's original designed CV with minimal Upwork-safety redactions. It preserves the original two-page layout, profile photo, professional history, skills, projects, education, publications, and GitHub/LeetCode work-evidence links. It removes only pre-contract contact or sensitive identity information: phone, email, LinkedIn, residential and employer street addresses, and NID information.

## Required attachment behavior

1. Never search for or choose a merely "latest" CV from the workspace, Downloads, an earlier application folder, or an attachment folder.
2. Before each proposal, verify the canonical asset against the SHA-256 above or `assets/Yousuf-Zaman-Upwork-Safe-CV.sha256`.
3. Copy this exact asset into the current application's `attachments/` directory under the required filename.
4. Verify that the copied file has the same hash, then upload it exactly once whenever Upwork provides an attachment field.
5. Confirm the exact filename appears once in the live proposal form. If the form has no attachment control or the client explicitly disallows attachments, record that exception in `proposal-ready-copy.txt`.
6. Never substitute the previously generated compact CV or any contact-bearing original CV. In particular, do not trust `C:\Users\User\Documents\Upwork\output\pdf\Yousuf-Zaman-Upwork-Safe-CV.pdf` unless its hash matches this canonical asset.

## Maintenance

Only replace the canonical asset when Yousuf explicitly supplies or approves an updated source CV. Preserve the source design and content, redact only Upwork-unsafe fields, render every page for visual inspection, run `scripts/verify_canonical_upwork_safe_cv.py`, and update this reference plus the `.sha256` file if the verified hash changes.

