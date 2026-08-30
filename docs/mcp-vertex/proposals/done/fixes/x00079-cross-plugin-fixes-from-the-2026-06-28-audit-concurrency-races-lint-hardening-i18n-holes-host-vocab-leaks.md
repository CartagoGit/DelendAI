---
id: x00079
status: done
type: proposal
track: plugins/proposals+lint+i18n+tools+scripts
date: 2026-06-28
kind: fix
title: Cross-plugin fixes from the 2026-06-28 audit — concurrency races, lint hardening, i18n holes, host-vocab leaks
runner: unknown
model: unknown
scope: cross-plugin-quick-wins
shipped-in:
    - e6429054 # S1+S2+S3+S4+S5 (cross-plugin fixes + i18n) — bundled in one commit
    - a0f3900e # S6 host-vocab removal
    - caf49e15 # S7 inverted console.error guard
    - 90655db4 # S8 process.cwd() → repoRoot() in sync-proposal-registry
related:
    - a00045 # audit post-merge que originó los hallazgos
    - a00044 # audit de robustez sistémica (overlap parcial con H4)
    - x00076 # quick wins from 2026-06-28 audit (Gemini) — paquete paralelo
    - f00078 # coordination protocol enforcement — partial overlap con S4
recan: []
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run test, expect: exit0 }
---

# x00079 — Cross-plugin fixes from the 2026-06-28 audit

## goal

Close the 8 findings (3 P0, 3 P1, 2 P2) opened by audit `a00045` and ship them as 8 small, independently-gated slices. Each slice is bounded, has its own gate, and can be claimed by a different implementer.

## why

The 2026-06-28 post-merge audit (`a00045`) found:
- **3 P0 concurrency races** in `plugins/proposals` — 1 read→check→write cycle and 4 single-`writeFileAtomic` sites without `withFileMutex` per-file protection.
- **`lint:proposals` degrades folder↔status mismatch and missing `paused-reason` to WARN**, allowing orphans and silent drift past the gate.
- **`[lang]/cli.astro` and `[lang]/guide.astro` pass literal English strings to `<PageHeader>` / `<Base>` / TOC** — `lint:web` cannot detect hardcoded JSX literals.
- **3 plugins (issues, memory, quality) hardcode `mcp-vertex.config.json` in user-visible text** — same anti-pattern a00032 fixed for the `audit` plugin.
- **`delivery-verifier.ts:160` has inverted console.error guard** — pollutes test stderr.
- **`sync-proposal-registry.script.ts:31-45` silently falls back to `process.cwd()`** — can mint a phantom cache.

## non-goals

- No new plugins, new tools, or new contracts.
- No refactors (the in-process mutex in `promote-on-release.ts` becomes cross-process; everything else is a 5–30 line patch).
- No proposal on the namespace-aware client (`f00081` handles that separately — different scope).

## slices

### S1 — `appendToClosedTasks` uses `withFileMutex(logPath, ...)`

Wrap the read → check → write cycle in `withFileMutex` so concurrent closure reports serialize.

- **Status**: done
- **shipped-in**: e6429054
- **Files**:
    - `plugins/proposals/src/lib/agents/closed-tasks-log.ts` [MODIFY]
    - `plugins/proposals/tests/src/lib/agents/closed-tasks-log.spec.ts` [MODIFY — add concurrency spec]
- **Gate**: `bun run test`
- **Closes**: a00045 H1 (P0)
### S2 — `promoteOnRelease` cross-process mutex

Replace the in-process `mutexRegistry` with `withFileMutex(queuePath, ...)` from `packages/core/src/lib/shared/file-mutex`. Remove `IMutex`, `mutexRegistry`, and the local `withMutex` function.

- **Status**: done
- **shipped-in**: e6429054
- **Files**:
    - `plugins/proposals/src/lib/agents/promote-on-release.ts` [MODIFY]
    - `plugins/proposals/tests/src/lib/agents/promote-on-release.spec.ts` [MODIFY — add cross-process spec or document that the test uses single-process and the engine delegates to withFileMutex]
- **Gate**: `bun run test`
- **Closes**: a00045 H2 (P0)
### S3 — Per-file `withFileMutex` bundle in `proposals`

Wrap each of the 4 sites (authoring.tool.ts × 2, sync-proposal-registry.ts reconcileBlocked, round-context-digest.ts writeRoundContextDigest) in `withFileMutex(<target path>, ...)`.

- **Status**: done
- **shipped-in**: e6429054
- **Files**:
    - `plugins/proposals/src/lib/tools/authoring.tool.ts` [MODIFY]
    - `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts` [MODIFY]
    - `plugins/proposals/src/lib/swarm/round-context-digest.ts` [MODIFY]
    - one new spec file under `plugins/proposals/tests/src/lib/` [CREATE] exercising concurrent calls with the same `docPath`
- **Gate**: `bun run test`
- **Closes**: a00045 H3 (P0)
### S4 — `lint:proposals` fails (not warns) on folder↔status mismatch and missing `paused-reason`

Add 2 fatal checks:
1. `frontmatter status "<x>" expects folder "<y>"` → exit 1 (currently WARN).
2. When `status: paused`, `paused-reason:` must be present and non-empty → exit 1.

Update existing tests and add 2 new specs (one per check).

- **Status**: done
- **shipped-in**: e6429054
- **Files**:
    - `tools/scripts/lint/proposals.script.ts` [MODIFY]
    - `tools/scripts/lint/proposals.spec.ts` [MODIFY or CREATE if absent]
- **Gate**: `bun run lint:proposals` (must exit 1 on the 3 currently-paused proposals that lack `paused-reason`, and on `done/feats/f00055-...md` whose status is `ready`)
- **Side effect**: this slice will turn the gate red until the 3 paused proposals are amended with `paused-reason` and `f00055` is moved or its status corrected. The slice's PR should include those amendments as drive-by edits, OR the implementer can stage them as separate in-progress fixes.
- **Closes**: a00045 H4 (P1)

### S5 — i18n strings for `[lang]/cli.astro` and `[lang]/guide.astro`

Add `t.cli.title`, `t.cli.description`, `t.guide.title`, `t.guide.description`, `t.guide.toc` (array of 13 entries) to `apps/web/src/i18n/ui.ts` for all 12 languages. Pipe them through `<PageHeader>` and `<Base>`. Add a small scanner (Node script) that greps `.astro` files in `apps/web/src/pages/[lang]/` for `<PageHeader title=` and `<Base.* title=` with literal English strings, exit 1 on any match. Wire into `bun run site:strict`.

- **Status**: done
- **shipped-in**: e6429054
- **Files**:
    - `apps/web/src/i18n/ui.ts` [MODIFY — add the 5 keys × 12 langs]
    - `apps/web/src/pages/[lang]/cli.astro` [MODIFY — pipe `t.cli.*`]
    - `apps/web/src/pages/[lang]/guide.astro` [MODIFY — pipe `t.guide.*`]
    - `apps/web/scripts/check-i18n.ts` [MODIFY — register the new keys as required]
    - `apps/web/scripts/scan-jsx-literals.ts` [CREATE — the new scanner]
    - `apps/web/package.json` [MODIFY — wire `bun run lint:web:jsx-literals` into `site:strict`]
- **Gate**: `bun run site:strict`
- **Closes**: a00045 H5 (P1)

### S6 — Host-vocab removal from issues / memory / quality knowledge text and error hints

Replace literal `mcp-vertex.config.json` strings in user-visible text with the `<config-file>` placeholder, mirroring what a00032 S2 did for the `audit` plugin.

- **Status**: done
- **Files**:
    - `plugins/issues/src/index.ts` [MODIFY — knowledge body line 44]
    - `plugins/memory/src/index.ts` [MODIFY — knowledge brief line 93]
    - `plugins/quality/src/lib/services/run-all.ts` [MODIFY — tool error hint line 130]
- **Gate**: `bun run test`
- **Shipped in**: a0f3900e
- **Closes**: a00045 H6 (P2)

### S7 — Fix inverted `console.error` guard in `delivery-verifier.ts`

Either invert the guard (only log in production) or route through the structured logger the rest of the plugin uses. Preferred: remove the log entirely — the synthetic green fallback is intentional and already documented in the function's contract; logging it is noise.

- **Status**: done
- **Files**:
    - `plugins/proposals/src/lib/agents/delivery-verifier.ts` [MODIFY]
- **Gate**: `bun run test`
- **Shipped in**: caf49e15
- **Closes**: a00045 H7 (P2)

### S8 — `sync-proposal-registry.script.ts` uses `repoRoot()` or fails

Replace the silent `process.cwd()` fallback with a call to `repoRoot()` (canonical helper from `tools/scripts/lib/monorepo-paths.ts`). If `repoRoot()` returns null, fail with a clear error message naming the `--root` flag.

- **Status**: done
- **Files**:
    - `tools/scripts/proposals/sync-proposal-registry.script.ts` [MODIFY]
    - `tools/scripts/tests/proposals/sync-proposal-registry.spec.ts` [CREATE or MODIFY]
- **Gate**: `bun run test`
- **Shipped in**: 90655db4
- **Closes**: a00045 H11 (P2)

## dependency graph

```
S1 ─┐
S2 ─┼─► (can land independently; all share `bun run validate` as final gate)
S3 ─┘
S4 ──► (requires amending 3 paused proposals + f00055 in the same PR)
S5 ──► (i18n + scanner; independent)
S6 ──► (3 plugin knowledge strings; independent)
S7 ──► (1 file; independent)
S8 ──► (1 script; independent)
```

S4 must include the `paused-reason` amendments as drive-by edits or the slice will turn the gate red. The implementer should:

1. Add `paused-reason: <text>` to `c00002`, `f00050`, `f00068` (one-line each).
2. Move `done/feats/f00055-...md` to `ready/feats/` (folder ↔ status already correct there) OR set its `status: done`.

If S4's PR is split from the data amendments, land the amendments FIRST, then enable the lint rule.

## acceptance

- `bun run validate` exits 0.
- `bun run lint:proposals` exits 0 (after S4 + the 3 paused-proposal amendments + the f00055 fix are merged).
- `bun run test` exits 0 with new concurrency specs covering S1, S2, S3.
- `bun run site:strict` exits 0 with all 12 locales showing translated chrome on `[lang]/cli` and `[lang]/guide`.
- `a00045` is closed by setting `shipped-in: [<commit>]` once this proposal lands.