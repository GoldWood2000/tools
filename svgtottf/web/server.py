# -*- coding: utf-8 -*-
"""
FastAPI server for the svgtottf web tool.

Runs under normal python3 (NOT FontForge's python). All FontForge work is
delegated to worker.py via `fontforge -lang=py -script worker.py ...`.

Run:
    uvicorn server:app --reload
    # then open http://localhost:8000
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "worker.py")
STATIC = os.path.join(HERE, "static")
SESSIONS = os.path.join(HERE, ".sessions")

FONTFORGE = shutil.which("fontforge")

app = FastAPI(title="svgtottf web")


# ---------------------------------------------------------------- helpers

def session_dir(session_id):
    """Resolve a session dir, guarding against path traversal."""
    if not re.fullmatch(r"[0-9a-f]{32}", session_id or ""):
        raise HTTPException(400, "无效 session")
    path = os.path.join(SESSIONS, session_id)
    if not os.path.isdir(path):
        raise HTTPException(404, "session 不存在或已过期")
    return path


def run_worker(args):
    """Run worker.py with given argv list. Returns (stdout, stderr).

    Raises HTTPException(400) carrying the worker's clean error line.
    """
    if not FONTFORGE:
        raise HTTPException(
            500, "未找到 fontforge，请先安装 FontForge 并确保在 PATH 中")

    proc = subprocess.run(
        [FONTFORGE, "-lang=py", "-script", WORKER] + args,
        capture_output=True, text=True)

    if proc.returncode != 0:
        msg = "字体处理失败"
        for line in (proc.stderr or "").splitlines():
            if line.startswith("WORKER_ERROR:"):
                msg = line.split("WORKER_ERROR:", 1)[1].strip()
                break
        raise HTTPException(400, msg)

    return proc.stdout, proc.stderr


# ---------------------------------------------------------------- routes

@app.post("/api/font")
async def upload_font(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    if not (name.endswith(".ttf") or name.endswith(".otf")):
        raise HTTPException(400, "请上传 .ttf 或 .otf 字体文件")

    session_id = uuid.uuid4().hex
    sdir = os.path.join(SESSIONS, session_id)
    thumbs = os.path.join(sdir, "thumbs")
    os.makedirs(thumbs, exist_ok=True)

    base_ttf = os.path.join(sdir, "base.ttf")
    with open(base_ttf, "wb") as fh:
        shutil.copyfileobj(file.file, fh)

    out_json = os.path.join(sdir, "glyphs.json")
    run_worker(["inspect", base_ttf, out_json, thumbs])

    with open(out_json) as fh:
        data = json.load(fh)

    data["session_id"] = session_id
    data["filename"] = file.filename
    return JSONResponse(data)


@app.get("/api/thumb/{session_id}/{hexcode}")
async def thumb(session_id, hexcode):
    if not re.fullmatch(r"[0-9A-Fa-f]{1,6}", hexcode):
        raise HTTPException(400, "无效码位")
    sdir = session_dir(session_id)
    path = os.path.join(sdir, "thumbs", "%s.svg" % hexcode.upper())
    if not os.path.isfile(path):
        raise HTTPException(404, "无缩略图")
    return FileResponse(path, media_type="image/svg+xml")


@app.post("/api/generate")
async def generate(
    session_id: str = Form(...),
    icons: str = Form(...),
    files: list[UploadFile] = File(...),
):
    sdir = session_dir(session_id)
    base_ttf = os.path.join(sdir, "base.ttf")
    if not os.path.isfile(base_ttf):
        raise HTTPException(404, "基础字体丢失，请重新上传")

    try:
        icon_cfgs = json.loads(icons)
    except Exception:
        raise HTTPException(400, "icons 参数不是合法 JSON")
    if not icon_cfgs:
        raise HTTPException(400, "未添加任何图标")

    # map uploaded svgs by filename
    svg_dir = os.path.join(sdir, "svgs")
    os.makedirs(svg_dir, exist_ok=True)
    by_name = {}
    for up in files:
        safe = os.path.basename(up.filename or "")
        if not safe.lower().endswith(".svg"):
            raise HTTPException(400, "只接受 .svg 文件: %s" % up.filename)
        dest = os.path.join(svg_dir, safe)
        with open(dest, "wb") as fh:
            shutil.copyfileobj(up.file, fh)
        by_name[safe] = dest

    worker_icons = []
    for cfg in icon_cfgs:
        fname = os.path.basename(cfg.get("filename", ""))
        if fname not in by_name:
            raise HTTPException(400, "缺少 SVG 文件: %s" % fname)
        ref = cfg.get("ref_codepoint")
        worker_icons.append({
            "svg_path": by_name[fname],
            "codepoint": int(cfg["codepoint"]),
            "name": cfg["name"],
            "ref_codepoint": int(ref) if ref not in (None, "") else None,
        })

    output_ttf = os.path.join(sdir, "output.ttf")
    args_json = os.path.join(sdir, "gen_args.json")
    with open(args_json, "w") as fh:
        json.dump({
            "base_ttf": base_ttf,
            "output_ttf": output_ttf,
            "icons": worker_icons,
        }, fh, ensure_ascii=False)

    stdout, _ = run_worker(["generate", args_json])
    try:
        result = json.loads(stdout.strip().splitlines()[-1])
    except Exception:
        result = {"ok": True}

    # persist result so the download endpoint can report css codes
    with open(os.path.join(sdir, "result.json"), "w") as fh:
        json.dump(result, fh, ensure_ascii=False)

    return JSONResponse(result)


@app.get("/api/download/{session_id}")
async def download(session_id):
    sdir = session_dir(session_id)
    output = os.path.join(sdir, "output.ttf")
    if not os.path.isfile(output):
        raise HTTPException(404, "尚未生成，请先点生成")
    return FileResponse(
        output, media_type="font/ttf", filename="icon.new.ttf")


@app.get("/api/health")
async def health():
    return {"ok": True, "fontforge": FONTFORGE}


# static frontend (mounted last so /api/* wins)
os.makedirs(STATIC, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
