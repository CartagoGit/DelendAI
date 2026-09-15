---
id: x00544
title: "Plugin path inputs still resolve lexically and miss symlinks that escape the workspace"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-15
tags:
    - security
    - containment
    - symlinks
    - plugins
---

# x00544 — Plugin path inputs still resolve lexically and miss symlinks that escape the workspace

## goal

Every plugin that turns a caller-supplied path into a file read or write
refuses a path whose real, symlink-resolved location is outside the
workspace and its authorized roots. Core's own primitives already do this.

## why

An external audit on 2026-09-15 said `SECURITY.md` understated the
product: it called containment "lexical", while core already compares
real paths. Checked on develop, that is half true.

- **Core is physical.** `fsRead` uses `resolveExistingWorkspaceContained`.
  `fsWrite` and `resolveWorkspaceContainedEffective` use
  `realpathContained`. All three refuse a pre-existing symlink that points
  outside, with `path escapes workspace via symlink`.
- **Most plugins are not.** 36 calls in 26 files across 17 plugins still
  call the lexical `resolveWorkspaceContained` directly. That check never
  touches the filesystem, so `workspace/link/config` passes when `link`
  points at `~/.ssh`. The affected plugins include `docs` and `deps`, the
  very examples `SECURITY.md` gave for containment.

`SECURITY.md` now states both halves. This proposal closes the second.

## non-goals

- **Not a TOCTOU fix.** A symlink swapped in between the check and the I/O
  is out of scope, and the host sandbox remains the last boundary. An
  `O_NOFOLLOW` or descriptor-based path is a separate question.
- **No change to the lexical primitive.** It stays pure and disk-free on
  purpose. Writers of paths that do not exist yet still need it, followed
  by `realpathContained`.

## slices

### S1 — A gate that names every lexical-only resolution in plugin code

- **Status**: pending
- **Files**: [`tools/scripts/lint/plugin-physical-containment.script.ts`, `tools/scripts/lint/plugin-physical-containment.script.spec.ts`]

This adds a baselined ratchet: a new direct call to the lexical resolver
in `plugins/*/src` fails. The existing 36 calls are listed in the
baseline, and the baseline may only shrink.

- **Gate**: `npx vitest run tools/scripts/lint/plugin-physical-containment.script.spec.ts`

### S2 — Readers use the existing-path primitive

- **Status**: pending
- **Files**: [`plugins/audit-orchestrator/src/lib/plan-reader.ts`, `plugins/audit/src/lib/services/run-pipeline-prelude.service.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/conventions/src/lib/services/fs-dir-reader.service.ts`, `plugins/deps/src/lib/services/engine.ts`, `plugins/deps/src/lib/services/polyglot.ts`, `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/env/src/lib/env/real-deps.ts`, `plugins/env/src/lib/tools/env-check.tool.ts`, `plugins/i18n/src/lib/tools/i18n-check.tool.ts`, `plugins/i18n/src/lib/tools/i18n-validate.tool.ts`, `plugins/perf/src/lib/tools/perf-profile.tool.ts`, `plugins/quality/src/lib/tools/quality-complexity.tool.ts`, `plugins/quality/src/lib/tools/quality-coverage.tool.ts`, `plugins/refactor/src/lib/tools/refactor-nav.tool.ts`, `plugins/test-convention/src/fs-scan-reader.ts`]

Where a plugin reads a path it was given, it resolves the path with
`resolveExistingWorkspaceContained` or `resolveWorkspaceContainedEffective`
instead. Each plugin gains one spec: a symlink inside a temporary
workspace that points outside is refused, with the path named.

- **Gate**: each touched plugin's suite, plus the S1 ratchet baseline
  dropping by the calls removed.

### S3 — Writers check the real location before writing

- **Status**: pending
- **Files**: [`plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/completion/src/index.ts`, `plugins/deps/src/lib/tools/write-tools.ts`, `plugins/docs/src/lib/tools/docs-generate.tool.ts`, `plugins/issues/src/index.ts`, `plugins/notification/src/index.ts`, `plugins/proposals/src/lib/proposals/migrate-foreign.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`, `plugins/self-learning/src/index.ts`]

A path that may not exist yet keeps the lexical check and then passes
`realpathContained`, the same order `fsWrite` uses. Writing through
`fsWrite` itself is preferred wherever the plugin does not need its own
I/O.

- **Gate**: each touched plugin's suite; the S1 baseline reaches 0.

## acceptance

- The S1 ratchet's baseline is empty, and a new lexical-only call in a
  plugin fails CI.
- `SECURITY.md`'s limit on physical containment coverage is removed. The
  TOCTOU limit stays.

## notes

- Counted on develop at `0bf0fe61e` on 2026-09-15 with
  `grep -rn "resolveWorkspaceContained(\|resolveWorkspaceContainedLexical(" plugins/*/src`.
  The result was 36 calls in 26 files. S2 and S3 split the files by what
  each call does; a file appears in both when it does both.
