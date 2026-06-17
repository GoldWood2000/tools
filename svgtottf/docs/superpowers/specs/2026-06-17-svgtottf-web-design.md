# svgtottf 可视化网页版 — 设计文档

日期: 2026-06-17
状态: 已批准设计，待写实现计划

## 1. 目标

把现有 `add_jd_pay_icon.py`(FontForge 手动脚本，手动改 `FONT_PATH`/`SVG_PATH`/`CODEPOINT` 等常量)改造成可视化网页工具。用户在浏览器里：

1. 上传基础 TTF 字体
2. 查看字体内现有字形网格(码位 + 缩略图)
3. 批量拖入多个 SVG，为每个分配码位、字形名、参考字形
4. 预览导入效果
5. 一键生成并下载新 TTF

## 2. 架构

```
浏览器 (单页 HTML/JS, 无构建)
      │  上传 ttf / svg, 选码位
      ▼
FastAPI server.py  ──subprocess──>  worker.py (FontForge 自带 python)
      │                                  │ 复用 fit_glyph_to_reference_box
      │  <── glyph 列表+缩略图 / new.ttf ──┘
      ▼
   下载 new.ttf
```

**关键约束**：`import fontforge` 只能在 FontForge 自带 python 解释器里运行，普通 python3 无法 import。因此：

- Web server 用普通 python3 + FastAPI + uvicorn 运行。
- 所有 FontForge 操作隔离进 `worker.py`，由 server 通过 `fontforge -script worker.py <args>` 子进程调用。
- worker 与 server 之间通过 JSON 参数 + 文件路径通信。

## 3. 组件

### 3.1 worker.py (FontForge 脚本)

职责：纯字体操作，无 web 依赖。两种子命令：

- `inspect <font.ttf> <out.json>`：导出字形清单 = `[{codepoint, name, advance, has_outline}]`；同时把每个有轮廓字形导出成 SVG 缩略图到指定目录。
- `generate <args.json>`：读 `{base_ttf, output_ttf, icons: [{svg_path, codepoint, name, ref_codepoint}]}`，对每个 icon：
  - `safe_remove_glyph`(若码位已占用)
  - `createChar` + `importOutlines`
  - `fit_glyph_to_reference_box`(复用现有等比缩放 + 居中对齐逻辑)
  - `correctDirection` / `removeOverlap` / `round`
  - 设 `glyph.width = font.em`
  - 全部完成后 `font.generate(output_ttf)`

复用来源：现有 `add_jd_pay_icon.py` 的 `get_reference_bbox` / `fit_glyph_to_reference_box` / `safe_remove_glyph`。

### 3.2 server.py (FastAPI)

会话用临时目录(每次上传一个 session id 文件夹)。路由：

- `POST /api/font` — multipart 上传 TTF。保存 → 调 worker inspect → 返回 `{session_id, em, glyphs: [...], thumb_base_url}`。
- `GET /api/thumb/{session_id}/{codepoint}` — 返回单字形 SVG 缩略图。
- `POST /api/generate` — body `{session_id, icons: [...]}`，先把上传的 SVG 存盘，调 worker generate，返回新 TTF 文件流(`Content-Disposition: attachment`)。
- `GET /` — 静态首页。

错误：worker 非零退出 → 解析 stderr，返回 4xx + 中文消息(如「SVG 无矢量轮廓」「码位冲突」)。

### 3.3 前端 (index.html + app.js + style.css)

纯原生 JS，无构建步骤。

- 上传区：拖入/选择 TTF。
- 字形网格：渲染现有字形缩略图 + 码位标签；点一个设为「参考字形」(★)。
- 新增图标表：拖入 SVG → 新增行 = `{svg 文件名, 码位输入(自动建议下一个空 PUA E000–F8FF), 字形名输入, 参考码位下拉, 预览按钮}`。
- 预览：调 generate 的单条预览(或前端直接渲染 SVG 叠在参考框上的近似预览)。
- 生成按钮：POST generate → 触发下载 + 显示各码位 CSS `\eXXX`。

## 4. 数据流

1. 用户上传 `jyicon.ttf` → server 存 session → worker inspect → 前端拿到字形列表 + 缩略图 → 渲染网格。
2. 用户看网格知道哪些 PUA 码位被占；拖入 SVG，每行自动建议下一个空码位。
3. 用户点某现有图标设为参考字形(决定新图标视觉大小)。
4. 点生成 → 上传所有 SVG + 配置 → worker generate → 返回 `new.ttf` → 浏览器下载。

## 5. 码位 / 参考字形规则

- 自动建议码位：扫现有占用码位，从 `0xE900`(或字体内已用 PUA 段起点)起找第一个空位，每新增一行递增。
- 冲突：若用户手填的码位已占用，标黄警告「将覆盖现有字形」，仍允许生成。
- 参考字形：默认取字体内某个已存在的图标(沿用现脚本 `0xE920` 思路，但改为用户可点选)。若未选，回退到「不缩放到参考、按 em 框居中」的安全默认。

## 6. 错误处理

| 情况 | 处理 |
|------|------|
| 非 TTF / 解析失败 | server 返回 400 + 「字体解析失败」 |
| SVG 无矢量轮廓 | worker 报错 → 400 +「SVG 无矢量轮廓，请确认是路径而非位图」 |
| 码位冲突 | 前端黄色警告 + 覆盖确认，不阻断 |
| FontForge 缺失 | server 启动时探测 `fontforge`，缺失则首页提示安装 |

## 7. 测试

- `pytest` 测 worker generate：喂样例 `settingIcon.svg` + `jyicon.ttf`，断言：
  - 输出 TTF 在目标码位存在字形
  - 该字形 bbox 落在参考字形 bbox 容差内
  - 该字形 advance width == em
- worker inspect：断言返回字形数 > 0 且含已知码位。
- 前端：手动验收(上传→生成→下载打开确认)。

## 8. 技术栈

- 后端：Python3 + FastAPI + uvicorn + python-multipart。FontForge(系统已装 `/usr/local/bin/fontforge`)。
- 前端：原生 HTML/CSS/JS，无打包。
- 运行：`uvicorn server:app`，浏览器开 `localhost:8000`。

## 9. 目录结构(新增，不动现有脚本)

```
svgtottf/
  web/
    server.py
    worker.py
    static/
      index.html
      app.js
      style.css
    tests/
      test_worker.py
    requirements.txt
    README.md
  add_jd_pay_icon.py   # 现有脚本保留
```

## 10. 非目标 (YAGNI)

- 不做用户账号 / 持久化存储(临时目录即可)。
- 不做在线 SVG 编辑器。
- 不做多字体合并(那是 tffadd 的活)。
- 不做云部署，仅本地运行。
