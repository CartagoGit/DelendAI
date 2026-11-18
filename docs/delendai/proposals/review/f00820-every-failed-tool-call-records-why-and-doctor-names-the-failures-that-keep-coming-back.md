---
id: f00820
title: "Every failed tool call records why, and doctor names the failures that keep coming back"
kind: feat
status: review
type: proposal
track: feats
date: 2026-11-18
last-transition-id: fae49456-46db-48a5-95be-a5ca4eb85e93
last-correlation-id: fae49456-46db-48a5-95be-a5ca4eb85e93
last-transition-from: in-progress
last-transition-at: 2026-11-18T03:21:52.633Z
---

# f00820 — Every failed tool call records why, and doctor names the failures that keep coming back

## goal

A tool.failed runtime event carries a bounded failure class and a stable code, `delendai kpis` groups them by tool, class and code, and `delendai doctor` reports a tool whose recurring failure code crosses a threshold, so delendai sees its own repeated errors and every host and model reads the same verdict.

## why

Measured 2026-11-18 over .cache/delendai/runtime/events.jsonl, 2026-11-11..18: review_claim failed 16 of 30 calls (53%), compact_router 14 of 29 (48%), create_proposal 17 of 42 (40%), proposal_review 13 of 46 (28%). The events hold only `error: true`; neither they nor the mcp-server logs keep the reason, so nobody can tell a correct refusal (an invalid gate value, one proposal per create unit) from a defect, and the same mistake repeats across agents and sessions without delendai ever learning it.

## non-goals

- Changing what any tool refuses.
- Sending failure data off the machine.
- Storing argument values or free text beyond the redacted, length-bounded code.

## slices

- global_gate: lint

### S1 — tool.failed carries a failure class and a stable code
- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/runtime-event.interface.ts`, `packages/core/src/lib/observability/tool-failure-class.helper.ts`, `packages/core/tests/src/lib/observability/tool-failure-class.helper.spec.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`
- **Gate**: lint
- acceptance:
  - "IRuntimeEvent gains an optional `failure` field: { class: 'input-invalid' | 'refused' | 'threw' | 'cancelled'; code: string }."
  - "tool-failure-class.helper.ts derives it from the tool result or thrown error: input-invalid for a schema validation error, refused for an isError result, threw for an exception, cancelled for an aborted call; code is structuredContent.error.code when present, else the first sentence of the reason with ids, hashes, numbers, paths and quoted values replaced by placeholders, passed through packages/core/src/lib/shared/redact.ts and cut to 120 characters."
  - "instrument-tool-handlers.helper.ts writes `failure` on every tool.failed event and on no other event."
  - "The spec asserts the class and code for each class, that two refusals differing only in an id produce the same code, and that a secret-shaped value never appears in the code."
- shipped-in: `88021e7c2f23`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — kpis groups failures by tool, class and code
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/kpis.command.ts`, `packages/cli/src/commands/kpis-options.ts`, `packages/cli/src/commands/kpis-renderer.ts`, `packages/cli/src/commands/kpis.command.spec.ts`
- **Gate**: lint
- acceptance:
  - "`delendai kpis --failures [--since=<days>]` reads the runtime events of the project and prints, per tool, calls, failures, failure share, and the top codes with their class and count, most frequent first; --json prints the same rows."
  - "The spec drives the command over a fixture events file and asserts the rows and their order."
- shipped-in: `659732cadb52`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — doctor reports a recurring failure code
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `packages/cli/src/commands/doctor-checks/recurring-tool-failures.check.ts`, `packages/cli/src/commands/doctor-checks/recurring-tool-failures.check.spec.ts`, `packages/cli/src/commands/doctor.ts`
- **Gate**: lint
- acceptance:
  - "A doctor check reads the last 7 days of runtime events and reports, as a warning, each tool and code that failed at least 5 times with class refused, threw or input-invalid, naming the count and the code."
  - "The check passes when no code reaches the threshold; the threshold and window are constants in the check file."
  - "The spec covers a fixture over the threshold, one under it, and an events file with no failure field (events written before S1), which the check ignores."
- shipped-in: `88021e7c2f23`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- IRuntimeEvent gains an optional `failure` field: { class: 'input-invalid' | 'refused' | 'threw' | 'cancelled'; code: string }.
- tool-failure-class.helper.ts derives it from the tool result or thrown error: input-invalid for a schema validation error, refused for an isError result, threw for an exception, cancelled for an aborted call; code is structuredContent.error.code when present, else the first sentence of the reason with ids, hashes, numbers, paths and quoted values replaced by placeholders, passed through packages/core/src/lib/shared/redact.ts and cut to 120 characters.
- instrument-tool-handlers.helper.ts writes `failure` on every tool.failed event and on no other event.
- The spec asserts the class and code for each class, that two refusals differing only in an id produce the same code, and that a secret-shaped value never appears in the code.
- `delendai kpis --failures [--since=<days>]` reads the runtime events of the project and prints, per tool, calls, failures, failure share, and the top codes with their class and count, most frequent first; --json prints the same rows.
- The spec drives the command over a fixture events file and asserts the rows and their order.
- A doctor check reads the last 7 days of runtime events and reports, as a warning, each tool and code that failed at least 5 times with class refused, threw or input-invalid, naming the count and the code.
- The check passes when no code reaches the threshold; the threshold and window are constants in the check file.
- The spec covers a fixture over the threshold, one under it, and an events file with no failure field (events written before S1), which the check ignores.
