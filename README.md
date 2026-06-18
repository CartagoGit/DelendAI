# mcp-core monorepo

Project-agnostic core for building MCP servers + a CLI plugin loader, by
[@cartago-git](https://www.npmjs.com/org/cartago-git).

- **[README-MCP-CORE.md](./docs/README-MCP-CORE.md)** — what it is, how to use it,
  CLI arguments, built-in tools, the hybrid bootstrap flow.
- **[PLUGINS-MCP-CORE.md](./docs/PLUGINS-MCP-CORE.md)** — how to create plugins.
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — layers, contracts, request flow,
  invariants (with a diagram).
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** · **[SECURITY.md](./SECURITY.md)** ·
  **[AGENTS.md](./AGENTS.md)** — how to contribute, report vulnerabilities, and the
  rules agents follow.

## Layout

| Path | Package | What |
|---|---|---|
| `packages/core` | `@mcp-vertex/core` | The agnostic core + `mcp-core` CLI. |
| `plugins/proposals` | `@mcp-vertex/proposals` | Proposal store + agent locks + task queue (swarm coordination). |
| `plugins/rules` | `@mcp-vertex/rules` | Per-framework ESLint/TS presets + per-area detection + enforcement modes (project config wins). |
| `plugins/memory` | `@mcp-vertex/memory` | Persistent project notes (save/recall/list/forget) for cross-session continuity. |
| `plugins/git` | `@mcp-vertex/git` | Read-only git orientation: status, changed files, diff stat, log. |
| `plugins/quality` | `@mcp-vertex/quality` | Quality-gate runner: executes lint/test/build per scope, structured pass/fail. |
| `plugins/search` | `@mcp-vertex/search` | Grep-like, low-token textual `search` over allow-listed workspace files. |
| `plugins/notification` | `@mcp-vertex/notification` | Watches the shared lock file and pushes an MCP `notifications/message` on release, so agents stop polling. |
| `plugins/docs` | `@mcp-vertex/docs` | Catalogue + read the repo markdown (`docs_list` / `docs_read`), anti-traversal. |
| `plugins/deps` | `@mcp-vertex/deps` | Dependency inventory + offline health (`deps_list` / `deps_check`); no network. |

## Typed tool outputs (SDK)

Every tool that declares a Zod `outputSchema` ships a generated TypeScript type
for its `structuredContent`, so MCP clients can consume responses type-safely:

```ts
import type { GitToolOutputs } from '@mcp-vertex/git/public';

const status: GitToolOutputs['git_status'] = result.structuredContent;
```

Each package exposes a `<Pkg>ToolOutputs` map (MCP tool name → output type) from
its public surface. The types are generated from the live schemas — never edited
by hand — and a drift guard in the test suite fails if they go stale:

```bash
bun run types:generate   # regenerate src/generated/tool-outputs.ts per package
```

## Develop

```bash
bun install
bun run validate         # typecheck + tests (incl. the type-SDK drift guard)
bun run types:generate   # regenerate the typed tool-output SDK
```

BSD-3-Clause © Cartago
