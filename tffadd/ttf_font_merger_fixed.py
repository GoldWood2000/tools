#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTF 字体文件字符添加工具 - 完整修复版
确保所有字体表都正确更新，解决 iconfont-preview 显示问题
"""

import argparse
import shutil
import sys
from pathlib import Path
from fontTools import ttLib
from fontTools.ttLib import newTable
from io import BytesIO
import os


def extract_glyphs_from_font(font_path, characters):
    """从字体文件中提取指定字符的字形数据"""
    try:
        font = ttLib.TTFont(font_path)
    except Exception as e:
        print(f"❌ 无法打开字体文件 {font_path}: {e}")
        return None
    
    glyphs = {}
    cmap = font.getBestCmap()
    
    if not cmap:
        print(f"❌ 字体文件 {font_path} 没有字符映射表")
        return None
    
    glyf_table = font.get('glyf')
    if not glyf_table:
        print(f"❌ 字体文件 {font_path} 不是有效的 TTF 文件")
        return None
    
    missing_chars = []
    
    for char in characters:
        char_code = ord(char)
        glyph_name = cmap.get(char_code)
        
        if glyph_name and glyph_name in glyf_table:
            try:
                glyphs[char] = {
                    'glyph_name': glyph_name,
                    'char_code': char_code,
                    'data': glyf_table[glyph_name]
                }
            except Exception as e:
                print(f"⚠️  无法提取字符 '{char}' 的字形数据: {e}")
                missing_chars.append(char)
        else:
            missing_chars.append(char)
    
    if missing_chars:
        print(f"⚠️  以下字符在源字体中不存在: {''.join(missing_chars)}")
    
    return glyphs, font


def sync_output_to_target(output_path, target_font_path):
    """将生成的字体文件同步回目标字体文件。"""
    if not output_path.exists():
        raise FileNotFoundError(f"输出字体文件不存在: {output_path}")

    if target_font_path.exists() and output_path.resolve() == target_font_path.resolve():
        return

    target_font_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(output_path, target_font_path)
    print(f"🔁 已同步更新目标字体: {target_font_path}")


def add_glyphs_to_target_font_fixed(target_font_path, source_glyphs, source_font, output_path):
    """
    将提取的字形添加到目标字体中（完整修复版）
    确保所有表都正确更新
    """
    try:
        target_font = ttLib.TTFont(target_font_path)
    except Exception as e:
        print(f"❌ 无法打开目标字体文件 {target_font_path}: {e}")
        return False
    
    # 获取必要的表
    glyf_table = target_font['glyf']
    cmap_table = target_font['cmap']
    loca_table = target_font['loca']
    head_table = target_font['head']
    hmtx_table = target_font['hmtx']
    maxp_table = target_font['maxp']
    post_table = target_font.get('post')
    hhea_table = target_font.get('hhea')
    vmtx_table = target_font.get('vmtx')
    
    # 获取最佳的字符映射表
    best_cmap = None
    for table in cmap_table.tables:
        if table.isUnicode():
            best_cmap = table
            break
    
    if not best_cmap:
        print("❌ 目标字体没有有效的 Unicode 字符映射表")
        return False
    
    added_count = 0
    updated_count = 0
    
    source_glyf = source_font['glyf']
    source_hmtx = source_font['hmtx']
    source_vmtx = source_font.get('vmtx')
    
    # 获取现有字形集合
    existing_glyphs = set(glyf_table.keys())
    new_glyph_counter = 0
    
    for char, glyph_info in source_glyphs.items():
        char_code = glyph_info['char_code']
        source_glyph_name = glyph_info['glyph_name']
        
        # 检查字符是否已存在
        if char_code in best_cmap.cmap:
            existing_glyph = best_cmap.cmap[char_code]
            if existing_glyph in glyf_table:
                # 更新现有字形
                try:
                    source_glyph = source_glyf[source_glyph_name]
                    glyf_table[existing_glyph] = source_glyph
                    
                    # 更新宽度信息
                    if source_glyph_name in source_hmtx.metrics:
                        width, lsb = source_hmtx.metrics[source_glyph_name]
                        hmtx_table.metrics[existing_glyph] = (width, lsb)
                    
                    # 更新竖向度量（如果存在）
                    if vmtx_table and source_vmtx and source_glyph_name in source_vmtx.metrics:
                        height, tsb = source_vmtx.metrics[source_glyph_name]
                        vmtx_table.metrics[existing_glyph] = (height, tsb)
                    
                    updated_count += 1
                    print(f"  ↻ 更新字符 '{char}' (U+{char_code:04X})")
                except Exception as e:
                    print(f"  ❌ 更新字符 '{char}' 失败: {e}")
                continue
        
        # 为新字形创建唯一的名称
        new_glyph_name = f"glyph_{new_glyph_counter}"
        while new_glyph_name in existing_glyphs:
            new_glyph_counter += 1
            new_glyph_name = f"glyph_{new_glyph_counter}"
        
        try:
            # 复制字形数据
            source_glyph = source_glyf[source_glyph_name]
            glyf_table[new_glyph_name] = source_glyph
            existing_glyphs.add(new_glyph_name)
            
            # 复制宽度信息
            if source_glyph_name in source_hmtx.metrics:
                width, lsb = source_hmtx.metrics[source_glyph_name]
                hmtx_table.metrics[new_glyph_name] = (width, lsb)
            else:
                hmtx_table.metrics[new_glyph_name] = (500, 0)
            
            # 复制竖向度量信息
            if vmtx_table and source_vmtx and source_glyph_name in source_vmtx.metrics:
                height, tsb = source_vmtx.metrics[source_glyph_name]
                vmtx_table.metrics[new_glyph_name] = (height, tsb)
            elif vmtx_table:
                vmtx_table.metrics[new_glyph_name] = (1000, 0)
            
            # 添加到字符映射表
            best_cmap.cmap[char_code] = new_glyph_name
            
            # 更新 maxp 表中的字形数量
            if hasattr(maxp_table, 'numGlyphs'):
                maxp_table.numGlyphs += 1
            
            added_count += 1
            print(f"  ✓ 添加字符 '{char}' (U+{char_code:04X})")
        except Exception as e:
            print(f"  ❌ 添加字符 '{char}' 失败: {e}")
    
    # 保存字体
    try:
        # 重新计算 loca 表
        target_font['loca'].loca = None
        
        # 保存文件
        target_font.save(output_path)
        sync_output_to_target(Path(output_path), Path(target_font_path))
        
        print(f"\n✅ 成功保存到: {output_path}")
        print(f"📊 统计: 新增 {added_count} 个字符，更新 {updated_count} 个字符")
        print(f"📈 总字符数: {maxp_table.numGlyphs}")
        return True
    except Exception as e:
        print(f"❌ 保存字体文件失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    parser = argparse.ArgumentParser(
        description='TTF 字体文件字符添加工具（完整修复版）',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='示例: python3 ttf_font_merger_fixed.py -s source.ttf -t target.ttf -c "文字" -o output.ttf'
    )
    
    parser.add_argument('-s', '--source', required=True, help='源字体文件路径')
    parser.add_argument('-t', '--target', required=True, help='目标字体文件路径')
    parser.add_argument('-c', '--characters', required=True, help='要添加的文字内容')
    parser.add_argument('-o', '--output', help='输出文件路径')
    
    args = parser.parse_args()
    
    if not Path(args.source).exists():
        print(f"❌ 源字体文件不存在: {args.source}")
        sys.exit(1)
    
    if not Path(args.target).exists():
        print(f"❌ 目标字体文件不存在: {args.target}")
        sys.exit(1)
    
    output_path = args.output or str(Path(args.target).stem) + '_merged.ttf'
    
    print(f"📖 源字体: {args.source}")
    print(f"🎯 目标字体: {args.target}")
    print(f"✍️  要添加的文字: {args.characters}")
    print(f"💾 输出文件: {output_path}\n")
    
    # 从源字体提取字形
    print("⏳ 正在从源字体提取字符...")
    result = extract_glyphs_from_font(args.source, args.characters)
    
    if result is None:
        sys.exit(1)
    
    source_glyphs, source_font = result
    
    if not source_glyphs:
        print("❌ 没有成功提取任何字符")
        sys.exit(1)
    
    print(f"✓ 成功提取 {len(source_glyphs)} 个字符\n")
    
    # 将字形添加到目标字体
    print("⏳ 正在添加字符到目标字体...\n")
    if add_glyphs_to_target_font_fixed(args.target, source_glyphs, source_font, output_path):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
