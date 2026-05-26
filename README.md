# 亚马逊旗舰店子系统 · 方案文档

交互式方案说明与 Demo 预览，部署于 GitHub Pages。

**在线访问：** https://beynawoo-code.github.io/amazon-flagship-store-system/

本地预览：在 `modules` 目录启动静态服务，例如 `python3 -m http.server 8080 --directory modules`，然后打开 http://localhost:8080/

## 目录结构

- `modules/` — 所有 HTML / JS 方案页与导航入口（`index.html`）
- `.github/workflows/` — GitHub Pages 自动部署

推送至 `main` 分支后，Actions 会将 `modules/` 发布为站点根目录。
