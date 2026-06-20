---
applies-to: docs/proposals/audits/**/*.md
---

# Architecture: audits

## Purpose

Audit reports capture evidence, findings, and follow-up proposals without
changing implementation state directly.

## Required Shape

- Name the audited scope and date near the top.
- Separate evidence from interpretation.
- Findings should include severity, file references where applicable, and a
  concrete follow-up.
- Do not mix accepted implementation plans into the audit body; create or link a
  proposal instead.

## Validation

Run `bun run lint:scaffolds` to ensure this scaffold stays discoverable and
well-formed.

