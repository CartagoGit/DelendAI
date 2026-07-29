---
id: x00189
title: "a00083 — fix the broken `bun run validate` gate (the gate itself is red on a clean develop checkout)"
kind: fix
status: ready
type: proposal
track: tests+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
---

# x00189 — a00083 — fix the broken `bun run validate` gate (the gate itself is red on a clean develop checkout)

## Goal

Resolve finding F36 from a00083 (29-07-2026). `bun run validate` is the canonical close-time gate for every proposal in this repo. As of HEAD `7339fee8`, it exits **1** on a clean checkout:

- `packages/core/tests/src/lib/configuration-center/first-party-metadata.spec.ts` — fails with `TypeError: undefined is not an object (evaluating 'z.discriminatedUnion')` from `packages/core/src/lib/plugins/config-file-schema.ts#L38`.
- `packages/core/tests/src/lib/project/create-mcp-project.spec.ts` — multiple failures: `outputSchema` contract drift between `coreMetaTools.spec.ts`'s `description: 'waits briefly'` and the registered tool.
- 7 spec files with 0 tests: `plugins/external-mcps/tests/src/lib/{catalog,server-registry,plugin-composition,discover-gate,detect-rules,configuration-metadata,suggest-ack}.spec.ts`, `plugins/forge/tests/src/lib/services/forge.spec.ts`, `plugins/forge/tests/src/lib/tools/forge-write.tool.spec.ts`, plus 2 more.
- `solid-compliance`: **7,569 pre-existing findings** suppressed by `tools/scripts/lint/solid-compliance.baseline.json`.

This proposal restores the gate to green by:

1. Fixing the `z.discriminatedUnion` runtime error in `config-file-schema.ts`.
2. Aligning `create-mcp-project`'s tool registration with `coreMetaTools.spec.ts`.
3. Either deleting the 0-test spec files or filling them with their first real assertions.
4. Regenerating the `solid-compliance` baseline so the next audit starts from a known-clean line.

## why

Without this fix, **no proposal can be closed via the canonical gate** — every fix proposed by `x00183`–`x00188` either passes the gate (proving it works) or doesn't (proving it doesn't). The audit a00083 was supposed to use `bun run validate` as its baseline and instead documented its failure in Finding 36; that is a meta-finding about the gate itself. Every prior slice in `docs/mcp-vertex/proposals/done/fixes/` that claimed it "passed validate" must be re-verified after this lands.

## non-goals

- Replacing `solid-compliance` with a different linter. The fix only regenerates the baseline.
- Adding new lint rules. This proposal is a *repair*; new rules belong in a separate proposal.
- Touching the 2,774 tests that currently pass. The fix only addresses the failing / 0-test files.

## slices

### S1 — fix `z.discriminatedUnion` runtime
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `packages/core/src/lib/plugins/config-file-schema.ts#L38`.
- Either pin `zod` to a version that ships `discriminatedUnion` on the runtime path, or replace the call with `z.union([…])` if `discriminatedUnion` isn't loadable from the resolved import.
- **Acceptance**: `bun test packages/core/tests/src/lib/configuration-center/first-party-metadata.spec.ts` exits 0.

### S2 — align `create-mcp-project` tool registration
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `packages/core/src/lib/project/create-mcp-project.ts`.
- Reconcile the schema drift surfaced by `create-mcp-project.spec.ts`. Likely candidates: the test expects a tool description that the registration no longer matches; or vice-versa. Pin both sides to the same string.
- **Acceptance**: `bun test packages/core/tests/src/lib/project/create-mcp-project.spec.ts` exits 0.

### S3 — empty spec files
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- For each of the 7+ empty spec files (`plugins/external-mcps/...`, `plugins/forge/...`, etc.), either delete the file or add the first real spec.
- **Acceptance**: `bun run test` reports `0 spec files with 0 tests` for the workspace.

### S4 — regenerate `solid-compliance` baseline
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `tools/scripts/lint/solid-compliance.baseline.json`.
- Run `bun tools/scripts/lint/solid-compliance.script.ts --regenerate-baseline` against the cleaned tree; commit the updated baseline.
- **Acceptance**: `bun run lint:solid` exits 0 with no suppressed findings (or only findings that survived the s1–s3 fixes).

## Notes



- a00083 — full-project audit
- x00187 — separate proposal covering the **first** spec per zero-spec plugin (s3 above is a different angle: it deletes 0-test files or fills them minimally; `x00187` adds real coverage).

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
