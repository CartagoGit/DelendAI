# Contributing to `@cartago-git/mcp-core`

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

See the [`mcp-core-plugin-authoring`](skills/mcp-core-plugin-authoring/SKILL.md)
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
