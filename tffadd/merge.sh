#!/bin/bash
# TTF 字体合并快速启动脚本 (修复版 - 支持 iconfont-preview)

cd "$(dirname "$0")"
source venv/bin/activate

# 设置默认值
SOURCE="fonts/source/source_font.ttf"
TARGET="fonts/target/AlimamaShuHeiTi-Bold.ttf"
OUTPUT_DIR="fonts/output"

# 如果传入参数，使用传入的字符内容
if [ -z "$1" ]; then
    echo "❌ 使用方法: $0 \"要添加的文字\""
    echo ""
    echo "示例："
    echo "  $0 \"支付账户\""
    echo "  $0 \"定价价格\""
    exit 1
fi

CHARACTERS="$1"

# 首先检查字符是否存在于源字体
echo "🔍 检查字符是否存在于源字体..."
echo ""

python3 check_characters.py "$SOURCE" "$CHARACTERS"
CHECK_RESULT=$?

if [ $CHECK_RESULT -ne 0 ]; then
    echo ""
    echo "❌ 部分字符不存在于源字体中，无法添加"
    echo ""
    echo "💡 提示：可以使用以下命令查看源字体中有哪些字符："
    echo "   python3 font_inspector.py fonts/source/source_font.ttf"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 生成输出文件名（添加时间戳以区分不同版本）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUTPUT_DIR"
OUTPUT="$OUTPUT_DIR/AlimamaShuHeiTi-Bold_${TIMESTAMP}.ttf"

echo "🚀 开始合并字体文件..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📖 源字体: $SOURCE"
echo "🎯 目标字体: $TARGET"
echo "✍️  要添加的文字: $CHARACTERS"
echo "💾 输出文件: $OUTPUT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

python3 ttf_font_merger_fixed.py \
  -s "$SOURCE" \
  -t "$TARGET" \
  -c "$CHARACTERS" \
  -o "$OUTPUT"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 合并完成！"
    echo "📍 输出文件位置: $(pwd)/$OUTPUT"
    echo ""
    echo "文件信息:"
    ls -lh "$OUTPUT"
else
    echo "❌ 合并失败！请检查字体文件或字符内容。"
    exit 1
fi
