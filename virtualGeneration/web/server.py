# -*- coding: utf-8 -*-
"""
FastAPI 服务：行驶证图片内容替换（测试/样例用途）。

路由：
  GET  /                  首页
  POST /api/driver/random      随机生成一份记录（号牌/所有人可指定）
  POST /api/driver/generate    用给定记录渲染正反两页 → 返回 base64 PNG
  GET  /api/driver/grid/{side}  返回校准网格图（front|back），用于微调字段坐标

运行：
  uvicorn server:app --reload
  # 打开 http://localhost:8000
"""

import base64
import io
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import fields as F
import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")

app = FastAPI(title="虚拟证件生成 - 行驶证")


# ----------------------------------------------------------- models

class DriverInput(BaseModel):
    plate: str | None = None   # 号牌号码
    owner: str | None = None   # 所有人


class DriverRecord(BaseModel):
    # 正页
    plate: str
    vehicle_type: str
    owner: str
    address: str
    use_char: str
    model: str
    vin: str
    engine: str
    register_date: str
    issue_date: str
    # 反页
    file_no: str
    passengers: str
    gross_mass: str
    curb_mass: str
    load_mass: str
    dimensions: str
    traction_mass: str
    inspect_year: str
    inspect_month: str


# ----------------------------------------------------------- helpers

def png_b64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ----------------------------------------------------------- routes

@app.post("/api/driver/random")
async def driver_random(inp: DriverInput):
    """随机生成一份记录；plate/owner 若给定则用指定值。"""
    rec = F.random_record(plate=inp.plate or None, owner=inp.owner or None)
    return rec


@app.post("/api/driver/generate")
async def driver_generate(rec: DriverRecord):
    """渲染正反两页，返回 base64 PNG。"""
    record = rec.model_dump()
    try:
        front = R.render_front(record)
        back = R.render_back(record)
    except Exception as exc:
        raise HTTPException(500, "渲染失败: %s" % exc)
    return {
        "front_png": png_b64(front),
        "back_png": png_b64(back),
    }


@app.get("/api/driver/grid/{side}")
async def driver_grid(side: str):
    """校准网格图：在模板上叠坐标网格，便于微调 fields.py 中的 region。"""
    if side == "front":
        path = R.FRONT_PNG
    elif side == "back":
        path = R.BACK_PNG
    else:
        raise HTTPException(400, "side 必须是 front 或 back")
    img = R.grid_overlay(path)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@app.get("/api/driver/template/{side}")
async def driver_template(side: str):
    """返回原始模板图（无网格、无字），供校准页底图。"""
    if side == "front":
        path = R.FRONT_PNG
    elif side == "back":
        path = R.BACK_PNG
    else:
        raise HTTPException(400, "side 必须是 front 或 back")
    return FileResponse(path, media_type="image/png")


@app.get("/api/driver/regions")
async def driver_regions():
    """返回当前字段坐标定义（含模板尺寸），供校准页加载。"""
    from PIL import Image
    fw, fh = Image.open(R.FRONT_PNG).size
    bw, bh = Image.open(R.BACK_PNG).size
    return {
        "front": [dict(fd, region=list(fd["region"])) for fd in F.FRONT_FIELDS],
        "back": [dict(fd, region=list(fd["region"])) for fd in F.BACK_FIELDS],
        "sizes": {"front": [fw, fh], "back": [bw, bh]},
    }


class RegionsPayload(BaseModel):
    front: list[dict]
    back: list[dict]


@app.post("/api/driver/regions")
async def save_regions(payload: RegionsPayload):
    """保存校准后的坐标到 regions.json，并热加载，免重启。"""
    import json as _json
    data = {"front": payload.front, "back": payload.back}
    with open(F.REGIONS_JSON, "w", encoding="utf-8") as fh:
        _json.dump(data, fh, ensure_ascii=False, indent=2)
    F.reload_regions()
    return {"ok": True, "saved": F.REGIONS_JSON}


@app.post("/api/driver/preview/{side}")
async def driver_preview(side: str, rec: DriverRecord):
    """渲染单页预览（校准页实时预览用），返回 base64 PNG。"""
    record = rec.model_dump()
    if side == "front":
        img = R.render_front(record)
    elif side == "back":
        img = R.render_back(record)
    else:
        raise HTTPException(400, "side 必须是 front 或 back")
    return {"png": png_b64(img)}


@app.get("/api/health")
async def health():
    return {"ok": True, "font": R._font_path}


# static frontend (mounted last so /api/* wins)
os.makedirs(STATIC, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
