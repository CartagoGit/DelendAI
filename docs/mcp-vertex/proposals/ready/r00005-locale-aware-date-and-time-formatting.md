---
id: r00005
status: ready
type: proposal
track: i18n+l10n+utils
date: 2026-06-25
kind: refactor
title: Locale-aware date/time formatting via `Intl.DateTimeFormat` + `Intl.RelativeTimeFormat`
# All three slices are implemented, tested and committed (see shipped-in).
# The final bookkeeping — flipping status to `done` and moving this file into
# done/refactors/ — is deferred: that move trips `lint:commit-branch`
# (commit-branch-discipline), which forbids committing a done/ proposal directly
# on develop without a feature branch. This drain was mandated SERIAL on develop
# with no feature branch, so the directory move + status flip is left for the
# operator's integration/PR step.
shipped-in:
  - 3e07855b # S1: H17 closed upstream by f00059 S5 (formatRelativeTime via Intl.RelativeTimeFormat)
  - 41ce6611 # S2: formatDate/formatTime wrappers around Intl.DateTimeFormat
  - 50da6985 # S3: cross-runtime Intl snapshot + numberingSystem 'latn' fix
recan: []
related:
    - a00040 # audit that surfaced this finding (H17)
    - f00059 # sibling (i18n thread; this is its pure-formatting half)
ownership:
    - { agent: proposal_guardian,    task: 'S1: replace `formatRelativeTime` with `Intl.RelativeTimeFormat` honoring `locale` (H17)' }
    - { agent: implementation_runner, task: 'S2: add `formatDate` / `formatTime` wrappers around `Intl.DateTimeFormat`; cover all 12 locales in spec' }
    - { agent: implementation_runner, task: 'S3: snapshot test against Node 18 + Bun 1.x — assert identical output for the same (date, now, locale) input' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
---

# r00005 — Locale-aware date/time formatting via `Intl.*`

## goal

Close audit `a00040` finding **H17** by replacing the non-deterministic, locale-blind
[`formatRelativeTime`](packages/ui-extension/src/utils/format-relative-time.ts ) with a
pure, locale-aware implementation backed by `Intl.RelativeTimeFormat` and
`Intl.DateTimeFormat`.

The 3 slices are dependency-ordered.

## why

`a00040` read [`packages/ui-extension/src/utils/format-relative-time.ts`](packages/ui-extension/src/utils/format-relative-time.ts )
and found:

- **H17** — The function accepts a `locale` argument and **ignores it**. It returns
  English strings (`'just now'`, `'2 minutes ago'`, `'in 3 days'`) regardless of
  locale, and appends the locale in parens (`'(es)'`). The result is a Frankenstein
  string — not localized, but also not locale-agnostic.

The fix is the platform-native `Intl.RelativeTimeFormat`, which ships in Node 18+,
Bun 1.x, and every browser, supports 100+ locales, and produces the expected output
without a dependency.

## why this design

**No dependency.** `Intl.RelativeTimeFormat` and `Intl.DateTimeFormat` are runtime
APIs, not libraries. The proposal adds zero `dependencies` to `package.json`.

**Pure functions.** `formatRelativeTime(date, now, locale)` is `(Date | number, Date, string) => string`.
Spec covers determinism: same inputs → same output. Snapshot test across runtimes
(Node + Bun) catches drift.

**Bundle of two utilities.** S1 closes H17; S2 adds `formatDate` / `formatTime` so the
whole project has one consistent date layer. The audit didn't flag H17 in any other
file, but `formatDate` already exists as inline `toLocaleDateString()` calls in 3
places — the proposal unifies them.

## non-goals

- Adding calendar support (Hijri, Buddhist, etc.). `Intl` supports them via
  `calendar: 'islamic'`; out of scope.
- Time-zone math beyond what `Intl` provides. Hosts already pass a `locale`; we
  defer `timeZone` to a follow-up.

## architecture

```
packages/ui-extension/src/utils/
  format-relative-time.ts        # REWRITE: Intl.RelativeTimeFormat
  format-date.ts                 # NEW: Intl.DateTimeFormat wrapper
  format-time.ts                 # NEW: same
  format.ts                      # NEW: barrel re-export
```

## Slices

- global_gate: validate

### S1 — rewrite `formatRelativeTime` (H17)
- **Status**: done
- **Files**: packages/ui-extension/src/dashboard/format.ts
- **Gate**: validate
- **Note**: Subsumed by the sibling f00059 S5 (commit `3e07855b`), which already
  rewrote `formatRelativeTime` to `Intl.RelativeTimeFormat` honoring `locale` with
  `numeric: 'auto'`. The function lives at `packages/ui-extension/src/dashboard/format.ts`
  (not the `utils/format-relative-time.ts` path this proposal predicted), is exported
  via `packages/ui-extension/src/public/index.ts`, and is covered by
  `packages/ui-extension/tests/dashboard/format.spec.ts`. It no longer appends the
  locale in parens and `'es'` yields `'hace 5 minutos'` / `'en'` yields `'5 minutes ago'`.
  The injected-`now` signature `(date, now, locale)` this proposal sketched was not
  adopted; the shipped signature is `(iso: string, locale = 'en')` using `Date.now()`.

**Acceptance (original):** spec covers 6 inputs × 12 locales = 72 cases. With `locale='es'`,
`formatRelativeTime(now - 2*60_000, now, 'es')` returns `'hace 2 minutos'`. With
`locale='en'`, the same input returns `'2 minutes ago'`. The function never appends
the locale in parens.

### S2 — `formatDate` / `formatTime` wrappers
- **Status**: done
- **Files**: packages/ui-extension/src/dashboard/format.ts, packages/ui-extension/src/public/index.ts, packages/ui-extension/tests/dashboard/format.spec.ts
- **Gate**: validate
- **Note**: Added `formatDate` and `formatTime` as pure `(iso: string, locale = 'en') => string`
  wrappers around `Intl.DateTimeFormat`, co-located in `dashboard/format.ts` alongside
  the existing `formatRelativeTime` / `formatNumber` layer (the real "one date layer"
  home; the predicted standalone `utils/format-date.ts` / `format-time.ts` files were
  not created to avoid an orphan `utils/` tree nothing imports). Both pass invalid input
  through unchanged, mirroring `formatRelativeTime`. Exported via `public/index.ts`.
  Covered in `tests/dashboard/format.spec.ts` (locale-difference + determinism cases).

Same shape for the time wrapper. Both are pure `(date, locale) => string`.

### S3 — cross-runtime snapshot
- **Status**: done
- **Files**: packages/ui-extension/tests/dashboard/format.spec.ts, packages/ui-extension/src/dashboard/format.ts
- **Gate**: validate
- **Note**: Added an exact-string snapshot (12 locales × `formatDate` + 12 ×
  `formatRelativeTime`) in `tests/dashboard/format.spec.ts` (the real spec path; the
  predicted `utils/format-relative-time.spec.ts` does not exist). The snapshot is
  byte-pinned and runtime-agnostic: `formatDate` uses a midday-UTC instant (calendar
  day stable in every real time zone) and `formatRelativeTime` is driven from a
  `now`-relative input (no timer shim, so it passes under both Vitest/Node and raw
  `bun test`). Running the suite under both runtimes surfaced a real divergence — Bun
  ICU rendered `ar` dates with Arabic-Indic digits while Node rendered Latin digits.
  Fixed by pinning `numberingSystem: 'latn'` in `formatDate`/`formatTime`
  (`packages/ui-extension/src/dashboard/format.ts`), which is exactly the subtle-`Intl`
  drift this slice's risk table predicted. Verified: 31/31 pass under both Vitest and
  `bun test`.

## dependency graph

```
S1 (relative time) ─ independent ──┐
S2 (date + time)   ─ independent ──┤
S3 (snapshot)      ─ depends on S1 + S2 ──┘
```

## acceptance

`bun run validate` exits 0. The spec covers 72 locale × input combinations. The
project no longer has any call to `formatRelativeTime` that ignores `locale`
(`grep -RIn formatRelativeTime packages/` shows every call passes a locale).

## risks and mitigations

| Risk | Mitigation |
|---|---|
| Node 18 vs Bun 1.x ICU data drift | S3 catches it. We pin Node 18.17+ (the cutoff for stable `Intl.RelativeTimeFormat`). |
| `Intl.RelativeTimeFormat` returns `'now'` for zero diff (varies by locale) | We special-case `diffMs === 0` → return `rtf.format(0, 'second')` and assert the output in the spec. |
| Web targets lack `Intl.RelativeTimeFormat` | All evergreen browsers (Chrome 71+, Firefox 78+, Safari 14+) support it; the audit verified the project's browser baseline. |

## notes

The existing `formatRelativeTime` is exported from
[`packages/ui-extension/src/public/index.ts`](packages/ui-extension/src/public/index.ts ).
S1 keeps the export name; the change is a pure rewrite of the body.