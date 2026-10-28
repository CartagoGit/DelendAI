---
id: x00987
title: "The security gate scans every tracked source file, in a fixed order"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-27
---

# x00987 — The security gate scans every tracked source file, in a fixed order

## goal

`verify:security` judges the whole checkout and the same checkout the same way on every machine: SAST reads every tracked source file but the tests, the secret scan reads every candidate file, and a known critical is gone from the code rather than parked in the baseline.

## why

On 2026-10-27 PR #1537 (a lockfile change) failed `verify-runtime` with a "new" critical in `packages/state-sqlite/src/lib/coordination-store.ts:110`, a file the branch did not touch, while develop passed the same gate and a local run on the PR head passed too. The SAST file list came from `detectStack`, whose walk stopped at 4,000 files in the order the filesystem listed them: locally it read 3,387 source files of 6,671 tracked, CI read a different subset, and each saw a different single critical. The secret scan capped its candidates at 5,000 of 6,543 and silently skipped the tail of `git ls-files`. A full scan finds five criticals: three are test fixtures written vulnerable on purpose, and two are statements built from constant table names or fixed clauses (`coordination-store.ts` and `roadmap-sqlite`'s timeline store).

The fix carries x00986 (and the qs pin of c00536 within it): every open PR, this one included, fails on the qs advisory and the shipped-rework lint until they land, and they fail this gate until it lands.

## non-goals

- Reporting the cap of the `security_secrets` / `security_sast` tools in their output; the tools keep their bounds, the gate drops them.
- A per-line suppression syntax for SAST.

## slices

- global_gate: type

### S1 — The stack walk lists every source file, in name order
- **Status**: pending
- **Files**: `plugins/security/src/lib/sast/stack-detect.ts`, `plugins/security/src/lib/sast/stack-detect.spec.ts`
- **Gate**: type
- acceptance:
  - "detectStack on a workspace of 4,100 source files lists all 4,100, sorted by path (stack-detect.spec.ts)."

### S2 — The gate reads every tracked file and its baseline is empty
- **Status**: pending
- **Files**: `tools/scripts/verify/security.script.ts`, `tools/scripts/verify/security.baseline.json`, `plugins/security/src/lib/secrets/run-scan.ts`, `plugins/security/src/public/index.ts`
- **Gate**: type
- acceptance:
  - "verify:security's SAST input is `git ls-files` minus test paths, and an empty listing fails the gate instead of passing it."
  - "The secret scan in the gate has no file cap."
  - "security.baseline.json holds no critical, and `bun run verify:security` passes."

### S3 — The flagged statements are written out in full
- **Status**: pending
- **Files**: `packages/state-sqlite/src/lib/contracts/constants/coordination.constant.ts`, `packages/state-sqlite/src/lib/coordination-store.ts`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `packages/roadmap-sqlite/src/lib/sqlite-timeline.store.ts`
- **Gate**: type
- acceptance:
  - "The full SAST scan reports no critical in packages/state-sqlite or packages/roadmap-sqlite (their statements name their tables and clauses in full); `bun run test:sqlite` and sqlite-timeline.store.spec.ts pass."

## acceptance

- detectStack on a workspace of 4,100 source files lists all 4,100, sorted by path (stack-detect.spec.ts).
- verify:security's SAST input is `git ls-files` minus test paths, and an empty listing fails the gate instead of passing it.
- The secret scan in the gate has no file cap.
- security.baseline.json holds no critical, and `bun run verify:security` passes.
- The full SAST scan reports no critical in packages/state-sqlite or packages/roadmap-sqlite (their statements name their tables and clauses in full); `bun run test:sqlite` and sqlite-timeline.store.spec.ts pass.
