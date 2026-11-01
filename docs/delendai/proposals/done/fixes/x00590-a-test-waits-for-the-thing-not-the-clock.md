---
id: x00590
title: "A test waits for the thing, not the clock"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-22
tags:
    - tests
    - races
shipped-in:
  - "be4f447c3cd6f12cb139395a669efc7e6937401c"
last-transition-id: 84e39be7-7ebe-4db8-be4d-6da957c1e6a1
last-correlation-id: 84e39be7-7ebe-4db8-be4d-6da957c1e6a1
last-transition-from: review
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

- Converting the 36 specs that already sleep. Several test timing on
  purpose — the file-mutex races, the process-tree kill — and a blind
  sweep would replace understanding with a pattern. They are baselined,
  visible as debt.
- Retrying. A slow test that passes on the second attempt is a test whose
  result nobody can read.

## architecture

**Stopping the clock beats waiting for it.** There are three right
answers, in order of preference, and the rule below names all three:

1. **Fake timers** — `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync`.
   Anything driven by the clock (an interval, a debounce, a backoff)
   becomes instant and deterministic.
2. **Await the thing** — when the code is ours, hand the promise back
   instead of discarding it. `sliceListener.start()` primed immediately
   and threw the promise away with `void`, so nothing could tell when the
   first check had finished; it now returns it.
3. **`waitUntil`** — only for real I/O finishing in an async chain nobody
   owns, where there is no clock to fake and no promise to hold.

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

### S1 — the waiting says what it is waiting for, and a rule keeps it out

- **Status**: done
- **Files**: [`packages/test-kit/src/lib/wait-until.helper.ts`, `packages/test-kit/src/lib/wait-until.constant.ts`, `packages/test-kit/src/public/index.ts`, `packages/test-kit/tests/src/lib/wait-until.helper.spec.ts`, `plugins/commit-policy/tests/src/slice-replay.plugin.spec.ts`, `plugins/commit-policy/src/lib/triggers/slice-listener.ts`, `tools/scripts/lint/no-sleep-in-specs.script.ts`, `tools/scripts/lint/no-sleep-in-specs.constant.ts`, `tools/scripts/lint/no-sleep-in-specs.interface.ts`, `tools/scripts/lint/no-sleep-in-specs.script.spec.ts`, `tools/scripts/lint/no-sleep-in-specs.baseline.json`, `package.json`]
- **Gate**: `bun run lint:no-sleep-in-specs`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real be4f447c3. waitUntil (test-kit) espera la CONDICIÓN con backoff corto en vez de un sleep fijo: retorna en cuanto la condición se cumple (mediblemente más rápido), inmediato si ya se cumple, acepta condiciones async, y su fallo nombra qué se esperaba Y el techo. slice-replay deja de depender de la rapidez de la máquina (34 líneas de spec adaptadas) y el lint no-sleep-in-specs (con baseline) rechaza await de duraciones, ignora setTimeout que solo programa, vi.advanceTimersByTime y waitUntil, y acepta waiver en la línea o encima. Acceptance cubierta; gate 49+34 líneas verificado en el lote 62/62. Coherente con x00647 (un test no expira con el calendario). Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit be4f447c3cd6 names refs/heads/delendai/wip/claude-opus-5/x00590-S1-g1/a-test-waits-for-the-thing-not-the-clock (be4f447c3cd6f12cb139395a669efc7e6937401c), opened by glm-5.3-max
## acceptance

- `waitUntil` returns as soon as the condition holds, measurably faster
  than the sleep it replaces.
- It returns immediately when the condition already holds.
- It accepts an async condition.
- Its failure names what was being waited for **and** the ceiling.
- `slice-replay` passes, and no longer depends on the machine being fast
  enough that day.
- `lint:no-sleep-in-specs` refuses an awaited duration, ignores a
  `setTimeout` that merely schedules, ignores `vi.advanceTimersByTime`
  and `waitUntil`, and accepts a written waiver on the line or the line
  above it.

## risks and mitigations

- **36 specs stay baselined.** Visible as debt rather than forgotten, and
  the rule bites on what arrives next.
- **A genuinely broken poll now takes ten seconds to report.** It
  reports, with a sentence saying what never happened — which a 400 ms
  sleep did not guarantee even when the poll worked.
