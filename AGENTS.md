# AGENTS.md — working in `@mcp-vertex/core`

Canonical instructions for any agent or contributor working in this repo. This
project is a **project-agnostic MCP server core + plugin loader**; it builds
infrastructure for agents, so it holds itself to the same discipline it asks of
its consumers (this file is part of that dogfooding — see audit M26).

## What this repo is

A Bun monorepo:

- `packages/core` — the agnostic runtime: tool registry, plugin loader, bootstrap,
  scaffold, metrics, shared filesystem primitives (`withFileMutex`,
  `writeFileAtomic`, `quarantineCorruptFile`, `resolveWorkspaceContained`,
  `redactSecrets`). **No domain logic lives here.**
- `packages/client` — stdio client + service layer used by every host
  extension (dashboard, knowledge, search, health, connection-health,
  notification-logs bridge, logs).
- `packages/ui-extension` — host-agnostic UI shell (dashboard, panels,
  knowledge navigator, command palette, brand assets). Pure HTML/CSS/JS,
  no host imports. Consumed by every `extensions/<host>/`.
- `plugins/*` — opt-in capabilities (16 plugins shipped today: `proposals`,
  `memory`, `quality`, `rules`, `search`, `docs`, `deps`, `git`, `notification`,
  `audit`, `conventions`, `issues`, `logs`, `status-marker`, `test-convention`,
  `web-fetch` — see `plugins/` for the live list). Each owns its namespace.
- `extensions/vscode` — VS Code host implementation that consumes
  `@mcp-vertex/ui-extension` + `@mcp-vertex/client`. Produces the
  `.vsix`. **Only file under `extensions/` that may import `vscode`.**
- `apps/web` — Astro product/docs site, generated from the **live** tool registry.
- `examples/*` — adoption examples (minimal host, custom plugin, swarm).
- `scripts/*` — build, release, type/schema generation (pure planning split from
  side-effecting shells).

## Commands (the only ones you need)

| Task | Command |
|---|---|
| Full gate (typecheck + lint + tests) | `bun run validate` |
| Tests only | `bun run test` (`bun run test:coverage` for thresholds) |
| Build publishable `dist/` for all packages | `bun run build` |
| Regenerate the typed tool SDK | `bun run types:generate` |
| Regenerate the config JSON Schema | `bun run config:schema` |
| Build the docs site | `bun run site` (`site:strict` fails on undocumented tools) |
| Cut a release (CI does this on push to `main`) | `bun run release` |

**Definition of done for any change: `bun run validate` is green.** It must never
be left red on a working branch.

**Re-read discipline.** After editing a file inside a slice, do not re-read it
"just to be sure". Re-read only when one of these is true:

- `git status --porcelain -- <path>` shows it as modified after your last write
  (means someone else — user, parallel agent, hook — touched it).
- `mcp-vertex_overview` (compact) reports a relevant change since the last
  read.
- You explicitly need the new bytes (e.g. to compose the next edit).

Between reads inside the same slice, trust the working tree. This is what
keeps `git diff` out of the hot path.

## Hard rules

1. **The core stays agnostic.** Never import a plugin from `packages/core`, never
   put a host/project vocabulary (role enums, model names, folder names) into the
   core. Plugins receive everything resolved through `IMcpPluginContext`.
2. **No `process.cwd()` in engines.** Paths come from `ctx.workspace` / `corePaths`
   / injected options. Tests inject readers; engines are pure over their inputs.
3. **Async I/O only in hot paths.** No `*Sync` filesystem calls inside tool
   handlers or engines. The "boot-time one-shots" exception is narrow: a
   sync read is acceptable when the call site runs **at most a handful of
   times per process lifetime** (CLI arg parse, config-file load at
   boot, `/proc/version` probe for WSL detection). Any code on a per-call
   path — `onToolCall`, `isAgentStuck`, request middleware, every tool
   handler — must use `await readFile` (or a `withFileMutex`-guarded
   read). For sync interfaces (e.g. `IMcpVertexHostConfig.isAgentStuck`)
   that cannot be widened without rippling the core contract, use a
   short-TTL in-memory cache populated by the async read path (see
   `AgentLoopDetectorService.lockCache` for the canonical example).
4. **Durable writes go through the primitives.** Persisted state uses
   `withFileMutex` + `writeFileAtomic`; corrupt ≠ empty (`quarantineCorruptFile`).
5. **Workspace-scoped path inputs must be contained.** Use
   `resolveWorkspaceContained` for any `roots`/`manifest`/path option (no `..`
   escape, no absolute paths).
6. **Secrets never get persisted.** Durable stores (memory, proposals) run user
   text through `redactSecrets` before writing.
7. **Token budget is a protected invariant.** `overview` (compact) + `auto_work`
   stay under their measured budgets; the e2e budget test guards regressions.
8. **Every public tool declares an `outputSchema`.** Open `catchall` schemas are a
   documented exception, not a default.
9. **i18n is complete or it doesn't ship.** Any web copy change must add ALL
   languages; `apps/web/scripts/check-i18n.ts` fails the build otherwise.
10. **`tools/` and `scripts/` are TypeScript-exclusive.** No `.py`, `.sh`,
    `.bash`, `.zsh`, `.pl`, `.rb`, `.pyc` inside them. The gate is
    `bun run lint:tools` (self-hosted at
    `tools/scripts/lint/no-shell-python.script.ts`); it walks the tree, matches
    by extension, and exits 1 with a per-violation report when any forbidden
    file is found. Entrypoints carry the suffix `*.script.ts` and are invoked
    as `bun tools/scripts/<area>/<name>.script.ts`. Pure modules imported by
    them live in the same area without the suffix. Plugins that legitimately
    need a non-TS utility (e.g. a future `python-lint` plugin) declare the
    exception in their plugin README and add the plugin name to the gate's
    allowlist.

## Conventions

- **Conventional Commits.** Versioning is derived from commit type on push to
  `main` (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major).
  No manual version bumps; no commit-back loop.
- **Swarm proposals workflow.** If a proposals task needs more than 3 tool
  calls, touches multiple files, or requires repeated MCP reads, delegate it
  instead of keeping it on the main thread. With 2+ agents in the same repo,
  each agent uses its own `agent_worktree` **only when the host has enabled
  `agentWorktree`/`--agent-worktree`** (default off; the tool returns a
  structured `ok: false` error when disabled), otherwise commit to the active
  branch; on claim conflict, wait for
  `lock-released` or `await_lock` instead of polling; `proposals_sync_proposals`
  runs only after the last open slice of that proposal is closed.
- **`auto_work` ↔ loop detector ↔ idle-streak (a00033 S3, H1).** Three pieces of
  plumbing converge on the same "is the orchestrator stuck?" question, and the
  contract is:
  - **In-tool brake** for `auto_work` no-args calls: the `consecutiveIdle`
    streak at `plugins/proposals/src/lib/tools/auto-work.tool.ts:75-77`. After
    3 consecutive idle returns, `auto_work` returns `stop: true` with the
    explicit recovery hint "STOP — auto_work has returned idle N× in a row.
    Do NOT call auto_work again until new work exists; enqueue/create a
    proposal (or wait for a lock-released notification) first."
  - **Loop detector** for actual loops (same `agent_lock claim` retried,
    same `sync_proposals` retried, etc.). The detector is wired into
    `auto_work` but **disabled by default for `proposals_auto_work`** (see
    `DEFAULT_LOOP_DETECTOR_DISABLE_FOR`) — calling `auto_work` three times
    in a row is NOT a loop; it's the orchestrator polling for work. Hosts
    that want the old behaviour can opt back in with
    `loopDetectorDisableFor: []`.
  - **Recovery from `stop: true`**: call `proposals_continue_proposal
    { mode: "auto" }` directly (or read the proposal cascade yourself with
    `proposals_compact_status`). Do NOT re-call `auto_work` until you have
    made progress (a slice closed, a lock released, a file edited). The
    detector is a safety net, not a workflow gate.
- **One barrel per package** (`src/public/index.ts`); internals live in `src/lib`.
- **Interfaces are `I`-prefixed**; match the surrounding file's idiom.
- **Tests** colocate as `*.spec.ts`; protocol behaviour gets an e2e with a real
  in-memory MCP server.
- **Audits File Naming**: Every audit must follow the exact name structure:
  `{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md`
  where:
  - `numAuditoria` is the chronological identifier (e.g., `a021`).
  - `DD`, `MM`, `YYYY` is the day, month, and 4-digit year (e.g., `21-06-2026`).
  - `controladorModelo` is the runner/client (e.g., `antigravity`, `claude-code`, `codex`, `copilot`).
  - `modelo` is the AI model (e.g., `deepmind`, `gpt-5-5`, `opus-4-8`).
  - `queSeHaAuditado` describes the audited scope (e.g., `repositorio`, `plugins`, `apps`, `web`, `extensionvscode`).
- **Audit Proposal Lifecycle**:
  - An audit is modeled as a proposal.
  - If the audit has pending tasks or slices to be executed within its own scope, the proposal must be created under `docs/mcp-vertex/proposals/ready/` with `status: ready` and all slices set to `pending`.
  - If the audit has no internal tasks (e.g. all findings are deferred to separate proposals), the audit is created directly under `docs/mcp-vertex/proposals/done/audits/` with `status: done` and must reference the deferred proposals.

## Repo root layout (keep it ordered — f00054)

The root is intentionally minimal. Before adding a file to it, check this:

- **Caches/build artefacts never clutter the root.** All caches live under
  `.cache/<tool>/` (our own state is `.cache/mcp-vertex/`; vitest coverage is
  `.cache/coverage/`). Build *outputs* go to `build/` (gitignored). Tool-owned
  dirs we cannot relocate (Astro's `.astro/`) stay gitignored — do not commit
  them, do not add more. The local plugin verification probe writes under
  `.cache/mcp-vertex/verify/`.
- **Relocatable tool configs live in `configs/`.** A tool config moves to
  `configs/` only if (a) the tool accepts an explicit config path AND (b) the
  VS Code editor integration is unaffected. Today that is `configs/typedoc.json`
  (CLI-only, no editor extension; `docs:api` passes `--options configs/typedoc.json`).
  When a config moves, its internal relative paths are rewritten relative to
  `configs/` (e.g. `../tsconfig.json`).
- **Config files that STAY at root are the ones their tool/editor auto-discovers
  there** — the standard, expected JS/TS monorepo layout, not clutter:
  `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`, `tsconfig*.json`,
  `biome.json`, `vitest.config.ts`/`vitest.shared.ts`, `stylelint.config.mjs`,
  `lefthook.yml`, `mcp-vertex.config.json`. Moving any of these breaks in-editor
  types/lint/format or the git hooks, so they stay. Agent/IDE configs
  (`.mcp.json`, `.aider.conf.yml`, `.cursorrules`, `.claude/`, …) also stay —
  each agent discovers its config at root.
- **Community-health docs live in `.github/`** (`CONTRIBUTING.md`,
  `SECURITY.md`) — GitHub discovers them there. `README.md`, `LICENSE`,
  `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md` stay at root by convention/agent
  discovery.
- A new root file must justify itself against the above; otherwise it belongs
  in `.github/`, `docs/`, `tools/`, or under `.cache/`.

## When you touch a plugin / add a tool

- Add/keep its `outputSchema`; run `bun run types:generate` if the surface changed.
- Update the plugin README and, if user-visible on the site, add the translation
  keys for **every** language in `apps/web/src/i18n/ui.ts`.
- New persisted state → mutex + atomic write + a corruption test.

See `skills/` for task-specific playbooks (plugin authoring, failure modes) and
`docs/mcp-vertex/proposals/done/audits/` for the living master audit (the roadmap).

## When you run an audit

**Always read `skills/mcp-vertex-audit-playbook/SKILL.md` first.** Audits in this repo are not
shell-only exercises — the LLM must read the actual source code exhaustively (every
plugin, every engine, every extension, tools, scripts, test specs, skills) and produce
findings backed by real file references and code snippets. Automated commands (`bun run
validate`, `biome ci`) provide the quantitative baseline in Phase 0; the qualitative
analysis in Phases 1–8 is what makes an audit valuable. An audit that skips those phases
produces nothing actionable and will be rejected.
