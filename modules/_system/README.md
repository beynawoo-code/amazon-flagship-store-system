---
title: 亚马逊旗舰店 · 总 · _system 索引
owner: "@beynawoo-code"
applies_to:
  - src/features/amazon-flagship-store-system/modules/_system/**
---

# 总 · `_system`（序号主题包）

子系统级方案产物，目录名统一 **`l{序号}-{主题}/`**。

| 概念 | 说明 |
|------|------|
| **文件夹序号（L1–L5）** | **阅读与汇报顺序**（与资源管理器排序一致） |
| **设计 / 动笔顺序** | 见下表；**不等于**文件夹序号（工作流目录为 `l3-*`，但探索阶段应**先于 L1**） |

权威定义：[上层架构与竞品调研-工作范式](../../../../docs/methodology/上层架构与竞品调研-工作范式.md) **§1.0、§1.4**。

```text
_system/
├── README.md                 ← 本索引 + 边界宣言
├── l1-business-capability-architecture/  ← L1 业务能力
├── l2-menu/                  ← L2 菜单 + 角色矩阵
├── l3-business-workflow/     ← 业务工作流（探索首稿落盘；阅读序号 L3）
├── l4-system-architecture/   ← L4 技术系统架构（方法论文档所称「L3 系统架构」）
└── l5-api-capability/        ← L5 Amazon Ads API 能力架构
```

## 主题包入口

| 序号 | 目录 | 回答的问题 | MD | HTML |
|:---:|------|------------|----|------|
| L1 | [l1-business-capability-architecture/](./l1-business-capability-architecture/) | 有哪些业务能力？ | [md](./l1-business-capability-architecture/flagship-store_capability_architecture.md) | [html](./l1-business-capability-architecture/flagship-store_capability_architecture.html) |
| L2 | [l2-menu/](./l2-menu/) | 谁用哪些菜单？ | [md](./l2-menu/flagship-store_menu_v1.md) | [html](./l2-menu/flagship-store_menu_v1.html) |
| L3 | [l3-business-workflow/](./l3-business-workflow/) | 跨菜单业务链路？ | — | [workflow](./l3-business-workflow/amazon-brand-store-workflow.html) |
| L4 | [l4-system-architecture/](./l4-system-architecture/) | 模块与技术集成？ | — | [arch](./l4-system-architecture/flagship-store_system_architecture.html) |
| L5 | [l5-api-capability/](./l5-api-capability/) | Ads API 能力分层与边界？ | — | [api](./l5-api-capability/amazon-brand-store-api-architecture.html) |

## 设计顺序 vs 阅读顺序

| | 顺序 |
|---|---|
| **设计 / 动笔（authoring）** | 边界宣言 → **[探索] 业务工作流**（`l3-business-workflow/` 首稿）→ L1 能力 → L2 菜单 → **回写校验工作流** → L4 系统架构 → L5 API（若有） |
| **阅读 / 评审（reading）** | **L1 → L2 → L3 → L4 → L5**（自上而下审约束；对业务方路演可先打开 L3 工作流） |

> 方法论文档「三层金字塔」的 L3 = 系统架构，落盘为 **`l4-system-architecture/`**（因 `l3-*` 已用于业务工作流包）。

## 边界宣言（摘要）

> 只做 Brand Store 引流与转化分析、Tag 与联盟全生命周期；不做广告执行、订单履约、品牌注册。

跨域数据经 `src/domain/` 交换。全索引：[../README.md](../README.md)

---

作者：@beynawoo-code
