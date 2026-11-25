# Routing reference — My PC (Usuf-Desktop) letter_Drive

Approved remote root: `gdrive:My PC (Usuf-Desktop)/` ONLY.

## Mapping

| Local | Drive mirrored folder |
|---|---|
| `E:\Documents\ChatGPT\Agent-Hub` | `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Agent-Hub` |
| `E:\Documents\CODEXENCE` | `My PC (Usuf-Desktop)/E_Drive/Documents/CODEXENCE` |
| `E:\Documents\ChatGPT\Software Business` | `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Software Business` |
| `E:\Documents\Upwork` | `My PC (Usuf-Desktop)/E_Drive/Documents/Upwork` |
| `E:\Documents\ChatGPT\Agent-Hub\CODEXENCE\Career-Hub\START_HERE.md` (single file) | parent `My PC (Usuf-Desktop)/E_Drive/Documents/ChatGPT/Agent-Hub/CODEXENCE/Career-Hub` |

Rules:
- `<L>:\a\b` -> `My PC (Usuf-Desktop)/<L>_Drive/a/b`, `<L>` uppercased, `_Drive` capital D (matches existing `E_Drive`).
- Reject `..`, reject non-drive paths, reject remotes not starting with `gdrive:My PC (Usuf-Desktop)/`, reject Shared Drives.
- Folder source: pair INSIDE corresponding folder. File source: pair in corresponding PARENT.
