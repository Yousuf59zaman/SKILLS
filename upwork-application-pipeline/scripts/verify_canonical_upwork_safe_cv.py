#!/usr/bin/env python3
"""Validate the canonical Upwork-safe CV without exposing removed PII."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from pypdf import PdfReader


ALLOWED_LINK_HOSTS = {"github.com", "www.github.com", "leetcode.com", "www.leetcode.com"}
UNSAFE_TEXT_PATTERNS = {
    "email": re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    "linkedin": re.compile(r"(?i)linkedin(?:\.com)?"),
    "nid_label": re.compile(r"(?i)\bNID\b"),
    "long_phone_like_number": re.compile(r"(?<!\d)\+?\d{10,15}(?!\d)"),
    "removed_address_marker": re.compile(
        r"(?i)\b(?:baridhara|dohs|kawran|karwan|bhaban|bazar)\b"
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def annotation_uris(reader: PdfReader) -> list[str]:
    uris: list[str] = []
    for page in reader.pages:
        for annotation_ref in page.annotations or []:
            annotation = annotation_ref.get_object()
            action = annotation.get("/A")
            if action and action.get("/URI"):
                uris.append(str(action["/URI"]))
    return uris


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()

    pdf = args.pdf.resolve()
    reader = PdfReader(str(pdf))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    uris = annotation_uris(reader)
    hash_value = sha256(pdf)

    unsafe_text_counts = {
        name: len(pattern.findall(text)) for name, pattern in UNSAFE_TEXT_PATTERNS.items()
    }
    unsafe_links = []
    for uri in uris:
        parsed = urlparse(uri)
        if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in ALLOWED_LINK_HOSTS:
            unsafe_links.append(uri)

    checks = {
        "two_pages": len(reader.pages) == 2,
        "under_25_mb": pdf.stat().st_size <= 25 * 1024 * 1024,
        "searchable_text_layer": len(text) >= 5000,
        "no_unsafe_text": all(count == 0 for count in unsafe_text_counts.values()),
        "only_work_evidence_links": not unsafe_links,
        "expected_sha256": (
            True
            if not args.expected_sha256
            else hash_value == args.expected_sha256.strip().upper()
        ),
    }
    report = {
        "pdf": str(pdf),
        "sha256": hash_value,
        "bytes": pdf.stat().st_size,
        "pages": len(reader.pages),
        "extracted_characters": len(text),
        "unsafe_text_counts": unsafe_text_counts,
        "link_annotations": len(uris),
        "unsafe_link_annotations": len(unsafe_links),
        "checks": checks,
        "passed": all(checks.values()),
    }
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
