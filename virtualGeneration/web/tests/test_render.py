# -*- coding: utf-8 -*-
"""
render.py 测试。验证渲染管线产出有效 PNG 且尺寸不变。

从 web/ 跑:
    pytest tests/
"""

import os
import sys

import pytest
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
sys.path.insert(0, WEB)

import fields as F  # noqa: E402
import render as R  # noqa: E402

pytestmark = pytest.mark.skipif(
    not (os.path.isfile(R.FRONT_PNG) and os.path.isfile(R.BACK_PNG)
         and R._font_path),
    reason="needs templates front.png/back.png + a CJK font",
)


def sample_record():
    import random
    random.seed(1)
    return F.random_record(plate="粤B12345", owner="张三")


def test_random_record_fields():
    rec = sample_record()
    for fd in F.FRONT_FIELDS + F.BACK_FIELDS:
        assert fd["key"] in rec, "记录缺字段 %s" % fd["key"]


def test_input_override():
    rec = F.random_record(plate="京A00001", owner="李四")
    assert rec["plate"] == "京A00001"
    assert rec["owner"] == "李四"


def test_render_front_size_unchanged():
    rec = sample_record()
    base = Image.open(R.FRONT_PNG)
    out = R.render_front(rec)
    assert out.size == base.size
    assert out.mode == "RGB"


def test_render_back_size_unchanged():
    rec = sample_record()
    base = Image.open(R.BACK_PNG)
    out = R.render_back(rec)
    assert out.size == base.size


def test_render_changes_pixels():
    """渲染后图像应与原模板不同（确实写了字）。"""
    rec = sample_record()
    base = Image.open(R.FRONT_PNG).convert("RGB")
    out = R.render_front(rec)
    assert list(base.getdata()) != list(out.getdata())


def test_regions_within_bounds():
    front = Image.open(R.FRONT_PNG)
    back = Image.open(R.BACK_PNG)
    for fd in F.FRONT_FIELDS:
        x0, y0, x1, y1 = fd["region"]
        assert 0 <= x0 < x1 <= front.size[0]
        assert 0 <= y0 < y1 <= front.size[1]
    for fd in F.BACK_FIELDS:
        x0, y0, x1, y1 = fd["region"]
        assert 0 <= x0 < x1 <= back.size[0]
        assert 0 <= y0 < y1 <= back.size[1]
