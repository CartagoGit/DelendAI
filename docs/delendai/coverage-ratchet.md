# Coverage ratchet policy

`vitest.config.ts` (`test.coverage.thresholds`) is a no-regression gate,
not a target. It only runs under `bun run test:coverage`; the plain
`bun run test` skips coverage entirely so day-to-day runs stay fast.

## The rule

Each threshold (statements/branches/functions/lines) is set to
`floor(measured − 1.0pt)`, where "measured" is the lower of at least two
back-to-back `test:coverage` runs. The 1.0pt margin was sized from
observed run-to-run drift on this suite (~0.05-0.1pt per metric across
two consecutive runs on 2026-08-29) — about 10x that drift, enough to
absorb ordinary noise without leaving enough slack to hide a real
regression.

**A threshold must never move down**, only up. If a fresh measurement
comes out below the currently declared threshold, that is coverage
regressing — a bug to find and fix, not a number to relax.

## How to re-tighten

1. Run `bun run test:coverage` and read the "Coverage summary" block
   under `.cache/coverage`.
   - If every spec is green, this just works.
   - If a spec is currently red, vitest's coverage provider skips
     report generation on any test failure unless told otherwise
     (`onTestFailure` cleans up the coverage files when
     `reportOnFailure` isn't set). To measure anyway, run vitest
     directly with the flag forced on, e.g.:
     `bun tools/scripts/lib/with-compute-lock.script.ts test:coverage -- ./node_modules/.bin/vitest run --coverage --coverage.reportOnFailure=true`
     (still goes through the shared compute lock — see that script's
     header for why that matters with concurrent agents).
2. Run it twice; take the lower value per metric if they differ.
3. Set each threshold to `floor(measured − 1.0)`.
4. Update the comment above `thresholds` in `vitest.config.ts` with the
   date and the two measured readings, so the next person can see
   whether the margin is still appropriately sized for the drift they
   observe.

## Known gap

Because coverage reporting is skipped on any test failure (see step 1
above), a red test suite currently means the threshold gate silently
does not run at all under the plain `bun run test:coverage` — it exits
non-zero from the test failures themselves, not from a threshold
check. That's a real gap (a red suite plus a coverage drop would ship
unnoticed), but fixing it means changing `coverage.reportOnFailure` in
`vitest.config.ts`, a behavioral change beyond this note's scope of the
`thresholds` block — flagged here for whoever picks it up next.
