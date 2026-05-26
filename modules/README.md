---
title: 亚马逊旗舰店 · modules 总/分索引
owner: "@beynawoo-code"
applies_to:
  - src/features/amazon-flagship-store-system/modules/**
---

# modules · 从总到分

## 统一 HTML 入口（发布给用户）

| 入口 | 说明 |
|------|------|
| **[index.html](./index.html)** | 全部 16 个方案页的导航门户；对外托管时建议作为 `modules/` 默认页 |

```text
总  modules/_system/          l1 → l2 → l3 → l4 → l5-api-capability
分  modules/<菜单>/           该菜单原型 · SOP · architecture/README
```

## 总 · 上层架构

| 文档 | 路径 |
|------|------|
| 边界宣言 + 三件套索引 | [_system/README.md](./_system/README.md) |
| L1 业务能力 | [_system/l1-business-capability-architecture/](./_system/l1-business-capability-architecture/flagship-store_capability_architecture.md) |
| L2 菜单蓝图 | [_system/l2-menu/](./_system/l2-menu/flagship-store_menu_v1.md) |
| L3 业务工作流 | [_system/l3-business-workflow/](./_system/l3-business-workflow/amazon-brand-store-workflow.html) |
| L4 系统架构图 | [_system/l4-system-architecture/](./_system/l4-system-architecture/flagship-store_system_architecture.html) |
| L5 API 能力架构 | [_system/l5-api-capability/](./_system/l5-api-capability/amazon-brand-store-api-architecture.html) |

## 分 · 业务菜单

| 目录 | 中文 | 分架构说明 | 原型 / 规范入口 |
|------|------|------------|-----------------|
| [goal-setting/](./goal-setting/) | 目标设定 | [architecture/README.md](./goal-setting/architecture/README.md) | （见 [_system 业务工作流](./_system/l3-business-workflow/amazon-brand-store-workflow.html)） |
| [page-planning/](./page-planning/) | 页面规划 | [architecture/README.md](./page-planning/architecture/README.md) | [页面层级 Demo](./page-planning/amazon-brand-store-page-hierarchy-demo.html) |
| [content-building/](./content-building/) | 素材搭建 | [architecture/README.md](./content-building/architecture/README.md) | （待建） |
| [publish-and-traffic/](./publish-and-traffic/) | 发布引流 | [architecture/README.md](./publish-and-traffic/architecture/README.md) | [Tag 管理](./publish-and-traffic/amazon-attribution-tag-manage-demo.html) |
| [analytics-and-iteration/](./analytics-and-iteration/) | 分析迭代 | [architecture/README.md](./analytics-and-iteration/architecture/README.md) | [Insights 看板](./analytics-and-iteration/amazon-flagship-store-insights-dashboard.html) |

## 设计顺序 vs 阅读顺序

| | 顺序 |
|---|---|
| **设计 / 动笔** | 边界宣言 → 业务工作流（`l3-business-workflow/`）→ L1 能力 → L2 菜单 → 回写工作流 → L4 系统 → L5 API |
| **阅读 / 评审** | `_system/README` → L1 → L2 → L3 工作流 → L4 → L5 |

详见 [`_system/README.md`](./_system/README.md) 与 [工作范式 §1.0](../../../../docs/methodology/上层架构与竞品调研-工作范式.md)。

## 使用建议

1. **从零做方案**：按 **设计顺序** 动笔（先工作流，再能力/菜单，最后技术）。
2. **评审 / 汇报**：按 **阅读顺序** 打开 HTML；业务方可先讲 L3 工作流。
3. **改菜单**：先改 L2 MD，同步 L1 能力与 `l3-business-workflow`，再动分目录 `architecture/README` 与实现。

---

作者：@beynawoo-code
