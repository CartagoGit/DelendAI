---
id: x00962
title: "The audit tools run every target and scanner they list, and read real plans"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00962 — The audit tools run every target and scanner they list, and read real plans

## goal

self_audit registers its scanners and filters by capability, audit_run runs every target or says which it skipped, consolidation keys a finding by identity not severity and reports unreadable inputs, the plan reader parses the repo's own plans, and the generated types keep nullable scores; the same applies to docs_generate, search's rg backend and external-mcps normalisation.

## why

Joint audit a00095 and gpt-6.1-sol. AUD-01: the public self_audit registers no scanners. AUD-02 and D115: the capabilities filter is nominal. AUD-03: audit_run silently skips targets after the fourth. AUD-04: consolidation splits one finding when its severity changes. D92: audit_consolidate can lose unreadable or misparsed audits without declaring them. D42: audit-orchestrator parses only plans indented exactly eight spaces and derives zero tasks from a real plan. D111: generated types harden score/average to number while the schema allows null. D70: docs_generate degrades read failures to an empty success. D104: search's rg backend degrades invalid explicit roots to 0 hits without a diagnostic. sol EXT-03: capability normalisation erases child tool errors and reports success.

## non-goals

- The joint-audit document format (the audit-document proposal).

## slices

- global_gate: type

### S1 — self_audit and audit_run
- **Status**: pending
- **Files**: `plugins/audit/src/index.ts`, `plugins/audit/src/lib/self-audit/aggregate.ts`, `plugins/audit/src/lib/tools/self-audit.tool.ts`, `plugins/audit/src/lib/services/llm-client.service.ts`, `plugins/audit/src/lib/tools/audit-run.schemas.ts`
- **Gate**: type
- acceptance:
  - "self_audit through the public registration runs its scanners (AUD-01) and capabilities filters the backlog (AUD-02, D115)."
  - "audit_run runs every target or lists the skipped ones with the reason (AUD-03)."

### S2 — Consolidation
- **Status**: pending
- **Files**: `plugins/audit/src/lib/services/audit-consolidate.service.ts`, `plugins/audit/src/lib/services/audit-consolidation-strategies.ts`, `plugins/audit/src/lib/services/parse-audit.service.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/audit/src/lib/contracts/interfaces/audit.interface.ts`, `plugins/audit/src/generated/tool-outputs.ts`
- **Gate**: type
- acceptance:
  - "One finding with two severities consolidates into one entry with both votes (AUD-04)."
  - "Unreadable or unparsable inputs are listed in the result (D92)."
  - "Generated types keep score and average nullable (D111)."

### S3 — Plan reader and silent empties elsewhere
- **Status**: pending
- **Files**: `plugins/audit-orchestrator/src/lib/plan-reader.ts`, `plugins/docs/src/lib/tools/docs-generate.tool.ts`, `packages/core/src/lib/shared/safe-list-dir.ts`, `plugins/search/src/lib/services/search-engine.backends.ts`, `plugins/search/src/lib/services/search-engine.in-house.ts`, `plugins/external-mcps/src/lib/normalize/normalize-response.service.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`
- **Gate**: type
- acceptance:
  - "The plan reader parses contains.proposals from a real repo plan by YAML, not by indentation (D42)."
  - "docs_generate reports unreadable directories (D70)."
  - "Rejected explicit roots produce a diagnostic (D104)."
  - "A child tool error survives normalisation as an error (EXT-03)."

## acceptance

- self_audit through the public registration runs its scanners (AUD-01) and capabilities filters the backlog (AUD-02, D115).
- audit_run runs every target or lists the skipped ones with the reason (AUD-03).
- One finding with two severities consolidates into one entry with both votes (AUD-04).
- Unreadable or unparsable inputs are listed in the result (D92).
- Generated types keep score and average nullable (D111).
- The plan reader parses contains.proposals from a real repo plan by YAML, not by indentation (D42).
- docs_generate reports unreadable directories (D70).
- Rejected explicit roots produce a diagnostic (D104).
- A child tool error survives normalisation as an error (EXT-03).
