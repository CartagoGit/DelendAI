---
id: x00927
title: "A refused push names the check that refused it"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-20
last-transition-id: e29b7eff-3e0a-4b5e-b95c-c6fa00b6a2d8
last-correlation-id: e29b7eff-3e0a-4b5e-b95c-c6fa00b6a2d8
last-transition-from: in-progress
last-transition-at: 2026-10-21T15:17:41.662Z
---

# x00927 — A refused push names the check that refused it

## goal

When the push after a unit's commit is refused, the message names the line that refused it: a check's own verdict (`✖`, `blocked`, `exited with code`), then git's failure line, then the last line printed. It no longer gives the first line of the output.

## why

Twice on 2026-10-20 (the f00774 and x00926 units), the commit hook reported:

```
… was committed here but origin refused it ($ bun tools/scripts/lint/push-to-develop-discipline.script.ts origin …)
```

That check had passed both times; rerun by hand on the same ref it printed `✓ push-to-develop-discipline: ok`. `pushUnitTip` reported `stderr.split('\n')[0]`, and a pre-push hook first prints the command it is about to run. So the message blamed a check that passed and hid the one that failed. The push succeeded by hand a minute later, so the real cause was transient, and nothing recorded what it was.

## non-goals

- Retrying the push. A refusal is reported with its repair, as before.

## slices

- global_gate: type

### S1 — The reason, not the first line

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-push.service.ts`, `packages/core/tests/src/lib/work-units/unit-push.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`failureLineOf` skips the lines a hook prints for the commands it runs (`$ …`). It returns the last check verdict, else the last git failure line (`error`, `rejected`, `fatal`, …), else the last line. `pushUnitTip` reports it as `detail`."
- shipped-in: `22687c0ea4f9`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- The S1 spec passes.
