# 虚拟证件生成 web

行驶证图片内容替换（测试 / 样例数据用途）。上传无关——直接用内置模板，填字段或随机生成，渲染正反两页并下载。

> 仅用于测试 / 样例数据，不做防伪纹理、印章仿真，不追求像素级乱真。

## 架构

```
浏览器 (静态页) ──> FastAPI (server.py) ──> render.py (Pillow) ──> fields.py (坐标+随机数据)
```

- `fields.py` — 字段定义（每个字段的 `region` 坐标 + 字号 + 对齐）+ 随机数据生成器。
- `render.py` — Pillow：载模板 → 用众数底纹色覆盖字段区域 → 画新字。
- `server.py` — FastAPI：`/random`（随机记录）、`/generate`（渲染正反页）、`/grid`（校准网格）。
- `static/` — 前端：填号牌/所有人 → 随机其余 → 生成 → 预览下载。

## 依赖

Python 3.10+（用到 `str | None` 注解）。

```bash
cd web
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

中文字体：默认用 macOS 自带 `STHeiti Medium.ttc`。其他系统在 `render.py` 的 `FONT_CANDIDATES` 加路径。

## 运行

```bash
cd web
source venv/bin/activate
uvicorn server:app --reload
# 打开 http://localhost:8000
```

## 用法

1. 填「号牌号码」「所有人」（留空则随机）。
2. 点「随机填充其余字段」→ 出现可编辑记录，逐项可改。
3. 点「生成正反两页」→ 预览 + 下载 PNG。

## 字段坐标校准

`fields.py` 里每字段是 `region: (x0, y0, x1, y1)`，即覆盖+绘制的矩形。

调坐标时开校准网格图对照：

```
http://localhost:8000/api/driver/grid/front
http://localhost:8000/api/driver/grid/back
```

红线 = x 每 100px，蓝线 = y 每 100px，每 20px 一条细线。看旧字落在哪，改对应 `region`。

## 测试

```bash
cd web
pip install pytest
pytest tests/
```

## 目录

```
web/
  server.py            FastAPI
  render.py            Pillow 渲染
  fields.py            字段坐标 + 随机数据
  templates/           front.png / back.png（行驶证正反模板）
  static/              前端
  tests/test_render.py
  requirements.txt  README.md
```

## 扩展新证件

模块化设计：加新证件类型时，新增模板图 + 在 `fields.py` 加字段定义 + 在 `render.py` 加 `render_xxx`，`server.py` 加对应路由。前端 `tabs` 加一个 tab。
