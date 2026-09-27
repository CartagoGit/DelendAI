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
last-transition-id: 0cda12da-1d0f-431b-8741-35f7cc6acb5c
last-correlation-id: 0cda12da-1d0f-431b-8741-35f7cc6acb5c
last-transition-from: in-progress
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

YAML reads `12345e678` as a float (`null` once it overflows), `123456789`
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

- **Status**: done (shipped-in frontmatter present)
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/tests/src/lib/services/review-attribution.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `12345e678`, `123456789` and `0123456789`, written by `withShippedIn`,
  pass `guardShippedInPresent` as themselves. Without the fix,
  `12345e678` fails with the error CI reported.
