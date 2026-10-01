---
id: x00799
title: "Every derived file merges without a conflict and is recomputed by the queue"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-01
---

# x00799 — Every derived file merges without a conflict and is recomputed by the queue

## Goal

Two branches that each add a proposal, an export, a tool or a guide merge into develop without a conflict on any derived file, and a branch brought forward by the queue is never left with a stale one.

## why

Measured on 2026-10-01 over PRs 689, 691, 692/696, 700/705: each needed two or three re-merge rounds on the inventory, the docs index, the agent catalog, TOKEN-BUDGETS.md, preset-metadata.generated.ts and the plugins' tool-outputs.ts. x00559 and x00576 built a merge driver but routed only the files that existed then; every generator added since sits outside the table and nothing fails when a generator is added without a route. The driver also regenerated inside the merge, where git has not yet written THEIRS into the tree (measured with a driver that lists a directory: it saw only OURS), so it produced a file from half a tree; and it kept OURS whole, so for a hand-written file with a generated region (the docs index) it dropped THEIRS' prose. Its bootstrap rule pointed at a block that no longer exists. And gen:all, which the queue's refresh runs after merging, does not run docs:index or types:generate, so the refresh returns those two stale.

## options considered

- **Merge driver only.** Necessary, not sufficient: git runs a driver while the tree is half merged, so it can end the conflict but cannot make the file true. Adopted, reduced to that job, and completed to every generator.
- **Deterministic generation.** Already the case where it mattered: preset-metadata and the stable manifest keep their timestamp unless the content moves, and `lint:generated-determinism` runs every generator twice. Nothing to change.
- **Not committing the artefacts.** Rejected (non-goal): people, the web app, the build and the drift guards read them from git.
- **Regenerate in the queue.** Exists (refresh-candidate-artifacts runs gen:all after merging; hydrate triggers it). It left docs-index and tool-types stale because gen:all did not run them, and a merge made by hand got only the catalog regenerated, and not even that: the post-merge commit was refused by git (`cannot do a partial commit during a merge`) because post-merge runs while MERGE_HEAD exists.

## decision

Three layers, each with one job. The drift guards are untouched: a source change without regeneration still fails `gen:all --check` and `check:generated`.

1. **The driver ends the conflict, never invents content.** It merges the text three ways; if that conflicts it keeps OURS, and for a file with a generated region it merges the authored text for real and keeps OURS inside the region. A conflict in authored text still stands. Every `gen:all` step is routed; a spec fails when a step has no rule, a rule names no step, `.gitattributes` and the rules differ, or the post-merge refresh paths differ from the routed files.
2. **The post-merge refresh makes the result true.** It runs `gen:all` (was: the catalog only) over every generated path and commits what moved, including while the merge is still open (scratch index plus a ref move that the reference-transaction guard still judges). A fast-forward is skipped.
3. **`gen:all` is the one list.** `docs-index` and `tool-types` join it, so the queue's refresh and `check:generated` cover them with nothing else to edit.

## limits

- The forge computes the PR merge ref itself and cannot run a driver. A PR whose files merge textually but are semantically stale still goes red; x00655 regenerates such a candidate and the refresh now includes the two generators it missed.
- The driver is configured per clone (`delendai guard install`); an unconfigured clone behaves as before.

## non-goals

- Committing fewer artefacts: the docs, the typed tool outputs and the inventory are read from git by people, the web app and the build.
- Changing any generator's output bytes.
- Making the forge's own merge ref run a driver: it cannot, which is why the queue regenerates.

## Slices

- global_gate: none

### S1 — Every gen:all step is routed to the driver, block files merge their prose, and gen:all covers docs:index and types:generate
- **Status**: pending
- **Files**: `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/contracts/constants/generated-refresh.constant.ts`, `packages/cli/src/lib/generated-refresh.service.ts`, `packages/cli/src/lib/generated-refresh.service.spec.ts`, `tools/scripts/git/generated-merge-driver.constant.ts`, `tools/scripts/git/generated-merge-driver.interface.ts`, `tools/scripts/git/generated-merge-driver.script.ts`, `tools/scripts/git/generated-merge-driver.script.spec.ts`, `tools/scripts/gen-all.script.ts`, `tools/scripts/gen-all.spec.ts`, `.gitattributes`
- **Gate**: none

## acceptance

- Two branches that each add a guide and a proposal merge with no conflict and no manual step: the driver ends the conflicts and the post-merge refresh commits the regenerated index and catalog (shown in a scratch repository with the real generators).
- `gen:all` runs `docs-index` and `tool-types`; every step is routed by a rule.
- A conflict in the authored text of a README stays a conflict.
- The refresh commits during an open merge.
