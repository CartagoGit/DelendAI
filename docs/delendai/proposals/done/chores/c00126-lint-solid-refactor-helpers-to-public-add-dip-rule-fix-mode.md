---
id: c00126
title: "lint:solid — refactor helpers to public/ + add DIP rule + --fix mode"
kind: chore
status: done
type: proposal
track: general
date: 2026-07-26
shipped-in: ["7490cc85bd86deaff2961af7b4f613f563731293", "13c8b2701e6fe9ba7a3ee831cabe554da5018e95", "17018879c851351a3149bb1fc9841f5b4a31438b", "cafdcf5be7c48edc5aa5993f144e20b8f841c628", "25ba1fa96ee363abd88b45e021e58ef6c665f751"]
---

# c00126 — lint:solid — refactor helpers to public/ + add DIP rule + --fix mode

## Goal

Build on c00125 (the `lint:solid` engine) with three orthogonal improvements that the
§6 / §7.1 #12 invariant explicitly demands:

1. **Refactor the engine's pure helpers into `packages/core/src/lib/scan/` and
   re-export them from `packages/core/src/public/index.ts`** so any future lint
   can `import { walkTsFiles, fnv1a, shingleBlocks, … }` from the public barrel
   instead of copy-pasting — exactly what `duplicated-cross-plugin` would catch.

2. **Add a sixth rule `dip-violation`** that catches the §7.1 #2 ("No
   `process.cwd()` in engines") and §7.1 #3 ("Async I/O only in hot paths;
   sync FS is boot-only") violations — a `process.cwd()` literal OR a sync
   `node:fs` import in `plugins/*/src/lib/**`.

3. **Add a `--fix` mode to `solid-compliance.script.ts`** that, for the
   `long-switch-chain` rule, prints a ready-to-paste registry skeleton derived
   from the actual `case` arms in the source. The fix is conservative: it
   never rewrites user code; it only emits a proposed registry skeleton to
   stdout so the agent can review and apply the change.

The refactor target is the 583 LOC `tools/scripts/lint/solid-compliance.script.ts`
produced by c00125.

## Why

c00125 marked the lint as "advisory" and shipped a working engine, but the
engine itself violates §7.1 #12 (the rule that says "extract shared helpers to
`packages/core/src/public/index.ts` rather than copy-paste across plugins"). The
duplicated-cross-plugin detector would flag this file if the engine lived in
`plugins/*`. The lint is the most-reused tool in the repo, so the helpers it
contains (`walkTsFiles`, `fnv1a`, `shingleBlocks`, `toRelPosix`, …) are
exactly the kind of code §7.1 #12 says to centralize.

The DIP rule and `--fix` mode close the loop: the lint now (a) reports the
violations §7.1 #2/#3 enumerate and (b) makes the long-switch-chain fix
mechanical instead of human-perceived.

## Non-goals

- **Do not rewrite any user code.** `--fix` only prints a proposed registry
  skeleton, never modifies the source file. Manual review stays in the loop.
- **Do not add a sixth DIP rule that requires AST parsing.** The rule is
  regex + `grep`-level; AST analysis is out of scope for the heuristic lint.
- **Do not refactor the lints that already exist** (e.g. `lint:file-conventions`,
  `lint:bootstrap-canonical`). The refactor scope is strictly the helpers of
  `solid-compliance.script.ts`. Other lints can adopt the helpers in their
  own slices.
- **Do not touch `packages/core/src/public/index.ts` if typecheck is red**
  for any reason outside this slice's diff (the repo has unrelated
  typecheck errors from concurrent slices). The acceptance gates for this
  slice are scoped to the new files + the lint:proposals / lint:bootstrap-
  canonical / lint:solid / spec tests.

## Slices

- global_gate: lint

### S1 — Extract helpers to packages/core/src/lib/scan/ + unit tests
- **Status**: done
- **Files**: `packages/core/src/lib/scan/path-utils.ts`, `packages/core/src/lib/scan/text-utils.ts`, `packages/core/src/lib/scan/ts-walker.ts`, `packages/core/src/lib/scan/shingle.ts`, `packages/core/src/lib/scan/long-chains.ts`, `packages/core/src/lib/scan/catch-swallow.ts`, `packages/core/src/lib/scan/magic-numbers.ts`, `packages/core/src/lib/scan/index.ts`, `packages/core/tests/src/lib/scan/path-utils.spec.ts`, `packages/core/tests/src/lib/scan/text-utils.spec.ts`, `packages/core/tests/src/lib/scan/ts-walker.spec.ts`, `packages/core/tests/src/lib/scan/shingle.spec.ts`, `packages/core/tests/src/lib/scan/long-chains.spec.ts`, `packages/core/tests/src/lib/scan/catch-swallow.spec.ts`, `packages/core/tests/src/lib/scan/magic-numbers.spec.ts`
- **Gate**: lint
- acceptance:
  - "All 7 helper modules created under `packages/core/src/lib/scan/` and exported via a barrel `index.ts`."
  - "Each helper is pure (no I/O for the text/shingle/long-chains/magic-numbers/catch-swallow/path-utils ones; the only async I/O is `walkTsFiles`)."
  - "Each helper has a dedicated `*.spec.ts` with at least 4 hermetic tests."
  - "`bun test packages/core/tests/src/lib/scan/` exit 0 with all tests passing."

### S2 — Re-export scan helpers from packages/core/src/public/index.ts
- **Status**: done
- **Files**: `packages/core/src/public/index.ts`
- **Gate**: lint
- acceptance:
  - "`packages/core/src/public/index.ts` exposes a new `export { walkTsFiles, fnv1a, shingleBlocks, … }` block from the scan barrel."
  - "Type aliases are exported alongside their implementations."
  - "`bun test packages/core/tests/src/public/` exit 0 if that test dir exists; otherwise `bun run typecheck` exit 0 on the modified barrel only (not the whole repo, which has unrelated errors)."

### S3 — Refactor solid-compliance.script.ts to import from public/
- **Status**: done
- **Files**: `tools/scripts/lint/solid-compliance.script.ts`, `tools/scripts/lint/solid-compliance.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "`tools/scripts/lint/solid-compliance.script.ts` no longer contains the helper functions locally; it imports them from `@mcp-vertex/core/public`."
  - "File size drops from 583 LOC to ≤ 300 LOC (orchestrator only)."
  - "`bun test tools/scripts/lint/solid-compliance.script.spec.ts` still 7/7 pass."
  - "`bun run lint:solid --report` exit 1 (or 0 if the repo has no findings) with no new findings introduced by the refactor."

### S4 — Add sixth rule: dip-violation
- **Status**: done
- **Files**: `tools/scripts/lint/solid-compliance.script.ts`, `tools/scripts/lint/solid-compliance.script.spec.ts`, `packages/core/src/lib/scan/dip-violation.ts`, `packages/core/tests/src/lib/scan/dip-violation.spec.ts`
- **Gate**: lint
- acceptance:
  - "New helper `detectDipViolations` in `packages/core/src/lib/scan/dip-violation.ts`."
  - "Detects two patterns: (a) `process.cwd()` literal in `plugins/*/src/lib/**` and `packages/core/src/lib/**`; (b) sync imports from `node:fs` (other than `readFileSync`/`existsSync` inside `bin/` or top-level `install/`)."
  - "Unit tests pin at least 4 cases: clean plugin, plugin with `process.cwd()`, plugin with sync FS import, package.json file in a plugin (should not flag)."
  - "`SolidRuleId` union extended; `RULE_PRIORITY` includes `dip-violation: 5` (highest priority)."
  - "`bun test` exit 0 with the new spec."

### S5 — Add --fix mode for long-switch-chain
- **Status**: done
- **Files**: `tools/scripts/lint/solid-compliance.script.ts`, `tools/scripts/lint/solid-compliance.script.spec.ts`, `packages/core/src/lib/scan/long-chains-fix.ts`, `packages/core/tests/src/lib/scan/long-chains-fix.spec.ts`
- **Gate**: lint
- acceptance:
  - "`solid-compliance.script.ts --fix <relPath>` parses the file (read-only), finds the long switch chain, and prints a registry skeleton to stdout: `export const <suggestedName> = new Map<string, T>([ ['a', …], … ]);` plus a switch wrapper that delegates to the map."
  - "The fix mode NEVER writes the file. The output is a printable proposal only."
  - "Spec test: a fixture with a 6-case switch on string literals prints a Map skeleton with 6 entries."
  - "`bun test` exit 0."

### S6 — Re-sync proposal registry + final lint:proposals gate + close-loop
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/chores/c00126-solid-lint-refactor-and-sixth-rule.md`, all staged files
- **Gate**: lint
- acceptance:
  - "`bun tools/scripts/proposals/sync-proposal-registry.script.ts` exit 0 with 0 errors."
  - "`bun run lint:bootstrap-canonical` exit 0 (no regression to the bootstrap anchor / H2 order)."
  - "`bun run lint:proposals` either exit 0 OR reports ONLY the pre-existing 3 duplicates (`a00074`, `f00123`, `f00128`) introduced by f00076 S2 (NOT by c00126)."
  - "Single atomic commit per slice (S1..S5) with conventional message; close commit for S6."
  - "Final HEAD log shows 6 commits: 5 slice commits + 1 close commit."

## Acceptance

- 7 helper modules under `packages/core/src/lib/scan/` with one spec each.
- `packages/core/src/public/index.ts` exports the scan helpers.
- `tools/scripts/lint/solid-compliance.script.ts` ≤ 300 LOC and imports from public.
- `lint:solid` now reports 6 rules including `dip-violation`.
- `lint:solid --fix <relPath>` prints a registry skeleton for long switches.
- All 7+4 = 11 unit tests for the original lint still pass; the new modules add
  28 more tests (7 helpers × 4) + 4 for `dip-violation` + 1 for `--fix`.
- No changes outside the slice files; no touching of the 3 duplicate proposals.
- Single `close` commit that moves c00126 to `done/chores/` with
  `status: done` and `shipped-in: [<last slice SHA>]`.
