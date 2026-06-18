# -*- coding: utf-8 -*-
"""
身份证测试图片生成：正面替换随机字段，背面原图返回。

仅用于测试/样例数据，输出会添加 SAMPLE 水印。
"""

import os
import random
import string

from PIL import Image, ImageDraw, ImageFont

import fields as F
import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
IDCARD_DIR = os.path.abspath(os.path.join(HERE, "..", "tmp", "idcard"))
FRONT_JPG = os.path.join(IDCARD_DIR, "idcard_front.jpg")
BACK_JPG = os.path.join(IDCARD_DIR, "idcard_back.jpg")

IDCARD_FIELDS = [
    {"key": "name", "region": (180, 96, 260, 130), "size": 18, "align": "left"},
    {"key": "gender", "region": (180, 150, 230, 184), "size": 18, "align": "left"},
    {"key": "nation", "region": (322, 150, 380, 184), "size": 18, "align": "left"},
    {"key": "birth_year", "region": (180, 205, 248, 238), "size": 17, "align": "left"},
    {"key": "birth_month", "region": (284, 205, 326, 238), "size": 17, "align": "left"},
    {"key": "birth_day", "region": (356, 205, 398, 238), "size": 17, "align": "left"},
    {"key": "address", "region": (180, 258, 480, 324), "size": 16, "align": "left"},
    {"key": "id_no", "region": (278, 399, 510, 434), "size": 17, "align": "left"},
]

NATIONS = ["汉", "满", "回", "蒙", "藏", "苗", "壮", "土家", "彝", "瑶"]
ID_ADDRESS_PREFIX = [
    "江苏省南京市雨花台区软件大道",
    "北京市朝阳区建国路",
    "上海市浦东新区世纪大道",
    "广东省深圳市南山区科技园路",
    "浙江省杭州市西湖区文三路",
]


def random_id_no(year, month, day):
    area = "".join(random.choice(string.digits) for _ in range(6))
    seq = "".join(random.choice(string.digits) for _ in range(3))
    body = "%s%04d%02d%02d%s" % (area, year, month, day, seq)
    return body + random.choice(string.digits + "X")


def random_record(name=None):
    year = random.randint(1970, 2005)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return {
        "name": name or F.random_name(),
        "gender": random.choice(["男", "女"]),
        "nation": random.choice(NATIONS),
        "birth_year": str(year),
        "birth_month": "%02d" % month,
        "birth_day": "%02d" % day,
        "address": random.choice(ID_ADDRESS_PREFIX) + str(random.randint(1, 999)) + "号",
        "id_no": random_id_no(year, month, day),
    }


def _wrap_text(text, font, max_width):
    lines = []
    line = ""
    for ch in str(text):
        if font.getlength(line + ch) <= max_width:
            line += ch
        else:
            if line:
                lines.append(line)
            line = ch
    if line:
        lines.append(line)
    return lines


def _draw_sample_watermark(img):
    draw = ImageDraw.Draw(img, "RGBA")
    font = R.load_font(28)
    text = "SAMPLE 仅供测试"
    for y in range(76, img.height, 150):
        for x in range(-120, img.width, 360):
            draw.text((x, y), text, font=font, fill=(210, 40, 40, 38))


def draw_field(img, field, value):
    x0, y0, x1, y1 = field["region"]
    crop = img.crop((x0, y0, x1, y1))
    bg = R.region_bg_color(img, x0, y0, x1, y1)
    mask = R.old_text_mask(crop, bg)
    if mask.getbbox() is not None:
        img.paste(R.inpaint_masked_pixels(crop, mask, bg), (x0, y0))

    draw = ImageDraw.Draw(img)
    font = R.fit_font(str(value), x1 - x0 - 4, field.get("size", 16))
    if field["key"] == "address":
        lines = _wrap_text(value, font, x1 - x0 - 4)[:2]
        y = y0 + 1
        for line in lines:
            draw.text((x0 + 2, y), line, font=font, fill=(22, 24, 30))
            y += field.get("size", 16) + 5
        return

    ascent, descent = font.getmetrics()
    y = y0 + ((y1 - y0) - ascent - descent) // 2
    draw.text((x0 + 2, y), str(value), font=font, fill=(22, 24, 30))


def render_front(record):
    img = Image.open(FRONT_JPG).convert("RGB")
    for field in IDCARD_FIELDS:
        draw_field(img, field, record.get(field["key"], ""))
    _draw_sample_watermark(img)
    return img


def render_back():
    img = Image.open(BACK_JPG).convert("RGB")
    _draw_sample_watermark(img)
    return img
