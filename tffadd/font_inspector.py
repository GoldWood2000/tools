#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
字体字符查看工具
列出 TTF 字体文件中包含的所有字符
"""

import argparse
import sys
from pathlib import Path
from fontTools import ttLib


def list_font_characters(font_path, limit=None):
    """
    列出字体文件中包含的所有字符
    
    Args:
        font_path: TTF 字体文件路径
        limit: 最多显示的字符数（None 表示显示全部）
    """
    try:
        font = ttLib.TTFont(font_path)
    except Exception as e:
        print(f"❌ 无法打开字体文件 {font_path}: {e}")
        return None
    
    cmap = font.getBestCmap()
    
    if not cmap:
        print(f"❌ 字体文件 {font_path} 没有字符映射表")
        return None
    
    # 收集所有字符
    characters = []
    for char_code in sorted(cmap.keys()):
        try:
            char = chr(char_code)
            # 过滤掉控制字符
            if not (0 <= char_code < 32 or 127 <= char_code < 160):
                characters.append((char_code, char))
        except:
            pass
    
    print(f"📊 字体文件: {Path(font_path).name}")
    print(f"📈 总字符数: {len(characters)}")
    print(f"\n{'字符':<5} {'Unicode编码':<15} {'十进制':<10}")
    print("=" * 35)
    
    count = 0
    for char_code, char in characters:
        if limit and count >= limit:
            print(f"\n... 还有 {len(characters) - limit} 个字符未显示")
            break
        
        try:
            print(f"{char:<5} U+{char_code:04X}        {char_code:<10}")
        except:
            print(f"?     U+{char_code:04X}        {char_code:<10}")
        count += 1
    
    # 按范围分类统计
    print(f"\n\n📋 按 Unicode 范围分类统计:")
    print("=" * 35)
    
    ranges = {
        'CJK Unified Ideographs (4E00-9FFF)': (0x4E00, 0x9FFF),
        'CJK Unified Ideographs Ext. A (3400-4DBF)': (0x3400, 0x4DBF),
        'CJK Unified Ideographs Ext. B (20000-2A6DF)': (0x20000, 0x2A6DF),
        'Latin (0000-00FF)': (0x0000, 0x00FF),
        'Latin Extended-A (0100-017F)': (0x0100, 0x017F),
        'Latin Extended-B (0180-024F)': (0x0180, 0x024F),
        'General Punctuation (2000-206F)': (0x2000, 0x206F),
        'Other ranges': None,
    }
    
    counted = set()
    
    for range_name, (start, end) in list(ranges.items())[:-1]:
        count = 0
        for char_code, _ in characters:
            if start <= char_code <= end:
                count += 1
                counted.add(char_code)
        if count > 0:
            print(f"  {range_name}: {count}")
    
    # 其他范围
    other_count = sum(1 for char_code, _ in characters if char_code not in counted)
    if other_count > 0:
        print(f"  Other ranges: {other_count}")
    
    return characters


def main():
    parser = argparse.ArgumentParser(
        description='字体字符查看工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python font_inspector.py source_font.ttf
  python font_inspector.py AlimamaShuHeiTi-Bold.ttf -l 50
        '''
    )
    
    parser.add_argument(
        'font',
        help='要检查的字体文件路径'
    )
    parser.add_argument(
        '-l', '--limit',
        type=int,
        help='最多显示的字符数'
    )
    
    args = parser.parse_args()
    
    # 验证文件存在
    if not Path(args.font).exists():
        print(f"❌ 字体文件不存在: {args.font}")
        sys.exit(1)
    
    list_font_characters(args.font, args.limit)


if __name__ == '__main__':
    main()
