#!/usr/bin/env python3
"""Summarize likely data-flow points in a Vue single-file component.

This is a lightweight heuristic scanner, not a parser. It helps Codex find the
right lines to inspect manually before adding debug UI or fixing data bugs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


BLOCK_RE = re.compile(
    r"<(?P<tag>script|template)\b(?P<attrs>[^>]*)>(?P<body>.*?)</(?P=tag)>",
    re.IGNORECASE | re.DOTALL,
)


def line_at(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def short(value: str, limit: int = 180) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def read_input(path_arg: str) -> tuple[str, str]:
    if path_arg == "-":
        return "<stdin>", sys.stdin.read()
    path = Path(path_arg)
    return str(path), path.read_text(encoding="utf-8", errors="replace")


def find_blocks(text: str) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for match in BLOCK_RE.finditer(text):
        attrs = match.group("attrs") or ""
        tag = match.group("tag").lower()
        kind = tag
        if tag == "script" and "setup" in attrs:
            kind = "script setup"
        blocks.append(
            {
                "kind": kind,
                "attrs": short(attrs, 120),
                "start_line": line_at(text, match.start()),
                "end_line": line_at(text, match.end()),
                "body": match.group("body"),
                "body_offset": match.start("body"),
            }
        )
    return blocks


def add_matches(
    target: list[dict[str, Any]],
    full_text: str,
    text: str,
    offset: int,
    pattern: str,
    kind: str,
    flags: int = 0,
    fields: tuple[str, ...] = (),
) -> None:
    regex = re.compile(pattern, flags)
    for match in regex.finditer(text):
        entry: dict[str, Any] = {
            "kind": kind,
            "line": line_at(full_text, offset + match.start()),
            "snippet": short(match.group(0)),
        }
        for field in fields:
            try:
                entry[field] = short(match.group(field), 240)
            except IndexError:
                pass
        target.append(entry)


def analyze_script(full_text: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    findings: dict[str, list[dict[str, Any]]] = {
        "reactive_declarations": [],
        "api_calls": [],
        "stores": [],
        "route_usage": [],
        "props_and_emits": [],
        "watchers": [],
        "transforms": [],
    }

    for block in blocks:
        if not block["kind"].startswith("script"):
            continue
        body = block["body"]
        offset = block["body_offset"]
        add_matches(
            findings["reactive_declarations"],
            full_text,
            body,
            offset,
            r"\b(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?P<factory>ref|shallowRef|reactive|computed|readonly|useState|useFetch|useLazyFetch|useAsyncData|useLazyAsyncData)\b",
            "reactive",
            fields=("name", "factory"),
        )
        add_matches(
            findings["api_calls"],
            full_text,
            body,
            offset,
            r"(?P<callee>\$fetch|useFetch|useLazyFetch|useAsyncData|useLazyAsyncData|axios\.(?:get|post|put|patch|delete)|[A-Za-z_$][\w$.]*(?:api|Api|client|Client|fetch|Fetch|request|Request)[\w$.]*)\s*\((?P<args>[^)\n]{0,240})",
            "api_call",
            fields=("callee", "args"),
        )
        add_matches(
            findings["stores"],
            full_text,
            body,
            offset,
            r"\b(?P<store>use[A-Z][A-Za-z0-9_]*Store)\s*\(",
            "store",
            fields=("store",),
        )
        add_matches(
            findings["route_usage"],
            full_text,
            body,
            offset,
            r"\b(?P<route>useRoute|useRouter|route\.query|route\.params|router\.push|router\.replace)\b",
            "route",
            fields=("route",),
        )
        add_matches(
            findings["props_and_emits"],
            full_text,
            body,
            offset,
            r"\b(?P<macro>defineProps|withDefaults\s*\(\s*defineProps|defineEmits)\b",
            "macro",
            fields=("macro",),
        )
        add_matches(
            findings["watchers"],
            full_text,
            body,
            offset,
            r"\b(?P<watcher>watch|watchEffect|watchPostEffect|watchSyncEffect)\s*\(",
            "watcher",
            fields=("watcher",),
        )
        add_matches(
            findings["transforms"],
            full_text,
            body,
            offset,
            r"(?P<transform>\.map|\.filter|\.reduce|\.sort|Object\.entries|Object\.values|Object\.fromEntries)\s*\(",
            "transform",
            fields=("transform",),
        )
    return findings


def analyze_template(full_text: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    findings: dict[str, list[dict[str, Any]]] = {
        "v_for": [],
        "directives_and_bindings": [],
        "interpolations": [],
        "component_tags": [],
    }

    for block in blocks:
        if block["kind"] != "template":
            continue
        body = block["body"]
        offset = block["body_offset"]
        add_matches(
            findings["v_for"],
            full_text,
            body,
            offset,
            r"\bv-for\s*=\s*['\"](?P<expr>[^'\"]+)['\"]",
            "v_for",
            fields=("expr",),
        )
        add_matches(
            findings["directives_and_bindings"],
            full_text,
            body,
            offset,
            r"(?P<directive>(?:[:@][\w:.-]+)|(?:v-(?:if|else-if|show|model|bind|on|slot|text|html)))\s*=\s*['\"](?P<expr>[^'\"]*)['\"]",
            "binding",
            fields=("directive", "expr"),
        )
        add_matches(
            findings["interpolations"],
            full_text,
            body,
            offset,
            r"\{\{\s*(?P<expr>.*?)\s*\}\}",
            "interpolation",
            flags=re.DOTALL,
            fields=("expr",),
        )
        add_matches(
            findings["component_tags"],
            full_text,
            body,
            offset,
            r"<(?P<tag>(?:[A-Z][A-Za-z0-9_.:-]*)|(?:Lazy[A-Za-z0-9_.:-]+))\b",
            "component",
            fields=("tag",),
        )
    return findings


def summarize(path: str, text: str) -> dict[str, Any]:
    blocks = find_blocks(text)
    script = analyze_script(text, blocks)
    template = analyze_template(text, blocks)

    return {
        "file": path,
        "sections": [
            {
                "kind": block["kind"],
                "attrs": block["attrs"],
                "start_line": block["start_line"],
                "end_line": block["end_line"],
            }
            for block in blocks
        ],
        "script": script,
        "template": template,
        "next_manual_checks": [
            "Verify API response shape against transform output.",
            "Trace v-for collection names back to refs, computed values, props, or stores.",
            "Inspect child component props when rendered data is passed through a component tag.",
            "Check loading, error, and empty states for async data.",
            "Check SSR/client-only access if values differ after hydration.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze Vue SFC data-flow hints.")
    parser.add_argument("file", help="Vue file path, or '-' to read from stdin")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    args = parser.parse_args()

    try:
        path, text = read_input(args.file)
        payload = summarize(path, text)
    except OSError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    indent = 2 if args.pretty else None
    print(json.dumps(payload, indent=indent, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
