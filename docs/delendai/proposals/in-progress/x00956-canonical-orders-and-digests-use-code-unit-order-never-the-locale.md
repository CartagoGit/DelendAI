---
id: x00956
title: "Canonical orders and digests use code-unit order, never the locale"
kind: fix
status: in-progress
type: proposal
track: state
date: 2026-10-23
last-transition-id: b9f4200b-faac-449c-a62f-3e80811c194d
last-correlation-id: b9f4200b-faac-449c-a62f-3e80811c194d
last-transition-from: review
last-transition-at: 2026-11-02T13:32:00.177Z
shipped-in:
  - "3409efa5b15f"
  - "1e088923ac3d96ab526931b4fb90e35e86a3c721"
---

# x00956 — Canonical orders and digests use code-unit order, never the locale

## goal

Every sort that feeds a canonical hash, digest or projection orders strings by code unit with a total comparator, so the same state hashes the same on every machine and in every insertion order.

## why

The forward sync of 0.2.2 (#1425) failed the required sqlite-cutover-ready check: the property 'incremental ≡ clean rebuild' found the counterexample keys U+19D2 and U+0C7D, for which localeCompare returns 0 both ways. A comparator that ties two distinct keys leaves their order to the input, and the incremental and rebuild paths feed different orders, so the digests differ. The same localeCompare orders production canonical data: sqlite-driver.ts registry-state hash (generation ids), proposals-sqlite's logical digest and markdown reconciler (uid, path), context-compiler's stable ref order, and the telemetry projector's slice and work-item order. localeCompare also depends on the machine's locale and ICU data, so a digest can differ between two hosts with the same state.

## non-goals

- Display ordering for people, where locale order is right.
- Changing what the digests cover.

## slices

- global_gate: type

### S1 — One code-unit comparator, used by the state engine and its property
- **Status**: done
- **Files**: `packages/state/src/lib/util/compare-code-units.helper.ts`, `packages/state/src/index.ts`, `packages/state/tests/src/lib/util/compare-code-units.helper.spec.ts`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `packages/state-sqlite/src/lib/sqlite-driver.spec.ts`, `packages/state/tests/src/contract/equivalence-property.helper.ts`
- **Gate**: type
- acceptance:
  - "compareCodeUnits orders by UTF-16 code unit and returns 0 only for equal strings; a spec covers the U+19D2/U+0C7D pair."
  - "The registry-state hash and the property's producers sort with it; the property passes with the recorded seed -1973392993 and the shrunk counterexample as a fixed case."
- shipped-in: `4ad050e699e2`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 1e088923ac3d, validate exit 0 and tests 13/13 claimed, no recorded run cited; acceptance 2/2: (1) compare-code-units.helper.spec covers the tie pair and equality/antisymmetry; passes (2) sqlite-driver.ts:914 sorts with compareCodeUnits; equivalence-property.helper.ts has the shrunk U+19D2/U+0C7D case with seed -1973392993 as a fixed case; sqlit… — ran specs

### S2 — Digests and projections elsewhere
- **Status**: review
- **Files**: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/scripts/gen-capabilities.ts`, `apps/web/scripts/gen-pages.ts`, `apps/web/scripts/gen-skills.ts`, `bun.lock`, `docs/delendai/CORE-PUBLIC-API-INVENTORY.md`, `packages/cli/src/lib/stable-json.service.ts`, `packages/core/src/lib/adopt/adopt-project.tool.ts`, `packages/core/src/lib/adopt/project-profile.service.ts`, `packages/core/src/lib/error-collection/collector.service.ts`, `packages/core/src/lib/plugins/plugin-availability-record.service.ts`, `packages/core/src/lib/transactions/plan.ts`, `packages/core/src/lib/work-units/work-event-journal.service.ts`, `packages/core/src/lib/workspace-migration/config-transitions.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.service.spec.ts`, `packages/test-kit/AGENT.md`, `packages/test-kit/package.json`, `packages/test-kit/src/lib/fixtures/legacy-workspace/index.ts`, `plugins/agent-orchestrator/src/lib/telemetry/decision-receipt.ts`, `plugins/completion/AGENT.md`, `plugins/completion/package.json`, `plugins/completion/src/lib/completion-store.service.ts`, `plugins/orchestrator-runner/AGENT.md`, `plugins/orchestrator-runner/package.json`, `plugins/orchestrator-runner/src/lib/services/invocation-journal.service.ts`, `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`, `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal-document.tool.ts`, `plugins/proposals/src/lib/tools/proposal-work-events.ts`, `plugins/search/AGENT.md`, `plugins/search/package.json`, `plugins/search/src/lib/embed/embed-pipeline.ts`, `plugins/search/src/lib/embed/index-store.ts`, `plugins/usage-tracking/AGENT.md`, `plugins/usage-tracking/package.json`, `plugins/usage-tracking/src/lib/services/usage-rollup.service.ts`, `tools/scripts/ci/zone-reads.script.ts`, `tools/scripts/compile/build.script.ts`, `tools/scripts/generate/from-manifests.script.ts`, `tools/scripts/generate/managed-lazy-catalog.script.ts`, `tools/scripts/inspect/core-public-inventory.script.ts`, `tools/scripts/lint/biome-baseline.script.ts`, `tools/scripts/lint/cache-layout-ratchet.script.ts`, `tools/scripts/lint/closed-frozen-guard.script.ts`, `tools/scripts/lint/core-version-pin.script.ts`, `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/file-conventions.script.ts`, `tools/scripts/lint/no-dead-modules.script.ts`, `tools/scripts/lint/no-duplicate-implementation.script.ts`, `tools/scripts/lint/no-locale-order-in-canonical.script.spec.ts`, `tools/scripts/lint/no-locale-order-in-canonical.script.ts`, `tools/scripts/lint/no-proposal-id-comments-in-source.script.ts`, `tools/scripts/lint/platform-reads.script.ts`, `tools/scripts/lint/proposal-filename-canonical.script.ts`, `tools/scripts/lint/proposal-ready-to-close.script.ts`, `tools/scripts/lint/token-budget-ceiling-ratchet.script.ts`, `tools/scripts/proposals/sync-proposal-counters.script.ts`, `tools/scripts/publish/workspace-deps.ts`, `tools/scripts/typecheck.script.ts`, `tools/scripts/types/generate-tool-types.script.ts`, `tools/scripts/build/stable-manifest.script.ts`
- **Gate**: type
- acceptance:
  - "Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders."
  - "A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order."
- shipped-in: `3409efa5b15f`
- review-state: in_review
- review-implementer: claude-opus-5-5
- review-log: requested_changes by claude-sonnet-5-5 — Code is converted everywhere and the lint (wired into lint:architecture, 153 files clean) plus its spec pass. But criterion 1 asks for a spec per package showing two localeCompare-tie keys ordered the same in both insertion orders: only proposals-sqlite digest.spec was added; context-compiler (context-compiler.ts), state-telemetry (progress-weighting, work-progress-snapshot) and reconciler-markdown have no such spec.
- review-log: requested_changes by minimax-m3.1-flash-preview — Two things the criterion asks for are still missing. First, the tie-order spec per package: the telemetry work-item order has none. work-progress-snapshot.service.ts:134 sorts rows by work item id with the comparator, but its spec 'orders rows by work item id whatever order events arrive in' (work-progress-snapshot.service.spec.ts:52) uses the ascii ids p/S1 and p/S2, which localeCompare does not tie, and no spec in packages/state-telemetry uses a localeCompare-tied pair such as the U+19D2 and U+0C7D pair. progress-weighting.service.spec.ts:73-92 does use canonically equivalent ids but asserts only that the aggregate is identical across the six permutations, never that the order is the same. The earlier reviewer's requested changes named exactly these two files (progress-weighting and work-progress-snapshot), and the rework commit 3409efa5b15f added the context-compiler and reconciler-markdown specs but not this one. What must hold: a spec that first asserts localeCompare is 0 for its pair and then asserts the identical order for both insertion orders, for the work-item sort. Second, the second branch of the lint criterion: no-locale-order-in-canonical.script.ts:13-19 hard-codes the canonical roots as five package roots, so a canonical sort outside them is invisible to the lint, and the proposal lists no inventory of the remaining uses with why they are display order - for instance plugins/search/src/lib/embed/index-store.ts:65, where the embed index is ordered by hash with localeCompare and that serialisation is canonical, and packages/cli/src/lib/stable-json.service.ts:6. What must hold: either a list that names every remaining localeCompare site with why it is display order, or a lint scope that covers the canonical producers outside those five roots. The first half of the criterion is met: every canonical sort uses the comparator, the lint is wired into lint:architecture and reports '154 files order with code units' (exit 0), and the proposals-sqlite and context-compiler tie specs are green.

## acceptance

- compareCodeUnits orders by UTF-16 code unit and returns 0 only for equal strings; a spec covers the U+19D2/U+0C7D pair.
- The registry-state hash and the property's producers sort with it; the property passes with the recorded seed -1973392993 and the shrunk counterexample as a fixed case.
- Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders.
- A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order.

## notes

- Rework of S2, 2026-11-02, for both requested changes. The telemetry work-item order has its tie spec: it asserts localeCompare is 0 for U+19D2/U+0C7D, then the same row order for both insertion orders. The lint now scans every source root: the five state packages as a whole and, anywhere else, a file that hashes (`createHash`, `.digest(`), a stable serialiser, or one that writes what it serialised with `JSON.stringify`. It found 44 files the five roots missed, the embed index and `stable-json.service.ts` among them; each now sorts with `compareCodeUnits`, and the six packages that lacked it declare `@delendai/state`. Core's public surface was not used for this: its budget is full (423/423). Every remaining localeCompare is in code that neither hashes nor writes a serialised file, so it is display order.
- S2, reopened 2026-11-02: the lint walked the source folders and skipped every folder named `build`, so it never scanned `tools/scripts/build/` (the stable manifest's order check sorted by locale), and a walk beside a proof's running specs could read a file that vanished. It now reads the tracked sources from `git ls-files`, in 0.12 s, and holds 383 files.
