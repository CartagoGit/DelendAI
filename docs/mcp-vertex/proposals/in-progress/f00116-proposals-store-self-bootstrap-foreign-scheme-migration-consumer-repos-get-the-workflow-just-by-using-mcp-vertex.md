---
id: f00116
title: "Proposals store self-bootstrap + foreign-scheme migration — consumer repos get the workflow just by using mcp-vertex"
kind: feat
status: in-progress
type: proposal
track: proposals+adoption
date: 2026-07-15
---

# f00116 — Proposals store self-bootstrap + foreign-scheme migration — consumer repos get the workflow just by using mcp-vertex

## Goal

A consumer repo should get the full proposals workflow without chasing docs: (1) proposal_adopt gains apply mode — it already ANALYZES a repo and prints a plan; with apply:true it executes that plan (create the canonical layout: 7 status folders + .gitkeep + README + index), idempotent, atomic, dry-run stays the default. (2) A migration engine converts FOREIGN proposal schemes (docs/rfcs/*.md, TODO/backlog markdown lists, ad-hoc frontmatter) into canonical proposals: kind inference, allocator ids, provenance note linking the original, redactSecrets, and a reversible migration report — opt-in via migrate:true. (3) When the proposals plugin boots in a workspace WITHOUT a store, orientation (recommendedNextAction + knowledge) points at adopt — visible nudge, zero silent writes at boot.

## why

User directive 2026-07-15: "que el proyecto sea capaz de crear correctamente la carpeta de propuestas, su organización, y de migrar otro esquema de propuestas en otros repos, solo por usar mcp-vertex". Today proposal_adopt (plugins/proposals/src/lib/proposals/adopt.ts) returns {plan[], ready} but executes nothing — the agent must hand-create folders; foreign schemes have no path in at all.

## non-goals

- No writes at plugin boot — bootstrap/migration only ever run through the explicit tool call.
- No deletion of foreign originals — migration copies+converts and reports; the caller decides what to retire.
- GitHub Issues / external trackers are out of scope; files-on-disk schemes only.

## Slices

- global_gate: e2e

### S1 — proposal_adopt apply mode: execute the bootstrap plan (folders + README + gitkeeps + index)
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/adopt.ts`, `plugins/proposals/src/lib/tools/adopt.tool.ts`, `plugins/proposals/tests/src/lib/adopt-apply.spec.ts`
- **Gate**: e2e
- acceptance:
  - "apply:true creates the canonical layout in a bare repo (writeFileAtomic; mkdir recursive); re-running is a no-op (idempotent, reported as such); dry-run remains the default and byte-identical to today's analysis output plus an explicit applied:false."
  - "outputSchema updated; spec covers bare repo, partial repo (some folders exist), and re-run."

### S2 — Foreign-scheme migration engine (classify → convert → report), opt-in
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/migrate-foreign.ts`, `plugins/proposals/tests/src/lib/migrate-foreign.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Given a fixture repo with docs/rfcs/*.md (title+status headings), a TODO.md checklist and an ad-hoc frontmatter scheme, migrateForeign() emits canonical proposals under ready/ with allocator ids, inferred kind (feat default; fix for bug-ish titles), original path recorded in the body (provenance), and user text run through redactSecrets."
  - "The migration REPORT lists every source→target mapping and every skipped file with a reason; nothing outside the proposals dir is written; originals untouched."

### S3 — Wire migration into the adopt tool + orientation nudge when the store is missing
- **Status**: pending
- **DependsOn**: [S1, S2]
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/adopt-migrate-wiring.ts`, `plugins/proposals/tests/src/lib/adopt-orientation.spec.ts`
- **Gate**: e2e
- acceptance:
  - "proposal_adopt accepts migrate:{roots:[...]} and returns the migration report; apply+migrate compose in one call."
  - "Booting the plugin in a workspace without a proposals store surfaces a knowledge/orientation nudge naming proposal_adopt (spec asserts it); with a store present the nudge is absent."
  - "types:generate + catalog regenerated; budgets green."

## acceptance

- apply:true creates the canonical layout in a bare repo (writeFileAtomic; mkdir recursive); re-running is a no-op (idempotent, reported as such); dry-run remains the default and byte-identical to today's analysis output plus an explicit applied:false.
- outputSchema updated; spec covers bare repo, partial repo (some folders exist), and re-run.
- Given a fixture repo with docs/rfcs/*.md (title+status headings), a TODO.md checklist and an ad-hoc frontmatter scheme, migrateForeign() emits canonical proposals under ready/ with allocator ids, inferred kind (feat default; fix for bug-ish titles), original path recorded in the body (provenance), and user text run through redactSecrets.
- The migration REPORT lists every source→target mapping and every skipped file with a reason; nothing outside the proposals dir is written; originals untouched.
- proposal_adopt accepts migrate:{roots:[...]} and returns the migration report; apply+migrate compose in one call.
- Booting the plugin in a workspace without a proposals store surfaces a knowledge/orientation nudge naming proposal_adopt (spec asserts it); with a store present the nudge is absent.
- types:generate + catalog regenerated; budgets green.
