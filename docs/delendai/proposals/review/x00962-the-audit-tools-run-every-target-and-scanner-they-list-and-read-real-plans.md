---
id: x00962
title: "The audit tools run every target and scanner they list, and read real plans"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 233daa2b-e0b9-4417-98e4-0c12c57125a1
last-correlation-id: 233daa2b-e0b9-4417-98e4-0c12c57125a1
last-transition-from: in-progress
last-transition-at: 2026-11-01T07:28:59.652Z
shipped-in:
  - "aa0026b7f082c9ae68c7fe468eab7c9fc1192eba"
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
- **Status**: done
- **Files**: `plugins/audit/src/lib/self-audit/aggregate.ts`, `plugins/audit/src/lib/services/llm-client.service.ts`, `plugins/audit/src/lib/tools/audit-run.schemas.ts`, `plugins/audit/src/lib/tools/audit-run.tool.ts`, `plugins/audit/src/lib/tools/self-audit.tool.ts`, `plugins/audit/src/public/index.ts`, `plugins/audit/src/lib/self-audit/default-scanners.service.ts`, `plugins/audit/src/lib/services/llm-fan-out.service.ts`
- **Gate**: type
- acceptance:
  - "self_audit through the public registration runs its scanners (AUD-01) and capabilities filters the backlog (AUD-02, D115)."
  - "audit_run runs every target or lists the skipped ones with the reason (AUD-03)."
- shipped-in: `bb8f825757cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at aa0026b7f082, validate exit 0 and tests 28/28 claimed, no recorded run cited; acceptance 2/2: (1) At aa0026b7 the self_audit tool registered in the plugin's public surface runs the default scanners instead of an empty map, and the aggregator keeps only the … (2) At aa0026b7 the fan-out calls every target with a shared cursor and a bounded number of calls in flight, keeping the input order, and the result lists the fail… — Approved on the delivered state of aa0026b7f082c9ae68c7fe468eab7c9fc1192eba. The self_audit tool, reached through the plugin's public registration, runs its scanners and filters the backlog by capability, reporting the scanners it did not run as skipped with the reason, and audit_run now calls every target instead of the first four, listing the ones that failed with their cause. The type gate exited 0 and the five slice specs pass 28 of 28. Two residuals, recorded and not blocking: the registration builder is not exported from the plugin's public barrel though the tool itself is, and no spec runs a real secret or vulnerability scan end to end.

### S2 — Consolidation
- **Status**: review
- **Files**: `plugins/audit/src/lib/contracts/interfaces/audit.interface.ts`, `plugins/audit/src/lib/contracts/interfaces/self-audit.interface.ts`, `plugins/audit/src/lib/services/audit-consolidate.service.ts`, `plugins/audit/src/lib/services/parse-audit.service.ts`, `plugins/audit/src/lib/tools/audit-close.tool.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `tools/scripts/types/emit-tool-types.script.ts`
- **Gate**: type
- acceptance:
  - "One finding with two severities consolidates into one entry with both votes (AUD-04)."
  - "Unreadable or unparsable inputs are listed in the result (D92)."
  - "Generated types keep score and average nullable (D111)."
- shipped-in: `e8666f5d4de3`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Plan reader and silent empties elsewhere
- **Status**: review
- **Files**: `plugins/audit-orchestrator/src/lib/plan-reader.ts`, `plugins/docs/src/lib/tools/docs-generate.tool.ts`, `plugins/external-mcps/src/lib/contracts/interfaces/external-answer.interface.ts`, `plugins/external-mcps/src/lib/normalize/normalize-response.service.ts`, `plugins/external-mcps/src/lib/tools/invoke-proxy.ts`, `plugins/search/src/lib/services/search-engine.backends.ts`, `plugins/search/src/lib/services/search-engine.in-house.ts`, `plugins/search/src/lib/services/search-safe-reader.ts`
- **Gate**: type
- acceptance:
  - "The plan reader parses contains.proposals from a real repo plan by YAML, not by indentation (D42)."
  - "docs_generate reports unreadable directories (D70)."
  - "Rejected explicit roots produce a diagnostic (D104)."
  - "A child tool error survives normalisation as an error (EXT-03)."
- shipped-in: `e8666f5d4de3`
- review-state: in_review
- review-implementer: claude-opus-5-5

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
