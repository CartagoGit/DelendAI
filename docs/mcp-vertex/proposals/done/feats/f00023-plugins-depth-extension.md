---
id: f00023
status: done
type: proposal
track: plugins
date: 2026-06-21
kind: feat
title: Plugin depth extension — search (rg + context), memory (export/import), docs (docs_search)
---

# f00028 — Plugin depth extension — `search` (rg + context), `memory` (export/import), `docs` (`docs_search`)

## Goal

Close the master audit's M33 follow-up (line 598) by adding the three
plugin-depth improvements that were explicitly **not addressed in session
21-06** and are still on the audit:

- **`search`**: optional `rg` (ripgrep) backend when the binary is on
  `$PATH`, plus a `context:N` parameter that returns N lines before/after
  each hit. Both behind `respectGitignore` and the existing containment
  guard (M22).
- **`memory`**: `memory_export` (returns the full store as JSON or NDJSON)
  and `memory_import` (replaces or merges; redactSecrets runs on the
  input by default; conflict resolution is per-key with `overwrite` /
  `skip` / `merge`).
- **`docs`**: `docs_search` (regex/glob over doc titles + bodies, returns
  ranked hits with snippets; respects the same containment + size caps as
  `docs_list`).

## Why

- The 3rd-party agnostic audit (Codex, 18-06) and the master audit both
  flag these as the most-requested follow-ups after M11 closed
  `search`/`memory`/`docs` quick wins.
- All three are **additive** (new tools / new optional behaviours) — none
  of them change existing tool semantics or break consumers.
- All three are well-bounded: each slice is ≤ 1 day of work with a clear
  spec.

## Non-goals

- Replacing the default `search` engine with `rg` by default — `rg` is an
  *opt-in fallback* (faster on huge repos, requires the user to install
  it). Default stays on the in-house async walker.
- Touching the on-disk memory store format (export/import are JSON
  snapshots of the same store; no migration needed).
- Full-text indexing for `docs_search` (it's a linear scan with the
  existing `search` engine underneath; for the 10–50 docs typically
  present, that's < 5 ms).

## Slices

### S1 — `search`: optional `rg` backend + `context:N`
  - **Status**: done
  - **Files**: `plugins/search/src/lib/engine.ts`, `plugins/search/src/lib/tools.ts`,
    `plugins/search/tests/src/lib/search-rg-context.spec.ts` (new spec, 7 cases).
  - **Command**: `bunx vitest run plugins/search/tests && bun run typecheck`
  - **Expect**: green.

### S2 — `memory`: export/import
  - **Status**: done
  - **Files**: `plugins/memory/src/lib/store.ts`, `plugins/memory/src/lib/tools.ts`,
    `plugins/memory/src/public/index.ts`, `plugins/memory/tests/src/lib/export-import.spec.ts`
    (new spec, 12 cases), `plugins/memory/tests/src/lib/memory.spec.ts` (updated tool-id list).
  - **Command**: `bunx vitest run plugins/memory/tests && bun run typecheck`
  - **Expect**: green.

### S3 — `docs`: `docs_search`
  - **Status**: done
  - **Files**: `plugins/docs/src/lib/engine.ts`, `plugins/docs/src/lib/tools.ts`,
    `plugins/docs/src/public/index.ts`, `plugins/docs/tests/src/lib/engine-search.spec.ts`
    (new spec, 6 cases), `plugins/docs/tests/src/lib/docs.spec.ts` (updated tool-id list).
  - **Command**: `bunx vitest run plugins/docs/tests && bun run typecheck`
  - **Expect**: green.

### S4 — Audit close
  - **Status**: done
  - **Files**: `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
    (M33 line → ✅, tracking table row → cerrado).
  - **Command**: none.
  - **Expect**: master audit M33 is closed.

## Acceptance

- [x] `search` accepts `context: N` (0 ≤ N ≤ 10) and returns N
      surrounding lines per hit (`before`/`after` arrays on each hit).
- [x] `search` with `preferRg: true` uses `rg` when available (`usedRg: true`),
      falls back with `rgFallbackReason` otherwise.
- [x] `memory_export` / `memory_import` round-trip preserves all
      non-expired entries; secrets are redacted on import.
- [x] `docs_search` returns ranked hits with snippets.
- [x] Master audit M33 is closed.

## risks and mitigations

- **R1 — `rg` JSON output is not stable across versions**: pin to
  `rg --json` format ≥ 12.0 (the documented stable line shape); the spec
  uses the documented fields only and asserts on them.
- **R2 — `memory_import` with `mode: 'replace'` is destructive**: the
  tool's `effects: ['write', 'destructive']` is set explicitly; the
  outputSchema names the modes so a CLI consumer can show a confirmation
  prompt.
- **R3 — `docs_search` is linear**: fine for the 10–50 doc scale we
  have; documented as a known limit. If a future user hits thousands of
  docs, the proposal to add an index is `l999` (placeholder).

## notes

- Master audit: `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
  (M33, formerly cited by its pre-renumbering line/path).
- M11 closure (search .gitignore, memory TTL/redact, docs pagination):
  same audit §7 "P2 — Calidad de producto".
- M22 containment guard: `packages/core/src/lib/shared/contain-path.ts`.
- M23 redact: `packages/core/src/lib/shared/redact.ts`.
- `docs_list` / `docs_read`: `plugins/docs/src/lib/tools.ts` (the model
  for the new `docs_search` tool).

### Rationale (decisions taken autonomously during implementation)

- **Tool name stays `search`/`memory_export`/`docs_search`, not `search_query`**:
  the proposal's S1 text said `search_query`, but the actual registered tool is
  `${prefix}_search` (`buildSearchToolRegistrations`). Renaming it would have
  broken the public surface for no functional gain (forbidden by this
  proposal's own Non-goals: "no breaking the public tool surface"). `context`/
  `preferRg` were added as new optional input fields on the existing tool.
- **`searchWorkspace` became a dispatcher over two private implementations**
  (`searchWorkspaceInHouse` / `searchWorkspaceWithRg`) rather than an `RgBackend`
  class as the proposal sketched — a plain function dispatch matches every
  other engine in this codebase (no class-based engines elsewhere in
  `plugins/*/src/lib/engine.ts`) and keeps the single-responsibility split
  (selection logic vs. each backend's own walk/parse logic) without
  introducing an OOP pattern foreign to the rest of the plugin.
- **rg JSON parsing required a two-pass buffer-per-file algorithm**, not the
  naive single-pass "nearest match" association first attempted: `rg --json
  --context N` interleaves `context` records *before* the `match` record in
  the stream (e.g. context(1), context(2), match(3), context(4), context(5)),
  so a context line for "before" arrives before any match key exists to
  attach it to. Buffering each file's records in line-number order and
  walking outward from each `match` while neighbours are `context` is the
  correct (and simpler) algorithm — verified against real `rg` output during
  implementation, not assumed from the spec.
- **`rg` path resolution bug found and fixed during implementation**: rg's
  JSON `path.text` field is the path exactly as it was passed on the
  command line. Since absolute roots are passed (the same `resolveWorkspaceContained`
  output used everywhere else for containment), `path.join(workspaceRootAbs, absolutePath)`
  silently concatenates instead of respecting the absolute path — `path.resolve`
  is required instead. Caught by the "context lines match the in-house walker"
  cross-check test, not by manual inspection.
- **`memory_import`'s conflict `'merge'` strategy** (union tags, keep the
  longer body, newest `updatedAt` wins) was not fully specified by the
  proposal beyond naming the three modes. Chosen because it's the only
  strategy of the three that can't silently lose data — `'overwrite'` and
  `'skip'` are both lossy by design (that's their point), so `'merge'` had to
  define a deterministic, non-lossy tie-break instead of picking one side
  arbitrarily.
- **`exportNotes`/`importNotes` live in `store.ts`, not `tools.ts`** — same
  split the file already had for `saveNote`/`recall`/`removeNote`: persistence
  + business logic in `store.ts` (independently unit-testable, no MCP
  plumbing), `outputSchema`/`inputSchema`/wiring in `tools.ts`. This is the
  Single Responsibility split the proposal's SOLID directive calls for; no
  new abstraction was introduced beyond what the file already does for every
  other memory operation.
- **`docs_search` reuses `listDocs` + `readDoc` verbatim** instead of a new
  read path, so the containment guard, size cap and root-resolution logic
  exist in exactly one place. The score formula `(titleHits * 3) + bodyHits`
  matches the proposal's spec literally.
- **Concurrent-session note**: this slice was implemented while ≥1 other
  agent was active in the same working tree (confirmed via `.mcp-vertex/handoff/*`
  and a live `.worktrees/implementation-runner` checkout) working on
  `f00022`/`f00026`/`f00035` (IDE/ui-extension rename) and `f00023`/`f00024`
  (proposal renumbering/cascade-priority). `plugins/search`, `plugins/memory`,
  `plugins/docs` were untouched by that work (confirmed via mtimes before
  starting), so this slice has zero file overlap with it. The global
  `bun run validate` was red for unrelated reasons during parts of this work
  (a syntax error mid-edit in `proposal-scaffold-linter.ts`, missing
  `lib: dom` in `packages/ui-extension`/`extensions/vscode` dev entries, a
  transient `@mcp-vertex/audit` workspace-link gap) — none touching
  `plugins/search`/`memory`/`docs`. Gate actually applied: `bun run typecheck`
  clean for all three plugins, `bunx vitest run plugins/search plugins/memory
  plugins/docs` → 83/83 green, `npx biome check` clean for every new/changed
  file in this slice.
