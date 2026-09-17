---
id: x00544
title: "Plugin path inputs still resolve lexically and miss symlinks that escape the workspace"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-15
shipped-in:
    - dc3f51c3878b477aa373e809e1b3d994bc9a02ec
    - abdee4dc4cfab1ac8a0c77b4a71010c604c2b658
    - 1eacb3e62564b5ae8231ce6dd65c9571dd69f8c8
    - 343fde6944d4c28060a41963e43f27041f31d933
    - 82fa813e94904adeb67e16034eebb653855f1f5a
    - d24293dc4a3e7f0087216cbfb2f7bca247f4083b
    - 9cd6a3e1cb5df837ab615501caaa736dbfe69d21
    - d98b69460a3135bfbfe7096fa4f777c256dfc38b
    - b29ce7f318cd1fc69781928adbc94436225268a8
    - 311dfa54e107f6c2bcf389677ad3bed3a2b59d55
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

- **Status**: done — shipped in `dc3f51c38`. `lint:plugin-physical-containment`
  ratchets every direct call to the lexical resolver under `plugins/*/src`;
  the baseline recorded the 36 calls counted at `0bf0fe61e` and may only
  shrink.
- **Files**: [`tools/scripts/lint/plugin-physical-containment.script.ts`, `tools/scripts/lint/plugin-physical-containment.script.spec.ts`]

This adds a baselined ratchet: a new direct call to the lexical resolver
in `plugins/*/src` fails. The existing 36 calls are listed in the
baseline, and the baseline may only shrink.

- **Gate**: `npx vitest run tools/scripts/lint/plugin-physical-containment.script.spec.ts`

### S2 — Readers use the existing-path primitive

- **Status**: done — readers resolve through `resolveExistingWorkspaceContained`,
  and each carries a spec that refuses a symlink pointing out of a temporary
  workspace: `abdee4dc4` (the last reader paths), `1eacb3e62` and `343fde694`
  (`refactor_apply`, read through `SafeWorkspaceReader` rather than
  `node:fs`), `82fa813e9` and `d24293dc4` (`deps`/`docs` refusal paths and
  the test-kit they need).
- **Files**: [`plugins/audit-orchestrator/src/lib/plan-reader.ts`, `plugins/audit/src/lib/services/run-pipeline-prelude.service.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/conventions/src/lib/services/fs-dir-reader.service.ts`, `plugins/deps/src/lib/services/engine.ts`, `plugins/deps/src/lib/services/polyglot.ts`, `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/env/src/lib/env/real-deps.ts`, `plugins/env/src/lib/tools/env-check.tool.ts`, `plugins/i18n/src/lib/tools/i18n-check.tool.ts`, `plugins/i18n/src/lib/tools/i18n-validate.tool.ts`, `plugins/perf/src/lib/tools/perf-profile.tool.ts`, `plugins/quality/src/lib/tools/quality-complexity.tool.ts`, `plugins/quality/src/lib/tools/quality-coverage.tool.ts`, `plugins/refactor/src/lib/tools/refactor-nav.tool.ts`, `plugins/test-convention/src/fs-scan-reader.ts`]

Where a plugin reads a path it was given, it resolves the path with
`resolveExistingWorkspaceContained` or `resolveWorkspaceContainedEffective`
instead. Each plugin gains one spec: a symlink inside a temporary
workspace that points outside is refused, with the path named.

- **Gate**: each touched plugin's suite, plus the S1 ratchet baseline
  dropping by the calls removed.

### S3 — Writers check the real location before writing

- **Status**: done — writers keep the lexical check and then pass
  `realpathContained`, the same order `fsWrite` uses: `9cd6a3e1c` (audit
  auto-scaffold), `d98b69460` (completion records), `b29ce7f31`
  (issues drafts, self-learning store, the notification bridge's four
  writes). Each guard was proven both ways — with it removed exactly the
  new case fails, restored the suite is green — and the refusal surface
  matches each caller's contract: a structured outcome where one exists,
  a throw where the caller converts it to a `toolError`, and a counted,
  logged skip where the sink must never throw.
- **Files**: [`plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/completion/src/index.ts`, `plugins/deps/src/lib/tools/write-tools.ts`, `plugins/docs/src/lib/tools/docs-generate.tool.ts`, `plugins/issues/src/index.ts`, `plugins/notification/src/index.ts`, `plugins/proposals/src/lib/proposals/migrate-foreign.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`, `plugins/self-learning/src/index.ts`]

A path that may not exist yet keeps the lexical check and then passes
`realpathContained`, the same order `fsWrite` uses. Writing through
`fsWrite` itself is preferred wherever the plugin does not need its own
I/O.

- **Gate**: each touched plugin's suite; the S1 baseline reaches 0.

### S4 — The register-time sites

- **Status**: done — neither option was needed. Core gained
  `resolveWorkspaceContainedPhysicalSync` (on `@delendai/core/plugin`): the
  lexical check, then the real location of the deepest existing prefix,
  without awaiting and without requiring the target to exist. It lives in
  its own boot-time module, the one place `lint:solid` allows core to call
  `node:fs` synchronously. The six register-time calls use it, so
  `register(ctx)` stays synchronous and its specs keep asserting a
  synchronous throw. The auto-scaffold call already ran in an async
  handler, so it moved into the audit path policy on the async
  `resolveWorkspaceContainedEffective`. Each plugin gains a real-symlink
  refusal case. With the lexical resolver put
  back, exactly those five new cases fail. The baseline is now empty; it had
  still listed all 36 original calls, so a fixed file could have regained
  lexical calls without failing. The shared real-root comparison also stopped
  treating a directory named `..cache` as outside the root.
- **Files**: [`packages/core/src/lib/shared/contain-realpath.ts`, `packages/core/src/lib/shared/contain-realpath-boot.ts`, `packages/core/src/lib/scan/dip-violation.ts`, `packages/core/src/plugin/index.ts`, `plugins/audit/src/lib/services/audit-path-policy.service.ts`, `packages/core/tests/src/lib/shared/contain-realpath-sync.spec.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/audit/tests/src/lib/tools/audit-consolidate.tool.spec.ts`, `plugins/completion/src/index.ts`, `plugins/completion/tests/src/plugin-register.spec.ts`, `plugins/issues/src/index.ts`, `plugins/issues/src/lib/services/github-client-port.service.ts`, `plugins/issues/tests/index.spec.ts`, `plugins/issues/tests/src/lib/services/github-client-port.service.spec.ts`, `plugins/notification/src/index.ts`, `plugins/notification/tests/src/lib/notification.spec.ts`, `plugins/self-learning/src/index.ts`, `plugins/self-learning/tests/src/plugin-wiring.spec.ts`, `tools/scripts/lint/plugin-physical-containment.baseline.json`, `.github/SECURITY.md`]

Seven lexical resolutions remain, and they are not the reader/writer
cases S2 and S3 closed. Six sit in a plugin's `register(ctx)`, which is
synchronous and whose specs assert the refusal synchronously
(`expect(() => plugin.register(ctx)).toThrow(...)`); `realpathContained`
is async, so the physical check moved to the point of use instead — the
write itself is guarded, and the register-time call keeps only the
lexical check that rejects `../` and absolute escapes. The seventh is
`audit-consolidate.tool.ts`.

Closing this slice meant choosing between making the register path async
(changing every spec that asserts a synchronous throw) and recording these
six as the ratchet's permanent floor. A synchronous physical primitive made
both unnecessary.

- **Gate**: the S1 baseline reaches 0, or the acceptance is amended with
  the decision and the baseline pinned at the residual.

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
