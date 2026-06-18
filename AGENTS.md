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

## Conventions

- **Conventional Commits.** Versioning is derived from commit type on push to
  `main` (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major).
  No manual version bumps; no commit-back loop.
- **One barrel per package** (`src/public/index.ts`); internals live in `src/lib`.
- **Interfaces are `I`-prefixed**; match the surrounding file's idiom.
- **Tests** colocate as `*.spec.ts`; protocol behaviour gets an e2e with a real
  in-memory MCP server.

## When you touch a plugin / add a tool

- Add/keep its `outputSchema`; run `bun run types:generate` if the surface changed.
- Update the plugin README and, if user-visible on the site, add the translation
  keys for **every** language in `apps/web/src/i18n/ui.ts`.
- New persisted state → mutex + atomic write + a corruption test.

See `skills/` for task-specific playbooks (plugin authoring, failure modes) and
`docs/proposals/audits/` for the living master audit (the roadmap).
