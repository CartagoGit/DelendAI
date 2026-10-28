---
id: x00991
title: "A standing check is not a one-shot rename: the journal never silences it"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-28
last-transition-id: 86ecba88-5372-4804-87ed-f1e9b1bc3656
last-correlation-id: 86ecba88-5372-4804-87ed-f1e9b1bc3656
last-transition-from: ready
last-transition-at: 2026-10-28T19:08:08.251Z
---

# x00991 — A standing check is not a one-shot rename: the journal never silences it

## goal

A migration whose job is to make a workspace agree with its policy is asked on every boot, not once and never again. A setting that contradicts the profile — and that makes the server refuse to start — is removed by the tool that says which setting to remove, in every workspace, whether the tool has run there before or not.

## why

Observed live on 2026-10-28 in a project that consumes delendai. The project's `.cache/delendai/records/migrations-applied.json` read `["policyAlignmentMigrator:v1"]`, written at 07:09:34 — the minute its server first refused to start. The engine's rule is `if (applied.has(migration.id)) continue;`: a migration recorded once is skipped FOREVER. So the auto-heal x00989 S3 added — the one that removes the `push.branch` the refusal names — could never run in that workspace, and the setting had to be removed by hand.

The journal's contract is "this one-shot rename already happened". A rename is done when it is done: `mcp-vertex` becomes `delendai`, and that is a fact forever. But the policy-alignment migrator is not a rename. Its job is to answer a question about the workspace's CURRENT state: does this config still agree with the policy the same file declares? Both halves of that question are editable at any moment — the config is a file a person edits, and the profile it declares can change — so the answer can change after the migration ran. The journal answered "already done" for a question that had not been asked.

The failure mode is the worst of the two kinds. A rename that does not re-run leaves an old string in a file: cosmetic. A standing check that does not re-run leaves a SETTING THE BOOT REFUSES OVER: the server exits 1 on every start, the editor's MCP client restarts it in a loop, and the error names a remedy the tool is supposed to apply and cannot.

A controlled reproduction, on the same config with and without the journal entry: without it the migrator removes `plugins.commit-policy.options.push.branch` and the workspace starts; with it the migration is skipped, the setting survives, and the start refuses. The journal is the whole difference.

The engine has no way to express the difference today, because `IMigration` says what a migration does but not what kind of thing it is. Every migration is a one-shot by construction, and the one that is not has no way to say so.

## non-goals

- Not changing WHAT the policy-alignment migrator removes, nor the rule that decides what contradicts the profile: those are x00989 S3 and stay as they are.
- Not making every migration a standing check. The one-shot renames keep their journal skip: their steady-state cost (a read and a parse per file, per boot, forever) is what the skip buys, and their failure mode is cosmetic rather than fatal.
- Not changing the journal's file format, its location, or what the other migrations record.
- Not changing the refusal a policy contradiction produces: a policy that cannot be honoured still stops the start, with the same message and the same remedy.

## slices

- global_gate: lint

### S1 — The engine tells a standing check from a one-shot rename
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/workspace-migration.interface.ts`, `packages/core/src/lib/workspace-migration/legacy-migration.service.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration.service.spec.ts`
- **Gate**: lint
- acceptance:
  - "`IMigration` can declare that it is a standing check rather than a one-shot rename, and the engine never skips such a migration because its id is in the journal."
  - "A one-shot rename keeps the skip it has: a migration whose id is in the journal is not run again, and the second run of the whole route changes no byte."
  - "A standing check that has nothing to do reports no steps and changes no byte — it is asked, it answers, and it is quiet."
  - "A standing check that has something to do applies it, and the engine still stops at the first failure rather than stacking the next migration on an unfinished one."
  - "The dry run reports the standing check's steps as planned, exactly as it reports a one-shot rename's."
- shipped-in: `5fe3e9334`
- review-state: in_review
- review-implementer: minimax-m3.1-flash-preview

### S2 — The policy-alignment migrator is a standing check
- **Status**: review
- **Files**: `packages/core/src/lib/workspace-migration/migrators/policy-alignment.migrator.ts`, `packages/core/tests/src/lib/workspace-migration/policy-alignment.migrator.spec.ts`
- **Gate**: lint
- acceptance:
  - "The policy-alignment migrator is a standing check: a workspace whose journal already records it still has it asked, and a `push.branch` that contradicts the profile is removed."
  - "A `push.branch` naming the integration branch under a profile that reaches it through the forge is removed, keeping the file's comments, its key order and the rest of the push settings."
  - "A `push.branch` naming any other branch is left alone, exactly as before."
  - "A workspace whose config agrees with its profile is left byte-identical, on every boot."
- shipped-in: `5fe3e9334`
- review-state: in_review
- review-implementer: minimax-m3.1-flash-preview

## acceptance

- `IMigration` can declare that it is a standing check rather than a one-shot rename, and the engine never skips such a migration because its id is in the journal.
- A one-shot rename keeps the skip it has: a migration whose id is in the journal is not run again, and the second run of the whole route changes no byte.
- A standing check that has nothing to do reports no steps and changes no byte — it is asked, it answers, and it is quiet.
- A standing check that has something to do applies it, and the engine still stops at the first failure rather than stacking the next migration on an unfinished one.
- The dry run reports the standing check's steps as planned, exactly as it reports a one-shot rename's.
- The policy-alignment migrator is a standing check: a workspace whose journal already records it still has it asked, and a `push.branch` that contradicts the profile is removed.
- A `push.branch` naming the integration branch under a profile that reaches it through the forge is removed, keeping the file's comments, its key order and the rest of the push settings.
- A `push.branch` naming any other branch is left alone, exactly as before.
- A workspace whose config agrees with its profile is left byte-identical, on every boot.
