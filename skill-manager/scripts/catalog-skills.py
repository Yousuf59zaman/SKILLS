#!/usr/bin/env python3
"""Discover local Codex skills and optionally rank them for a task."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "file",
    "files",
    "from",
    "in",
    "into",
    "not",
    "of",
    "on",
    "plain",
    "rename",
    "text",
    "to",
    "use",
    "using",
    "task",
    "please",
    "koro",
    "korte",
    "amar",
    "amr",
    "ami",
    "tumi",
    "ki",
    "na",
}


@dataclass
class Skill:
    folder: str
    name: str
    description: str
    path: str
    root: str
    scope: str
    has_todo: bool


def codex_home() -> Path:
    import os

    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))


def default_root() -> Path:
    return codex_home() / "skills"


def plugin_cache_root() -> Path:
    return codex_home() / "plugins" / "cache"


def frontmatter(text: str) -> str:
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    return match.group(1) if match else ""


def field_value(frontmatter_text: str, field: str) -> str:
    pattern = rf"^{re.escape(field)}:\s*(.*)$"
    match = re.search(pattern, frontmatter_text, re.MULTILINE)
    if not match:
        return ""
    value = match.group(1).strip()
    if value and value[0] in {'"', "'"} and value[-1:] == value[0]:
        value = value[1:-1]
    return value.strip()


def discover(root: Path, default_scope: str | None = None) -> list[Skill]:
    skills: list[Skill] = []
    if not root.exists():
        return skills
    for skill_md in sorted(root.rglob("SKILL.md")):
        parts = set(skill_md.parts)
        if ".git" in parts or ".github" in parts or "__pycache__" in parts:
            continue
        skill_dir = skill_md.parent
        text = skill_md.read_text(encoding="utf-8", errors="replace")
        fm = frontmatter(text)
        name = field_value(fm, "name") or skill_dir.name
        description = field_value(fm, "description")
        try:
            rel = skill_dir.relative_to(root)
            rel_text = str(rel)
        except ValueError:
            rel_text = str(skill_dir)
        scope = default_scope or ("system" if rel_text.startswith(".system") else "user")
        has_todo = "TODO" in description or "TODO" in text[:1200]
        skills.append(
            Skill(
                folder=skill_dir.name,
                name=name,
                description=description,
                path=str(skill_dir),
                root=str(root),
                scope=scope,
                has_todo=has_todo,
            )
        )
    return skills


def dedupe_skills(skills: list[Skill]) -> list[Skill]:
    best: dict[tuple[str, str, str], Skill] = {}
    for skill in skills:
        key = (skill.scope, skill.name.lower(), skill.description)
        current = best.get(key)
        if current is None:
            best[key] = skill
            continue
        skill_norm = skill.path.replace("\\", "/")
        current_norm = current.path.replace("\\", "/")
        skill_is_latest = "/latest/" in skill_norm
        current_is_latest = "/latest/" in current_norm
        if skill_is_latest and not current_is_latest:
            best[key] = skill
        elif skill_is_latest == current_is_latest and len(skill.path) < len(current.path):
            best[key] = skill
    return sorted(best.values(), key=lambda item: (item.scope, item.name.lower(), item.path.lower()))


def tokens(text: str) -> set[str]:
    found = set(re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]{1,}", text.lower()))
    return {token for token in found if token not in STOPWORDS}


def score_skill(skill: Skill, query: str) -> tuple[int, list[str]]:
    query_tokens = tokens(query)
    haystack = f"{skill.name} {skill.folder} {skill.description}".lower()
    skill_tokens = tokens(haystack)
    matched = sorted(query_tokens & skill_tokens)
    score = len(matched) * 5
    for token in query_tokens:
        if token and token in haystack:
            score += 2
    if skill.name.lower() in query.lower() or skill.folder.lower() in query.lower():
        score += 25
    if skill.has_todo:
        score -= 8
    return score, matched


def ranked(skills: list[Skill], query: str, limit: int) -> list[dict[str, object]]:
    rows = []
    for skill in skills:
        score, matched = score_skill(skill, query)
        if score < 5:
            continue
        rows.append(
            {
                "name": skill.name,
                "folder": skill.folder,
                "scope": skill.scope,
                "score": score,
                "confidence": confidence(score),
                "matched_terms": matched,
                "description": skill.description,
                "path": skill.path,
                "caution": "description contains TODO; inspect before use" if skill.has_todo else "",
            }
        )
    rows.sort(key=lambda row: (-int(row["score"]), str(row["name"])))
    return rows[:limit]


def confidence(score: int) -> str:
    if score >= 25:
        return "high"
    if score >= 12:
        return "medium"
    return "low"


def catalog_markdown(skills: list[Skill], roots: list[Path]) -> str:
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    lines = [
        "# Local Skill Catalog",
        "",
        f"Generated: {generated}",
        "Roots:",
        *[f"- `{root}`" for root in roots],
        "",
        "Use this catalog for routing only. Always read a selected skill before following it.",
        "",
    ]
    for scope in ("user", "system", "plugin", "extra"):
        scoped = [skill for skill in skills if skill.scope == scope]
        if not scoped:
            continue
        title = "User Skills" if scope == "user" else "System Skills"
        if scope == "plugin":
            title = "Plugin Skills"
        elif scope == "extra":
            title = "Extra Root Skills"
        lines.extend([f"## {title}", ""])
        for skill in scoped:
            caution = " Warning: description/body contains TODO." if skill.has_todo else ""
            lines.append(f"- `{skill.name}` (`{skill.folder}`): {skill.description or 'No description.'}{caution}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Catalog and rank local Codex skills.")
    parser.add_argument("--root", default=str(default_root()), help="Primary skills root directory")
    parser.add_argument("--extra-root", action="append", default=[], help="Additional skills root to scan; may be repeated")
    parser.add_argument("--no-plugin-cache", action="store_true", help="Do not scan CODEX_HOME/plugins/cache for plugin skills")
    parser.add_argument("--query", help="Task text to rank skills for")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--write", help="Write markdown catalog to this path")
    parser.add_argument("--json", action="store_true", help="Emit full catalog as JSON")
    args = parser.parse_args()

    primary_root = Path(args.root).expanduser().resolve()
    roots: list[tuple[Path, str | None]] = [(primary_root, None)]
    if not args.no_plugin_cache:
        cache = plugin_cache_root().expanduser().resolve()
        if cache.exists():
            roots.append((cache, "plugin"))
    for raw in args.extra_root:
        roots.append((Path(raw).expanduser().resolve(), "extra"))

    skills: list[Skill] = []
    for root, scope in roots:
        skills.extend(discover(root, scope))
    skills = dedupe_skills(skills)

    if args.write:
        output = Path(args.write).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(catalog_markdown(skills, [root for root, _ in roots]), encoding="utf-8")

    if args.query:
        print(json.dumps(ranked(skills, args.query, args.limit), indent=2, ensure_ascii=False))
        return 0

    if args.json:
        print(json.dumps([skill.__dict__ for skill in skills], indent=2, ensure_ascii=False))
        return 0

    sys.stdout.write(catalog_markdown(skills, [root for root, _ in roots]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
