#!/usr/bin/env python3
"""Build the canonical Upwork-safe CV from Yousuf's original CV.

The original visual design is preserved by rendering each page, removing only
pre-contract contact/identity fields from the pixels, and rebuilding the PDF.
A safe invisible text layer and safe portfolio/repository links are restored so
the result remains searchable without carrying the redacted data.
"""

from __future__ import annotations

import argparse
import io
import re
import subprocess
import tempfile
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
PHONE_RE = re.compile(r"^\+?\d{10,15}$")
SAFE_LINK_HOSTS = ("github.com", "leetcode.com")


def group_lines(words: list[dict], tolerance: float = 2.0) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        for line in lines:
            if abs(line[0]["top"] - word["top"]) <= tolerance:
                line.append(word)
                break
        else:
            lines.append([word])
    for line in lines:
        line.sort(key=lambda item: item["x0"])
    return lines


def line_text(line: list[dict]) -> str:
    return " ".join(str(word["text"]).replace("\x00", "") for word in line)


def padded_box(
    line: list[dict],
    *,
    left: float = 8.0,
    right: float = 4.0,
    top: float = 2.0,
    bottom: float = 2.0,
) -> tuple[float, float, float, float]:
    return (
        max(0.0, min(word["x0"] for word in line) - left),
        max(0.0, min(word["top"] for word in line) - top),
        max(word["x1"] for word in line) + right,
        max(word["bottom"] for word in line) + bottom,
    )


def redaction_regions(page_number: int, words: list[dict]) -> list[tuple[float, float, float, float]]:
    """Return PDF-coordinate boxes (x0, top, x1, bottom) to burn out."""
    if page_number != 1:
        return []

    regions: list[tuple[float, float, float, float]] = []
    lines = group_lines(words)

    for index, line in enumerate(lines):
        clean = line_text(line)
        lower = clean.lower()
        top = min(word["top"] for word in line)

        # Header contact and sensitive identity rows.
        if top < 140 and (
            EMAIL_RE.search(clean)
            or "linkedin.com" in lower
            or re.search(r"\bnid\s*:", lower)
            or any(PHONE_RE.fullmatch(str(word["text"]).strip()) for word in line)
        ):
            regions.append(padded_box(line, left=12.0, right=8.0, top=3.0, bottom=3.0))
            # The original LinkedIn URL wraps onto a second visual line. Remove
            # that continuation as part of the same social-contact field.
            if "linkedin.com" in lower:
                for following in lines[index + 1 :]:
                    following_top = min(word["top"] for word in following)
                    following_x0 = min(word["x0"] for word in following)
                    if following_top - top > 14.0:
                        break
                    if 0.0 < following_top - top and following_x0 >= 245.0:
                        regions.append(padded_box(following, left=12.0, right=8.0, top=3.0, bottom=3.0))
            continue

        # The two-line residential address in the header.
        if top < 140 and (
            ("road" in lower and "block" in lower)
            or ("dhaka" in lower and "bangladesh" in lower and top < 135)
        ):
            regions.append(padded_box(line, left=12.0, right=8.0, top=3.0, bottom=3.0))
            continue

        # OrangeBD address shares a line with the employment date; retain the
        # date and remove the address from the location icon onward.
        if "present" in lower and any(token in lower for token in ("lane", "dohs", "baridhara")):
            present = next(word for word in line if str(word["text"]).lower() == "present")
            regions.append(
                (
                    present["x1"] + 7.0,
                    max(0.0, min(word["top"] for word in line) - 3.0),
                    max(word["x1"] for word in line) + 8.0,
                    max(word["bottom"] for word in line) + 3.0,
                )
            )
            continue

        # Bdjobs office street address appears on its own line.
        if all(token in lower for token in ("building", "bazar")):
            regions.append(padded_box(line, left=12.0, right=8.0, top=3.0, bottom=3.0))

    return regions


def intersects(word: dict, region: tuple[float, float, float, float]) -> bool:
    x0, top, x1, bottom = region
    return not (
        word["x1"] <= x0
        or word["x0"] >= x1
        or word["bottom"] <= top
        or word["top"] >= bottom
    )


def safe_uri(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    uri = value.strip()
    lower = uri.lower()
    if lower.startswith(("mailto:", "tel:")) or "linkedin.com" in lower:
        return None
    if lower.startswith(("http://", "https://")) and any(host in lower for host in SAFE_LINK_HOSTS):
        return uri
    return None


def build(input_pdf: Path, output_pdf: Path, pdftoppm: Path, dpi: int = 300) -> None:
    output_pdf.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="upwork-safe-cv-") as temp_name:
        temp_dir = Path(temp_name)
        rendered_prefix = temp_dir / "page"
        subprocess.run(
            [
                str(pdftoppm),
                "-png",
                "-r",
                str(dpi),
                str(input_pdf),
                str(rendered_prefix),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        with pdfplumber.open(input_pdf) as source:
            page_images = sorted(temp_dir.glob("page-*.png"))
            if len(page_images) != len(source.pages):
                raise RuntimeError("Rendered-page count does not match source PDF")

            cv = canvas.Canvas(str(output_pdf), pageCompression=1)
            cv.setTitle("Md Yousuf Zaman - Upwork Safe CV")
            cv.setAuthor("Md Yousuf Zaman")
            cv.setSubject("Upwork-safe professional CV without pre-contract contact details")

            for page_number, (page, image_path) in enumerate(zip(source.pages, page_images), start=1):
                page_width = float(page.width)
                page_height = float(page.height)
                words = page.extract_words(x_tolerance=2, y_tolerance=2, keep_blank_chars=False)
                regions = redaction_regions(page_number, words)

                with Image.open(image_path) as opened:
                    image = opened.convert("RGB")
                draw = ImageDraw.Draw(image)
                scale_x = image.width / page_width
                scale_y = image.height / page_height

                # Header redactions use the sampled navy background; body
                # address redactions use the sampled white page background.
                header_color = image.getpixel((8, 8))
                body_color = image.getpixel((8, min(image.height - 1, int(image.height * 0.35))))
                for x0, top, x1, bottom in regions:
                    fill = header_color if top < 140 else body_color
                    draw.rectangle(
                        (
                            int(x0 * scale_x),
                            int(top * scale_y),
                            int(x1 * scale_x),
                            int(bottom * scale_y),
                        ),
                        fill=fill,
                    )

                image_bytes = io.BytesIO()
                image.save(image_bytes, format="JPEG", quality=96, optimize=True, subsampling=0)
                image_bytes.seek(0)

                cv.setPageSize((page_width, page_height))
                cv.drawImage(
                    ImageReader(image_bytes),
                    0,
                    0,
                    width=page_width,
                    height=page_height,
                    preserveAspectRatio=False,
                    mask="auto",
                )

                # Searchable/ATS-friendly invisible safe text layer.
                for word in words:
                    if any(intersects(word, region) for region in regions):
                        continue
                    text = str(word["text"]).replace("\x00", "").strip()
                    if not text:
                        continue
                    if EMAIL_RE.search(text) or "linkedin.com" in text.lower() or re.search(r"(?i)\bnid\s*:", text):
                        continue
                    text_object = cv.beginText()
                    text_object.setTextRenderMode(3)
                    font_size = max(5.0, min(18.0, float(word["bottom"] - word["top"]) * 0.85))
                    text_object.setFont("Helvetica", font_size)
                    text_object.setTextOrigin(float(word["x0"]), page_height - float(word["bottom"]))
                    text_object.textOut(text)
                    cv.drawText(text_object)

                # Restore only work-evidence links; all contact/social links
                # and repository-access exceptions are intentionally omitted.
                for hyperlink in page.hyperlinks:
                    uri = safe_uri(hyperlink.get("uri"))
                    if uri is None:
                        continue
                    x0 = float(hyperlink["x0"])
                    x1 = float(hyperlink["x1"])
                    top = float(hyperlink["top"])
                    bottom = float(hyperlink["bottom"])
                    cv.linkURL(
                        uri,
                        (x0, page_height - bottom, x1, page_height - top),
                        relative=0,
                        thickness=0,
                    )

                cv.showPage()

            cv.save()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_pdf", type=Path)
    parser.add_argument("--pdftoppm", type=Path, required=True)
    parser.add_argument("--dpi", type=int, default=300)
    args = parser.parse_args()
    build(args.input_pdf.resolve(), args.output_pdf.resolve(), args.pdftoppm.resolve(), args.dpi)


if __name__ == "__main__":
    main()
