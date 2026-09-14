<div align="center">

<img src="apps/shared/brand/logo.svg" alt="DelendAI" width="112" height="112">

# DelendAI

**A project-agnostic core for building MCP servers, and the plugin loader that feeds them.**

*AI delenda est* — AI dismantled into named tools, a hermetic runtime,
public errors and private data.

[![License](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](./LICENSE)
[![npm org](https://img.shields.io/badge/npm-%40delendai-cb3837.svg)](https://www.npmjs.com/org/delendai)
[![Bun](https://img.shields.io/badge/runtime-bun-000000.svg)](https://bun.sh)

</div>

---

## What this is

An MCP server you point at a project, and a loader that gives it exactly the
capabilities that project needs — no more, so the model's context is not spent
on tools nobody will call.

- **Agnostic.** Nothing here knows your stack. Capabilities arrive as plugins;
  the core only knows how to load, isolate and describe them.
- **Cheap by default.** Presets and lazy loading decide what reaches the model.
  A tool that is not published costs nothing to ignore.
- **Hermetic.** Plugins read through a contained reader, write atomically, and
  declare the effects they are allowed to have. What leaves the machine is a
  decision, never an accident.

It is dogfooded: this repository is developed by agents using the server it
builds.

## Quickstart

```bash
# 1. Add the server to your MCP client (VS Code / Cursor / Antigravity)
#    .vscode/mcp.json
{
  "servers": {
    "delendai": {
      "command": "bunx",
      "args": ["--package", "@delendai/cli", "delendai", "__serve",
               "--workspace", "${workspaceFolder}", "--preset", "standard"]
    }
  }
}
```

```bash
# 2. Or drive it from the terminal, no client involved
bunx --package @delendai/cli delendai overview
```

Claude Code reads `~/.claude.json` and Codex reads `~/.codex/config.toml`; the
launch arguments are identical in all of them — only the wrapping changes.
[Every client's exact snippet →](./docs/delendai/README-DELENDAI.md#install--register)

### Choosing what gets loaded

`--preset` picks a curated set; `delendai.config.json` overrides it per project.

| Preset | For |
| --- | --- |
| `minimal` | The built-ins and little else. |
| `lean` · `standard` | Everyday work, growing surface. |
| `swarm` | Several agents on one repository: proposals, locks, coordination. |
| `full` · `dogfood` | Everything, including host-only plugins. |
| `web-app` · `backend-api` · `cli-tool` | Stack packs — a tuned set per project shape. |

[Presets, plugin options and precedence →](./docs/delendai/README-DELENDAI.md#passing-values-to-plugins--delendaiconfigjson)

## Documentation

**Start here**

| | |
| --- | --- |
| [Using DelendAI](./docs/delendai/README-DELENDAI.md) | Install, register, CLI arguments, built-in tools, configuration. |
| [Writing a plugin](./docs/delendai/PLUGINS-DELENDAI.md) | The plugin contract, tools, permissions, scaffolding. |
| [Architecture](./docs/delendai/ARCHITECTURE.md) | Layers, contracts, request flow, the invariants — with diagrams. |

**Going deeper**

| | |
| --- | --- |
| [Vision and operating model](./docs/delendai/VISION-AND-OPERATING-MODEL.md) | North star, the growth rule, the two speeds, the dogfooding loop. |
| [Configuration Center](./docs/delendai/CONFIGURATION-CENTER.md) | Every setting the runtime reads, and where it comes from. |
| [CI gates](./docs/delendai/CI-GATES.md) | What each gate asserts and why it exists. |
| [Publishing](./docs/delendai/NPM_PUBLISH.md) | How a release is cut. It is asked for, never automatic. |
| [Brand](./docs/delendai/BRAND.md) | `delendai` for tools, `DelendAI` for prose — and the *AI delenda est* origin. |

**Contributing**

| | |
| --- | --- |
| [CONTRIBUTING](./.github/CONTRIBUTING.md) | How to propose and land a change. |
| [AGENTS](./AGENTS.md) | The rules agents follow in this repository. |
| [SECURITY](./.github/SECURITY.md) | How to report a vulnerability. |
| [PRIVACY](./docs/PRIVACY.md) | What is collected, what never leaves, and the attribution policy. |

## Layout

The monorepo keeps the reusable runtime in `packages/core`, ships first-party
capabilities as plugins under `plugins/*`, and uses apps, extensions, tools and
docs as the delivery and verification surfaces around that core.

> The table below is generated from the live first-party registry, the workspace
> `package.json` files, and the migrated manifests where they exist; do not edit
> it by hand.

<!-- BEGIN GENERATED: plugin-layout-table -->
| Path                           | Package                          | What                                                                                                                                |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/adaptive-optimizer`   | `@delendai/adaptive-optimizer`   | Adaptive optimizer: cheaply rank model, plugin-set and prompt candidates with explicit budget and consent guards.                   |
| `plugins/api`                  | `@delendai/api`                  | REST/GraphQL API surface for delendai plugins.                                                                                      |
| `plugins/audit`                | `@delendai/audit`                | Multi-model audit planning + consolidation; f00139 adds self_audit dogfood loop.                                                    |
| `plugins/auto-agent-selector`  | `@delendai/auto-agent-selector`  | Zero-config multi-agent routing (cost↔quality dial, auto_recommend, escalation).                                                    |
| `plugins/auto-plugin-selector` | `@delendai/auto-plugin-selector` | Recommends the best plugin set for this project from its signals (manifest, files, git, task).                                      |
| `plugins/browser`              | `@delendai/browser`              | Headless browser automation tools.                                                                                                  |
| `plugins/cache`                | `@delendai/cache`                | Cache-eviction rules and lifecycle for plugin scratch dirs.                                                                         |
| `plugins/changelog`            | `@delendai/changelog`            | Conventional-commits changelog + release plan generator.                                                                            |
| `plugins/completion`           | `@delendai/completion`           | Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.                   |
| `plugins/container`            | `@delendai/container`            | Container inspection + lint (docker ps/images, k8s, Dockerfile rules).                                                              |
| `plugins/context-for-change`   | `@delendai/context-for-change`   | Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.                               |
| `plugins/conventions`          | `@delendai/conventions`          | Repo file-convention enforcement (interface, constant, service, tool …).                                                            |
| `plugins/database`             | `@delendai/database`             | Database schema/introspection tools (read-only, offline).                                                                           |
| `plugins/deps`                 | `@delendai/deps`                 | Dependency inventory + offline health (deps_list, deps_check, deps_audit, deps_licenses, deps_tree).                                |
| `plugins/diagram`              | `@delendai/diagram`              | Diagram generator (mermaid, dot) from code structure.                                                                               |
| `plugins/docs`                 | `@delendai/docs`                 | Doc generation, search, and rendered catalog.                                                                                       |
| `plugins/env`                  | `@delendai/env`                  | Environment config validation (.env check + schema + env_explains).                                                                 |
| `plugins/error-reporting`      | `@delendai/error-reporting`      | Automatic delendai error reporting: opens de-duplicated GitHub issues for internal failures (enabled by default).                   |
| `plugins/external-mcps`        | `@delendai/external-mcps`        | Compose third-party MCP servers through the catalog + human ack.                                                                    |
| `plugins/forge`                | `@delendai/forge`                | Forge (GitHub/GitLab) wrappers — PRs, CI, issues.                                                                                   |
| `plugins/git`                  | `@delendai/git`                  | Git wrappers (PR list/view, diff, changelog, extended).                                                                             |
| `plugins/i18n`                 | `@delendai/i18n`                 | i18n key/interpolation validation across locale JSON files.                                                                         |
| `plugins/impact-analysis`      | `@delendai/impact-analysis`      | Bounded impact analysis and test selection across changed symbols, dependents and related specs.                                    |
| `plugins/issues`               | `@delendai/issues`               | Issue tracker adapters.                                                                                                             |
| `plugins/link-check`           | `@delendai/link-check`           | Markdown link checker.                                                                                                              |
| `plugins/logs`                 | `@delendai/logs`                 | Structured logs reader (tail, query, redact).                                                                                       |
| `plugins/memory`               | `@delendai/memory`               | Persistent memory store (BM25 + recall, save, search).                                                                              |
| `plugins/notification`         | `@delendai/notification`         | Notification + lock-await primitives.                                                                                               |
| `plugins/observability`        | `@delendai/observability`        | Observability surface (metrics, errors, telemetry).                                                                                 |
| `plugins/orchestrator-runner`  | `@delendai/orchestrator-runner`  | Orchestrator-runner runtime utilities.                                                                                              |
| `plugins/perf`                 | `@delendai/perf`                 | Performance bench/bundle/profile tools.                                                                                             |
| `plugins/project-health`       | `@delendai/project-health`       | Compact project-health aggregator: cheap summary first, lazy domain details on demand.                                              |
| `plugins/prompt-eval`          | `@delendai/prompt-eval`          | Prompt-eval harness (golden prompts, scoring).                                                                                      |
| `plugins/prompts-pack`         | `@delendai/prompts-pack`         | Project-aware MCP prompts (explain-this-code, write-tests-for, review-this-diff, etc.).                                             |
| `plugins/proposals`            | `@delendai/proposals`            | Proposals workflow + multi-agent (swarm) orchestration.                                                                             |
| `plugins/quality`              | `@delendai/quality`              | Quality gates: coverage, complexity, lint, type-check orchestration.                                                                |
| `plugins/quality-policy`       | `@delendai/quality-policy`       | Unified quality-policy surface: cheap tests, conventions, lint, types and coverage guidance without running heavy quality commands. |
| `plugins/refactor`             | `@delendai/refactor`             | Refactor primitives (symbols, definition, references, rename, codemod).                                                             |
| `plugins/rules`                | `@delendai/rules`                | Lint/type rules engine (frameworks, dogmas, presets).                                                                               |
| `plugins/search`               | `@delendai/search`               | Code search (semantic + symbol + references).                                                                                       |
| `plugins/security`             | `@delendai/security`             | Security audit (CVEs, SAST, secrets, env).                                                                                          |
| `plugins/skills-pack`          | `@delendai/skills-pack`          | Curated skill pack (debugging, perf, pr-review, security, incident, migration).                                                     |
| `plugins/status-marker`        | `@delendai/status-marker`        | Status marker + closure canonical line.                                                                                             |
| `plugins/tech-debt`            | `@delendai/tech-debt`            | Tech-debt scanner (TODO/FIXME/HACK inventory).                                                                                      |
| `plugins/test-convention`      | `@delendai/test-convention`      | Test-file convention enforcement (spec path, mock style, forbidden patterns).                                                       |
| `plugins/test-policy`          | `@delendai/test-policy`          | Test policy mode (TDD, tests-after, free, none).                                                                                    |
| `plugins/usage-tracking`       | `@delendai/usage-tracking`       | Per-token/per-call usage tracking (spend, budget).                                                                                  |
| `plugins/web-fetch`            | `@delendai/web-fetch`            | Web fetch (allow-listed URLs only).                                                                                                 |
<!-- END GENERATED: plugin-layout-table -->
## Typed tool outputs

Every tool that declares a Zod `outputSchema` ships a generated TypeScript type
for its `structuredContent`, so MCP clients consume responses type-safely:

```ts
import type { GitToolOutputs } from '@delendai/git/public';

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
bun run validate    # typecheck + every gate + the full suite
bun run test        # the suite alone
bun run cli -- overview --json
```

The checked-in `.vscode/mcp.json` is this repository's **canonical launch
shape**, and the quickest parity check is to ask the server what it loaded:

```bash
bun run cli -- overview --json   # pluginDiagnostic.loaded == requested - missing
```

[The full development loop, gates and conventions →](./.github/CONTRIBUTING.md)

---

<div align="center">

BSD-3-Clause © Cartago

</div>
