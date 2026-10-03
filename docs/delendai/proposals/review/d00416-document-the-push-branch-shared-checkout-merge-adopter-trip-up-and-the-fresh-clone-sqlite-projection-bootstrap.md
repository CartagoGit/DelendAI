---
id: d00416
title: "Document the push.branch × shared-checkout-merge adopter trip-up and the fresh-clone SQLite projection bootstrap"
kind: docs
status: review
type: proposal
track: adopter-experience
date: 2026-09-29
last-transition-id: fb6e5d9f-fd4a-4e83-b027-289c68ef8b8e
last-correlation-id: fb6e5d9f-fd4a-4e83-b027-289c68ef8b8e
last-transition-from: in-progress
---

# d00416 — Document the push.branch × shared-checkout-merge adopter trip-up and the fresh-clone SQLite projection bootstrap

## Goal

An adopter who picks `development.profile: shared-checkout-merge` AND names `plugins.commit-policy.options.push.branch: develop` in the same `delendai.config.json` is refused at boot with `[push-target-contradicts-policy]`. The error message is correct, but the trip-up recurs (real adopter: Beateam/logistics-app 2026-09-29) and no adopter-side doc names the contradiction up front, the rationale, or the two recovery paths. A second, independent adopter trip-up compounds it: a fresh clone with no `.cache/delendai/state/proposals.sqlite` boots `DEGRADED` with `state-database.corrupt` because the projection has never been built, and the remedy (`proposals_db_reconcile`) is not co-located with the policy error.

## why

Observed live on Beateam/logistics-app 2026-09-29: a single config file trips two unrelated blockers in the same boot, in this order: (1) the policy-alignment guard refuses to start because the profile says one thing and the plugin says another, (2) the proposals SQLite projection is absent because the projection is a rebuildable artefact, but the boot reconciliation treats its absence as `state-database.corrupt` and reports `phases NOT EXECUTED: forge, journal` rather than "expected, project it". The fix on the adopter's side is one line (remove `push.branch`) plus one tool call (`proposals_db_reconcile`), but neither is in an adopter doc. The first error's remedy is correct; the second error's remedy is not co-located with the first.

## non-goals

- Changing the policy-validation error message — it is already clear and self-contained (verified in `packages/core/src/lib/development-policy/validate.ts:294` and the existing test at `validate.spec.ts:289`).
- Changing `startup-reconciliation`'s decision to treat absent `proposals.sqlite` as DEGRADED — separate architectural choice in `packages/state` and `packages/proposals-sqlite`; would be a `feat`, not a `docs`.
- Backfilling the SQLite projection from a release artefact — the projection must stay a rebuildable derivative, not a checked-in or shipped binary.
- Re-touching the Beateam tree — that adopter's config is theirs to fix through their own workflow.

## Slices

- global_gate: none

### S1 — Add `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md` with the two trip-ups, the rationale and the recovery paths
- **Status**: done — verified 2026-09-30: `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`
  exists on `develop` (delivered by `db98793fb`, "docs(d00416): S1 — document the
  push.branch x shared-checkout-merge adopter trip-up and the fresh-clone SQLite
  projection bootstrap") and matches every acceptance bullet verbatim: Section 1
  names the `push.branch` × `shared-checkout-merge` contradiction with both
  recovery paths (drop `push.branch`, or switch to `shared-direct`) and cites
  `packages/core/src/lib/development-policy/validate.ts:294` /
  `validate.spec.ts:286`; Section 2 names `state-database.corrupt` on a fresh
  clone, explains the projection is rebuildable, and points at
  `proposals_db_reconcile`, citing `plugins/proposals/src/lib/services/db-doctor.ts:51`.
  This landed without the proposal's own status being updated — classic
  status-lag, corrected here.
- **Files**: `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`
- **Gate**: none
- acceptance:
  - "Page exists at `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`."
  - "Section 1 names the `push.branch` × `shared-checkout-merge` contradiction and the two recovery paths (drop `push.branch`, or switch profile to `shared-direct`)."
  - "Section 2 names the `state-database.corrupt`-on-fresh-clone behaviour, why the projection is rebuildable, and points at `proposals_db_reconcile` as the recovery."
  - "Each section cross-references the source it describes (with file:line of the validator and the projections' lifecycle section)."
- shipped-in: `db98793fb4558f1f71fd667be84e82d675ac1ff5`

### S2 — Link the new page from `docs/delendai/AGENT-BOOTSTRAP.md` and `docs/delendai/ADOPTER-SURFACE-MODE.md` so the next adopter finds it before they hit the error
- **Status**: review — 2026-09-30. Added one discoverable line to each file:
  `AGENT-BOOTSTRAP.md`'s "Cross-plugin configuration compatibility" section
  (the section that already talks about `delendai.config.json` validation
  diagnostics) now links `ADOPTER-CONFIG-FOOTGUNS.md`; `ADOPTER-SURFACE-MODE.md`'s
  intro (the page's own stated purpose is "gotchas that trip up first-time
  integrators") now links it too, naming both symptoms (boot refusal, fresh-clone
  corrupt-state) so a reader recognizes the trip-up before searching for it.
  Verified byte budget: `wc -c docs/delendai/AGENT-BOOTSTRAP.md` → 31,588 B,
  under the 32,000 B cap enforced by `bun run lint:prompt-size`
  (`tools/scripts/lint/system-prompt-size.script.ts`); the link added 137 B.
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`, `docs/delendai/ADOPTER-SURFACE-MODE.md`
- **Gate**: none
- acceptance:
  - "Both source files contain a discoverable link to `ADOPTER-CONFIG-FOOTGUNS.md`."
  - "The link is under a section that an adopter onboarding the project will read (config setup, not a contributor-only section)."
- shipped-in: `c104a2522e42`

## acceptance

- Page exists at `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`.
- Section 1 names the `push.branch` × `shared-checkout-merge` contradiction and the two recovery paths (drop `push.branch`, or switch profile to `shared-direct`).
- Section 2 names the `state-database.corrupt`-on-fresh-clone behaviour, why the projection is rebuildable, and points at `proposals_db_reconcile` as the recovery.
- Each section cross-references the source it describes (with file:line of the validator and the projections' lifecycle section).
- Both source files contain a discoverable link to `ADOPTER-CONFIG-FOOTGUNS.md`.
- The link is under a section that an adopter onboarding the project will read (config setup, not a contributor-only section).
