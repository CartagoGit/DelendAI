# mcp-vertex monorepo

Project-agnostic core for building MCP servers + a CLI plugin loader, by
[@mcp-vertex](https://www.npmjs.com/org/mcp-vertex).

- **[README-MCP-VERTEX.md](./docs/mcp-vertex/README-MCP-VERTEX.md)** — what it is, how to use it,
  CLI arguments, built-in tools, the hybrid bootstrap flow.
- **[PLUGINS-MCP-VERTEX.md](./docs/mcp-vertex/PLUGINS-MCP-VERTEX.md)** — how to create plugins.
- **[ARCHITECTURE.md](./docs/mcp-vertex/ARCHITECTURE.md)** — layers, contracts, request flow,
  invariants (with a diagram).
- **[VISION-AND-OPERATING-MODEL.md](./docs/mcp-vertex/VISION-AND-OPERATING-MODEL.md)** — north star,
  growth rule, two speeds, dogfooding loop, privacy motto.
- **[CONTRIBUTING.md](./.github/CONTRIBUTING.md)** · **[SECURITY.md](./.github/SECURITY.md)** ·
  **[AGENTS.md](./AGENTS.md)** · **[PRIVACY.md](./docs/PRIVACY.md)** — how to contribute, report
  vulnerabilities, the rules agents follow, and the attribution policy (no LLM
  brands on the public GitHub surface).

## Layout

The monorepo keeps the reusable runtime in `packages/core`, ships first-party capabilities as plugins under `plugins/*`, and uses apps/extensions/tools/docs as delivery and verification surfaces around that core.

> La tabla de abajo se genera desde los datos vivos del registro first-party, los `package.json` del workspace y los manifests migrados cuando existen; no la edites a mano.

<!-- BEGIN GENERATED: plugin-layout-table -->
| Path | Package | What |
| --- | --- | --- |
| `plugins/adaptive-optimizer` | `@mcp-vertex/adaptive-optimizer` | Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards. |
| `plugins/api` | `@mcp-vertex/api` | REST/GraphQL API surface for mcp-vertex plugins. |
| `plugins/audit` | `@mcp-vertex/audit` | Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop. |
| `plugins/auto-agent-selector` | `@mcp-vertex/auto-agent-selector` | Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation). |
| `plugins/auto-plugin-selector` | `@mcp-vertex/auto-plugin-selector` | Recommends the best plugin set for this project from its signals (manifest, files, git, task). |
| `plugins/browser` | `@mcp-vertex/browser` | Headless browser automation tools. |
| `plugins/cache` | `@mcp-vertex/cache` | Cache-eviction rules and lifecycle for plugin scratch dirs. |
| `plugins/changelog` | `@mcp-vertex/changelog` | Conventional-commits changelog + release plan generator. |
| `plugins/completion` | `@mcp-vertex/completion` | Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification. |
| `plugins/container` | `@mcp-vertex/container` | Container inspection + lint (docker ps/images, k8s, Dockerfile rules). |
| `plugins/context-for-change` | `@mcp-vertex/context-for-change` | Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions. |
| `plugins/conventions` | `@mcp-vertex/conventions` | Repo file-convention enforcement (interface, constant, service, tool …). |
| `plugins/database` | `@mcp-vertex/database` | Database schema/introspection tools (read-only, offline). |
| `plugins/deps` | `@mcp-vertex/deps` | Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree). |
| `plugins/diagram` | `@mcp-vertex/diagram` | Diagram generator (mermaid, dot) from code structure. |
| `plugins/docs` | `@mcp-vertex/docs` | Doc generation, search, and rendered catalog. |
| `plugins/env` | `@mcp-vertex/env` | Environment config validation (.env check + schema + env_explains). |
| `plugins/error-reporting` | `@mcp-vertex/error-reporting` | Automatic mcp-vertex error reporting: opens de-duplicated GitHub issues for internal failures (enabled by default). |
| `plugins/external-mcps` | `@mcp-vertex/external-mcps` | Compose third-party MCP servers through the catalog + human ack. |
| `plugins/forge` | `@mcp-vertex/forge` | Forge (GitHub/GitLab) wrappers — PRs, CI, issues. |
| `plugins/git` | `@mcp-vertex/git` | Git wrappers (PR list/view, diff, changelog, extended). |
| `plugins/i18n` | `@mcp-vertex/i18n` | i18n key/interpolation validation across locale JSON files. |
| `plugins/impact-analysis` | `@mcp-vertex/impact-analysis` | Bounded impact analysis and test selection across changed symbols, dependents and related specs. |
| `plugins/issues` | `@mcp-vertex/issues` | Issue tracker adapters. |
| `plugins/link-check` | `@mcp-vertex/link-check` | Markdown link checker. |
| `plugins/logs` | `@mcp-vertex/logs` | Structured logs reader (tail, query, redact). |
| `plugins/memory` | `@mcp-vertex/memory` | Persistent memory store (BM25 + recall, save, search). |
| `plugins/notification` | `@mcp-vertex/notification` | Notification + lock-await primitives. |
| `plugins/observability` | `@mcp-vertex/observability` | Observability surface (metrics, errors, telemetry). |
| `plugins/orchestrator-runner` | `@mcp-vertex/orchestrator-runner` | Orchestrator-runner runtime utilities. |
| `plugins/perf` | `@mcp-vertex/perf` | Performance bench/bundle/profile tools. |
| `plugins/project-health` | `@mcp-vertex/project-health` | Compact project-health aggregator: cheap summary first, lazy domain details on demand. |
| `plugins/prompt-eval` | `@mcp-vertex/prompt-eval` | Prompt-eval harness (golden prompts, scoring). |
| `plugins/prompts-pack` | `@mcp-vertex/prompts-pack` | Project-aware MCP prompts (explain-this-code, write-tests-for, review-this-diff, etc.). |
| `plugins/proposals` | `@mcp-vertex/proposals` | Proposals workflow + multi-agent (swarm) orchestration. |
| `plugins/quality` | `@mcp-vertex/quality` | Quality gates: coverage, complexity, lint, type-check orchestration. |
| `plugins/quality-policy` | `@mcp-vertex/quality-policy` | Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands. |
| `plugins/refactor` | `@mcp-vertex/refactor` | Refactor primitives (symbols, definition, references, rename, codemod). |
| `plugins/rules` | `@mcp-vertex/rules` | Lint/type rules engine (frameworks, dogmas, presets). |
| `plugins/search` | `@mcp-vertex/search` | Code search (semantic + symbol + references). |
| `plugins/security` | `@mcp-vertex/security` | Security audit (CVEs, SAST, secrets, env). |
| `plugins/skills-pack` | `@mcp-vertex/skills-pack` | Curated skill pack (debugging, perf, pr-review, security, incident, migration). |
| `plugins/status-marker` | `@mcp-vertex/status-marker` | Status marker + closure canonical line. |
| `plugins/tech-debt` | `@mcp-vertex/tech-debt` | Tech-debt scanner (TODO/FIXME/HACK inventory). |
| `plugins/test-convention` | `@mcp-vertex/test-convention` | Test-file convention enforcement (spec path, mock style, forbidden patterns). |
| `plugins/test-policy` | `@mcp-vertex/test-policy` | Test policy mode (TDD, tests-after, free, none). |
| `plugins/usage-tracking` | `@mcp-vertex/usage-tracking` | Per-token/per-call usage tracking (spend, budget). |
| `plugins/web-fetch` | `@mcp-vertex/web-fetch` | Web fetch (allow-listed URLs only). |
<!-- END GENERATED: plugin-layout-table -->

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

## Local MCP Host

The checked-in `.vscode/mcp.json` is the **canonical launch shape** for this
repo. GitHub Copilot, Cursor, and Antigravity all read it from the workspace
root; Claude Code and Codex read equivalents from `~/.claude.json` and
`~/.codex/config.toml` respectively, but wrap the **same** launch arguments.

| Client | Config file | Loaded by |
|---|---|---|
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | workspace root |
| Cursor | `.vscode/mcp.json` | workspace root (reuses the VS Code file) |
| Antigravity | `.vscode/mcp.json` | workspace root (reuses the VS Code file) |
| Claude Code | `~/.claude.json` | user home (`mcpServers.<name>`) |
| Codex | `~/.codex/config.toml` | user home (`[mcp_servers.<name>]`) |

The canonical launch is `bunx --package @mcp-vertex/cli mcpv __serve`
with `--workspace` and optional preset/plugin flags. Repository-only work may
still pass `--mcp-vertex-root` to `mcpv init` for an explicit local checkout.
The host uses the same
loader as the CLI, so plugins declared in `mcp-vertex.config.json` are
loaded automatically in addition to the preset unless excluded with
`--exclude-plugins`. See [`docs/mcp-vertex/README-MCP-VERTEX.md`](./docs/mcp-vertex/README-MCP-VERTEX.md)
for the full snippet per client and the plugin-resolution precedence.

```bash
bun install
bun run validate         # typecheck + tests (incl. the type-SDK drift guard)
bun run types:generate   # regenerate the typed tool-output SDK

# Quick parity check from the terminal — confirms mcp.json vs config.json match:
bun run cli -- overview --json   # pluginDiagnostic.loaded == requested - missing
```

BSD-3-Clause © Cartago
