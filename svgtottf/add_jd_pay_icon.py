# -*- coding: utf-8 -*-
"""
把「支付,京东.svg」追加/覆盖写入 jyicon.ttf，
并按字体里 U+E910 的图标视觉尺寸进行等比适配。

运行：
  fontforge -script add_jd_pay_icon_match_e910.py

输出：
  jyicon.new.ttf
"""

import fontforge
import psMat

FONT_PATH = "jyicon.ttf"
SVG_PATH = "settingIcon.svg"
OUTPUT_PATH = "jyicon.new.ttf"
# 新图标写入的位置
CODEPOINT = 0xE925
GLYPH_NAME = "icon-setting"

# 参考图标：按 U+E910 的视觉大小来适配
REFERENCE_CODEPOINT = 0xE920


def safe_remove_glyph(font, codepoint):
    try:
        font.removeGlyph(codepoint)
    except Exception:
        pass


def get_reference_bbox(font, codepoint):
    ref_glyph = font[codepoint]
    xmin, ymin, xmax, ymax = ref_glyph.boundingBox()
    w = xmax - xmin
    h = ymax - ymin
    if w <= 0 or h <= 0:
        raise RuntimeError(f"参考字形 {hex(codepoint)} 没有有效轮廓")
    return xmin, ymin, xmax, ymax, w, h


def fit_glyph_to_reference_box(font, glyph, ref_codepoint):
    """不翻转，只按参考字形等比缩放并对齐。"""
    rxmin, rymin, rxmax, rymax, rw, rh = get_reference_bbox(font, ref_codepoint)

    xmin, ymin, xmax, ymax = glyph.boundingBox()
    w = xmax - xmin
    h = ymax - ymin
    if w <= 0 or h <= 0:
        raise RuntimeError("SVG 导入后没有有效轮廓，请检查 SVG 是否为矢量路径")

    # 等比缩放到不超过参考字形的宽高
    scale = min(rw / w, rh / h)
    glyph.transform(psMat.scale(scale))

    # 重新取边界框
    xmin, ymin, xmax, ymax = glyph.boundingBox()
    w = xmax - xmin
    h = ymax - ymin

    # 水平、垂直都对齐到参考字形的盒子中间
    target_xmin = rxmin + (rw - w) / 2
    target_ymin = rymin + (rh - h) / 2

    tx = target_xmin - xmin
    ty = target_ymin - ymin
    glyph.transform(psMat.translate(tx, ty))

    # 保持和原字体一致的 advance width
    glyph.width = font.em


def main():
    font = fontforge.open(FONT_PATH)

    safe_remove_glyph(font, CODEPOINT)

    glyph = font.createChar(CODEPOINT, GLYPH_NAME)
    glyph.importOutlines(SVG_PATH)

    fit_glyph_to_reference_box(font, glyph, REFERENCE_CODEPOINT)

    glyph.correctDirection()
    glyph.removeOverlap()
    glyph.round()

    font.selection.none()
    font.generate(OUTPUT_PATH)

    print("生成成功:", OUTPUT_PATH)
    print("当前码位:", hex(CODEPOINT))
    print("参考码位:", hex(REFERENCE_CODEPOINT))
    print('CSS content: "\\e925"')


if __name__ == "__main__":
    main()
