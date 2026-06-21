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
- `plugins/*` — opt-in capabilities (`proposals`, `memory`, `quality`, `rules`,
  `search`, `docs`, `deps`, `git`, `notification`). Each owns its namespace.
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
   handlers or engines (boot-time one-shots are the documented exception).
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
  - If the audit has pending tasks or slices to be executed within its own scope, the proposal must be created under `docs/proposals/ready/` with `status: ready` and all slices set to `pending`.
  - If the audit has no internal tasks (e.g. all findings are deferred to separate proposals), the audit is created directly under `docs/proposals/done/audits/` with `status: done` and must reference the deferred proposals.

## When you touch a plugin / add a tool

- Add/keep its `outputSchema`; run `bun run types:generate` if the surface changed.
- Update the plugin README and, if user-visible on the site, add the translation
  keys for **every** language in `apps/web/src/i18n/ui.ts`.
- New persisted state → mutex + atomic write + a corruption test.

See `skills/` for task-specific playbooks (plugin authoring, failure modes) and
`docs/proposals/audits/` for the living master audit (the roadmap).
