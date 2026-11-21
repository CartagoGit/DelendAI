---
id: x00652
title: "An expiring exception warns before it fails"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-25
priority: P2
related: [x00647, r00043]
last-transition-id: bf92feba-1164-4a1c-b401-0e5bb4c93553
last-correlation-id: bf92feba-1164-4a1c-b401-0e5bb4c93553
last-transition-from: review
shipped-in:
  - "1fe417a3e1f8fe805ac2c381f83f274cd6269b2b"
---

# x00652 — An expiring exception warns before it fails

## goal

A time-boxed exception in the core→proposals boundary gate announces its
date for a month before it becomes a failure.

## why

On 2026-09-25 a test with a hard-coded date failed on the day the date
passed. It turned `develop` red and stopped the queue for hours (x00647).
Running the whole suite with the clock one year ahead found one more
date of that kind. This one is deliberate: the 37 active exceptions of
`core-proposals-boundary` all expire on 2027-03-31, so that the coupling
r00043 is removing does not stay forever. On that day the gate will fail
on every pull request at once, whatever the pull request changed, and
nothing announces it beforehand.

## why this design

The date is the right tool and stays as it is. What was missing is
notice. For `EXPIRY_WARNING_DAYS` (30) before any active exception
expires, every run of the gate prints the date and the number of
exceptions that expire on it. In CI it prints a forge `::warning`
annotation, which shows on each pull request's checks. It stays a
warning, not a failure: there is a month to retire the coupling or to
extend the exception on purpose.

## non-goals

- Changing any exception's date.
- A generic mechanism for every dated check. This is the only dated
  gate the one-year clock shift found.

## architecture

- `tools/scripts/lint/core-proposals-boundary.script.ts` (and its
  `.d.ts`): `EXPIRY_WARNING_DAYS`, `expiringSoon`,
  `formatExpiryWarnings`; `main` prints them.

## Slices

- global_gate: none

### S1 — The boundary gate warns a month before an exception expires

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
- **Files**:
  - `tools/scripts/lint/core-proposals-boundary.script.ts`
  - `tools/scripts/lint/core-proposals-boundary.script.d.ts`
  - `packages/core/tests/src/architecture/core-proposals-boundary.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 1fe417a3e. El gate de core-proposals-boundary AVISA antes de fallar: dentro de la ventana (un mes), cada fecha de expiración se nombra con cuántas exceptions caducan en ella; fuera de la ventana no imprime nada; las exceptions vivas se avisan un mes antes de su fecha; en CI emite anotación ::warning y fuera una línea plana; el resultado pass/fail del gate NO cambia (solo advierte). core-proposals-boundary.spec 78 líneas. Acceptance cubierta; gate 8/8 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- Inside the window, each expiry date is named with how many exceptions
  expire on it. Outside the window, nothing is printed.
- The live exceptions are warned about a month before their date.
- CI gets a `::warning` annotation; elsewhere a plain line is printed.
- The gate's pass/fail result does not change.

## risks and mitigations

- **A warning nobody reads.** The annotation is attached to every pull
  request's checks for the month, which is where people look.
