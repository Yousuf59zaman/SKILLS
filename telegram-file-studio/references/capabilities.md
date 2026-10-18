# Capabilities and interaction contract

Source: inspected `studio-v2/README.md` and `services.mjs`, 2026-10-18. Re-read current `FORMATS`, worker checks and menus before offering a specific pair.

## User interface

Send `/menu` for the home keyboard. File messages reveal contextual actions instead of requiring long commands. Preserve `/status`, `/queue`, `/cancel`, `/batch`, `/settings`, `/formats`, `/help`. Converted files return as documents with useful size/dimension summaries; retain buttons to work on the result or original again.

Use high quality by default, with balanced/smaller options; video download defaults to best available. Request images as **File/Document** to preserve source resolution. Telegram photo uploads can already be reduced before the bot receives them. Preserve Back/Home/Cancel, flood-limit handling, expiry messages, actionable validation errors and retry.

A file reference/menu expires after one hour. Settings persist, but a PC restart interrupts active work: report interruption and offer resend/retry rather than claiming completion. One job runs at a time with up to five queued. Batch collection accepts up to 20 compatible files in arrival order; Undo removes the last item.

## Compatible format families

| Input family | Outputs/options in the observed release |
|---|---|
| Images | JPEG, PNG, WebP, AVIF, TIFF, BMP, GIF, ICO, PDF. HEIC/HEIF and self-contained SVG accepted as input. |
| Image resize/edit | Custom dimensions, width-only, height-only, percentage, presets; fit/crop/pad; rotate, flip/mirror, grayscale, text watermark; metadata removal default. |
| Image compression | Target JPEG size presets 100 KB to 2 MB; quality settings. Do not promise every input reaches every target without quality/dimension loss. |
| PDF | Page images, selected text, text-only DOCX, page ranges, split ZIP, rotate, structural optimization, merge, images-to-one-PDF. |
| Documents | Compatible DOC/DOCX/ODT/RTF/Text conversions and PDF/HTML export. Do not list an output solely because a different family supports it. |
| Presentations | PPT/PPTX/ODP input; PDF, PPTX or ODP where supported. |
| Ebooks/markup | Compatible EPUB/Markdown/HTML/Text/DOCX/PDF conversions. |
| Tables/data | XLS/XLSX/CSV/TSV/JSON/YAML input; XLSX/CSV/TSV/JSON/YAML output. XLS is input-only. |
| Video | MP4, MKV, MOV, WebM, audio extraction, GIF; trim, mute, compress, thumbnail. Legacy inputs are subject to available decoders. |
| Audio | MP3, M4A, WAV, FLAC, OGG, Opus, AAC, AIFF. Check the family-specific menu for available targets. |
| Batch | Compatible files to a common format in a ZIP; merge PDFs; images to one PDF; ZIP originals. Preserve per-file output isolation. |
| Video links | Supported public YouTube, Instagram and Facebook HTTPS URLs; return video in same chat. No playlists/live streams, login bypass, or guaranteed support for every link. |

## Explain resize choices accurately

- **Fit:** preserve aspect ratio inside the requested dimensions; the result need not fill both exact dimensions.
- **Crop:** fill the requested dimensions by cutting edges; warn when content may be lost.
- **Pad:** preserve the whole image with a border to obtain exact dimensions.
- Upscaling changes pixel count, not the amount of real source detail. These tools are not generative image restoration.

## Limits implemented in the release

| Resource | Conservative limit |
|---|---|
| Each transfer/output; total batch input | 2,000,000,000 bytes (decimal 2000 MB), not 2 GiB |
| Image or Office document input | 100 MB |
| SVG input | 5 MB; external resources rejected |
| Image geometry | 12000 pixels per dimension, 60 megapixels |
| PDF input | 200 MB and 500 pages |
| PDF split/page-image export | Up to 60 pages per export |
| Spreadsheet/data input | 40 MB; 20 sheets; 100000 rows; 256 columns; 2 million cells |
| Video-to-GIF | Up to 20 seconds; 480 px; 12 fps |
| SVG rasterization | Longest edge 2000 px |
| Worker budget | 2 CPU cores, 2 GB RAM, 256 processes, 2-hour job deadline |
| Disk | Intake accounts for input copies plus reserve; running conversions stop when free space drops below the guard. |

The configured 2000 MB ceiling is not evidence that a real near-limit file was tested. Recheck Telegram's current primary documentation when changing transfer behavior.

## Boundaries that must remain visible

PDF-to-DOCX is text extraction, not original-layout reconstruction. Scanned PDF OCR is not enabled. Complex Office layouts, missing fonts, macros and slide effects can change or be unsupported. The current spreadsheet path preserves saved cell values, not formulas, formatting, charts or fresh formula calculation; multi-sheet CSV/TSV returns a ZIP.

Image edits use the first frame/page of animated or multi-page input. JPEG/BMP/image-to-PDF flatten transparency onto white. Already-optimized files might not become smaller. Protected/corrupt/encrypted inputs may fail safely. Do not label an arbitrary rename as real conversion.

Job cleanup does not erase Telegram messages or the separate Local Bot API cache. Conversion workers are local/offline, but file transport still goes through Telegram. Do not claim end-to-end encryption or zero retention.
