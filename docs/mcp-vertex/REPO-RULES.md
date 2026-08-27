# Repo-level rules — `@mcp-vertex/core`

> Read this **only** if the host you are running in reads a
> workspace-root `AGENTS.md` (see [`AGENT-BOOTSTRAP.md`](AGENT-BOOTSTRAP.md)
> §7). Hosts that don't read `AGENTS.md` never need this file — nothing
> in the universal bootstrap depends on it, so skip it and save the
> tokens. This is the canonical content for `@mcp-vertex/core` itself;
> downstream projects adapt it to their own monorepo shape.

## What this repo is

A Bun monorepo:

- `packages/core` — the agnostic runtime: tool registry, plugin loader,
  bootstrap, scaffold, metrics, shared filesystem primitives
  (`withFileMutex`, `writeFileAtomic`, `quarantineCorruptFile`,
  `resolveWorkspaceContained`, `redactSecrets`). **No domain logic lives
  here.**
- `packages/client` — stdio client + service layer used by every host
  extension.
- `packages/ui-extension` — host-agnostic UI shell.
- `plugins/*` — opt-in capabilities (one plugin per namespace). Each owns
  its own namespace, lifecycle, and durable state.
- `extensions/vscode` — VS Code host implementation. The only file under
  `extensions/` that may import `vscode`.
- `apps/web` — Astro product/docs site, generated from the **live** tool
  registry.
- `docs/mcp-vertex/examples/*` — adoption examples (minimal host, custom
  plugin, swarm).
- `scripts/*` — build, release, type/schema generation.
- `docs/mcp-vertex/agent-catalog.generated.json` — checked-in snapshot of
  the unified discovery surface (tools + skills + proposals). Hosts that
  need a stable route to this surface read it directly.

## Commands (the only ones you need)

| Task | Command |
|---|---|
| Full gate (typecheck + lint + tests) | `bun run validate` |
| Tests only | `bun run test` (`bun run test:coverage` for thresholds) |
| Build publishable `dist/` for all packages | `bun run build` |
| Regenerate the typed tool SDK | `bun run types:generate` |
| Regenerate the config JSON Schema | `bun run config:schema` |
| Build the docs site | `bun run site` (`site:strict` fails on undocumented tools) |
| Regenerate the agent-catalog artifact + host hints | `bun run catalog:generate` (check: `bun run catalog:check` + `bun run catalog:hints:check`) |
| Cut a release (CI does this on push to `main`) | `bun run release` |

## Repo-level hard rules

1. The core stays agnostic. Never import a plugin from `packages/core`,
   never put a host/project vocabulary (role enums, model names, folder
   names) into the core. Plugins receive everything resolved through
   `IMcpPluginContext`.
2. No `process.cwd()` in engines. Paths come from `ctx.workspace` /
   `corePaths` / injected options.
3. Async I/O only in hot paths. Sync filesystem calls are allowed only
   at boot (CLI arg parse, config-file load, WSL detection). Per-call
   paths must `await readFile`. For sync interfaces that cannot be
   widened without rippling the core contract, use a short-TTL in-memory
   cache populated by the async read path.
4. Durable writes go through the primitives. Persisted state uses
   `withFileMutex` + `writeFileAtomic`; corrupt ≠ empty
   (`quarantineCorruptFile`).
5. Workspace-scoped path inputs must be contained. Use
   `resolveWorkspaceContained` for any `roots`/`manifest`/path option.
6. Secrets never get persisted. Durable stores (memory, proposals) run
   user text through `redactSecrets` before writing.
7. Token budget is a protected invariant. `overview` (compact) +
   `auto_work` stay under their measured budgets.
8. Every public tool declares an `outputSchema`. `catchall` is
   documented, not default.
9. i18n is complete or it doesn't ship. Any web copy change must add
   ALL languages; `apps/web/scripts/check-i18n.ts` fails the build
   otherwise.
10. `tools/` and `scripts/` are TypeScript-exclusive. No
    `.py`/`.sh`/`.bash`/`.zsh`/`.pl`/`.rb`/`.pyc` inside them.
11. Host files point at this bootstrap, never enumerate content.
    `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, anything
    written for Cursor/Aider/Continue/etc. **include** this file by
    reference and add only the repo-/host-specific rules the server
    cannot enforce (see `AGENT-BOOTSTRAP.md` § 8).
12. Code quality defaults are non-negotiable. Apply SOLID, Clean Code,
    reusable patterns and general best practices by default — see the
    `AGENT-BOOTSTRAP.md` §6 invariant for the universal contract. In this
    repo that concretely means: small files with one responsibility each;
    interfaces named `IFoo` and exported as the single contract; pure
    validators returning a result type rather than throwing across
    boundaries; no ad-hoc inline `switch` or long `if-else` chains
    over plugin / tool / enum IDs (route through the existing
    registries instead); no duplicated cross-plugin logic; names that
    explain intent; no magic numbers; no swallowed errors; no dead
    code; `*.spec.ts` tests colocated next to the unit they cover;
    and any new shared helper lands in the appropriate public barrel
    (`src/public/index.ts`) rather than being copy-pasted across
    plugins. Only relax when the user explicitly asks for it in the
    request or when the project's own binding instructions force it —
    in which case state the exception in the response so it stays
    auditable.

## Repo-level conventions

- Conventional Commits. Versioning is derived from commit type on push
  to `main` (`fix:` → patch, `feat:` → minor, `feat!:` /
  `BREAKING CHANGE:` → major). No manual version bumps; no commit-back
  loop.
- Swarm proposals workflow. If a proposals task needs more than 3 tool
  calls, touches multiple files, or requires repeated MCP reads, delegate
  it instead of keeping it on the main thread. **Agents land on
  `develop` through a pull request; the operator does not have to.**
  `develop` is the branch this repo is programmed on and is deliberately
  NOT protected — the operator pushes to it directly. With
  `agentWorktree: false` in `mcp-vertex.config.json` (this repo's
  setting) agents never create `agent/*` worktrees or per-agent branches
  — they work on a `wip/*` branch off `develop`, commit there, push it,
  and open a PR the operator reviews and decides on. `main` is the
  protected branch: nothing lands there automatically. The operator may
  still create manual branches (`fix/*`, `feature/*`) alongside
  `wip/*`. When the gate is on and an
  agent works in a worktree, it must never `git switch` the shared
  checkout: the main checkout stays on `develop` and the worktree is
  merged + removed before its branch disappears. `branch_status` and
  `swarm_hygiene` report `mainCheckoutDrift` when the shared checkout
  was switched. On claim conflict, wait for `lock-released` or
  `await_lock` instead of polling; `proposals_sync_proposals` runs only
  after the last open slice of that proposal is closed.
- **No orphaned branches or stashes — always reconcile.** Before closing
  any work (or a session), run `bun run reclaim:orphans` (report) and
  reconcile every listed orphan: if a stranded branch or stash adds
  value, merge it into `develop` and fix discrepancies/bugs until it is
  100% functional (`git switch develop && git merge --no-ff <branch>` →
  validate → commit → `git branch -D <branch>`); if it adds no value,
  delete it as-is (`git branch -D <branch>` / `git stash drop <ref>`).
  `bun run reclaim:orphans --apply` deletes only the provably-lossless
  branches (`ahead === 0`); `needs-review` branches and stashes are
  never auto-deleted. This is a repo-level policy, not a plugin
  behaviour: mcp-vertex does not enforce it on other repos.
- `auto_work` ↔ loop detector ↔ idle-streak. Calling `auto_work` three
  times in a row is NOT a loop; it's the orchestrator polling for work.
  The detector is wired into `auto_work` but disabled by default for
  `proposals_auto_work`. Recovery from `stop: true`: call
  `proposals_continue_proposal { mode: "auto" }` directly (or read the
  cascade yourself with `proposals_compact_status`). Do NOT re-call
  `auto_work` until you have made progress.
- One barrel per package (`src/public/index.ts`); internals live in
  `src/lib`.
- Interfaces are `I`-prefixed; match the surrounding file's idiom.
- Tests colocate as `*.spec.ts`; protocol behaviour gets an e2e with a
  real in-memory MCP server.

## Tooling posture

- **Optional: relax `exactOptionalPropertyTypes` (c00123).** The
  workspace typecheck is wrapped by `tools/scripts/typecheck.script.ts`
  (since 2026-07-24). Default mode keeps
  `exactOptionalPropertyTypes: true` (strict; the post-2026-06
  baseline). To opt out — useful when an LLM keeps hitting the
  `Type 'string | undefined' is not assignable to type 'string'`
  cryptic error — set `MCP_VERTEX_RELAX_EXACT_OPTIONAL=1` before
  running `bun run typecheck`. The wrapper switches to
  `tsconfig.relax.json` (extends base, flips the flag off). Trade:
  this removes ~3-7% of LLM fix cycles (a00067 F3 / DC5) at zero
  runtime cost — the flag is a static check, not a runtime guard.
  The default stays ON; do not flip the flag in
  `tsconfig.base.json` directly.

## Proposal ID prefixes

| Prefix | Meaning | Notes |
|---|---|---|
| `f` | feat | New feature work (`kind: feat`). |
| `x` | fix | Bug fix work (`kind: fix`). |
| `r` | refactor | Behaviour-preserving refactor work (`kind: refactor`). |
| `c` | chore | Build / lint / CI / maintenance work (`kind: chore`). |
| `d` | docs | Docs-only work (`kind: docs`). |
| `t` | test | Tests-only work (`kind: test`). |
| `l` | legacy | Pre-f00016 `pNNN` proposals migrated into the legacy tier. |
| `a` | audit | Audit-finding lifecycle (`kind: audit`). |
| `n` | note | Resume / note records kept as permanent history. |

## When you touch a plugin / add a tool

- Add/keep its `outputSchema`; run `bun run types:generate` if the surface
  changed.
- Update the plugin README and, if user-visible on the site, add the
  translation keys for **every** language in `apps/web/src/i18n/ui.ts`.
- New persisted state → mutex + atomic write + a corruption test.

## When you run an audit

Always read the audit playbook skill first (use `mcp-vertex_agent_catalog`
to find its current path). Audits in this repo are not shell-only
exercises — the LLM must read the actual source code exhaustively
(every plugin, every engine, every extension, tools, scripts, test specs,
skills) and produce findings backed by real file references and code
snippets.

## Repo root layout (keep it ordered)

The root is intentionally minimal. Before adding a file to it, check:

- The cache is ALWAYS the root cache — never per-folder. There is
  exactly one cache root: the workspace root `.cache/`. Resolve the
  cache path through the single source of truth — `DEFAULT_CORE_PATHS.cacheDir`
  in the engine, or `cacheRoot()`/`CACHE_DIR_REL` from
  `tools/scripts/lib/monorepo-paths.ts` in tooling — never a hardcoded
  folder-relative `.cache`. `bun run lint:cache` FAILS if any `.cache`
  appears outside the root.
- Relocatable tool configs live in `config/`. A tool config moves to
  `config/` only if (a) the tool accepts an explicit config path AND
  (b) the VS Code editor integration is unaffected.
- External agent/IDE configs may use `config/external/<tool>/` as the
  canonical source only when the tool's root auto-discovery keeps
  working via a tested stub, include, symlink, or explicit path. Do not
  move `.github/`, `.vscode/`, `.cursor/`, `.claude/`, `.codex/`,
  `.continue/`, `.mcp.json`, `.aider.conf.yml`, or `.cursorrules`
  blindly.
- Config files that STAY at root are the ones their tool/editor
  auto-discovers there — the standard, expected JS/TS monorepo layout:
  `package.json`, `bun.lock`, `bunfig.toml`, `.gitignore`,
  `tsconfig*.json`, `biome.json`, `vitest.config.ts`/`vitest.shared.ts`,
  `stylelint.config.mjs`, `lefthook.yml`, `mcp-vertex.config.json`.
- Community-health docs live in `.github/` (`CONTRIBUTING.md`,
  `SECURITY.md`) — GitHub discovers them there. `README.md`, `LICENSE`,
  `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md` stay at root by convention.
- A new root file must justify itself against the above; otherwise it
  belongs in `.github/`, `docs/mcp-vertex/`, `tools/`, `config/`, or
  under `.cache/`.
