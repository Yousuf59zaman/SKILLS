from __future__ import annotations

import asyncio
import ctypes
import fnmatch
import getpass
import hmac
import json
import os
import platform
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, Header, HTTPException, Security
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file(PROJECT_ROOT / ".env")


def int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


APP_TITLE = os.environ.get("BRIDGE_APP_TITLE", "Basha Command Bridge").strip() or "Basha Command Bridge"
GPT_NAME = os.environ.get("BRIDGE_GPT_NAME", "Basha Commander").strip() or "Basha Commander"
BRIDGE_SECRET = os.environ.get("BRIDGE_SECRET", "").strip()
DEFAULT_CWD = Path(os.environ.get("BRIDGE_DEFAULT_CWD") or str(Path.home())).expanduser()
MAX_TIMEOUT_SEC = int_env("BRIDGE_MAX_TIMEOUT_SEC", 900, 1, 24 * 60 * 60)
MAX_OUTPUT_BYTES = int_env("BRIDGE_MAX_OUTPUT_BYTES", 200_000, 10_000, 10_000_000)
MAX_JOBS = int_env("BRIDGE_MAX_JOBS", 200, 10, 10_000)
AUDIT_LOG = Path(os.environ.get("BRIDGE_AUDIT_LOG") or "logs/audit.jsonl")
if not AUDIT_LOG.is_absolute():
    AUDIT_LOG = PROJECT_ROOT / AUDIT_LOG

TERMINAL_STATUSES = {"succeeded", "failed", "timed_out", "cancelled", "error"}
POWERSHELL_PREAMBLE = (
    "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); "
    "$OutputEncoding=[Console]::OutputEncoding; "
)


app = FastAPI(
    title=APP_TITLE,
    version="1.0.0",
    description=(
        "Private local bridge for a Custom GPT Action. Authenticated callers can "
        "run PowerShell/cmd commands and manage files using the Windows user that "
        "started this service."
    ),
    docs_url=None,
    redoc_url=None,
)

bearer_scheme = HTTPBearer(auto_error=False)


def public_base_url() -> str | None:
    configured = os.environ.get("BRIDGE_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    tunnel_file = PROJECT_ROOT / ".tunnel-url"
    if tunnel_file.exists():
        value = tunnel_file.read_text(encoding="utf-8").strip().rstrip("/")
        if value.startswith("https://"):
            return value
    return None


def custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    base_url = public_base_url()
    if base_url:
        schema["servers"] = [{"url": base_url}]
    normalize_object_schemas(schema)
    mark_operations_non_consequential(schema)
    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi  # type: ignore[method-assign]


def normalize_object_schemas(value: Any) -> None:
    if isinstance(value, dict):
        if value.get("type") == "object" and "properties" not in value:
            value["properties"] = {}
        for child in value.values():
            normalize_object_schemas(child)
    elif isinstance(value, list):
        for child in value:
            normalize_object_schemas(child)


def mark_operations_non_consequential(schema: dict[str, Any]) -> None:
    for path_item in schema.get("paths", {}).values():
        if not isinstance(path_item, dict):
            continue
        for method in ("get", "post", "put", "patch", "delete"):
            operation = path_item.get(method)
            if isinstance(operation, dict):
                operation["x-openai-isConsequential"] = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    x_bridge_secret: str | None = Header(default=None, alias="X-Bridge-Secret", include_in_schema=False),
) -> None:
    supplied = None
    if credentials and credentials.scheme.lower() == "bearer":
        supplied = credentials.credentials
    elif x_bridge_secret:
        supplied = x_bridge_secret

    if not BRIDGE_SECRET or BRIDGE_SECRET.startswith("replace-this"):
        raise HTTPException(status_code=503, detail="BRIDGE_SECRET is not configured")
    if not supplied or not hmac.compare_digest(supplied, BRIDGE_SECRET):
        raise HTTPException(status_code=401, detail="Invalid or missing bridge secret")


def audit(event: str, payload: dict[str, Any]) -> None:
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": now_iso(), "event": event, **payload}
    with AUDIT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def decode_output(data: bytes | bytearray) -> str:
    return bytes(data).decode("utf-8", errors="replace")


def append_limited(buffer: bytearray, chunk: bytes) -> bool:
    buffer.extend(chunk)
    if len(buffer) <= MAX_OUTPUT_BYTES:
        return False
    overflow = len(buffer) - MAX_OUTPUT_BYTES
    del buffer[:overflow]
    return True


def resolve_cwd(cwd: str | None) -> Path:
    path = Path(cwd).expanduser() if cwd else DEFAULT_CWD
    if not path.is_absolute():
        path = DEFAULT_CWD / path
    resolved = path.resolve(strict=False)
    if not resolved.exists():
        raise HTTPException(status_code=400, detail=f"cwd does not exist: {resolved}")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail=f"cwd is not a directory: {resolved}")
    return resolved


def resolve_path(path: str) -> Path:
    raw = Path(path).expanduser()
    if not raw.is_absolute():
        raw = DEFAULT_CWD / raw
    return raw.resolve(strict=False)


def shell_argv(shell: str, command: str) -> list[str]:
    if shell == "cmd":
        return ["cmd.exe", "/d", "/s", "/c", command]
    if shell == "pwsh":
        return ["pwsh.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_PREAMBLE + command]
    return ["powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_PREAMBLE + command]


def is_admin() -> bool:
    try:
        if os.name == "nt":
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        return os.geteuid() == 0  # type: ignore[attr-defined]
    except Exception:
        return False


async def terminate_process_tree(pid: int) -> None:
    if os.name == "nt":
        proc = await asyncio.create_subprocess_exec(
            "taskkill",
            "/PID",
            str(pid),
            "/T",
            "/F",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return
    try:
        os.kill(pid, 15)
    except ProcessLookupError:
        return


class CommandStartRequest(BaseModel):
    command: str = Field(..., min_length=1, description="Command text to run in the selected shell.")
    cwd: str | None = Field(None, description="Working directory. Relative paths resolve under BRIDGE_DEFAULT_CWD.")
    shell: Literal["powershell", "pwsh", "cmd"] = Field("powershell", description="Shell used to run the command.")
    timeoutSec: int | None = Field(None, ge=1, le=24 * 60 * 60, description="Max runtime before the bridge kills the process tree.")
    env: dict[str, str] | None = Field(None, description="Optional extra environment variables for this command.")


class CommandStdinRequest(BaseModel):
    text: str = Field(..., description="Text to write to the running process stdin.")
    appendNewline: bool = Field(True, description="Append a newline after text.")


class CommandStatusResponse(BaseModel):
    id: str
    command: str
    cwd: str
    shell: str
    status: str
    exitCode: int | None
    startedAt: str
    finishedAt: str | None
    timeoutSec: int
    stdout: str
    stderr: str
    stdoutTruncated: bool
    stderrTruncated: bool
    error: str | None


class JobListResponse(BaseModel):
    jobs: list[CommandStatusResponse]


class FilePathRequest(BaseModel):
    path: str


class ListDirRequest(BaseModel):
    path: str
    includeHidden: bool = False
    maxEntries: int = Field(500, ge=1, le=5000)


class ReadFileRequest(BaseModel):
    path: str
    maxBytes: int = Field(500_000, ge=1, le=10_000_000)
    encoding: str = "utf-8"


class WriteFileRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"
    createParents: bool = True
    overwrite: bool = True


class AppendFileRequest(BaseModel):
    path: str
    content: str
    encoding: str = "utf-8"
    createParents: bool = True


class DeletePathRequest(BaseModel):
    path: str
    recursive: bool = False
    missingOk: bool = False


class MovePathRequest(BaseModel):
    source: str
    destination: str
    overwrite: bool = False


class CopyPathRequest(BaseModel):
    source: str
    destination: str
    overwrite: bool = False


class MakeDirRequest(BaseModel):
    path: str
    parents: bool = True
    existOk: bool = True


class SearchFilesRequest(BaseModel):
    root: str
    pattern: str = "*"
    text: str | None = None
    includeHidden: bool = False
    maxResults: int = Field(200, ge=1, le=2000)


class TextReplacement(BaseModel):
    old: str
    new: str
    count: int = Field(-1, description="-1 replaces all occurrences.")


class ReplaceTextRequest(BaseModel):
    path: str
    replacements: list[TextReplacement]
    encoding: str = "utf-8"


@dataclass
class JobRecord:
    id: str
    command: str
    cwd: str
    shell: str
    timeoutSec: int
    startedAt: str
    status: str = "queued"
    exitCode: int | None = None
    finishedAt: str | None = None
    stdout: bytearray = field(default_factory=bytearray)
    stderr: bytearray = field(default_factory=bytearray)
    stdoutTruncated: bool = False
    stderrTruncated: bool = False
    process: Any = None
    cancelRequested: bool = False
    error: str | None = None


jobs: dict[str, JobRecord] = {}
jobs_lock = asyncio.Lock()


def command_response(job: JobRecord) -> CommandStatusResponse:
    return CommandStatusResponse(
        id=job.id,
        command=job.command,
        cwd=job.cwd,
        shell=job.shell,
        status=job.status,
        exitCode=job.exitCode,
        startedAt=job.startedAt,
        finishedAt=job.finishedAt,
        timeoutSec=job.timeoutSec,
        stdout=decode_output(job.stdout),
        stderr=decode_output(job.stderr),
        stdoutTruncated=job.stdoutTruncated,
        stderrTruncated=job.stderrTruncated,
        error=job.error,
    )


async def read_stream(reader: asyncio.StreamReader, buffer: bytearray, stream_name: str, job: JobRecord) -> None:
    while True:
        chunk = await reader.read(4096)
        if not chunk:
            return
        truncated = append_limited(buffer, chunk)
        if truncated and stream_name == "stdout":
            job.stdoutTruncated = True
        elif truncated:
            job.stderrTruncated = True


async def prune_finished_jobs() -> None:
    async with jobs_lock:
        if len(jobs) <= MAX_JOBS:
            return
        finished = [job for job in jobs.values() if job.status in TERMINAL_STATUSES]
        finished.sort(key=lambda item: item.finishedAt or item.startedAt)
        for job in finished[: max(0, len(jobs) - MAX_JOBS)]:
            jobs.pop(job.id, None)


async def run_job(job: JobRecord, extra_env: dict[str, str]) -> None:
    audit("command_start", {"jobId": job.id, "shell": job.shell, "cwd": job.cwd, "command": job.command, "timeoutSec": job.timeoutSec})
    try:
        argv = shell_argv(job.shell, job.command)
        env = os.environ.copy()
        env.update(extra_env)
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        job.process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=job.cwd,
            env=env,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=creationflags,
        )
        job.status = "running"

        readers = [
            asyncio.create_task(read_stream(job.process.stdout, job.stdout, "stdout", job)),
            asyncio.create_task(read_stream(job.process.stderr, job.stderr, "stderr", job)),
        ]
        try:
            job.exitCode = await asyncio.wait_for(job.process.wait(), timeout=job.timeoutSec)
        except asyncio.TimeoutError:
            job.status = "timed_out"
            await terminate_process_tree(job.process.pid)
            job.exitCode = await job.process.wait()

        await asyncio.gather(*readers, return_exceptions=True)
        if job.cancelRequested:
            job.status = "cancelled"
        elif job.status != "timed_out":
            job.status = "succeeded" if job.exitCode == 0 else "failed"
    except FileNotFoundError as exc:
        job.status = "error"
        job.error = f"Shell executable not found: {exc}"
    except Exception as exc:
        job.status = "error"
        job.error = repr(exc)
    finally:
        job.finishedAt = now_iso()
        audit(
            "command_finish",
            {"jobId": job.id, "status": job.status, "exitCode": job.exitCode, "error": job.error},
        )
        await prune_finished_jobs()


def path_info(path: Path) -> dict[str, Any]:
    exists = path.exists()
    info: dict[str, Any] = {"path": str(path), "exists": exists}
    if not exists:
        return info
    stat = path.stat()
    info.update(
        {
            "isFile": path.is_file(),
            "isDir": path.is_dir(),
            "size": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        }
    )
    return info


def is_hidden_path(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": APP_TITLE, "gptName": GPT_NAME, "openapi": "/openapi.json"}


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy() -> str:
    return """
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Basha Command Bridge Privacy Policy</title>
      </head>
      <body>
        <h1>Basha Command Bridge Privacy Policy</h1>
        <p>This private bridge is operated by the owner of this Windows PC.</p>
        <p>Authenticated requests can run local commands and file operations on the owner's machine.</p>
        <p>The bridge keeps local audit logs on the owner's PC and does not sell or share data with third parties.</p>
      </body>
    </html>
    """


@app.get("/health", dependencies=[Security(require_auth)])
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": APP_TITLE,
        "gptName": GPT_NAME,
        "time": now_iso(),
        "pid": os.getpid(),
        "defaultCwd": str(DEFAULT_CWD),
    }


@app.get("/system/info", dependencies=[Security(require_auth)])
async def system_info() -> dict[str, Any]:
    return {
        "user": getpass.getuser(),
        "isAdmin": is_admin(),
        "platform": platform.platform(),
        "python": sys.version,
        "projectRoot": str(PROJECT_ROOT),
        "defaultCwd": str(DEFAULT_CWD),
        "auditLog": str(AUDIT_LOG),
        "maxTimeoutSec": MAX_TIMEOUT_SEC,
        "maxOutputBytes": MAX_OUTPUT_BYTES,
    }


@app.post("/commands/start", response_model=CommandStatusResponse, dependencies=[Security(require_auth)])
async def start_command(request: CommandStartRequest) -> CommandStatusResponse:
    cwd = resolve_cwd(request.cwd)
    timeout = min(request.timeoutSec or MAX_TIMEOUT_SEC, MAX_TIMEOUT_SEC)
    job = JobRecord(
        id=str(uuid.uuid4()),
        command=request.command,
        cwd=str(cwd),
        shell=request.shell,
        timeoutSec=timeout,
        startedAt=now_iso(),
    )
    async with jobs_lock:
        jobs[job.id] = job
    asyncio.create_task(run_job(job, request.env or {}))
    return command_response(job)


@app.get("/commands", response_model=JobListResponse, dependencies=[Security(require_auth)])
async def list_commands() -> JobListResponse:
    async with jobs_lock:
        ordered = sorted(jobs.values(), key=lambda item: item.startedAt, reverse=True)
    return JobListResponse(jobs=[command_response(job) for job in ordered])


@app.get("/commands/{job_id}", response_model=CommandStatusResponse, dependencies=[Security(require_auth)])
async def get_command(job_id: str) -> CommandStatusResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job id")
    return command_response(job)


@app.post("/commands/{job_id}/stdin", response_model=CommandStatusResponse, dependencies=[Security(require_auth)])
async def send_stdin(job_id: str, request: CommandStdinRequest) -> CommandStatusResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job id")
    if job.status != "running" or not job.process or not job.process.stdin:
        raise HTTPException(status_code=409, detail="Job is not accepting stdin")
    payload = request.text + ("\n" if request.appendNewline else "")
    try:
        job.process.stdin.write(payload.encode("utf-8"))
        await job.process.stdin.drain()
    except Exception as exc:
        raise HTTPException(status_code=409, detail=f"Could not write stdin: {exc}") from exc
    audit("command_stdin", {"jobId": job.id, "bytes": len(payload.encode("utf-8"))})
    return command_response(job)


@app.post("/commands/{job_id}/cancel", response_model=CommandStatusResponse, dependencies=[Security(require_auth)])
async def cancel_command(job_id: str) -> CommandStatusResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Unknown job id")
    if job.status in TERMINAL_STATUSES:
        return command_response(job)
    job.cancelRequested = True
    if job.process and job.process.pid:
        await terminate_process_tree(job.process.pid)
    audit("command_cancel", {"jobId": job.id})
    return command_response(job)


@app.post("/files/list")
async def list_dir(request: ListDirRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    root = resolve_path(request.path)
    if not root.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {root}")
    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {root}")
    entries = []
    for child in sorted(root.iterdir(), key=lambda item: item.name.lower()):
        if not request.includeHidden and is_hidden_path(child.relative_to(root)):
            continue
        entries.append(path_info(child))
        if len(entries) >= request.maxEntries:
            break
    return {"path": str(root), "entries": entries, "truncated": len(entries) >= request.maxEntries}


@app.post("/files/read")
async def read_file(request: ReadFileRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")
    with path.open("rb") as handle:
        data = handle.read(request.maxBytes + 1)
    truncated = len(data) > request.maxBytes
    if truncated:
        data = data[: request.maxBytes]
    return {**path_info(path), "content": data.decode(request.encoding, errors="replace"), "truncated": truncated}


@app.post("/files/write")
async def write_file(request: WriteFileRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    if path.exists() and not request.overwrite:
        raise HTTPException(status_code=409, detail=f"Path already exists: {path}")
    if request.createParents:
        path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(request.content, encoding=request.encoding)
    audit("file_write", {"path": str(path), "bytes": len(request.content.encode(request.encoding, errors="replace"))})
    return path_info(path)


@app.post("/files/append")
async def append_file(request: AppendFileRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    if request.createParents:
        path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding=request.encoding) as handle:
        handle.write(request.content)
    audit("file_append", {"path": str(path), "bytes": len(request.content.encode(request.encoding, errors="replace"))})
    return path_info(path)


@app.post("/files/delete")
async def delete_path(request: DeletePathRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    if not path.exists():
        if request.missingOk:
            return {"path": str(path), "deleted": False, "missing": True}
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    if path.is_dir() and not path.is_symlink():
        if request.recursive:
            shutil.rmtree(path)
        else:
            path.rmdir()
    else:
        path.unlink()
    audit("file_delete", {"path": str(path), "recursive": request.recursive})
    return {"path": str(path), "deleted": True}


@app.post("/files/mkdir")
async def make_dir(request: MakeDirRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    path.mkdir(parents=request.parents, exist_ok=request.existOk)
    audit("file_mkdir", {"path": str(path)})
    return path_info(path)


@app.post("/files/move")
async def move_path(request: MovePathRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    source = resolve_path(request.source)
    destination = resolve_path(request.destination)
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"Source does not exist: {source}")
    if destination.exists():
        if not request.overwrite:
            raise HTTPException(status_code=409, detail=f"Destination already exists: {destination}")
        if destination.is_dir() and not destination.is_symlink():
            shutil.rmtree(destination)
        else:
            destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(source), str(destination))
    audit("file_move", {"source": str(source), "destination": str(destination)})
    return {"source": str(source), "destination": path_info(destination)}


@app.post("/files/copy")
async def copy_path(request: CopyPathRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    source = resolve_path(request.source)
    destination = resolve_path(request.destination)
    if not source.exists():
        raise HTTPException(status_code=404, detail=f"Source does not exist: {source}")
    if destination.exists():
        if not request.overwrite:
            raise HTTPException(status_code=409, detail=f"Destination already exists: {destination}")
        if destination.is_dir() and not destination.is_symlink():
            shutil.rmtree(destination)
        else:
            destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir() and not source.is_symlink():
        shutil.copytree(source, destination)
    else:
        shutil.copy2(source, destination)
    audit("file_copy", {"source": str(source), "destination": str(destination)})
    return {"source": str(source), "destination": path_info(destination)}


@app.post("/files/search")
async def search_files(request: SearchFilesRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    root = resolve_path(request.root)
    if not root.exists():
        raise HTTPException(status_code=404, detail=f"Root does not exist: {root}")
    if not root.is_dir():
        raise HTTPException(status_code=400, detail=f"Root is not a directory: {root}")
    matches = []
    checked = 0
    for path in root.rglob(request.pattern):
        checked += 1
        relative = path.relative_to(root)
        if not request.includeHidden and is_hidden_path(relative):
            continue
        if not fnmatch.fnmatch(path.name, request.pattern):
            continue
        item = path_info(path)
        if request.text and path.is_file():
            try:
                sample = path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            index = sample.lower().find(request.text.lower())
            if index < 0:
                continue
            start = max(0, index - 80)
            end = min(len(sample), index + len(request.text) + 80)
            item["matchPreview"] = sample[start:end]
        elif request.text:
            continue
        matches.append(item)
        if len(matches) >= request.maxResults:
            break
    return {"root": str(root), "matches": matches, "checked": checked, "truncated": len(matches) >= request.maxResults}


@app.post("/files/replace")
async def replace_text(request: ReplaceTextRequest, _: None = Security(require_auth)) -> dict[str, Any]:
    path = resolve_path(request.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path does not exist: {path}")
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")
    content = path.read_text(encoding=request.encoding)
    counts: list[dict[str, Any]] = []
    for replacement in request.replacements:
        count = content.count(replacement.old)
        if replacement.count >= 0:
            count = min(count, replacement.count)
        content = content.replace(replacement.old, replacement.new, replacement.count)
        counts.append({"old": replacement.old, "replaced": count})
    path.write_text(content, encoding=request.encoding)
    audit("file_replace", {"path": str(path), "replacements": counts})
    return {**path_info(path), "replacements": counts}
