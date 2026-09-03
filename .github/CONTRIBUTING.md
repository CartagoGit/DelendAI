# Contributing to `@mcp-vertex/core`

Thanks for helping. This repo holds itself to the discipline it asks of its
consumers — the short version is in [`AGENTS.md`](AGENTS.md); this is the
human-facing companion.

## Setup

```bash
bun install
bun run validate   # recommended locally; required before a PR reaches main
```

Requires [Bun](https://bun.sh) for development. The published packages run under
Node (and Deno/bun); the dev toolchain is Bun-only.

`bun install` also installs the git hooks via `lefthook install` (the
`prepare` script). They format staged files on commit and report format, type
and lint findings without blocking normal development commits or pushes.

## Formatting

The repo uses [Biome](https://biomejs.dev/) (not Prettier) as its single
formatter — see [`biome.json`](biome.json). Two scopes:

| Scope                  | Glob          | Commands                                  |
| ---------------------- | ------------- | ----------------------------------------- |
| **Front** (Astro site) | `apps/web/**` | `bun run format:web` / `format:web:check` |
| **Whole repo**         | `**`          | `bun run format:all` / `format:all:check` |

Automation:

- **Editor**: `editor.formatOnSave = true` is set in
  [`.vscode/settings.json`](.vscode/settings.json) — Biome formats on save.
- **Pre-commit** (via `lefthook`): reformats staged files in the matching
  scope and re-stages them. Fast and surgical.
- **Pre-push**: runs `format:all:check`, SCSS lint and drift checks. Formatting
   and lint findings are advisory locally; pushes to `develop` are not blocked
   by those quality findings.
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
5. `bun run validate` is recommended during development. It is mandatory for a
   PR targeting `main`, including the release PR from `develop` into `main`.

## Release flow

1. Branch from `develop` using `release/<propuesta>` (or `release/vX.Y.Z/<slug>`).
2. Each commit on a `release/*` branch runs the `release-pr-gate`:
   - Conventional Commits on the commit message.
   - `bun run typecheck` clean.
   - `bun run lint` (Biome) clean.
   The gate is **blocking** in `lefthook` for `release/*` and `main`; pushes
   are aborted if any of those fail. Use `LEFTHOOK_BYPASS=1 git push …` only
   for emergencies — CI will re-check.
3. Open a pull request `release/<propuesta> → main`. The PR triggers two
   checks: `ci-complete` (full matrix) and `release-pr-gate` (local gate
   re-run in CI). Both must be green.
4. Merge into `main` (squash or merge commit, never fast-forward with a
   dirty history). After merge, sync `main → develop` so the release
   commits land in the journal too.

The push discipline is asymmetric on purpose:
- `develop` accepts any push (it's a snapshot journal).
- `release/*` and `main` are protected locally and on GitHub.
- `agent/*` branches never protect themselves.

## Commit messages — Conventional Commits

Versioning is **automatic** on push to `main`, derived from commit type:

| Prefix                               | Bump  | Example                                    |
| ------------------------------------ | ----- | ------------------------------------------ |
| `fix:`                               | patch | `fix(memory): prune expired notes on read` |
| `feat:`                              | minor | `feat(search): add context lines`          |
| `feat!:` / `BREAKING CHANGE:`        | major | `feat(core)!: rename plugin context field` |
| `docs:` `chore:` `test:` `refactor:` | none  | —                                          |

Scope with the package/plugin you touched. No manual version bumps.

> **No AI attribution.** `Co-authored-by:` trailers toward AI assistants
> (Claude, MiniMax, GPT-5, Gemini, Codex, Copilot, …) are not accepted.
> See [`docs/PRIVACY.md`](../docs/PRIVACY.md) for the full policy. The
> pre-commit hook (`bun tools/scripts/lint/no-llm-attribution.script.ts`,
> wired in `lefthook.yml`) refuses them with a clear error.

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
