#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Local web console for checking and merging TTF fonts."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
FONTS_ROOT = ROOT / "fonts"
SOURCE_ROOT = FONTS_ROOT / "source"
TARGET_ROOT = FONTS_ROOT / "target"
OUTPUT_ROOT = FONTS_ROOT / "output"
UPLOAD_ROOT = FONTS_ROOT / "uploads"
for directory in (SOURCE_ROOT, TARGET_ROOT, OUTPUT_ROOT, UPLOAD_ROOT):
    directory.mkdir(parents=True, exist_ok=True)

PYTHON_BIN = ROOT / "venv" / "bin" / "python"
if not PYTHON_BIN.exists():
    PYTHON_BIN = Path(sys.executable)

SOURCE_FONT = "source_font.ttf"
TARGET_FONT = "AlimamaShuHeiTi-Bold.ttf"
FONT_SCOPES = {
    "source": SOURCE_ROOT,
    "target": TARGET_ROOT,
    "output": OUTPUT_ROOT,
    "uploads": UPLOAD_ROOT,
    # Backward-compatible alias for pages cached from the previous version.
    "root": OUTPUT_ROOT,
}

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


def send_json(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


def is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def safe_filename(name: str, fallback: str = "font.ttf") -> str:
    filename = Path(name or fallback).name
    filename = re.sub(r"[^0-9A-Za-z._-]+", "_", filename).strip("._")
    if not filename:
        filename = fallback
    if not filename.lower().endswith(".ttf"):
        filename = f"{Path(filename).stem}.ttf"
    return filename


def format_bytes(byte_count: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(byte_count)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{int(size)} {unit}"
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{byte_count} B"


def font_scope(path: Path) -> str:
    if is_relative_to(path, SOURCE_ROOT):
        return "source"
    if is_relative_to(path, TARGET_ROOT):
        return "target"
    if is_relative_to(path, OUTPUT_ROOT):
        return "output"
    if is_relative_to(path, UPLOAD_ROOT):
        return "uploads"
    return "output"


def font_ref(path: Path) -> str:
    return f"{font_scope(path)}:{path.name}"


def font_download_url(path: Path) -> str:
    return f"/fonts/{font_scope(path)}/{path.name}"


def font_record(path: Path) -> dict:
    stat = path.stat()
    modified = datetime.fromtimestamp(stat.st_mtime)
    scope = font_scope(path)
    generated = scope == "output"
    return {
        "name": path.name,
        "ref": font_ref(path),
        "scope": scope,
        "bytes": stat.st_size,
        "sizeLabel": format_bytes(stat.st_size),
        "modified": modified.isoformat(timespec="seconds"),
        "modifiedLabel": modified.strftime("%Y-%m-%d %H:%M:%S"),
        "downloadUrl": font_download_url(path),
        "isGenerated": generated,
        "isUploaded": scope == "uploads",
    }


def resolve_font_ref(ref: str | None, default_name: str) -> Path:
    if not ref:
        if default_name == SOURCE_FONT:
            return SOURCE_ROOT / default_name
        if default_name == TARGET_FONT:
            return TARGET_ROOT / default_name
        return OUTPUT_ROOT / default_name

    if ":" in ref:
        scope, raw_name = ref.split(":", 1)
    else:
        scope, raw_name = "output", ref

    name = Path(unquote(raw_name)).name
    if not name.lower().endswith(".ttf"):
        raise ValueError("只支持 TTF 字体文件")

    base = FONT_SCOPES.get(scope)
    if not base:
        raise ValueError("字体来源无效")
    path = (base / name).resolve()

    if not is_relative_to(path, base) or not path.exists():
        raise FileNotFoundError(f"字体文件不存在: {name}")
    return path


def unique_output_path(target_path: Path, output_name: str | None) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if output_name:
        base_name = safe_filename(output_name, f"{target_path.stem}_{timestamp}.ttf")
        path = OUTPUT_ROOT / base_name
        if path.exists():
            path = OUTPUT_ROOT / f"{path.stem}_{timestamp}{path.suffix}"
        return path
    return OUTPUT_ROOT / f"{target_path.stem}_{timestamp}.ttf"


def font_inventory() -> dict:
    source_fonts = sorted(SOURCE_ROOT.glob("*.ttf"), key=lambda item: item.stat().st_mtime, reverse=True)
    target_fonts = sorted(TARGET_ROOT.glob("*.ttf"), key=lambda item: item.stat().st_mtime, reverse=True)
    output_fonts = sorted(OUTPUT_ROOT.glob("*.ttf"), key=lambda item: item.stat().st_mtime, reverse=True)
    uploaded_fonts = sorted(UPLOAD_ROOT.glob("*.ttf"), key=lambda item: item.stat().st_mtime, reverse=True)
    source_records = [font_record(path) for path in source_fonts]
    target_records = [font_record(path) for path in target_fonts]
    output_records = [font_record(path) for path in output_fonts]
    uploaded_records = [font_record(path) for path in uploaded_fonts]
    all_records = source_records + target_records + output_records + uploaded_records
    default_source = SOURCE_ROOT / SOURCE_FONT
    default_target = TARGET_ROOT / TARGET_FONT
    return {
        "source": font_record(default_source) if default_source.exists() else (source_records[0] if source_records else None),
        "target": font_record(default_target) if default_target.exists() else (target_records[0] if target_records else None),
        "sources": source_records,
        "targets": target_records,
        "outputs": output_records,
        "available": all_records,
        "generated": output_records,
        "uploaded": uploaded_records,
        "all": all_records,
    }


def append_job_log(job_id: str, line: str) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["logs"].append(line)
        if len(job["logs"]) > 2000:
            job["logs"] = job["logs"][-2000:]
        job["updatedAt"] = time.time()


def update_job(job_id: str, **changes) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job:
            job.update(changes)
            job["updatedAt"] = time.time()


def run_and_stream(job_id: str, command: list[str]) -> int:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"

    process = subprocess.Popen(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        append_job_log(job_id, line.rstrip("\n"))
    return process.wait()


def run_merge_job(
    job_id: str,
    text: str,
    source_ref: str | None,
    target_ref: str | None,
    output_name: str | None,
) -> None:
    started_at = time.time()
    update_job(job_id, status="running", startedAt=started_at)

    try:
        source_path = resolve_font_ref(source_ref, SOURCE_FONT)
        target_path = resolve_font_ref(target_ref, TARGET_FONT)
        output_path = unique_output_path(target_path, output_name)
    except Exception as exc:
        append_job_log(job_id, f"❌ 参数错误: {exc}")
        update_job(job_id, status="failed", exitCode=1, finishedAt=time.time())
        return

    append_job_log(job_id, "🔍 检查字符是否存在于源字体...")
    append_job_log(job_id, "")
    check_code = run_and_stream(
        job_id,
        [str(PYTHON_BIN), "check_characters.py", str(source_path), text],
    )
    if check_code != 0:
        append_job_log(job_id, "")
        append_job_log(job_id, "❌ 部分字符不存在于源字体中，无法添加")
        update_job(job_id, status="failed", exitCode=check_code, finishedAt=time.time())
        return

    append_job_log(job_id, "")
    append_job_log(job_id, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    append_job_log(job_id, "")
    append_job_log(job_id, "🚀 开始合并字体文件...")
    append_job_log(job_id, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    append_job_log(job_id, f"📖 源字体: {source_path.relative_to(ROOT)}")
    append_job_log(job_id, f"🎯 目标字体: {target_path.relative_to(ROOT)}")
    append_job_log(job_id, f"✍️  要添加的文字: {text}")
    append_job_log(job_id, f"💾 输出文件: {output_path.relative_to(ROOT)}")
    append_job_log(job_id, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    append_job_log(job_id, "")

    merge_code = run_and_stream(
        job_id,
        [
            str(PYTHON_BIN),
            "ttf_font_merger_fixed.py",
            "-s",
            str(source_path),
            "-t",
            str(target_path),
            "-c",
            text,
            "-o",
            str(output_path),
        ],
    )

    if merge_code == 0 and output_path.exists():
        append_job_log(job_id, "")
        append_job_log(job_id, "✅ 合并完成！")
        append_job_log(job_id, f"📍 输出文件位置: {output_path}")
        append_job_log(job_id, "")
        append_job_log(job_id, f"文件信息: {output_path.name} · {format_bytes(output_path.stat().st_size)}")
        update_job(
            job_id,
            status="completed",
            exitCode=0,
            finishedAt=time.time(),
            output=font_record(output_path),
        )
    else:
        append_job_log(job_id, "❌ 合并失败！请检查字体文件或字符内容。")
        update_job(job_id, status="failed", exitCode=merge_code, finishedAt=time.time())


def create_merge_job(
    text: str,
    source_ref: str | None,
    target_ref: str | None,
    output_name: str | None,
) -> dict:
    job_id = uuid.uuid4().hex[:12]
    now = time.time()
    job = {
        "id": job_id,
        "text": text,
        "sourceRef": source_ref,
        "targetRef": target_ref,
        "outputName": output_name,
        "status": "queued",
        "logs": [],
        "exitCode": None,
        "output": None,
        "createdAt": now,
        "updatedAt": now,
    }
    with JOBS_LOCK:
        JOBS[job_id] = job

    thread = threading.Thread(
        target=run_merge_job,
        args=(job_id, text, source_ref, target_ref, output_name),
        daemon=True,
    )
    thread.start()
    return job


def run_check(text: str, source_ref: str | None) -> dict:
    source_path = resolve_font_ref(source_ref, SOURCE_FONT)
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    result = subprocess.run(
        [str(PYTHON_BIN), "check_characters.py", str(source_path), text],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=60,
    )
    return {
        "ok": result.returncode == 0,
        "exitCode": result.returncode,
        "output": result.stdout,
        "source": font_record(source_path),
        "length": len(text),
        "uniqueLength": len(set(text)),
    }


def parse_multipart(content_type: str, body: bytes) -> tuple[dict[str, str], dict[str, dict]]:
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not match:
        raise ValueError("缺少 multipart boundary")

    boundary = match.group("boundary").strip('"').encode("utf-8")
    fields: dict[str, str] = {}
    files: dict[str, dict] = {}

    for raw_part in body.split(b"--" + boundary):
        if not raw_part or raw_part in {b"--", b"--\r\n"}:
            continue
        if raw_part.startswith(b"\r\n"):
            raw_part = raw_part[2:]
        if raw_part.endswith(b"--\r\n"):
            raw_part = raw_part[:-4]
        elif raw_part.endswith(b"\r\n"):
            raw_part = raw_part[:-2]

        header_blob, separator, content = raw_part.partition(b"\r\n\r\n")
        if not separator:
            continue
        headers = header_blob.decode("utf-8", errors="replace").split("\r\n")
        disposition = ""
        for header in headers:
            if header.lower().startswith("content-disposition:"):
                disposition = header
                break
        name_match = re.search(r'name="([^"]+)"', disposition)
        if not name_match:
            continue
        field_name = name_match.group(1)
        filename_match = re.search(r'filename="([^"]*)"', disposition)
        if filename_match:
            files[field_name] = {
                "filename": filename_match.group(1),
                "content": content,
            }
        else:
            fields[field_name] = content.decode("utf-8", errors="replace").strip()

    return fields, files


def save_uploaded_font(role: str, filename: str, content: bytes) -> dict:
    if role not in {"source", "target"}:
        role = "source"
    if not content:
        raise ValueError("上传文件为空")

    safe_name = safe_filename(filename, f"{role}.ttf")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = UPLOAD_ROOT / f"{role}_{timestamp}_{safe_name}"
    counter = 1
    while target.exists():
        target = UPLOAD_ROOT / f"{role}_{timestamp}_{counter}_{safe_name}"
        counter += 1
    target.write_bytes(content)
    return font_record(target)


class FontMergeHandler(BaseHTTPRequestHandler):
    server_version = "FontMergeWeb/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[web] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.serve_static("index.html")
            return
        if path.startswith("/assets/"):
            self.serve_static(path.removeprefix("/"))
            return
        if path == "/api/fonts":
            send_json(self, {"ok": True, "fonts": font_inventory()})
            return
        if path.startswith("/api/jobs/"):
            job_id = path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                payload = json.loads(json.dumps(job, ensure_ascii=False)) if job else None
            if not payload:
                send_json(self, {"ok": False, "error": "未找到任务"}, 404)
                return
            send_json(self, {"ok": True, "job": payload})
            return
        if path.startswith("/fonts/"):
            self.serve_font(path.removeprefix("/fonts/"))
            return

        send_json(self, {"ok": False, "error": "Not found"}, 404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/upload":
            self.handle_upload()
            return

        try:
            payload = read_json(self)
        except json.JSONDecodeError:
            send_json(self, {"ok": False, "error": "JSON 格式无效"}, 400)
            return

        text = str(payload.get("text", ""))
        source_ref = payload.get("sourceRef")
        target_ref = payload.get("targetRef")
        output_name = str(payload.get("outputName") or "").strip() or None

        if parsed.path == "/api/check":
            if not text:
                send_json(self, {"ok": False, "error": "请输入要添加的文字"}, 400)
                return
            try:
                result = run_check(text, source_ref)
            except subprocess.TimeoutExpired:
                send_json(self, {"ok": False, "error": "检查超时"}, 504)
                return
            except Exception as exc:
                send_json(self, {"ok": False, "error": str(exc)}, 400)
                return
            send_json(self, {"ok": True, "result": result})
            return

        if parsed.path == "/api/merge":
            if not text:
                send_json(self, {"ok": False, "error": "请输入要添加的文字"}, 400)
                return
            job = create_merge_job(text, source_ref, target_ref, output_name)
            send_json(self, {"ok": True, "job": job}, 202)
            return

        send_json(self, {"ok": False, "error": "Not found"}, 404)

    def handle_upload(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            send_json(self, {"ok": False, "error": "请选择 TTF 文件"}, 400)
            return
        if length > 100 * 1024 * 1024:
            send_json(self, {"ok": False, "error": "文件过大"}, 413)
            return

        try:
            fields, files = parse_multipart(content_type, self.rfile.read(length))
            upload = files.get("font")
            if not upload:
                raise ValueError("未找到上传文件")
            record = save_uploaded_font(
                fields.get("role", "source"),
                upload.get("filename", "font.ttf"),
                upload.get("content", b""),
            )
        except Exception as exc:
            send_json(self, {"ok": False, "error": str(exc)}, 400)
            return

        send_json(self, {"ok": True, "font": record}, 201)

    def serve_static(self, relative: str) -> None:
        target = (WEB_ROOT / unquote(relative)).resolve()
        if not is_relative_to(target, WEB_ROOT.resolve()) or not target.is_file():
            send_json(self, {"ok": False, "error": "Not found"}, 404)
            return

        mime, _ = mimetypes.guess_type(target)
        if target.suffix == ".js":
            mime = "text/javascript"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_font(self, request_path: str) -> None:
        parts = [part for part in unquote(request_path).split("/") if part]
        if len(parts) >= 2 and parts[0] in FONT_SCOPES:
            ref = f"{parts[0]}:{parts[-1]}"
            default = parts[-1]
        elif parts:
            ref = f"output:{parts[-1]}"
            default = parts[-1]
        else:
            send_json(self, {"ok": False, "error": "字体文件不存在"}, 404)
            return

        try:
            target = resolve_font_ref(ref, default)
        except Exception as exc:
            send_json(self, {"ok": False, "error": str(exc)}, 404)
            return

        body = target.read_bytes()
        safe_name = target.name.replace('"', "")
        self.send_response(200)
        self.send_header("Content-Type", "font/ttf")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    port = int(os.environ.get("TFFADD_WEB_PORT", "8787"))
    host = os.environ.get("TFFADD_WEB_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), FontMergeHandler)
    url = f"http://{host}:{port}"
    print(f"字体合并控制台已启动: {url}")
    print("按 Ctrl+C 退出")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
