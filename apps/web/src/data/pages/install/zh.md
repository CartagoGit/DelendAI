---
title: 安装与运行
description: 安装 mcp-vertex，把它接到你的 IDE，选择一个预设，并在开始工作前验证服务器。
order: 1
navLabel: 安装
---

# 安装与运行

把 mcp-vertex 接入你的工作流，让 MCP 客户端指向对应二进制，并在第一次会话前先验证解析出的插件集合。

## 选择你的包管理器

下面所有包管理器执行的都是同一个已发布包。选择你的团队已经在用的那个，并按原样保留命令。

### npm

Node Package Manager 随 Node.js 一起提供，因此在你需要跨机器和 CI runner 获得最广兼容性时，它是最稳妥的通用默认选项。

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm 速度快、节省磁盘空间，而且依赖解析更严格，因此很适合 monorepo，或者已经把 pnpm 作为团队标准的环境。

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn 在许多 JavaScript 代码库里依然是熟悉的替代方案，所以当你的工具链和团队习惯已经围绕 Yarn 建立时，这条路径会很顺手。

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun 把 runtime 和包管理器合在一个工具里，而 mcp-vertex 本身就是用 bun 构建的，所以如果机器上已经有 bun，这就是最直接的路径。

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno 可以直接执行 npm 包。如果你偏好默认更安全、对 TypeScript 一等支持且兼容 npm 的 runtime，这条路径就很合适。

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## 选择你的 IDE

下面的片段使用的是基于 bun 的 standard 预设。把 JSON 原样贴进目标文件，然后让你的 IDE 注册这个 stdio 服务器。

### VS Code

文件：.vscode/mcp.json
范围：项目

```json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Cursor

文件：.cursor/mcp.json 或 ~/.cursor/mcp.json
范围：项目 / 全局

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Windsurf

文件：~/.codeium/windsurf/mcp_config.json
范围：全局

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Claude Code

文件：.mcp.json 或通过 claude mcp add
范围：项目

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Claude Desktop

文件：claude_desktop_config.json
范围：全局

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Antigravity

文件：~/.gemini/antigravity-ide/mcp_config.json
范围：全局

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Zed

文件：settings.json
范围：全局

```json
{
  "context_servers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

## 选择一个预设

预设是可叠加的。先从最小集合开始，只有当工作流确实需要更多能力时再扩大插件表面。

### minimal

推荐用途：只读定位和 CI smoke test。
大小：2 个插件。

- git
- search

### standard

推荐用途：单智能体工作，需要 memory、docs、lint、类型和依赖辅助。
大小：7 个插件。

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

推荐用途：多智能体协作，需要锁、通知、日志和关闭标记。audit 仍然是 opt-in，应该在一轮工作结束后单独加载。
大小：13 个插件。

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions

### full

推荐用途：在 swarm 预设基础上再加上 web-fetch 和 issues 这类 host-only 集成，前提是宿主暴露了它们。
大小：15 个插件。

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions
- web-fetch
- issues

## 验证

配置写好后，用安装时同一个包管理器跑一次自检。如果你不用 bun，请把 `bunx` 换成 `npx`、`pnpm dlx`、`yarn dlx` 或 `deno run -A npm:`。

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

当你想在不 fork 预设的前提下从预设里减掉某个插件时，就用 `--exclude-plugins=`。例如保留 swarm 基线，但在单智能体会话里去掉 notification。

## FAQ

### 为什么 `deno run -A npm:@mcp-vertex/core` 启动很慢？

Deno 在第一次运行时会解析并验证 npm 包。后续执行会复用 `~/.cache/deno` 里的缓存，但如果你频繁在本地启动，bun 或 npx 仍然更快。

### 我的 IDE 不在列表里。怎么办？

任何接受 stdio MCP 服务器的 IDE 都能运行同一个服务器。从 VS Code 的 JSON 开始，把文件路径改成你的 IDE 期望的位置，并保持相同的命令与参数。

### 我可以同时运行多个预设吗？

不可以。一个服务器实例一次只解析一个预设。如果不同项目需要不同的插件集合，就在每个项目里放一个专用的 mcp-vertex.config.json，让 loader 按 workspace 分别解析。