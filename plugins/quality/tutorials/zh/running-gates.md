---
title: 为任意语言运行质量门控
plugin: quality
audience: 需要验证项目状态的代理
order: 1
lang: zh
---

# 为任意语言运行质量门控

`quality` 插件在设计上是**语言无关的**：它执行您的 `mcp-vertex.config.json`
中指定的任何命令并报告退出码。本教程展示三个作用域来源（按优先级顺序）、
如何运行一个，以及如何取消失控的进程。

## 0. 心理模型

**作用域**是一个命名的命令列表。插件按顺序执行作用域中的每个命令，捕获
stdout/stderr，并返回结构化报告 `{ ok, results: [{ command, ok, code, tail }] }`。
`ok` 字段表示整个作用域——如果任何命令失败，作用域不 ok。

```
┌─ plugin options.scopes（最高优先级）
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ 检测到的 package.json 脚本 → "all"（lint, typecheck, test, build）
```

## 1. 列出可用作用域（只读）

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

示例响应（截断）：

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. 运行一个作用域

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

响应是按命令的：

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

读取 `results[N].tail` 获取失败上下文。`tail` 是最后 20 个非空行
（总输出上限 64 KiB）——足以调试而不会淹没代理的上下文。

## 3. 取消失控的进程

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

向每个运行中进程的进程组发送 `SIGKILL`。传递 `{ "pid": <number> }`
取消其中一个。取消是非阻塞的：下次调用的 `results` 将反映终止。

## 4. 使其语言无关

核心运行您的配置所说的。多语言项目（TypeScript + Python）示例：

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` 将运行 `typecheck` / `test` 作用域中的**所有四个命令**，
不论什么语言。Exit 0 = 通过；非零 = 失败（不管哪个二进制发出的）。

## 5. 用命令策略加固（M13）

`run_quality` **执行**宿主配置所说的内容。要限制信任度较低的代理调用
工具时哪些二进制可以运行，使用 `commandPolicy`：

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

被阻止的命令以 `code: 126` 和原因（"blocked by command policy"）报告，
**永远不会被启动**。`deny` 优先于 `allow`；空 `allow` 意味着"任何未
被拒绝的二进制"。

## 常见陷阱

- **`run_quality` 不替代 `bun run validate`**：核心的 `validate` 脚本
  直接运行四项检查。`run_quality` 用于**临时**运行和来自代理的按作用域
  内省。两者都有效；它们互不通信。
- **超过超时的长时间运行命令**被以 `code: 124` 和 `timedOut: true` 终止。
  默认超时为 600 000 ms（10 分钟）。如需要可按 runner 覆盖。
- **轮询"完成了吗？"**：不要这样做。`run_quality` 是同步的。如果需要
  了解长作用域，使用带有来自 `activeRunPids`（通过指标或后续工具调用）
  的 `pid` 的 `quality_cancel`。

## 下一步

- [多语言质量门控（p107）](../../p107-multilang-quality-gates.md)
- [信任边界 & 命令策略（M13）](../../p107-multilang-quality-gates.md#5-no-objetivos)
