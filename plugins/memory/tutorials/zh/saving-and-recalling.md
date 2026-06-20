---
title: 保存和调用记忆笔记
plugin: memory
audience: 任何需要跨会话连续性的代理
order: 1
lang: zh
---

# 保存和调用记忆笔记

本教程展示四个 `memory_*` 工具的实际应用。笔记是存储在
`.cache/mcp-vertex/memory/notes.json` 下的小型 JSON 记录——
小到足以完整输出，按 id 索引，可通过标签或全文查询检索。

## 0. 心理模型

**笔记**是 `{ id, title, body, tags, createdAt, updatedAt }`。
标题是唯一的（不区分大小写）——`memory_save` 按标题进行 upsert。
`body` 没有固定模式；将其视为简短的自由文本字段。保存前，`redactSecrets`
会自动编辑掉秘密（见
`packages/core/src/lib/shared/redact.ts`）。

## 1. 保存笔记

```json
{
  "tool": "memory_save",
  "args": {
    "title": "monorepo 发布顺序",
    "body": "先发布 core，然后插件同步发布。derive-version.ts 从最后一个 vX.Y.Z 标签读取 Conventional Commits。",
    "tags": ["release", "monorepo"]
  }
}
```

响应：`{ id: "<uuid>", createdAt: "..." }`。Save 返回 id，以便
稍后可以 `forget`。

## 2. 按查询调用

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "发布顺序",
    "limit": 5
  }
}
```

返回最多 `limit` 条与查询匹配的笔记（对标题 + body 的子字符串
匹配，按时间倒序排列）。使用 `tags` 代替（或配合）`query` 缩小范围：

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. 低成本列表

`memory_list` 只返回 `{ id, title, tags }` ——索引。当你还不想
获取 body 时使用：

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. 遗忘

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` 是硬删除——没有软删除/归档。id 消失；标题释放
供未来的 `memory_save` 使用。

## 常见陷阱

- **`body` 中的秘密**：即使插件在保存时编辑，也不要粘贴原始令牌或
  `.env` 风格的值——编辑是启发式的，并不完美。
- **标题冲突**：`memory_save` 按标题进行 upsert。如果两个代理并行
  保存同一标题，第二个写入者获胜，第一个丢失。每个切片/问题使用
  唯一标题。
- **Recall 结果过多**：优先使用 `tags` 而不是宽泛的 `query`。
  `""` 的查询返回全部内容按时间倒序——对于"上次我保存了什么？"很有
  用，但在完整存储上代价高昂。

## 下一步

- [round_context (proposals) 如何将记忆笔记链接到活动提案](../../proposals/tutorials/zh/getting-started.md)
- [秘密编辑合约](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
