---
id: f00114
title: "Proposal-ID prefix taxonomy as a Zod enum — promoted from f00050 S-G"
kind: feat
status: done
type: proposal
track: proposals+lint
date: 2026-07-14
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing f00114 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - aae0b627 # fix(proposals): reclassify l00001 → r00013 (refactor) — f00114 overcorrection
  - d10ee02b # feat(proposals): f00114 — prefix taxonomy as executable Zod schema + tree drift 
  - 464bce29 # feat(proposals): promote f00050 S-D and S-G — triggers fired by owner decision (
---

# f00114 — Proposal-ID prefix taxonomy as a Zod enum — promoted from f00050 S-G

## Goal

Fix the proposal-ID prefix taxonomy as executable schema instead of prose: a Zod enum derived from PROPOSAL_KINDS (single source), an id-pattern schema that validates prefix↔kind coherence, both exported from the proposals plugin's public barrel, and a repo-wide verification that every existing proposal id resolves to a valid prefix with an unchanged index. Trigger fired 2026-07-14: the user (project owner) decided the current taxonomy (f/x/r/c/d/t/l/a/n + q + legacy alias p) is the agreed one — that is the community-decision precondition of f00050 S-G.

## why

Parked non-goal S-G of f00049 (via f00050). Today the taxonomy lives as typed constants (PROPOSAL_PREFIX_BY_KIND / PROPOSAL_KIND_BY_PREFIX) plus prose in f00049 S9, but nothing validates a frontmatter `kind:` string or an `id:` prefix at parse time with a Zod schema, so an invalid kind flows through as `kind?: string`. DEVIATION recorded per the pre-flight re-scan: the parked block said "exported from @mcp-vertex/core", but proposal vocabulary in the core would violate AGENTS.md rule #1 (core agnostic) and invert the core→plugin dependency; the enum is exported from @mcp-vertex/proposals' public barrel instead.

## non-goals

- No renumbering of historical ids (that is f00050 S-F, still parked).
- No new prefixes and no fusion of existing ones — the enum encodes the CURRENT taxonomy exactly, including the retired `p` alias for legacy reads.
- No file moves or frontmatter rewrites unless a proposal is found invalid (expected: zero — the migration is a verification pass).

## Slices

- global_gate: e2e

### S1 — Zod enum + id schema derived from PROPOSAL_KINDS, exported from the plugin barrel
- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/schemas/proposal-kind.schema.ts`, `plugins/proposals/src/public/index.ts`, `plugins/proposals/tests/src/lib/contracts/schemas/proposal-kind.schema.spec.ts`
- **Gate**: e2e
- acceptance:
  - "proposalKindSchema = z.enum(Object.keys(PROPOSAL_KINDS)) — derived, not duplicated; proposalIdSchema validates /^[a-z]\d{5}$/ AND that the letter is a known prefix (q and l included, p accepted read-only as legacy alias)."
  - "kindMatchesId(kind, id) helper returns a structured mismatch reason; exported from the public barrel."
  - "Spec: every kind round-trips kind→prefix→kind; invalid prefix 'z00001' and mismatched pair (kind: feat, id: x00001) are rejected with the reason."

### S2 — Enforce at the seams: document parse + authoring validate against the schema
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`
- **Gate**: e2e
- acceptance:
  - "proposal-document frontmatter parse validates kind (when present) against proposalKindSchema and id against proposalIdSchema, surfacing a structured lint issue instead of a silent pass-through."
  - "create_proposal rejects an explicit id whose prefix mismatches kind using kindMatchesId (replacing/absorbing any ad-hoc check)."
  - "Existing specs stay green — behaviour-preserving for valid inputs."

### S3 — Repo-wide verification pass (the 'migration' proves itself a no-op)
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/tests/src/lib/proposals/prefix-taxonomy-verification.spec.ts`
- **Gate**: e2e
- acceptance:
  - "A spec walks docs/mcp-vertex/proposals/**/*.md via the real store, asserts every id parses under proposalIdSchema and every kind↔prefix pair is coherent; failures list the offending files."
  - "Per the parked gate: bun run lint:proposals exits 0, proposal count before == after, index.json regenerates identically (sync_proposals reports changed: false on a second run)."

## acceptance

- proposalKindSchema = z.enum(Object.keys(PROPOSAL_KINDS)) — derived, not duplicated; proposalIdSchema validates /^[a-z]\d{5}$/ AND that the letter is a known prefix (q and l included, p accepted read-only as legacy alias).
- kindMatchesId(kind, id) helper returns a structured mismatch reason; exported from the public barrel.
- Spec: every kind round-trips kind→prefix→kind; invalid prefix 'z00001' and mismatched pair (kind: feat, id: x00001) are rejected with the reason.
- proposal-document frontmatter parse validates kind (when present) against proposalKindSchema and id against proposalIdSchema, surfacing a structured lint issue instead of a silent pass-through.
- create_proposal rejects an explicit id whose prefix mismatches kind using kindMatchesId (replacing/absorbing any ad-hoc check).
- Existing specs stay green — behaviour-preserving for valid inputs.
- A spec walks docs/mcp-vertex/proposals/**/*.md via the real store, asserts every id parses under proposalIdSchema and every kind↔prefix pair is coherent; failures list the offending files.
- Per the parked gate: bun run lint:proposals exits 0, proposal count before == after, index.json regenerates identically (sync_proposals reports changed: false on a second run).
