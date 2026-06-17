# -*- coding: utf-8 -*-
"""
Tests for worker.py. Driven through the `fontforge` CLI subprocess, so they
exercise the real FontForge path the server uses.

Run from the web/ dir:
    pytest tests/

Requires: fontforge on PATH, and the sample jyicon.ttf + settingIcon.svg in
the parent svgtottf/ dir.
"""

import json
import os
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)            # svgtottf/
WORKER = os.path.join(WEB, "worker.py")
FONT = os.path.join(ROOT, "jyicon.ttf")
SVG = os.path.join(ROOT, "settingIcon.svg")
FONTFORGE = shutil.which("fontforge")

pytestmark = pytest.mark.skipif(
    not (FONTFORGE and os.path.isfile(FONT) and os.path.isfile(SVG)),
    reason="needs fontforge + sample jyicon.ttf + settingIcon.svg",
)


def run(*args):
    return subprocess.run(
        [FONTFORGE, "-lang=py", "-script", WORKER, *args],
        capture_output=True, text=True)


def inspect(font_path, tmp_path):
    out = str(tmp_path / "g.json")
    thumbs = str(tmp_path / "thumbs")
    os.makedirs(thumbs, exist_ok=True)
    proc = run("inspect", font_path, out, thumbs)
    assert proc.returncode == 0, proc.stderr
    with open(out) as fh:
        return json.load(fh), thumbs


def test_inspect_lists_glyphs(tmp_path):
    data, thumbs = inspect(FONT, tmp_path)
    assert data["ok"] is True
    assert data["glyph_count"] > 0
    assert data["em"] > 0
    outlined = [g for g in data["glyphs"] if g["has_outline"]]
    assert outlined, "expected at least one outlined glyph"
    # every outlined glyph got a thumbnail
    for g in outlined:
        assert os.path.isfile(os.path.join(thumbs, g["hex"] + ".svg"))


def test_generate_adds_glyph(tmp_path):
    out_ttf = str(tmp_path / "out.ttf")
    args = {
        "base_ttf": FONT,
        "output_ttf": out_ttf,
        "icons": [{
            "svg_path": SVG,
            "codepoint": 0xE925,
            "name": "icon-setting",
            "ref_codepoint": 0xE920,
        }],
    }
    args_path = str(tmp_path / "args.json")
    with open(args_path, "w") as fh:
        json.dump(args, fh)

    proc = run("generate", args_path)
    assert proc.returncode == 0, proc.stderr
    result = json.loads(proc.stdout.strip().splitlines()[-1])
    assert result["ok"] is True
    assert os.path.isfile(out_ttf)

    # re-inspect output: glyph must exist at E925, outlined, advance == em
    data, _ = inspect(out_ttf, tmp_path / "re")
    g = next((x for x in data["glyphs"] if x["codepoint"] == 0xE925), None)
    assert g is not None, "E925 missing in output"
    assert g["has_outline"] is True
    assert g["advance"] == data["em"]


def test_generate_without_reference(tmp_path):
    out_ttf = str(tmp_path / "out.ttf")
    args = {
        "base_ttf": FONT,
        "output_ttf": out_ttf,
        "icons": [{
            "svg_path": SVG,
            "codepoint": 0xE926,
            "name": "icon-noref",
            "ref_codepoint": None,
        }],
    }
    args_path = str(tmp_path / "args.json")
    with open(args_path, "w") as fh:
        json.dump(args, fh)

    proc = run("generate", args_path)
    assert proc.returncode == 0, proc.stderr
    data, _ = inspect(out_ttf, tmp_path / "re")
    g = next((x for x in data["glyphs"] if x["codepoint"] == 0xE926), None)
    assert g is not None and g["has_outline"] is True


def test_bad_svg_errors(tmp_path):
    bad = str(tmp_path / "bad.svg")
    with open(bad, "w") as fh:
        fh.write("<svg xmlns='http://www.w3.org/2000/svg'></svg>")  # no path
    out_ttf = str(tmp_path / "out.ttf")
    args = {
        "base_ttf": FONT,
        "output_ttf": out_ttf,
        "icons": [{
            "svg_path": bad,
            "codepoint": 0xE927,
            "name": "icon-bad",
            "ref_codepoint": 0xE920,
        }],
    }
    args_path = str(tmp_path / "args.json")
    with open(args_path, "w") as fh:
        json.dump(args, fh)

    proc = run("generate", args_path)
    assert proc.returncode == 1
    assert "WORKER_ERROR" in proc.stderr
