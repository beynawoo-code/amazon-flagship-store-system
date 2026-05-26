# 亚马逊旗舰店子系统 · 方案文档

交互式方案说明与 Demo 预览，部署于 GitHub Pages。

**在线访问：** https://beynawoo-code.github.io/amazon-flagship-store-system/

本地预览：在项目根目录执行 `python3 -m http.server 8080`，浏览器打开 http://localhost:8080/

## 目录结构

- `index.html` — 方案导航入口
- `_system/`、`page-planning/`、`publish-and-traffic/`、`analytics-and-iteration/` — 各模块 HTML / JS
- `.github/workflows/` — GitHub Pages 自动部署

推送至 `main` 分支后，Actions 会自动发布站点。
