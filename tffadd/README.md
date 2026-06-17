# TTF 字体文件字符添加工具

这是一个专业的 TTF 字体字符合并工具，用于将指定文字从源字体文件（如 source_font.ttf）提取出来，并添加/更新到目标字体文件（如 AlimamaShuHeiTi-Bold.ttf）中。

## 功能特性

- ✅ 从 source_font.ttf 源字体中提取指定字符
- ✅ 自动添加/更新字符到 AlimamaShuHeiTi-Bold.ttf
- ✅ 保留原有字体的所有字符，不会被覆盖
- ✅ 自动处理字符映射和字形数据
- ✅ 支持更新现有字符或添加新字符
- ✅ 完整的错误处理和详细日志输出

---

## 🚀 快速开始（3步）

### 1️⃣ 首次使用 - 安装依赖

```bash
# 进入项目目录
cd /Users/chenkang/Downloads/tffadd

# 创建虚拟环境并安装依赖
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2️⃣ 运行合并工具 - 推荐方式

```bash
# 使用快速脚本（最简单）
./merge.sh "支付账户"
```

**特点：**
- ✅ 最简单的方式
- ✅ 自动生成输出文件名
- ✅ 自动处理所有参数

**例子：**
```bash
./merge.sh "支付"
./merge.sh "账户定价"
./merge.sh "支付账户定价使用充值"
```

### 3️⃣ 获取结果

输出的新字体文件将保存在项目目录中，可以直接使用。

---

## 📚 详细使用方法

### 方法一：使用完整命令（适合高级用户）

```bash
python3 ttf_font_merger.py -s 源文件 -t 目标文件 -c 文字 -o 输出文件
```

**参数说明：**

| 参数 | 说明 | 必需 |
|------|------|------|
| `-s, --source` | 源字体文件路径（从中提取字符）- 通常是 source_font.ttf | ✅ |
| `-t, --target` | 目标字体文件路径（要添加字符到这个文件）- 通常是 AlimamaShuHeiTi-Bold.ttf | ✅ |
| `-c, --characters` | 要添加的文字内容（可以是多个字符或整个句子） | ✅ |
| `-o, --output` | 输出文件路径（默认为 target_merged.ttf） | ❌ |

**使用示例：**

```bash
# 添加 3 个字符
python3 ttf_font_merger.py -s source_font.ttf -t AlimamaShuHeiTi-Bold.ttf -c "支付账" -o output1.ttf

# 添加 6 个字符
python3 ttf_font_merger.py -s source_font.ttf -t AlimamaShuHeiTi-Bold.ttf -c "支付账户定价" -o output2.ttf

# 添加大量文字
python3 ttf_font_merger.py -s source_font.ttf -t AlimamaShuHeiTi-Bold.ttf -c "现在人工智能已经成为了科技发展的重要驱动力" -o output3.ttf
```

---

## 🔍 查看字体中的字符

想知道字体中包含哪些字符？使用字体检查工具：

```bash
# 查看 source_font.ttf 的所有字符
python3 font_inspector.py source_font.ttf

# 只显示前 50 个字符
python3 font_inspector.py source_font.ttf -l 50

# 查看目标字体的字符统计
python3 font_inspector.py AlimamaShuHeiTi-Bold.ttf
```

---

## ⚙️ 工作原理

1. **读取源字体**：打开源字体文件，获取其 cmap（字符映射表）
2. **查找字符**：在源字体中查找要添加的每个字符
3. **提取字形**：从 glyf 表中提取字符对应的字形数据
4. **复制信息**：复制宽度（hmtx）和其他元数据
5. **写入目标**：将字形数据写入目标字体文件
6. **更新映射**：更新目标字体的 cmap 表

---

## ❓ 常见问题

**Q: 如何知道要添加的字符在 source_font.ttf 中是否存在？**  
A: 运行 `python3 font_inspector.py source_font.ttf` 来查看所有可用字符。

**Q: 如果源字体中没有某个字符怎么办？**  
A: 工具会跳过该字符并显示警告信息，继续处理其他字符。

**Q: 可以同时处理多个文字吗？**  
A: 可以，直接在 `-c` 参数中输入多个字符（如 "支付账户"）。

**Q: 会覆盖原始文件吗？**  
A: 不会，原始文件保持不变。使用 `-o` 参数指定新的输出文件。

**Q: 原有的字体字符会被删除吗？**  
A: 不会。AlimamaShuHeiTi-Bold.ttf 中的原有字符完全保留，新添加的字符只是增加或更新对应的字形。

**Q: 支持其他字体格式吗？**  
A: 目前仅支持 TTF 格式。

---

## 📂 项目文件结构

```
tffadd/
├── merge.sh                  # 🚀 快速启动脚本（推荐使用）
├── ttf_font_merger_fixed.py  # 核心字体合并工具
├── check_characters.py       # 字符验证工具
├── font_inspector.py         # 字体字符检查工具
├── source_font.ttf           # 源字体文件
├── AlimamaShuHeiTi-Bold.ttf  # 目标字体文件
├── requirements.txt          # 依赖配置
├── README.md                 # 本文档
└── venv/                     # Python 虚拟环境
```

---

## 技术细节

- 使用 `fontTools` 库处理 TTF 文件格式
- 保留原始字体的所有必要信息（glyf、loca、hmtx、cmap 等表）
- 自动处理字形名称冲突
- 支持完整的 Unicode 字符范围
