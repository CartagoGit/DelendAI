---
id: f00027
status: ready
type: proposal
track: metrics+ci
date: 2026-06-21
kind: feat
title: Metrics longitudinal regression gate (per-release snapshot diff)
---

# f00027 — Metrics longitudinal regression gate (per-release snapshot diff)

## Goal

Close the master audit's M29 follow-up (line 565) by adding a **CI gate**
that compares a fresh `metrics --persist` snapshot against the **last
release's** snapshot, and **fails the build** on regressions above an
agreed threshold (e.g. +20% tokens on `overview` / `auto_work` / any
single tool).

## Why

- M29 already shipped `metrics { persist: true }` which dumps a JSON
  snapshot under `<cacheDir>/metrics/<ISO>.json`. The data is there; the
  *gate* is missing.
- Without a gate, "we measure tokens" is a one-off — the regression
  protection relies on a human noticing a number go up. The whole point
  of M12 was to make token cost a *first-class* invariant.
- The 3rd-party agnostic audit (GPT-5.4, 18-06) flagged this as the
  single highest-leverage hardening remaining after M29.

## Non-goals

- Replacing the existing in-process token-budget e2e (it tests the
  **current** budget; this proposal tests the **delta** between
  releases).
- A UI for browsing historical metrics (out of scope; the JSON snapshots
  + the CI summary are the deliverable).
- Long-term storage beyond the last 2 snapshots (we keep the last release
  on disk; older ones are GC'd).

## Slices

### S1 — Baseline snapshot retrieval
  - **Status**: ready
  - **Files**: `scripts/metrics/get-baseline.ts` (new — pulls the
    `metrics-<lastReleaseTag>.json` from the GitHub release assets of the
    previous tag, or fails gracefully if the tag doesn't exist yet),
    `scripts/metrics/get-baseline.spec.ts` (new — 4 cases: tag exists,
    tag missing, rate-limited, malformed JSON).
  - **Command**: `bunx vitest run scripts/metrics`
  - **Expect**: pass; pure function over HTTP + filesystem.

### S2 — Diff + threshold gate
  - **Status**: ready
  - **Files**: `scripts/metrics/diff-snapshots.ts` (new — loads baseline
    + candidate, computes per-tool delta in `tokens`, `latencyMs`,
    `responseBytes`; emits a markdown report and exits non-zero if any
    tool exceeds the threshold),
    `scripts/metrics/diff-snapshots.spec.ts` (new — 6 cases: no
    regression, +20% tokens (fail), +5% (pass), new tool added (info,
    pass), tool removed (warn, pass), corrupted baseline (fail loud)).
  - **Command**: `bunx vitest run scripts/metrics`
  - **Expect**: pass; thresholds are configurable via env vars
    (`METRICS_TOKEN_DELTA_PCT`, `METRICS_LATENCY_DELTA_PCT`,
    `METRICS_BYTES_DELTA_PCT`).

### S3 — Wire into CI
  - **Status**: ready
  - **Files**: `.github/workflows/ci.yml` (new job `metrics-gate`:
    checkout, install, build, run a synthetic MCP client that calls
    `metrics` on every tool 3 times, persist, diff against the
    retrieved baseline, post the markdown report as a job summary).
  - **Command**: `bun run validate && gh workflow run ci.yml --job metrics-gate`
    (the second is documented; not part of `validate`).
  - **Expect**: green on the current codebase; the job produces a
    non-empty summary.

### S4 — Audit close
  - **Status**: ready
  - **Files**: `docs/proposals/audits/a1-16-06-2026-…md` (line 565 → `[x]`
    with link to this proposal).
  - **Command**: none.
  - **Expect**: master audit line 565 is `[x]`.

## Acceptance

- [ ] `scripts/metrics/diff-snapshots.ts` runs end-to-end against two
      hand-crafted fixtures (one passing, one failing).
- [ ] CI job `metrics-gate` runs on every PR; failing on a synthetic
      +50% regression in `overview`.
- [ ] The job summary is a markdown table readable from the PR UI.
- [ ] Master audit line 565 is `[x]`.

## Risk register

- **R1 — First run has no baseline (the very first release with this
  gate)**: S1's "fail gracefully if the tag doesn't exist yet" path
  is the answer. The first release publishes the baseline *as part of*
  the release artefacts; the gate starts enforcing on the *second*
  release. Documented in the README.
- **R2 — Flaky runs on shared CI**: average over 3 calls (S3) and use
  `bun test` deterministic mode. Threshold of 20% is conservative
  precisely to absorb CI noise.
- **R3 — Network access from the CI job** (for the baseline pull):
  GitHub Actions runners have internet; the script uses the built-in
  `fetch` with a 5 s timeout. No new dependency.

## Linked references

- Master audit: `docs/proposals/audits/a1-16-06-2026- Auditoría Maestra (Unificada).md` (line 565).
- M12 / M29 foundations: same audit §7 "P3 — Plataforma de referencia".
- `metrics` tool source: `packages/core/src/lib/metrics/metrics-tool.ts`.
- Existing token-budget e2e: `plugins/proposals/tests/src/e2e/token-budget.spec.ts`
  (or equivalent — `rg token-budget plugins/` to confirm).
