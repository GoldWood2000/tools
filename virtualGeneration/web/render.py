# -*- coding: utf-8 -*-
"""
行驶证图片渲染：载模板 → 去除旧字段值 → 画新内容 → 返回 PIL.Image。

测试/样例用途。不做防伪纹理 / 印章仿真。
"""

import os

from PIL import Image, ImageDraw, ImageFont
from PIL import ImageFilter

import fields as F

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(HERE, "templates")
FRONT_PNG = os.path.join(TEMPLATES, "front.png")
BACK_PNG = os.path.join(TEMPLATES, "back.png")

TEMPLATE_VALUES = {
    "plate": "冀DD12345",
    "vehicle_type": "新能源重型厢式货车",
    "owner": "李康",
    "address": "江苏省南京市江宁开发总部基地",
    "use_char": "货运",
    "model": "比亚迪牌QZ5180XXYD",
    "vin": "L4J3PQURNHUTP2SJD",
    "engine": "7BMC1KHDTI",
    "register_date": "2020-05-20",
    "issue_date": "2020-05-23",
    "file_no": "376132214300",
    "passengers": "2",
    "gross_mass": "18000kg",
    "curb_mass": "9200kg",
    "load_mass": "8600kg",
    "dimensions": "9800X2550X3850mm",
    "traction_mass": "0kg",
    "inspect_year": "2027",
    "inspect_month": "6",
}

FONT_CANDIDATES = [
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]
TEXT_COLOR = (28, 28, 30)

_font_path = next((p for p in FONT_CANDIDATES if os.path.isfile(p)), None)
_font_cache = {}


def load_font(size):
    if _font_path is None:
        raise RuntimeError("未找到可用中文字体，请在 render.py FONT_CANDIDATES 配置")
    key = int(size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(_font_path, key)
    return _font_cache[key]


# ----------------------------------------------------------- 旧字擦除

def _luma(pixel):
    return 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]


def region_bg_color(img, x0, y0, x1, y1):
    """取 region 内出现最多的颜色（量化后）作背景色。

    背景安全底纹像素远多于旧字像素，故众数即背景；自动避开旧字，
    不会像角落采样那样误吃到字的深色。
    """
    crop = img.convert("RGB").crop((x0, y0, x1, y1))
    counts = {}
    bg_counts = {}
    for p in crop.getdata():
        # 量化到 8 的倍数，合并相近底纹色
        q = (p[0] & 0xF8, p[1] & 0xF8, p[2] & 0xF8)
        counts[q] = counts.get(q, 0) + 1
        lum = _luma(p)
        chroma = max(p) - min(p)
        if lum > 215 or chroma > 18:
            bg_counts[q] = bg_counts.get(q, 0) + 1
    source = bg_counts or counts
    if not source:
        return (240, 238, 235)
    best = max(source, key=source.get)
    # 还原到量化块中心
    return (min(best[0] + 4, 255), min(best[1] + 4, 255), min(best[2] + 4, 255))


def old_text_mask(crop, bg):
    """识别字段内旧文字笔画，而不是把整个字段区域都当作待清理区。"""
    bg_luma = _luma(bg)
    pixels = crop.load()
    w, h = crop.size
    raw = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            p = pixels[x, y]
            lum = _luma(p)
            chroma = max(p) - min(p)
            dist = abs(p[0] - bg[0]) + abs(p[1] - bg[1]) + abs(p[2] - bg[2])
            is_dark_mark = lum < min(175, bg_luma - 32) and dist > 32
            is_gray_mark = chroma < 48 and lum < min(222, bg_luma - 12) and dist > 20
            if is_dark_mark or is_gray_mark:
                raw[y][x] = True

    seen = [[False] * w for _ in range(h)]
    mask = Image.new("L", crop.size, 0)
    out = mask.load()
    for sy in range(h):
        for sx in range(w):
            if not raw[sy][sx] or seen[sy][sx]:
                continue

            stack = [(sx, sy)]
            seen[sy][sx] = True
            points = []
            while stack:
                x, y = stack.pop()
                points.append((x, y))
                for ny in range(max(0, y - 1), min(h, y + 2)):
                    for nx in range(max(0, x - 1), min(w, x + 2)):
                        if seen[ny][nx] or not raw[ny][nx]:
                            continue
                        seen[ny][nx] = True
                        stack.append((nx, ny))

            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            bw = max(xs) - min(xs) + 1
            bh = max(ys) - min(ys) + 1
            area = len(points)
            density = area / (bw * bh)
            is_hline = bw >= 20 and bh <= 3 and bw / max(bh, 1) >= 8
            is_tiny_noise = area < 2
            is_big_background = (
                area > w * h * 0.35
                or (bw > w * 0.85 and bh > h * 0.55 and density > 0.35)
            )
            if is_hline or is_tiny_noise or is_big_background:
                continue

            for x, y in points:
                out[x, y] = 255
    return mask.filter(ImageFilter.MaxFilter(3))


def inpaint_masked_pixels(crop, mask, fallback):
    """用周围未遮罩像素向内补色，去除旧字同时尽量保留局部底纹。"""
    clean = crop.copy()
    pixels = clean.load()
    masked = [[mask.getpixel((x, y)) > 0 for x in range(mask.size[0])]
              for y in range(mask.size[1])]
    w, h = crop.size

    for _ in range(max(w, h)):
        changes = []
        for y in range(h):
            for x in range(w):
                if not masked[y][x]:
                    continue
                colors = []
                for ny in range(max(0, y - 1), min(h, y + 2)):
                    for nx in range(max(0, x - 1), min(w, x + 2)):
                        if nx == x and ny == y:
                            continue
                        if not masked[ny][nx]:
                            colors.append(pixels[nx, ny])
                if colors:
                    r = sum(c[0] for c in colors) // len(colors)
                    g = sum(c[1] for c in colors) // len(colors)
                    b = sum(c[2] for c in colors) // len(colors)
                    changes.append((x, y, (r, g, b)))
        if not changes:
            break
        for x, y, color in changes:
            pixels[x, y] = color
            masked[y][x] = False

    for y in range(h):
        for x in range(w):
            if masked[y][x]:
                pixels[x, y] = fallback
    return clean


def remove_old_text(img, field):
    x0, y0, x1, y1 = field["region"]
    crop = img.crop((x0, y0, x1, y1))
    bg = region_bg_color(img, x0, y0, x1, y1)
    mask = old_text_mask(crop, bg)
    if mask.getbbox() is None:
        return
    img.paste(inpaint_masked_pixels(crop, mask, bg), (x0, y0))


# ----------------------------------------------------------- 字段绘制

def fit_font(text, max_w, size):
    s = size
    while s >= 8:
        font = load_font(s)
        if font.getlength(text) <= max_w:
            return font
        s -= 1
    return load_font(8)


def draw_field(img, field, text):
    text = str(text)
    x0, y0, x1, y1 = field["region"]
    rw = x1 - x0
    rh = y1 - y0

    # 先去除旧字笔画，再绘制新内容；避免整块覆盖字段底纹。
    remove_old_text(img, field)

    # 新字：垂直居中
    font = fit_font(text, rw - 2, field.get("size", 12))
    ascent, descent = font.getmetrics()
    ty = y0 + (rh - ascent - descent) // 2

    if field.get("align") == "center":
        tw = font.getlength(text)
        tx = x0 + (rw - tw) // 2
    else:
        tx = x0 + 2

    ImageDraw.Draw(img).text((tx, ty), text, font=font, fill=TEXT_COLOR)


# ----------------------------------------------------------- 渲染整页

# 默认替换全部字段；传入字段 key 元组时可只替换指定字段。
DEFAULT_ONLY = None


def render_page(template_path, field_defs, record, only=DEFAULT_ONLY):
    img = Image.open(template_path).convert("RGB")
    for field in field_defs:
        if only is not None and field["key"] not in only:
            continue
        val = record.get(field["key"], "")
        if val == "":
            continue
        draw_field(img, field, val)
    return img


def render_front(record, only=DEFAULT_ONLY):
    return render_page(FRONT_PNG, F.FRONT_FIELDS, record, only)


def render_back(record, only=DEFAULT_ONLY):
    return render_page(BACK_PNG, F.BACK_FIELDS, record, only)


# ----------------------------------------------------------- 校准网格

def grid_overlay(template_path, step=20):
    img = Image.open(template_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    font = load_font(9)
    for gx in range(0, w, step):
        col = (255, 0, 0) if gx % 100 == 0 else (255, 180, 180)
        draw.line((gx, 0, gx, h), fill=col)
        if gx % 100 == 0:
            draw.text((gx + 1, 1), str(gx), font=font, fill=(200, 0, 0))
    for gy in range(0, h, step):
        col = (0, 0, 255) if gy % 100 == 0 else (180, 180, 255)
        draw.line((0, gy, w, gy), fill=col)
        if gy % 100 == 0:
            draw.text((1, gy + 1), str(gy), font=font, fill=(0, 0, 200))
    return img
