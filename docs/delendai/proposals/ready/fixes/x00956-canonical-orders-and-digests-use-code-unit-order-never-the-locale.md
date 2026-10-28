---
id: x00956
title: "Canonical orders and digests use code-unit order, never the locale"
kind: fix
status: ready
type: proposal
track: state
date: 2026-10-23
last-transition-id: d70026c6-b00d-44b5-b8a1-773d72b35934
last-correlation-id: d70026c6-b00d-44b5-b8a1-773d72b35934
last-transition-from: review
last-transition-at: 2026-10-28T08:25:30.463Z
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
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/repository/digest.ts`, `packages/proposals-sqlite/src/lib/reconciler-markdown.ts`, `packages/context-compiler/src/lib/context-compiler.ts`, `packages/state-telemetry/src/lib/projector/progress-weighting.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.service.ts`, `packages/proposals-sqlite/tests/src/lib/repository/digest.spec.ts`, `tools/scripts/lint/no-locale-order-in-canonical.script.ts`, `tools/scripts/lint/no-locale-order-in-canonical.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders."
  - "A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order."
- shipped-in: `3409efa5b15f`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: requested_changes by claude-sonnet-5-5 — Code is converted everywhere and the lint (wired into lint:architecture, 153 files clean) plus its spec pass. But criterion 1 asks for a spec per package showing two localeCompare-tie keys ordered the same in both insertion orders: only proposals-sqlite digest.spec was added; context-compiler (context-compiler.ts), state-telemetry (progress-weighting, work-progress-snapshot) and reconciler-markdown have no such spec.
- review-log: requested_changes by minimax-m3.1-flash-preview — Two things the criterion asks for are still missing. First, the tie-order spec per package: the telemetry work-item order has none. work-progress-snapshot.service.ts:134 sorts rows by work item id with the comparator, but its spec 'orders rows by work item id whatever order events arrive in' (work-progress-snapshot.service.spec.ts:52) uses the ascii ids p/S1 and p/S2, which localeCompare does not tie, and no spec in packages/state-telemetry uses a localeCompare-tied pair such as the U+19D2 and U+0C7D pair. progress-weighting.service.spec.ts:73-92 does use canonically equivalent ids but asserts only that the aggregate is identical across the six permutations, never that the order is the same. The earlier reviewer's requested changes named exactly these two files (progress-weighting and work-progress-snapshot), and the rework commit 3409efa5b15f added the context-compiler and reconciler-markdown specs but not this one. What must hold: a spec that first asserts localeCompare is 0 for its pair and then asserts the identical order for both insertion orders, for the work-item sort. Second, the second branch of the lint criterion: no-locale-order-in-canonical.script.ts:13-19 hard-codes the canonical roots as five package roots, so a canonical sort outside them is invisible to the lint, and the proposal lists no inventory of the remaining uses with why they are display order - for instance plugins/search/src/lib/embed/index-store.ts:65, where the embed index is ordered by hash with localeCompare and that serialisation is canonical, and packages/cli/src/lib/stable-json.service.ts:6. What must hold: either a list that names every remaining localeCompare site with why it is display order, or a lint scope that covers the canonical producers outside those five roots. The first half of the criterion is met: every canonical sort uses the comparator, the lint is wired into lint:architecture and reports '154 files order with code units' (exit 0), and the proposals-sqlite and context-compiler tie specs are green.

## acceptance

- compareCodeUnits orders by UTF-16 code unit and returns 0 only for equal strings; a spec covers the U+19D2/U+0C7D pair.
- The registry-state hash and the property's producers sort with it; the property passes with the recorded seed -1973392993 and the shrunk counterexample as a fixed case.
- Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders.
- A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order.
