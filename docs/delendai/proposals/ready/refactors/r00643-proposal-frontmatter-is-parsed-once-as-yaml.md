---
id: r00643
title: "Proposal frontmatter is parsed once, as YAML"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-25
priority: P1
related: [q00022, r00049, f00552]
---

# r00643 — Proposal frontmatter is parsed once, as YAML

## goal

Every reader of a proposal's frontmatter gets the same values, and they
are the values YAML says the file contains.

## why

Found while planning q00022 S4 phase 1 (the registry exported from the
database): the registry scan and the database reconciler read the same
files with different parsers, so their projections cannot agree by
construction. Measured on 2026-09-25 over the 1,019 proposal files:

- `packages/proposals-sqlite/src/lib/markdown-parser.ts` and
  `plugins/proposals/src/lib/proposals/frontmatter-parser.ts` each
  implement `parseFrontmatterBlock` by hand, and disagree on 161 files for
  `shipped-in` (an inline `["sha"]` becomes a string in one), 184 for
  `audit-source` (a nested map becomes `[]`), and on `contains`,
  `closureGate`, `slices`, `project-rules` and others.
- Against a real YAML parse (`yaml`, core schema), the plugin parser
  keeps YAML comments inside values: `shipped-in` in 283 files reads
  `"58ef6288 # feat(surface): …"`, `related` in 290. Consumers carry
  their own workaround (`proposal-state.ts` strips them). It turns flow
  maps (`- { id: x00246, kind: fix }`) into `null`.
- 30 files are not valid YAML at all (for example `- S1: 7cbb8cfb
  feat(x00152)`, a compact mapping with a colon in the value); the hand
  parsers accept them and each guesses differently.

(`plugins/issues` has its own `parseFrontmatterBlock` for issue files,
with a different result shape; it is out of scope.)

## why this design

- A real YAML parser, not a fourth hand-written one: the files are YAML
  by declaration, and every divergence above is a hand parser disagreeing
  with YAML.
- It lives in `@delendai/proposals-sqlite`, which both the reconciler and
  the proposals plugin already depend on, so `yaml` does not become a
  runtime dependency of the core (`core-runtime-deps`).
- The 30 invalid files are repaired as data first, so the switch changes
  no file's meaning silently; after it, an invalid frontmatter is a
  reported error (quarantine / registry `errors`), never a guess.

## non-goals

- The issues plugin's parser.
- Changing what any field means; only how it is read.

## architecture

`parseProposalFrontmatter(block)` in proposals-sqlite, on `yaml` with the
core schema; both `parseFrontmatterBlock` implementations become it. The
writer that serialises frontmatter is checked to round-trip through it.

## Slices

- global_gate: none

### S0 — The 30 frontmatters that are not YAML are repaired

- **Status**: pending
- **Gate**: `bun run lint:proposals`
- **Files**: the 30 proposal files the S0 scan lists — the literal list is recorded when the slice ships

A scan that parses every proposal frontmatter as YAML and fails on any
error, added to the proposals lint; each failing file is quoted or
restructured without changing its values.

### S1 — One parser, on YAML

- **Status**: pending
- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/markdown-parser.spec.ts`
- **Files**: `packages/proposals-sqlite/src/lib/markdown-parser.ts`,
  `packages/proposals-sqlite/package.json`,
  `plugins/proposals/src/lib/proposals/frontmatter-parser.ts`,
  `packages/proposals-sqlite/tests/src/lib/markdown-parser.spec.ts`

### S2 — The workarounds for the old parsers go

- **Status**: pending
- **Gate**: `npx vitest run --project proposals`
- **Files**: `plugins/proposals/src/lib/services/proposal-state.ts` — the full list is recorded when the slice ships

Comment stripping and similar repairs of parsed values, which a YAML
parse makes unnecessary.

## dependency graph

S0 → S1 → S2. q00022 S4 phase 1 depends on S1.

## acceptance

- Every proposal frontmatter parses as YAML; the proposals lint fails on
  one that does not.
- The reconciler and the registry scan produce the same value for every
  frontmatter key of every proposal (a differential spec over the tree).
- No consumer strips comments from parsed values.

## risks and mitigations

- **Values change for hundreds of files** (comments dropped, flow maps
  parsed). They change toward what the file says; the differential spec
  lists every change before the switch lands.

## notes

The measurement scripts are reproducible: parse each frontmatter block
with both `parseFrontmatterBlock` implementations and with
`yaml.parse(block, { schema: 'core' })`, and compare per key.
