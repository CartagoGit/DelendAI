---
id: x00631
title: "The bootstrap carries no repository-wide count"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00631 — The bootstrap carries no repository-wide count

## goal

A commit leaves behind only what it staged, and no committed document
carries a number that every pull request changes.

## why

Measured on 2026-09-24. `AGENT-BOOTSTRAP.md` ended with a generated
"Quantitative facts" block: plugin, tool, spec and proposal counts plus a
timestamp. A pre-commit hook rewrote it on every commit that touched a
spec or plugin source, with `stage_fixed`, so:

- when the bootstrap was not staged, the hook left it modified after the
  commit, a change nobody asked for;
- when it was staged, the commit silently carried the rewritten block;
- the counts are over the whole repository, so, as x00569 found for the
  catalogue's `byStatus`, they have no per-branch answer: the committed
  block was stale on `develop` itself while every candidate carried a
  different one;
- the only gate comparing it, `check:quantitative`, ran in local
  `validate:run` and never in CI;
- it cost about 300 bytes of the bootstrap's 32,000-byte budget, in the
  one file whose own first rule is that live facts come from the server
  (`delendai_overview`), not from a list in a document.

The generator had grown two layers of workarounds (hold the timestamp
and the proposal line still "when nothing substantive moved") to keep
this from blocking pushes. They treated the symptom.

## why this design

- Remove the block and its section from the bootstrap.
- The generator keeps its uncommitted snapshot,
  `build/inspect/quantitative.json`, and prints it: useful to a person
  inspecting one checkout, and derived from nothing a branch owns.
- Remove the hook step that rewrote the document, the check that
  compared it, and the block-embedding code with its workarounds.

## non-goals

- Changing how the server counts anything; it counts live.

## Slices

- global_gate: none

### S1 — No generated count in the bootstrap

- **Status**: done
- **Gate**: `npx vitest run tools/scripts/gen/quantitative.script.spec.ts`
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`,
  `docs/delendai/DOCS-MANUAL-VS-GENERATED.md`,
  `lefthook.yml`,
  `package.json`,
  `tools/scripts/gen/quantitative.script.ts`,
  `tools/scripts/gen/quantitative.script.spec.ts`,
  `tools/scripts/lint/check-quantitative.script.ts`,
  `tools/scripts/lint/check-quantitative.script.spec.ts`

## acceptance

- A commit that touches a spec leaves the working tree as clean as the
  commit found it.
- `AGENT-BOOTSTRAP.md` has no `quantitative` block and is under budget
  with more headroom than before.
