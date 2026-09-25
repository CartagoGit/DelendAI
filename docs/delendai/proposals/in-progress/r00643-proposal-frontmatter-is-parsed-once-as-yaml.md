---
id: r00643
title: "Proposal frontmatter is parsed once, as YAML"
kind: refactor
status: in-progress
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

### S0 — The frontmatters that are not YAML are repaired

- **Status**: review
- **Gate**: `bun tools/scripts/lint/proposal-frontmatter-yaml.script.ts`
- **Files**: `tools/scripts/lint/proposal-frontmatter-yaml.script.ts`,
  `tools/scripts/lint/proposal-frontmatter-yaml.script.spec.ts`,
  `package.json`,
  `docs/delendai/proposals/done/chores/c00089-lean-activation-and-full-preset-context-budgets.md`,
  `docs/delendai/proposals/done/chores/c00135-separar-dashboards-adaptive-vs-native.md`,
  `docs/delendai/proposals/done/chores/c00137-lint-de-capabilities-no-declaradas.md`,
  `docs/delendai/proposals/done/chores/c00138-affected-ci-grafo-de-dependencias-filtro.md`,
  `docs/delendai/proposals/done/chores/c00139-tier-1-2-3-jobs-feedback-1-min-pr-merge-nightly.md`,
  `docs/delendai/proposals/done/chores/c00140-generar-datos-cuantitativos-plugin-count-tool-count-etc.md`,
  `docs/delendai/proposals/done/chores/c00141-eliminar-comentarios-fnnnnn-del-source.md`,
  `docs/delendai/proposals/done/chores/c00143-idempotency-keys-para-mutaciones-propagacion.md`,
  `docs/delendai/proposals/done/chores/c00160-auto-seleccion-de-subagentes-invocacion-bajo-presupuesto-cierre-end-to-end-del-routing-llm-en-delendai.md`,
  `docs/delendai/proposals/done/chores/c00527-anexo-q00021-f00513-inventario-historico-de-cache-layout-epochs-1-9.md`,
  `docs/delendai/proposals/done/feats/f00102-shared-ui-source-of-truth-one-ts-scss-pair-per-reusable-component-consumed-by-site-and-editor.md`,
  `docs/delendai/proposals/done/feats/f00120-project-plugin-generator-wiring-doctor-turn-a-project-or-part-of-it-into-a-fully-wired-mcp-vertex-plugin-automatically.md`,
  `docs/delendai/proposals/done/feats/f00144-session-hygiene-observability-and-advisory-alerts.md`,
  `docs/delendai/proposals/done/feats/f00145-host-lifecycle-checkpoint-adapters.md`,
  `docs/delendai/proposals/done/fixes/x00072-sec-001-workspace-trust-aprobacion-de-comando-para-la-extension-vs-code.md`,
  `docs/delendai/proposals/done/fixes/x00152-rel-001-publicar-exactamente-los-tarballs-verificados-rewrite-workspace-compartido.md`,
  `docs/delendai/proposals/done/fixes/x00419-stderr-como-bucle-de-reparacion-legible-por-agentes-las-tormentas-de-commit-policy-se-consumen-desde-auto-work.md`

`proposal-frontmatter-yaml` (chained into `lint:proposals`) fails on any
frontmatter outside `legacy/` that YAML refuses. The 17 such files in
`done/` are repaired; for each, the plugin parser's reading was compared
before and after. Nine read the same (a value quoted, a duplicate key
dropped keeping the later one, which is what both parsers already read,
a whole list item quoted). Eight now read what the file always meant and
YAML reads: in the seven `c001xx` audit chores `section` and `sha256` had
drifted below `shipped-in` and are back under `audit-source`, where the
plugin parser had dropped them; c00527's `related` list was indented with
tabs and read as `null`.

The 13 invalid files under `legacy/closed/` are not edited: that folder
is frozen by hash (`closed-frozen-guard`). S1 has to read them anyway,
so it keeps a tolerant fallback for a frontmatter YAML refuses, reported
as an error rather than guessed silently.

### S1 — One parser, on YAML

- **Status**: review
- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/frontmatter.spec.ts`
- **Files**: `packages/proposals-sqlite/src/lib/frontmatter.helper.ts`,
  `packages/proposals-sqlite/src/lib/frontmatter-loose.helper.ts`,
  `packages/proposals-sqlite/src/lib/contracts/interfaces/frontmatter.interface.ts`,
  `packages/proposals-sqlite/src/lib/markdown-parser.ts`,
  `packages/proposals-sqlite/src/index.ts`,
  `packages/proposals-sqlite/package.json`, `bun.lock`,
  `plugins/proposals/src/lib/proposals/frontmatter-parser.ts`,
  `packages/proposals-sqlite/tests/src/lib/frontmatter.helper.spec.ts`,
  `plugins/proposals/tests/src/lib/proposals/blocked-by.spec.ts`

`parseProposalFrontmatter` (proposals-sqlite, on `yaml` with the core
schema) is the one reader; the reconciler's `parseFrontmatterBlock` and
the plugin's `frontmatter-parser.ts` both resolve to it. A block YAML
refuses is read by the plugin's former hand parser, moved into
proposals-sqlite as `parseLooseFrontmatter`, and the refusal is returned
beside the values; outside `legacy/` the S0 lint already refuses such a
block.

What changes, measured over the proposals outside `legacy/`: 428 lists
and 2 values lose the YAML comments the hand parser kept inside them, 37
inline `shipped-in` arrays are arrays instead of strings, 45
`closed-evidence` lists read their `a: b` items as maps (nothing in the
code reads that field), and 17 plans' `contains` mapping is read at all.
Five of those plans are active (q00009, q00010, q00011, q00020, q00021):
the hand parser read their `contains` as `{ proposals: null }`, so the
plan-closure gate and `blockedByFor` saw no children and a plan could
close before its 4 to 48 children were done. A test that had pinned this
as a known gap since 2026-06-23 now asserts the children.

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
