---
id: x00590
title: "A test waits for the thing, not the clock"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - tests
    - races
---

# x00590 — A test waits for the thing, not the clock

## goal

A test that waits for something asynchronous waits for **that thing**,
and fails only when it does not happen.

## why

`slice-replay` failed in CI with `expected 0 to be greater than 0`, and
passed five times out of five locally — on `develop`, on the candidate's
branch, and on the merge ref.

The cause is in the test:

```ts
const registered = await plugin.register(contextFor(root));
await new Promise((resolve) => setTimeout(resolve, 400));
…
return lines.filter((line) => line.includes('"slice.detected"'));
```

It sleeps 400 ms for a poll and then asserts the poll happened. On a
loaded runner the poll had not emitted yet, the list was empty, and an
empty list read as a defect.

That is the worst distribution of outcomes: the failure arrives detached
from the change that caused it, it cannot be reproduced where it is being
investigated, and the two usual responses — a retry, or a bigger number —
both hide whatever is underneath. This one cost three candidates a red
check that had nothing to do with any of them.

## non-goals

- Converting all 26 specs that call `setTimeout`. Several of them test
  timing on purpose — the file-mutex races, the process-tree kill — and a
  blind sweep would replace understanding with a pattern.
- Retrying. A slow test that passes on the second attempt is a test whose
  result nobody can read.

## architecture

`waitUntil(describe, condition, options?)` in `@delendai/test-kit`
resolves the moment the condition holds and throws when it has not within
a ceiling. The fast path is fast — a condition that already holds returns
immediately — so the ceiling costs a passing test nothing and exists only
to turn a hang into a readable failure.

`describe` is required rather than optional. A timeout that says
"condition not met" tells the next reader nothing, and they are usually
reading it because CI failed and they cannot reproduce it.

`detectedSlices` takes `expectDetection`, because a caller asserting that
**nothing** was detected must not wait out the ceiling to find out.

## slices

### S1 — the waiting says what it is waiting for

- **Status**: review
- **Files**: [`packages/test-kit/src/lib/wait-until.helper.ts`, `packages/test-kit/src/lib/wait-until.constant.ts`, `packages/test-kit/src/public/index.ts`, `packages/test-kit/tests/src/lib/wait-until.helper.spec.ts`, `plugins/commit-policy/tests/src/slice-replay.plugin.spec.ts`]
- **Gate**: `npx vitest run packages/test-kit/tests/src/lib/wait-until.helper.spec.ts plugins/commit-policy/tests/src/slice-replay.plugin.spec.ts`

## acceptance

- `waitUntil` returns as soon as the condition holds, measurably faster
  than the sleep it replaces.
- It returns immediately when the condition already holds.
- It accepts an async condition.
- Its failure names what was being waited for **and** the ceiling.
- `slice-replay` passes, and no longer depends on the machine being fast
  enough that day.

## risks and mitigations

- **A genuinely broken poll now takes ten seconds to report.** It
  reports, with a sentence saying what never happened — which a 400 ms
  sleep did not guarantee even when the poll worked.
