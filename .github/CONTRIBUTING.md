# Contributing to `@mcp-vertex/core`

Thanks for helping. This repo holds itself to the discipline it asks of its
consumers — the short version is in [`AGENTS.md`](AGENTS.md); this is the
human-facing companion.

## Setup

```bash
bun install
bun run validate   # typecheck + lint + tests — must be green
```

Requires [Bun](https://bun.sh) for development. The published packages run under
Node (and Deno/bun); the dev toolchain is Bun-only.

`bun install` also installs the git hooks via `lefthook install` (the
`prepare` script). They format staged files on commit and run a full format
check on push.

## Formatting

The repo uses [Biome](https://biomejs.dev/) (not Prettier) as its single
formatter — see [`biome.json`](biome.json). Two scopes:

| Scope | Glob | Commands |
|---|---|---|
| **Front** (Astro site) | `apps/web/**` | `bun run format:web` / `format:web:check` |
| **Whole repo** | `**` | `bun run format:all` / `format:all:check` |

Automation:

- **Editor**: `editor.formatOnSave = true` is set in
  [`.vscode/settings.json`](.vscode/settings.json) — Biome formats on save.
- **Pre-commit** (via `lefthook`): reformats staged files in the matching
  scope and re-stages them. Fast and surgical.
- **Pre-push**: runs `format:all:check`; push fails if anything is unformatted.
- **CI**: `bun run lint` runs `biome ci`, which includes format checks.

Skip hooks with `LEFTHOOK=0 git commit …` or `git commit --no-verify`. Don't
make this a habit — CI will catch it.

## The loop

1. Branch off `develop`.
2. Make a small, file-disjoint change. Keep the **core agnostic** — domain logic
   belongs in a plugin, never in `packages/core`.
3. Add tests next to the code (`*.spec.ts`). Protocol behaviour gets an e2e against
   a real in-memory MCP server.
4. If you changed a tool's surface, run `bun run types:generate`. If you changed
   site copy, add the keys for **every** language in `apps/web/src/i18n/ui.ts`
   (`bun --cwd apps/web run check:i18n` enforces it).
5. `bun run validate` must be green before you open a PR.

## Commit messages — Conventional Commits

Versioning is **automatic** on push to `main`, derived from commit type:

| Prefix | Bump | Example |
|---|---|---|
| `fix:` | patch | `fix(memory): prune expired notes on read` |
| `feat:` | minor | `feat(search): add context lines` |
| `feat!:` / `BREAKING CHANGE:` | major | `feat(core)!: rename plugin context field` |
| `docs:` `chore:` `test:` `refactor:` | none | — |

Scope with the package/plugin you touched. No manual version bumps.

## Adding a plugin

See the [`mcp-vertex-plugin-authoring`](skills/mcp-vertex-plugin-authoring/SKILL.md)
skill. In short: `definePlugin`, namespace every tool, declare an `outputSchema`,
resolve paths from `ctx` (never `process.cwd()`), use the shared primitives for
durable state, and contain path inputs with `resolveWorkspaceContained`.

## Invariants a reviewer will check

Agnostic core · no `process.cwd()` in engines · async I/O in hot paths · durable
writes via `withFileMutex` + `writeFileAtomic` · contained path inputs · secrets
redacted before persisting · `overview`/`auto_work` under their token budgets ·
every public tool declares an `outputSchema` · complete translations.

## Reporting bugs / security

Functional bugs: open an issue with repro steps and `bun run validate` output.
Security issues: see [`SECURITY.md`](SECURITY.md) — please do **not** open a public
issue for a vulnerability.
