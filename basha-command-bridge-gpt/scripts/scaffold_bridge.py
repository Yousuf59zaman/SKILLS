#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import secrets
import shutil
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_ROOT = SKILL_ROOT / "assets" / "bridge-template"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scaffold a private ChatGPT local command bridge project.")
    parser.add_argument("--target", default="basha-command-bridge", help="Destination project directory.")
    parser.add_argument("--gpt-name", default="Basha Commander", help="Custom GPT display name.")
    parser.add_argument("--port", type=int, default=8765, help="Local bridge port.")
    parser.add_argument("--default-cwd", default=str(Path.home()), help="Default command working directory.")
    parser.add_argument("--public-base-url", default="", help="Optional stable public base URL.")
    parser.add_argument("--force", action="store_true", help="Overwrite template files in an existing target.")
    parser.add_argument("--regenerate-secret", action="store_true", help="Replace an existing .env bridge secret.")
    return parser.parse_args()


def copy_template(target: Path, force: bool) -> None:
    if not TEMPLATE_ROOT.exists():
        raise SystemExit(f"Template directory missing: {TEMPLATE_ROOT}")
    if target.exists() and any(target.iterdir()) and not force:
        raise SystemExit(f"Target is not empty: {target}. Re-run with --force to overwrite template files.")
    target.mkdir(parents=True, exist_ok=True)
    shutil.copytree(TEMPLATE_ROOT, target, dirs_exist_ok=True)


def write_env(args: argparse.Namespace, target: Path) -> None:
    env_path = target / ".env"
    if env_path.exists() and not args.regenerate_secret:
        return
    secret = secrets.token_urlsafe(48)
    content = "\n".join(
        [
            f"BRIDGE_SECRET={secret}",
            "BRIDGE_HOST=127.0.0.1",
            f"BRIDGE_PORT={args.port}",
            f"BRIDGE_GPT_NAME={args.gpt_name}",
            f"BRIDGE_DEFAULT_CWD={args.default_cwd}",
            "BRIDGE_MAX_TIMEOUT_SEC=900",
            "BRIDGE_MAX_OUTPUT_BYTES=200000",
            "BRIDGE_MAX_JOBS=200",
            "BRIDGE_AUDIT_LOG=logs\\audit.jsonl",
            f"BRIDGE_PUBLIC_BASE_URL={args.public_base_url.rstrip('/')}",
            "",
        ]
    )
    env_path.write_text(content, encoding="utf-8")


def write_custom_gpt_instructions(args: argparse.Namespace, target: Path) -> None:
    template = target / "custom-gpt" / "instructions-template.md"
    if not template.exists():
        return
    safe_name = re.sub(r"[^a-zA-Z0-9]+", "-", args.gpt_name).strip("-") or "custom-gpt"
    output = target / "custom-gpt" / f"{safe_name}-instructions.md"
    text = template.read_text(encoding="utf-8").replace("Basha Commander", args.gpt_name)
    output.write_text(text, encoding="utf-8")


def main() -> None:
    args = parse_args()
    target = Path(args.target).expanduser().resolve()
    copy_template(target, args.force)
    write_env(args, target)
    write_custom_gpt_instructions(args, target)
    rel = os.path.relpath(target, Path.cwd())
    print(f"Bridge project ready: {rel}")
    print("Next:")
    print(f"  cd {target}")
    print("  powershell -ExecutionPolicy Bypass -File .\\scripts\\setup.ps1")
    print("  powershell -ExecutionPolicy Bypass -File .\\scripts\\start-bridge.ps1 -Detached")


if __name__ == "__main__":
    main()
