# -*- coding: utf-8 -*-

import os
import sys

import pytest
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
sys.path.insert(0, WEB)

import idcard as ID  # noqa: E402

pytestmark = pytest.mark.skipif(
    not (os.path.isfile(ID.FRONT_JPG) and os.path.isfile(ID.BACK_JPG)),
    reason="needs idcard front/back images",
)


def test_random_record_fields():
    rec = ID.random_record(name="张三")
    for fd in ID.IDCARD_FIELDS:
        assert fd["key"] in rec
    assert rec["name"] == "张三"


def test_render_front_size_unchanged():
    rec = ID.random_record()
    base = Image.open(ID.FRONT_JPG)
    out = ID.render_front(rec)
    assert out.size == base.size
    assert out.mode == "RGB"


def test_render_back_returns_back_size():
    base = Image.open(ID.BACK_JPG)
    out = ID.render_back()
    assert out.size == base.size
    assert out.mode == "RGB"
