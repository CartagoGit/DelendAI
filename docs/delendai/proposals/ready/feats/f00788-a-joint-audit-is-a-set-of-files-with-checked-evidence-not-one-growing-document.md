---
id: f00788
title: "A joint audit is a set of files with checked evidence, not one growing document"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# f00788 — A joint audit is a set of files with checked evidence, not one growing document

## goal

A joint audit keeps one file per reviewer contribution and a generated index; finding ids are allocated per reviewer so parallel reviewers cannot collide; every evidence reference is checked to exist; the scoreboard is derived from the findings; and bilingual signed annexes have a place.

## why

Joint audit a00095, on its own process. C1: the record is one 665 KB file every reviewer reads in full. G89: the record weighs 359 KB and 3,501 lines; each reviewer loads about 90,000 tokens. G44: duplicated D17 row, a split table, agreements never audited. G100: G79 id collision and four duplicate pairs inflating the count. C6: a duplicate finding (a G79 equal to G150) after consolidation. G152: parallel reviewers assign ids without coordination. G87: evidence references are not checked: 3 files do not exist and 4 paths are stale. G88: the scoreboard shows a state different from the code (170 of 200 listed open). G90: 47 findings have no file:line reference. G64: a signed annex has nowhere to live: evidence/ is not bilingual and the English-prose lint rejects it. gpt-6.1-sol's contribution already uses the target shape (findings.jsonl, coverage ledgers, signed originals).

## non-goals

- Rewriting a00095 itself; it stays as published.

## slices

- global_gate: type

### S1 — Layout and ids
- **Status**: pending
- **Files**: `plugins/audit/src/lib/tools/audit-plan.tool.ts`, `docs/delendai/audits/JOINT-AUDIT-FORMAT.md`
- **Gate**: type
- acceptance:
  - "A joint audit is a directory with one findings file per reviewer and a generated index; ids carry the reviewer's namespace (C1, G89, G152, G100, C6)."

### S2 — Checked evidence and a derived scoreboard
- **Status**: pending
- **Files**: `tools/scripts/lint/audit-evidence-refs.script.ts`, `tools/scripts/lint/audit-evidence-refs.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A lint fails when a finding's evidence names a file that does not exist at its snapshot or has no file:line (G87, G90)."
  - "The scoreboard is generated from the findings and their settlements (G88, G44)."

### S3 — Signed annexes
- **Status**: pending
- **Files**: `tools/scripts/lint/i18n-english-prose.script.ts`
- **Gate**: type
- acceptance:
  - "Files under an audit's evidence directory may be in the reviewer's language and are excluded from the English-prose lint (G64)."

## acceptance

- A joint audit is a directory with one findings file per reviewer and a generated index; ids carry the reviewer's namespace (C1, G89, G152, G100, C6).
- A lint fails when a finding's evidence names a file that does not exist at its snapshot or has no file:line (G87, G90).
- The scoreboard is generated from the findings and their settlements (G88, G44).
- Files under an audit's evidence directory may be in the reviewer's language and are excluded from the English-prose lint (G64).
