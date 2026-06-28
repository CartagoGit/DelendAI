---
id: f00079
status: done
type: proposal
track: core+plugins+lint+docs
date: 2026-06-28
kind: feat
title: Canonical ephemeral exec paths inside pluginCacheDir — one home for runtime scratch that agents create, run, and unlink
shipped-in:
  - 9bb6c4de
recan: []
related:
  - f00056 # agent discovery catalog — close sibling, also caches per-plugin
  - f00065 # single canonical cache root (already enforced by check-cache)
ownership:
  - { agent: implementation_runner, task: 'S1: ship the shared `exec-path` helper in @mcp-vertex/core/public with `resolveExecPath` + `withEphemeralExec` + a `pruneExpired` TTL helper, plus tests' }
  - { agent: implementation_runner, task: 'S2: add `check-ephemeral-paths` lint that fails when runtime code under `packages/core/src/` or `plugins/*/src/` calls `os.tmpdir()` / `mkdtempSync(join(tmpdir(), …))` / writes to `/tmp/`, and wire it into `bun run validate`' }
  - { agent: implementation_runner, task: 'S3: migrate the few stray runtime call sites that still write outside pluginCacheDir (scaffold, proposal authoring, smoke helpers) onto the new helper' }
  - { agent: implementation_runner, task: 'S4: document the canonical rule in AGENTS.md, docs/mcp-vertex/FILE-CONVENTIONS.md, and the plugin authoring skill' }
globalGate: validate
acceptance:
  - { command: bun run types:generate, expect: exit0 }
  - { command: bun run test, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# f00058 — Canonical ephemeral exec paths inside pluginCacheDir

## Goal

Give every plugin, host, and AI agent exactly **one** canonical home for the
files they create in order to *do something and then throw away*: a
runnable script, a temp JSON the agent will unlink after parsing, a sidecar
the harness expects for one call. After this slice those artefacts all
land under `<pluginCacheDir>/exec/` — derived from `IMcpPluginContext` —
and nothing runtime-touching writes them anywhere else.

## Why

Today three patterns leak runtime scratch into the wrong place:

1. The **handoff packets** the proposals plugin writes when the
   loop-detector fires — `.cache/mcp-vertex/handoff/*.json` — are already
   inside the canonical cache, but the resolver hardcodes the
   `.cache/mcp-vertex` literal when a host reconfigures the cache root
   (x00054). Same family of bug as x00052.
2. **Smoke / smoke-equivalent scripts** under `tools/scripts/` create
   `mkdtempSync(join(tmpdir(), 'mcp-smoke-'))` workspaces — fine for
   one-shot CLI tooling, but the same idiom leaks into runtime code
   when an author copies a pattern without the comment.
3. The new `plugin-tool-verify.script.ts` harness writes
   `.verify-tmp/` at the repo root — which is fine *only* because the
   next session re-`rm -rf`s it. There is no schema, no TTL, no
   ownership, no enforcement.

When the artefact lives under `pluginCacheDir` it inherits four
invariants for free: it is `.gitignore`d, the `check-cache` lint refuses
stray siblings, the plugin loader can `rm -rf` it on `--reset`, and a
human can `ls .cache/mcp-vertex/<plugin>/exec/` to debug a misbehaving
agent.

## non-goals

- Replacing `os.tmpdir()` in test fixtures. `*.spec.ts` and
  `tools/scripts/` keep using it freely — the lint whitelists those
  locations.
- Persisting artefacts beyond their declared TTL. A script the agent
  needs again tomorrow is not ephemeral; it belongs in `pluginCacheDir`
  itself, or in `pluginDocsDir` if it is human-facing.
- Touching `node_modules/**` or `build/**`.

## risks and mitigations

> Runtime code MUST NOT call `os.tmpdir()`, `mkdtempSync(join(tmpdir(), …))`,
> `Deno.makeTempFile()`, or write under `/tmp/`, `/var/tmp/`, or any path
> outside the workspace root. Ephemeral artefacts MUST resolve through
> `resolveExecPath(ctx, name)` (or `withEphemeralExec(ctx, name, fn)`)
> so they land in `<pluginCacheDir>/exec/`. Test fixtures and CLI
> tooling under `tools/scripts/` are exempt — they run once and exit.

## Slices

### S1 — Shared `exec-path` helper in `@mcp-vertex/core/public`

- **Files**:
  - `packages/core/src/lib/shared/exec-path.ts` (new)
  - `packages/core/src/public/index.ts` (export the new surface)
  - `packages/core/tests/src/lib/shared/exec-path.spec.ts` (new)
- **Status**: ready
- **Gate**: `bun run test`
- **Acceptance**:
  - `resolveExecPath(ctx, 'foo.sh')` returns
    `<ctx.pluginCacheDir>/exec/foo.sh`, `mkdir -p`'s the parent, and is
    idempotent across calls.
  - `resolveExecPath(ctx, '../escape.sh')` throws a structured error
    (workspace containment).
  - `withEphemeralExec(ctx, 'probe.json', async (abs) => { await
    writeFileAtomic(abs, '{}'); return readFile(abs, 'utf8'); })` writes
    the file, runs `fn`, and `unlink`s the file in `finally` — even
    when `fn` throws.
  - `pruneExpiredExec(ctx, ttlMs)` removes every regular file in the
    `exec/` dir whose `mtimeMs` is older than `ttlMs`. Returns the
    count of pruned files. Missing dir → empty result, no throw.
  - The helper never reads `process.cwd()`. It only uses
    `ctx.workspace.resolve` and `ctx.pluginCacheDir`.

### S2 — `check-ephemeral-paths` lint + wire to `validate`

- **Files**:
  - `tools/scripts/lint/check-ephemeral-paths.script.ts` (new)
  - `tools/scripts/lint/check-ephemeral-paths.script.spec.ts` (new)
  - `package.json` (`scripts` → `lint:ephemeral`, plus
    `validate` chain)
- **Status**: ready
- **Gate**: `bun run test`
- **Acceptance**:
  - Walks every `*.ts` under `packages/core/src/**` and
    `plugins/*/src/**` (excluding `*.spec.ts` and `__tests__/**`).
  - Fails when a file imports `node:os` and references `tmpdir()`,
    calls `mkdtempSync` / `mkdtemp`, or hard-codes `/tmp/` /
    `os.homedir()` in a string literal that looks like a path.
  - Prints the offending file, line, and the matched token. Exits 1
    with a paste-ready fix recipe that points at
    `resolveExecPath(ctx, name)`.
  - Whitelists `tools/scripts/**` and any file ending in `.spec.ts`.
  - A focused spec proves: (a) clean tree returns no violations,
    (b) a planted `mkdtempSync(join(tmpdir(), 'x-'))` is flagged with
    file + line, (c) a planted call inside `tools/scripts/` is ignored,
    (d) a planted call inside `*.spec.ts` is ignored.

### S3 — Migrate the stray runtime call sites

- **Files**:
  - `packages/core/src/lib/scaffold/scaffold-tool.ts` (the
    `unlink(source)` post-copy step is already canonical; verify and
    add a comment if needed)
  - `plugins/proposals/src/lib/agents/loop-detector-service.ts`
    (the `pruneOldHandoffs` could adopt `pruneExpiredExec` if we move
    the handoff dir under `pluginCacheDir/exec/handoff/` — out of
    scope for f00058, kept as `related` follow-up)
  - `tools/scripts/verify/plugin-tool-verify.script.ts` (move
    `.verify-tmp/` to `.cache/mcp-vertex/.scratch/verify/<pid>/` and
    add a TTL prune on entry; document the choice in a comment)
  - any other call site the lint flags in S2 (drive the migration off
    the lint output, not pre-emptively)
- **Status**: ready
- **Gate**: `bun run validate`
- **Acceptance**:
  - `bun tools/scripts/lint/check-ephemeral-paths.script.ts` reports
    zero violations on `main` after the migration.
  - `plugin-tool-verify.script.ts` writes its scratch under the
    canonical cache and is still verifiable end-to-end (the harness
    output is unchanged).
  - No new helper is added at the plugin level; everything goes through
    the shared `withEphemeralExec` / `resolveExecPath`.

### S4 — Documentation

- **Files**:
  - `AGENTS.md` (extend the "Hard rules" section with rule #12 — see
    above)
  - `docs/mcp-vertex/FILE-CONVENTIONS.md` (link to the helper + lint
    from the "Why this exists" preamble)
  - `plugins/*/skills/plugin-authoring/SKILL.md` (note the
    `pluginCacheDir/exec/` pattern in the durable-state section)
- **Status**: ready
- **Gate**: `bun run validate` (no behavioural change)
- **Acceptance**:
  - `AGENTS.md` rule #12 cites the helper by name and points at the
    lint, mirroring the existing rule #4 citation style.
  - `FILE-CONVENTIONS.md` adds a one-paragraph note under "Why this
    exists" so future contributors discover the helper before they
    reach for `os.tmpdir()`.
  - The plugin-authoring skill says: *"ephemeral artefacts the agent
    will unlink must live under `ctx.pluginCacheDir/exec/`. Use
    `resolveExecPath(ctx, name)` (or `withEphemeralExec` when the
    lifecycle is `write → run → unlink`)."*

## acceptance

- `bun run validate` is green at the end of every slice.
- `check-ephemeral-paths` reports zero violations on `main` after S3.
- No runtime code under `packages/core/src/` or `plugins/*/src/`
  imports `node:os` for `tmpdir()` or writes under `/tmp/`.
- `resolveExecPath` and `withEphemeralExec` are documented in the core
  public barrel and reachable from every plugin.

## notes

### Migration map (filled in during S3)

| Call site | Today | After f00058 |
|---|---|---|
| `tools/scripts/verify/plugin-tool-verify.script.ts` | `.verify-tmp/<pid>` at repo root | `<cacheDir>/.scratch/verify/<pid>/` via `cacheRoot()` |
| `tools/scripts/smoke/cli.script.ts` | `mkdtempSync(tmpdir(), …)` | unchanged — `tools/scripts/` is whitelisted |
| `tools/scripts/smoke/pack.script.ts` | `mkdtempSync(tmpdir(), …)` | unchanged — whitelisted |
| `plugins/proposals/src/lib/agents/loop-detector-service.ts` | `<cacheDir>/handoff/` | unchanged in f00058; follow-up proposal will move it under `pluginCacheDir/exec/handoff/` |

### Token budget

- `resolveExecPath` is a 6-line helper — no measurable budget impact.
- The lint is a single-file walker over ~2 000 TS files — expected
  runtime well under 200 ms; CI budget unaffected.

### Divergence guards

- `exec-path.spec.ts` covers idempotency, containment, exception
  cleanup, and TTL pruning.
- `check-ephemeral-paths.script.spec.ts` covers the four branches:
  clean / violation-in-runtime / violation-in-tooling-allowed /
  violation-in-spec-allowed.
- A follow-up `bun run validate` after S3 must pass with zero
  violations reported by the new lint.