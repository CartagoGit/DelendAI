---
id: x00956
title: "Canonical orders and digests use code-unit order, never the locale"
kind: fix
status: ready
type: proposal
track: state
date: 2026-10-23
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
- **Status**: pending
- **Files**: `packages/state/src/lib/util/compare-code-units.helper.ts`, `packages/state/tests/src/lib/util/compare-code-units.helper.spec.ts`, `packages/state-sqlite/src/lib/sqlite-driver.ts`, `packages/state-sqlite/src/lib/sqlite-driver.spec.ts`, `packages/state/tests/src/contract/equivalence-property.helper.ts`
- **Gate**: type
- acceptance:
  - "compareCodeUnits orders by UTF-16 code unit and returns 0 only for equal strings; a spec covers the U+19D2/U+0C7D pair."
  - "The registry-state hash and the property's producers sort with it; the property passes with the recorded seed -1973392993 and the shrunk counterexample as a fixed case."

### S2 — Digests and projections elsewhere
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/repository/digest.ts`, `packages/proposals-sqlite/src/lib/reconciler-markdown.ts`, `packages/context-compiler/src/lib/context-compiler.ts`, `packages/state-telemetry/src/lib/projector/progress-weighting.service.ts`, `packages/state-telemetry/src/lib/projector/work-progress-snapshot.service.ts`
- **Gate**: type
- acceptance:
  - "Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders."
  - "A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order."

## acceptance

- compareCodeUnits orders by UTF-16 code unit and returns 0 only for equal strings; a spec covers the U+19D2/U+0C7D pair.
- The registry-state hash and the property's producers sort with it; the property passes with the recorded seed -1973392993 and the shrunk counterexample as a fixed case.
- Each sort uses the code-unit comparator; a spec per package shows two keys localeCompare ties ordered the same in both insertion orders.
- A lint fails on localeCompare inside a function that returns or feeds a digest or canonical hash, or the remaining uses are listed with why they are display order.
