---
title: Install & run
description: Install mcp-vertex, wire it into your IDE, choose a preset, and verify the server before you start working.
order: 1
navLabel: Install
---

# Install & run

Add mcp-vertex to your workflow, point your MCP client at the binary, and verify the resolved plugin set before the first session.

## Pick your package manager

Every package manager below runs the same published package. Choose the one your team already uses and keep the commands exactly as shown.

### npm

Node Package Manager ships with Node.js, so it is the safest universal default when you need the broadest compatibility across machines and CI runners.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm is fast, disk-efficient, and strict about dependency resolution, which makes it a strong fit for monorepos or teams that already standardize on pnpm.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn remains a familiar alternative in many JavaScript codebases, so this path works well when your project tooling and developer muscle memory already revolve around Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bundles the runtime and the package manager in one tool, and mcp-vertex itself is built with bun, so this is the most direct path when bun is already available on the machine.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno can execute the npm package directly, which is useful when you prefer a secure-by-default runtime with first-class TypeScript support and npm compatibility.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Pick your IDE

The snippets below use the default standard preset over bun. Paste the JSON into the target file as-is, then let your IDE register the stdio server.

### VS Code

File: .vscode/mcp.json
Scope: project

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

File: .cursor/mcp.json or ~/.cursor/mcp.json
Scope: project / global

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

File: ~/.codeium/windsurf/mcp_config.json
Scope: global

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

File: .mcp.json or via claude mcp add
Scope: project

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

File: claude_desktop_config.json
Scope: global

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

File: ~/.gemini/antigravity-ide/mcp_config.json
Scope: global

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

File: settings.json
Scope: global

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

## Pick a preset

Presets are additive. Start small, then widen the plugin set only when your workflow actually needs the extra surface.

### minimal

Recommended use: read-only orientation and CI smoke tests.
Size: 2 plugins.

- git
- search

### standard

Recommended use: single-agent work with memory, docs, lint, type, and dependency help.
Size: 7 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Recommended use: multi-agent coordination with locks, notifications, logs, and close markers. Audit stays opt-in and should be loaded separately when a round finishes.
Size: 13 plugins.

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

Recommended use: the swarm preset plus host-only integrations such as web-fetch and issues, when the host exposes them.
Size: 15 plugins.

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

## Verify

After the config lands, run a self-check with the same package manager you used for install. Replace `bunx` with `npx`, `pnpm dlx`, `yarn dlx`, or `deno run -A npm:` if that is your chosen path.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Use `--exclude-plugins=` when you want to subtract one plugin from a preset without forking the preset, for example to keep a swarm baseline but drop notifications in a single-agent session.

## FAQ

### Why is `deno run -A npm:@mcp-vertex/core` slow to start?

Deno resolves and verifies the npm package on first use. Later runs reuse the cache under `~/.cache/deno`, but for repeated local launches bun or npx still start faster.

### My IDE is not listed. What now?

Any IDE that accepts a stdio MCP server can run the same server. Start from the VS Code JSON, switch the file path to whatever your IDE expects, and keep the same command plus args.

### Can I run multiple presets at once?

No. One server instance resolves one preset at a time. If different projects need different plugin sets, place a dedicated mcp-vertex.config.json in each project and let the loader resolve it per workspace.