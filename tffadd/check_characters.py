#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
字体字符检查工具
检查指定的文字中，哪些字符在源字体中存在，哪些不存在
"""

import argparse
import sys
from pathlib import Path
from fontTools import ttLib


def check_characters(font_path, text):
    """
    检查文本中的字符是否在字体中存在
    
    Args:
        font_path: TTF 字体文件路径
        text: 要检查的文本
        
    Returns:
        (存在的字符列表, 不存在的字符列表, 重复字符列表)
    """
    try:
        font = ttLib.TTFont(font_path)
    except Exception as e:
        print(f"❌ 无法打开字体文件 {font_path}: {e}")
        return None, None, None
    
    cmap = font.getBestCmap()
    
    if not cmap:
        print(f"❌ 字体文件 {font_path} 没有字符映射表")
        return None, None, None
    
    existing = []
    missing = []
    duplicates = set()
    
    seen = set()
    
    for i, char in enumerate(text):
        char_code = ord(char)
        
        # 跳过空格和特殊字符的重复检查
        if char in seen:
            if char not in duplicates:
                duplicates.add(char)
            continue
        
        seen.add(char)
        
        if char_code in cmap:
            existing.append((char, char_code))
        else:
            missing.append((char, char_code))
    
    return existing, missing, duplicates


def main():
    parser = argparse.ArgumentParser(
        description='字体字符检查工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  python check_characters.py source_font.ttf "立即邀请生成专属海报我的奖励"
  python check_characters.py AlimamaShuHeiTi-Bold.ttf "你好世界"
        '''
    )
    
    parser.add_argument(
        'font',
        help='字体文件路径'
    )
    parser.add_argument(
        'text',
        help='要检查的文本'
    )
    
    args = parser.parse_args()
    
    # 验证文件存在
    if not Path(args.font).exists():
        print(f"❌ 字体文件不存在: {args.font}")
        sys.exit(1)
    
    print(f"📖 字体文件: {Path(args.font).name}")
    print(f"📝 检查文本: {args.text}")
    print(f"📊 文本长度: {len(args.text)} 个字符")
    print("=" * 60)
    
    existing, missing, duplicates = check_characters(args.font, args.text)
    
    if existing is None:
        sys.exit(1)
    
    # 显示结果
    print(f"\n✅ 存在的字符 ({len(existing)} 个):")
    if existing:
        for char, code in existing:
            print(f"   '{char}' (U+{code:04X})")
    else:
        print("   无")
    
    print(f"\n❌ 缺失的字符 ({len(missing)} 个):")
    if missing:
        for char, code in missing:
            print(f"   '{char}' (U+{code:04X})")
    else:
        print("   无")
    
    if duplicates:
        print(f"\n⚠️  重复的字符 ({len(duplicates)} 个):")
        for char in sorted(duplicates):
            print(f"   '{char}'")
    
    # 统计
    print("\n" + "=" * 60)
    total_unique = len(existing) + len(missing)
    coverage = (len(existing) / total_unique * 100) if total_unique > 0 else 0
    
    print(f"📈 统计信息:")
    print(f"   总字符数（去重）: {total_unique}")
    print(f"   存在: {len(existing)} ({coverage:.1f}%)")
    print(f"   缺失: {len(missing)} ({100 - coverage:.1f}%)")
    
    if duplicates:
        print(f"   重复: {len(duplicates)}")
    
    # 返回状态码
    if missing:
        print(f"\n⚠️  存在 {len(missing)} 个缺失的字符，无法全部添加")
        sys.exit(1)
    else:
        print(f"\n✅ 所有字符都可以添加")
        sys.exit(0)


if __name__ == '__main__':
    main()
