---
title: proposals 插件入门
plugin: proposals
audience: 协调器 / 代理
order: 1
lang: zh
---

# proposals 插件入门

本教程从一个空白工作区开始，以完整的提案 → 切片 → 实现 → 关闭循环结束，
文件互斥锁规范保持完整。假设 `proposals` 插件已启用
（见 `plugins/proposals/README.md` 中的 JSON 片段）。

## 0. 心理模型

**提案**是带有 frontmatter 头部的 markdown 文件。**切片**是其中的
编号章节。插件为每个切片协调两个写入者：一个认领，一个释放。
`auto_work` 是高层入口点，回答"我下一步该做什么？"。

```
docs/mcp-vertex/proposals/
├─ index.json          （由 sync_proposals 重新生成）
├─ p<N>-<标题>.md     （一个提案）
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. 从 `auto_work` 开始

`auto_work` 返回整个提案存储中下一个可执行的切片，以及紧凑有序的
计划。计划必须逐字执行——不得即兴发挥步骤。

```json
// MCP 工具调用
{ "tool": "proposals_auto_work", "args": {} }

// 典型响应（截断）
{
  "state": "work",
  "proposalId": "l110",
  "sliceId": "s1-claim",
  "steps": [
    "打开 docs/mcp-vertex/proposals/l110-…md 并选择下一个原子切片。",
    "认领其文件：proposals_agent_lock { action: \"claim\", … }。",
    "仅实现该切片——不在认领文件之外进行任何操作。",
    "按项目门控验证（如有，见 get_validation_matrix）。",
    "在提案中标记进度，然后调用 proposals_sync_proposals。",
    "释放：proposals_agent_lock { action: \"release\", task_id }。"
  ]
}
```

## 2. 认领切片的文件

`proposals_agent_lock` 工具记录在切片期间谁拥有哪些路径。没有认领，
`sync_proposals` 将拒绝将切片标记为已完成。

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

响应携带一个 `task_id`，必须保留直到释放。两个代理认领同一文件 ⇒
冲突，无进展。互斥锁由文件系统支持（非建议性），在进程重启后仍然存在。

## 3. 实现切片，然后验证

仅编辑已认领的文件。运行项目门控：

```bash
bun run validate
```

如果门控失败，修复切片——不要悄悄扩大认领范围。

## 4. 标记进度并同步

`sync_proposals` 读取提案文件，验证其 frontmatter + 切片计划，
并重建 `index.json`。操作轻量且幂等。

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. 关闭切片

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "l110",
    "sliceId": "s1-claim"
  }
}
```

这会将提案中的切片状态重写为 `done`，移除锁并重新同步索引。
然后再次调用 `auto_work`——它将返回下一个切片（如果存储已耗尽则
返回 `state: "idle"`）。

## 常见陷阱

- **编辑认领范围外的文件**：`sync_proposals` 将拒绝将切片标记为
  完成。使用带有自己认领的第二个切片，或拆分提案。
- **跳过 `sync_proposals`**：索引变得陈旧。下一个代理请求"下一个
  切片"并获得错误的切片。
- **忘记释放**：陈旧的锁会阻塞下一个协调器长达 `staleMs`（默认
  30 秒）。调用 `proposals_agent_lock { action: "gc" }` 清理。

## 下一步

- [agent_worktree 插件如何隔离并发代理](#)
- [auto_work 的持久化模式 (l109)](../../l109-feat-auto-work-persist-modes.md)
- [恢复工作的 Round context](#)
