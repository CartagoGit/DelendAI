---
title: 为项目文档建立目录
plugin: docs
audience: 任何需要按主题查找文档的代理
order: 1
lang: zh
---

# 为项目文档建立目录

`docs` 插件回答一个小而频繁的问题："这个项目有哪些文档，我在找哪一个？"
代理不必进行 grep，而是直接询问插件。本教程展示如何启用、列出和读取。

## 0. 心理模型

**文档**是配置的 `roots` 下的任何 `.md` 文件。插件枚举一次，从第一个
`# heading` 或 frontmatter `title:` 提取标题，并提供低令牌索引。
正文仅按需获取。

配置位于 `mcp-vertex.config.json`：

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` 是路径数组（文件或目录）。目录递归遍历。**工作区外的路径被
拒绝**——不允许 `..` 遍历。

## 1. 列出（低令牌索引）

```json
{ "tool": "docs_list", "args": {} }
```

响应（截断）：

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: 真实 i18n…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

列表按路径排序。传递 `roots` 将列表范围限制到子集（如只有
`["docs/proposals"]`）：

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. 读取一个文档

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

响应：

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…完整正文…",
  "truncated": false,
  "found": true
}
```

`content` 限制为 256 KiB。如果文档更大，`truncated: true` 且正文为前
256 KiB。如果路径不匹配配置的 roots 下的任何文档，`found: false`。

## 3. 为何两个工具而不是一个

`list` 廉价（每个文档几百字节，18 个文档 ≈ 4 KiB）。`read` 昂贵（每个
文档可能几兆字节）。分开它们意味着代理可以先 `list`，然后只 `read`
看起来相关的——在每个发现步骤节省令牌。

## 4. 路径包含（安全性）

`docs_read` 使用 `resolveWorkspaceContained` 解析路径——绝对路径、`..`
遍历和指向工作区外的符号链接都被拒绝。`found: false` 响应是代理路径被
拒绝的信号；插件故意不区分"缺失"和"工作区外"（以避免泄露文件系统布局）。

## 常见陷阱

- **Root 不存在**：`docs_list` 返回 `{ count: 0, truncated: false,
  docs: [] }`。插件不发出警告。
- **文档尚未提交**：未跟踪的文件仍然会被提供（插件从文件系统读取，而
  不是从 git）。返回的 `path` 是相对于工作区的。
- **标题推断失败**：如果第一个标题不是 `# `（没有空格，错误级别）且没有
  frontmatter `title:`，插件使用文件名 basename（如 `CHANGELOG.md` →
  `CHANGELOG.md`）。修复标题后重新运行。

## 下一步

- [`docs_list` 如何与 `memory_recall` 集成以回答"我保存了什么 + 在哪里有文档？"](#)
- [使用 `knowledge` 插件整理知识索引](#)
