# 技术与产品决策记录

本目录保存 Architecture Decision Records（ADR），用于记录会长期影响多个模块或组员的重要决定。

## 什么时候新增 ADR

- 正式交付平台或主架构改变；
- 产品安全边界改变；
- 公共 schema、证据状态或数据源优先级改变；
- 引入新的外部服务、持久化或敏感数据处理；
- 一个取舍会明显改变其他负责人范围。

普通 bug 修复、局部样式和不改变接口的重构不需要 ADR。

## 状态

- `Proposed`：等待团队确认；
- `Accepted`：当前应遵循；
- `Superseded`：被更新 ADR 取代；
- `Deprecated`：保留历史但不再采用。

## 编号与模板

文件名使用：

```text
NNNN-short-title.md
```

模板：

```markdown
# ADR-NNNN：标题

- 状态：Proposed
- 日期：YYYY-MM-DD
- 负责人：姓名或角色

## 背景

为什么需要作出决定。

## 决定

团队选择什么。

## 原因

为什么选择它。

## 影响

正面影响、代价和迁移要求。

## 备选方案

考虑过但没有采用的方案。
```

## 当前 ADR

- [ADR-0001：产品是研究之上的决策层](0001-decision-layer-product-boundary.md)
- [ADR-0002：桌面网页为当前正式交付面](0002-desktop-web-primary-surface.md)
- [ADR-0003：决策验证采用可追溯证据状态](0003-traceable-decision-validation.md)
