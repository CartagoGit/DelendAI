---
id: x00588
title: "The bun suite has a deliberate ceiling"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-22
tags:
    - tests
    - ci
shipped-in:
  - "6066dc3082b04382f878d544aa64909301abb691"
last-transition-id: 833d7d16-7ae9-425e-be08-5285a4c9138d
last-correlation-id: 833d7d16-7ae9-425e-be08-5285a4c9138d
last-transition-from: review
---

# x00588 — The bun suite has a deliberate ceiling

## goal

A test suite fails on a defect, never on the project having grown.

## why

`sqlite-cutover-ready` went red, and the failure was not an assertion:

```
(fail) projects every markdown file in docs/delendai/proposals [5398.44ms]
  ^ this test timed out after 5000ms.
```

`bun test` defaults to **five seconds**. That spec reconciles every
markdown file under `docs/delendai/proposals` — a tree that was ~800
files when the spec was written and is 968 today. It drifted from
comfortably inside the default to 5,398 ms against it, so the suite began
failing because the project did exactly what it is supposed to do, and
would have failed more often from here.

The vitest projects already made this decision and wrote it down —
`testTimeout: 30_000`, because a spec that is fast on an idle machine
pays several times that under the contention of a full run (x00542 S2).
The bun suites inherited no such decision and sat on the language
default. The reasoning covered one runner out of two.

## why this design

The obvious home is `bunfig.toml`, which already has a `[test]` section.
It was tried, and **it does not work**: the `[test] timeout` key is
ignored by the bun in use here. That was verified against a spec that
sleeps six seconds — it timed out at 5,000 ms with the key present, and
passed with `--timeout` on the command line.

So the ceiling lives where the suite is invoked, and a rule keeps it
there rather than trusting the next person to remember which of the two
places works.

## non-goals

- Raising a quality budget to silence a gate. This is a clock, not a
  threshold: the work is the same, the runner was told to allow less time
  than it takes.
- Retrying. A slow test that passes on the second attempt is a test whose
  result nobody can read.

## architecture

Every `bun test` invocation states `--timeout 30000`, matching the vitest
ceiling for the same reason.

`lint:bun-suite-ceiling` refuses a `package.json` script that runs the
bun test runner without stating one. It ignores `bun run …` and
`bun tools/…`, which are not the runner — a rule that fired on those
would be turned off within a week.

## slices

### S1 — every bun suite states its timeout, and a rule keeps it stated

- **Status**: done
- **Files**: [`package.json`, `tools/scripts/lint/bun-suite-has-a-ceiling.script.ts`, `tools/scripts/lint/bun-suite-has-a-ceiling.constant.ts`, `tools/scripts/lint/bun-suite-has-a-ceiling.interface.ts`, `tools/scripts/lint/bun-suite-has-a-ceiling.script.spec.ts`]
- **Gate**: `npx vitest run tools/scripts/lint/bun-suite-has-a-ceiling.script.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 6066dc308. Nuevo lint bun-suite-has-a-ceiling: toda suite `bun test`/`bun run test` encadenada en package.json debe llevar --timeout explícito (REQUIRED_TIMEOUT_FLAG) alineado con el techo deliberado de vitest; suites sin techo se rechazan con fix accionable; `bun run …`/`bun tools/…`/`bun build …` no se mencionan; lint reaches CI vía lints-reach-ci. Acceptance: test:sqlite 355/355 verificado por el implementador y gate del spec 47 líneas — verificado en el lote 34/34. Techo explícito frente a reloj implícito (coherente con x00647). Sin cambios fuera de alcance.
- review-attribution: claude-opus-5 from commit 6066dc3082b0 names refs/heads/delendai/wip/claude-opus-5/x00588-S1-g1/the-bun-suite-has-a-deliberate-ceiling (6066dc3082b04382f878d544aa64909301abb691), opened by glm-5.3-max
## acceptance

- `test:sqlite` passes: 355 tests, 0 failures.
- A bun suite without `--timeout` is refused; one with it is accepted.
- A suite chained behind another command is still seen.
- `bun run …`, `bun tools/…` and `bun build …` are never mentioned.
- `lints-reach-ci` confirms the rule runs in CI.

## risks and mitigations

- **A genuinely hung test now takes 30s to report.** It reports, which
  five seconds did not guarantee for a test that merely grew.
- **`bunfig.toml` gains the key in a future bun.** The rule still holds:
  stating it at the invocation is correct either way, and the docstring
  records that the key was tried and found inert.
