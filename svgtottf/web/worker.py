# -*- coding: utf-8 -*-
"""
FontForge worker. Runs under FontForge's bundled python (not system python3).

Invoked by server.py as a subprocess:

    fontforge -lang=py -script worker.py inspect  <font.ttf> <out.json> <thumb_dir>
    fontforge -lang=py -script worker.py generate <args.json>

Subcommands:

  inspect:  dump glyph list (codepoint/name/advance/has_outline) to <out.json>
            and export an SVG thumbnail per outlined glyph into <thumb_dir>.

  generate: read <args.json> =
              {
                "base_ttf":   "...",
                "output_ttf": "...",
                "icons": [
                  {"svg_path": "...", "codepoint": 59685,
                   "name": "icon-setting", "ref_codepoint": 59680}
                ]
              }
            import each SVG into the font at its codepoint, fit it to the
            reference glyph (or to the em box when ref_codepoint is null),
            then generate the output TTF. Prints a JSON result to stdout.

Reuses the fitting logic from add_jd_pay_icon.py.
"""

import sys
import json

import fontforge
import psMat


def eprint(msg):
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


def safe_remove_glyph(font, codepoint):
    try:
        font.removeGlyph(codepoint)
    except Exception:
        pass


def safe_close(font):
    # FontForge can raise a spurious error from close() even after a clean
    # generate/inspect; the real work is already done, so swallow it.
    try:
        font.close()
    except Exception:
        pass


def bbox_wh(glyph):
    xmin, ymin, xmax, ymax = glyph.boundingBox()
    return xmin, ymin, xmax, ymax, xmax - xmin, ymax - ymin


def has_outline(glyph):
    try:
        xmin, ymin, xmax, ymax = glyph.boundingBox()
    except Exception:
        return False
    return (xmax - xmin) > 0 and (ymax - ymin) > 0


# ---------------------------------------------------------------- fitting

def fit_to_reference(font, glyph, ref_codepoint):
    """Scale uniformly to the reference glyph's bbox and center inside it."""
    ref = font[ref_codepoint]
    rxmin, rymin, rxmax, rymax, rw, rh = bbox_wh(ref)
    if rw <= 0 or rh <= 0:
        raise RuntimeError(u"参考字形 %s 无有效轮廓" % hex(ref_codepoint))

    xmin, ymin, xmax, ymax, w, h = bbox_wh(glyph)
    if w <= 0 or h <= 0:
        raise RuntimeError(u"SVG 无矢量轮廓，请确认是矢量路径而非位图")

    scale = min(rw / w, rh / h)
    glyph.transform(psMat.scale(scale))

    xmin, ymin, xmax, ymax, w, h = bbox_wh(glyph)
    target_xmin = rxmin + (rw - w) / 2.0
    target_ymin = rymin + (rh - h) / 2.0
    glyph.transform(psMat.translate(target_xmin - xmin, target_ymin - ymin))


def fit_to_em(font, glyph, pad=0.1):
    """No reference: scale to fit the em box (with padding) and center."""
    em = font.em
    xmin, ymin, xmax, ymax, w, h = bbox_wh(glyph)
    if w <= 0 or h <= 0:
        raise RuntimeError(u"SVG 无矢量轮廓，请确认是矢量路径而非位图")

    avail = em * (1.0 - 2.0 * pad)
    scale = min(avail / w, avail / h)
    glyph.transform(psMat.scale(scale))

    xmin, ymin, xmax, ymax, w, h = bbox_wh(glyph)
    target_xmin = (em - w) / 2.0
    # vertical middle of the em box in glyph coords (baseline = 0)
    mid_y = (font.ascent - font.descent) / 2.0
    target_ymin = mid_y - h / 2.0
    glyph.transform(psMat.translate(target_xmin - xmin, target_ymin - ymin))


# ---------------------------------------------------------------- inspect

def cmd_inspect(font_path, out_json, thumb_dir):
    font = fontforge.open(font_path)
    glyphs = []
    for glyph in font.glyphs():
        cp = glyph.unicode
        if cp is None or cp < 0:
            continue
        outlined = has_outline(glyph)
        entry = {
            "codepoint": cp,
            "hex": "%04X" % cp,
            "name": glyph.glyphname,
            "advance": glyph.width,
            "has_outline": outlined,
        }
        if outlined:
            thumb = thumb_dir.rstrip("/") + "/%04X.svg" % cp
            try:
                glyph.export(thumb)
                entry["thumb"] = "%04X.svg" % cp
            except Exception as exc:
                eprint("thumb export failed for %s: %s" % (entry["hex"], exc))
        glyphs.append(entry)

    glyphs.sort(key=lambda g: g["codepoint"])
    result = {
        "ok": True,
        "em": font.em,
        "ascent": font.ascent,
        "descent": font.descent,
        "family": font.familyname or "",
        "glyph_count": len(glyphs),
        "glyphs": glyphs,
    }
    with open(out_json, "w") as fh:
        json.dump(result, fh, ensure_ascii=False)
    safe_close(font)


# ---------------------------------------------------------------- generate

def cmd_generate(args_path):
    with open(args_path) as fh:
        args = json.load(fh)

    font = fontforge.open(args["base_ttf"])
    out_icons = []

    for icon in args["icons"]:
        cp = int(icon["codepoint"])
        name = icon["name"]
        ref = icon.get("ref_codepoint")

        safe_remove_glyph(font, cp)
        glyph = font.createChar(cp, name)
        glyph.importOutlines(icon["svg_path"])

        if ref is not None:
            fit_to_reference(font, glyph, int(ref))
        else:
            fit_to_em(font, glyph)

        glyph.correctDirection()
        glyph.removeOverlap()
        glyph.round()
        glyph.width = font.em

        out_icons.append({
            "codepoint": cp,
            "hex": "%04X" % cp,
            "name": name,
            "css": "\\%x" % cp,
        })

    font.selection.none()
    font.generate(args["output_ttf"])
    safe_close(font)

    sys.stdout.write(json.dumps(
        {"ok": True, "output_ttf": args["output_ttf"], "icons": out_icons},
        ensure_ascii=False))
    sys.stdout.flush()


# ---------------------------------------------------------------- entry

def main(argv):
    if len(argv) < 2:
        eprint("usage: worker.py inspect|generate ...")
        return 2

    cmd = argv[1]
    try:
        if cmd == "inspect":
            cmd_inspect(argv[2], argv[3], argv[4])
        elif cmd == "generate":
            cmd_generate(argv[2])
        else:
            eprint("unknown command: %s" % cmd)
            return 2
    except Exception as exc:
        # surface a clean single-line error for the server to relay
        eprint(u"WORKER_ERROR: %s" % exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
