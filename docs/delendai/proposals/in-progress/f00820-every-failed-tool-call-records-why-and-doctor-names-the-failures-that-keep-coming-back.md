---
id: f00820
title: "Every failed tool call records why, and doctor names the failures that keep coming back"
kind: feat
status: in-progress
type: proposal
track: feats
date: 2026-11-18
last-transition-id: 43c77f8f-a2c3-41d0-a89a-13a59dcf4963
last-correlation-id: 43c77f8f-a2c3-41d0-a89a-13a59dcf4963
last-transition-from: review
last-transition-at: 2026-11-21T00:42:39.027Z
shipped-in:
  - "64d614baf4ee024c4a9ed2396f26533bfdcd0cbd"
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
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/runtime-event.interface.ts`, `packages/core/src/lib/observability/tool-failure-class.helper.ts`, `packages/core/tests/src/lib/observability/tool-failure-class.helper.spec.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`
- **Gate**: lint
- acceptance:
  - "IRuntimeEvent gains an optional `failure` field: { class: 'input-invalid' | 'refused' | 'threw' | 'cancelled'; code: string }."
  - "tool-failure-class.helper.ts derives it from the tool result or thrown error: input-invalid for a schema validation error, refused for an isError result, threw for an exception, cancelled for an aborted call; code is structuredContent.error.code when present, else the first sentence of the reason with ids, hashes, numbers, paths and quoted values replaced by placeholders, passed through packages/core/src/lib/shared/redact.ts and cut to 120 characters."
  - "instrument-tool-handlers.helper.ts writes `failure` on every tool.failed event and on no other event."
  - "The spec asserts the class and code for each class, that two refusals differing only in an id produce the same code, and that a secret-shaped value never appears in the code."
- shipped-in: `88021e7c2f23`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 64d614baf4ee, validate exit 0 and tests 28/28 claimed, no recorded run cited; acceptance 4/4: (1) runtime-event.interface.ts exports IToolFailure with the exact class union and string code, and IRuntimeEvent has optional failure with a failed-event-only com… (2) deriveToolFailure implements the four classes, prefers structuredContent.error.code, generalises first-sentence dynamic values, redacts secrets, and slices to … (3) The final runtime-event emit selects tool.failed when isError and spreads failureField only there; other events receive no failure. The helper spec asserts fai… (4) tool-failure-class.helper.spec.ts has explicit schema/refused/thrown/cancelled assertions, stable-code equality across IDs, and a ghp-shaped secret non-retenti… — Reviewed the delivered diff and current implementation; no later change touches these slice files. The 28 focused specs for this proposal pass and the lint gate exits 0. Failure classification, stable redacted/bounded codes, and event-only instrumentation meet the acceptance criteria.

### S2 — kpis groups failures by tool, class and code
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/commands/kpis.command.ts`, `packages/cli/src/commands/kpis-options.ts`, `packages/cli/src/commands/kpis-renderer.ts`, `packages/cli/src/commands/kpis.command.spec.ts`
- **Gate**: lint
- acceptance:
  - "`delendai kpis --failures [--since=<days>]` reads the runtime events of the project and prints, per tool, calls, failures, failure share, and the top codes with their class and count, most frequent first; --json prints the same rows."
  - "The spec drives the command over a fixture events file and asserts the rows and their order."
- shipped-in: `659732cadb52`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 64d614baf4ee, validate exit 0 and tests 28/28 claimed, no recorded run cited; acceptance 2/2: (1) runFailuresView reads <workspace>/<cacheDir>/runtime/events.jsonl with a default 7-day window, summariseToolFailures folds tool.completed/tool.failed events an… (2) kpis.command.spec.ts supplies JSONL with completed/failed events, asserts b before a, exact calls/failureShare/topCodes order in JSON, missing/odd-line behavio… — Reviewed the delivered diff and current implementation; no later change touches these slice files. The 28 focused specs pass and the lint gate exits 0. The failures view reads project runtime events, folds calls/failures and ranks failure codes consistently in text and JSON.

### S3 — doctor reports a recurring failure code
- **Status**: in-progress
- **DependsOn**: [S2]
- **Files**: `packages/cli/src/commands/doctor-checks/recurring-tool-failures.check.ts`, `packages/cli/src/commands/doctor-checks/recurring-tool-failures.check.spec.ts`, `packages/cli/src/commands/doctor.ts`
- **Gate**: lint
- acceptance:
  - "A doctor check reads the last 7 days of runtime events and reports, as a warning, each tool and code that failed at least 5 times with class refused, threw or input-invalid, naming the count and the code."
  - "The check passes when no code reaches the threshold; the threshold and window are constants in the check file."
  - "The spec covers a fixture over the threshold, one under it, and an events file with no failure field (events written before S1), which the check ignores."
- shipped-in: `88021e7c2f23`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: requested_changes by mai-code-2 — The behavior is present, but one acceptance item is not delivered as specified: `recurring-tool-failures.check.ts` imports RECURRING_FAILURE_WINDOW_DAYS and RECURRING_FAILURE_THRESHOLD from `packages/cli/src/contracts/constants/recurring-tool-failures.constant.ts`; the check file does not declare the threshold/window constants, and that constants file is outside the slice's declared Files scope. Reproduce by inspecting the imports at the top of recurring-tool-failures.check.ts. To approve, either move the two constants into the check file (and keep tests using the same source) as the acceptance says, or revise the acceptance/scope in the same implementation unit to explicitly allow the shared constants module and list that file; do not close under wording the delivery does not meet.

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
