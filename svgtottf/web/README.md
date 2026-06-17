# svgtottf web

可视化网页版：上传图标字体 → 看现有字形 → 批量把 SVG 写入空码位 → 生成下载新 TTF。

取代手动改 `add_jd_pay_icon.py` 常量的老流程。

## 架构

```
浏览器 (静态页) ──> FastAPI (server.py) ──subprocess──> FontForge (worker.py)
```

- `server.py` 跑普通 python3，不直接 `import fontforge`。
- 所有字体操作隔离在 `worker.py`，由 `fontforge -lang=py -script worker.py ...` 子进程执行。

## 依赖

- FontForge（命令行 `fontforge` 在 PATH 中）。macOS: `brew install fontforge`。
- Python 3.9+

## 安装

```bash
cd web
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## 运行

```bash
cd web
source venv/bin/activate
uvicorn server:app --reload
# 打开 http://localhost:8000
```

## 用法

1. 拖入基础 `.ttf`（如 `jyicon.ttf`）。
2. 现有字形网格出现，点一个图标设为「默认参考字形 ★」（决定新图标视觉大小）。
3. 拖入一个或多个 `.svg`，每行自动建议下一个空 PUA 码位（E900 起）；可改码位、字形名、参考字形。
   - 码位变黄 = 已占用，会覆盖。
   - 参考选「按 em 居中」= 不按参考缩放，居中铺到 em 框。
4. 点「生成并下载新 TTF」。页面列出每个图标的 CSS `content` 值。

## 测试

```bash
cd web
pip install pytest
pytest tests/
```

测试通过 `fontforge` 子进程跑真实路径，需要父目录的样例 `jyicon.ttf` + `settingIcon.svg`。

## 目录

```
web/
  server.py            FastAPI 服务
  worker.py            FontForge 脚本 (inspect / generate)
  static/              前端 (index.html / app.js / style.css)
  tests/test_worker.py worker 测试
  .sessions/           运行时临时会话 (自动生成，可删)
  requirements.txt
```

## 说明

- 会话数据存 `web/.sessions/<id>/`，重启不清。手动 `rm -rf web/.sessions` 清理。
- FontForge 启动会向 stderr 打印版权 banner 和偶发 `utf82def_copy failure!`，无害；server 只看退出码与 `WORKER_ERROR:` 行。
