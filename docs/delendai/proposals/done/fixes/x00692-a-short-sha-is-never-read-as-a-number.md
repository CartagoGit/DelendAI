---
id: x00692
title: "A short SHA is never read as a number"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00681]
last-transition-id: fa0ce9e9-1611-4d6a-b79d-d57a5e406dbc
last-correlation-id: fa0ce9e9-1611-4d6a-b79d-d57a5e406dbc
last-transition-from: review
shipped-in:
  - "b7a9154b60e09a08f84e548ce48255df42cb2e29"
---

# x00692 — A short SHA is never read as a number

## goal

The commit an approval records in `shipped-in` is read back as the same
string, whatever its characters.

## why

`proposal-review-attribution.spec.ts` failed develop's certification
twice on 2026-09-27 and passed everywhere else. x00681 made the failure
name its refusal: "frontmatter `shipped-in` is required". On approval,
`withShippedIn` writes the verified short SHA unquoted:

```yaml
shipped-in:
  - 12345e678
```

YAML reads 12345e678 as a float (`null` once it overflows), `123456789`
as an integer, and an all-digit SHA with a leading zero loses the zero.
The close gate then finds no commit and refuses. The test's commit is
new on every run, so its hash decided the outcome, about one run in 70.
The same happens to any real approval whose SHA has that shape.

## why this design

- **Quote at the only writer.** `withShippedIn` is the one place that
  writes `shipped-in` into frontmatter. It writes every entry as a JSON
  string, which YAML reads back as that string. Entries already listed
  are rewritten the same way.

## non-goals

- Rewriting existing `done/` proposals. A number there already failed
  its close, so none reached `done/` this way.

## architecture

- `plugins/proposals/src/lib/services/review-attribution.ts`:
  `withShippedIn`.

## Slices

- global_gate: none

### S1 — Recorded commits stay strings

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real b7a9154b6. Un SHA corto nunca se lee como número: 12345e678, `123456789` y `0123456789` escritos por withShippedIn pasan guardShippedInPresent INTACTOS — sin el fix, 12345e678 (notación científica al parsear como número) fallaba con el error que CI reportó. review-attribution +5 con corrección de coerción, specs +27. Acceptance cubierta; gate 29/29 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- 12345e678, `123456789` and `0123456789`, written by `withShippedIn`,
  pass `guardShippedInPresent` as themselves. Without the fix,
  12345e678 fails with the error CI reported.
