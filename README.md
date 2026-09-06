# delendai monorepo

Project-agnostic core for building MCP servers + a CLI plugin loader, by
[@delendai](https://www.npmjs.com/org/delendai).

> Named **DelendAI** — *AI delenda est*. AI dismantled into named tools, a
> hermetic runtime, public errors and private data. The brand contract
> (when to write `delendai` vs `DelendAI`) lives in
> **[BRAND.md](./docs/delendai/BRAND.md)**.

- **[README-DELENDAI.md](./docs/delendai/README-DELENDAI.md)** — what it is, how to use it,
  CLI arguments, built-in tools, the hybrid bootstrap flow.
- **[PLUGINS-DELENDAI.md](./docs/delendai/PLUGINS-DELENDAI.md)** — how to create plugins.
- **[BRAND.md](./docs/delendai/BRAND.md)** — the brand contract (`delendai` for tools, `DelendAI`
  for prose) and the *AI delenda est* origin.
- **[ARCHITECTURE.md](./docs/delendai/ARCHITECTURE.md)** — layers, contracts, request flow,
  invariants (with a diagram).
- **[VISION-AND-OPERATING-MODEL.md](./docs/delendai/VISION-AND-OPERATING-MODEL.md)** — north star,
  growth rule, two speeds, dogfooding loop, privacy motto.
- **[CONTRIBUTING.md](./.github/CONTRIBUTING.md)** · **[SECURITY.md](./.github/SECURITY.md)** ·
  **[AGENTS.md](./AGENTS.md)** · **[PRIVACY.md](./docs/PRIVACY.md)** — how to contribute, report
  vulnerabilities, the rules agents follow, and the attribution policy (no LLM
  brands on the public GitHub surface).

## Layout

The monorepo keeps the reusable runtime in `packages/core`, ships first-party capabilities as plugins under `plugins/*`, and uses apps/extensions/tools/docs as delivery and verification surfaces around that core.

> The table below is generated from the live first-party registry, the workspace `package.json` files, and the migrated manifests where they exist; do not edit it by hand.

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

## Typed tool outputs (SDK)

Every tool that declares a Zod `outputSchema` ships a generated TypeScript type
for its `structuredContent`, so MCP clients can consume responses type-safely:

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

## Local MCP Host

The checked-in `.vscode/mcp.json` is the **canonical launch shape** for this
repo. GitHub Copilot, Cursor, and Antigravity all read it from the workspace
root; Claude Code and Codex read equivalents from `~/.claude.json` and
`~/.codex/config.toml` respectively, but wrap the **same** launch arguments.

| Client                   | Config file            | Loaded by                                |
| ------------------------ | ---------------------- | ---------------------------------------- |
| GitHub Copilot (VS Code) | `.vscode/mcp.json`     | workspace root                           |
| Cursor                   | `.vscode/mcp.json`     | workspace root (reuses the VS Code file) |
| Antigravity              | `.vscode/mcp.json`     | workspace root (reuses the VS Code file) |
| Claude Code              | `~/.claude.json`       | user home (`mcpServers.<name>`)          |
| Codex                    | `~/.codex/config.toml` | user home (`[mcp_servers.<name>]`)       |

The canonical launch is `bunx --package @delendai/cli delendai __serve`
with `--workspace` and optional preset/plugin flags. Repository-only work may
still pass `--delendai-root` to `delendai init` for an explicit local checkout.
The host uses the same
loader as the CLI, so plugins declared in `delendai.config.json` are
loaded automatically in addition to the preset unless excluded with
`--exclude-plugins`. See [`docs/delendai/README-DELENDAI.md`](./docs/delendai/README-DELENDAI.md)
for the full snippet per client and the plugin-resolution precedence.

```bash
bun install
bun run validate         # typecheck + tests (incl. the type-SDK drift guard)
bun run types:generate   # regenerate the typed tool-output SDK

# Quick parity check from the terminal — confirms mcp.json vs config.json match:
bun run cli -- overview --json   # pluginDiagnostic.loaded == requested - missing
```

BSD-3-Clause © Cartago
