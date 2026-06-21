---
id: f00024
status: done
type: proposal
track: metrics+ci
date: 2026-06-21
kind: feat
title: Metrics longitudinal regression gate (per-release snapshot diff)
shipped-in: []
ownership:
    - { agent: implementation_runner, task: 'S1-S4: baseline retrieval + diff gate + CI wiring + audit close' }
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

## risks and mitigations

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

## notes

- Master audit: `docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md`
  (M29, "Métricas persistentes").
- M12 / M29 foundations: same audit §7 "P3 — Plataforma de referencia".
- `metrics` tool source: `packages/core/src/lib/metrics/metrics-tool.ts`.

## rationale

Design decisions not obvious from the slices above:

- **Path convention deviation**: the proposal text specified `scripts/metrics/*`,
  but the repo's actual convention (see `tools/scripts/lint/`, `tools/scripts/smoke/`)
  is `tools/scripts/<category>/<name>.script.ts`. There is no top-level `scripts/`
  directory in this repo — implemented under `tools/scripts/metrics/` instead,
  matching every sibling tool script and picked up automatically by the root
  `vitest.config.ts` `projects: ['tools/scripts']` glob.
- **Baseline distribution via release asset, not a fixed snapshot path**: the
  GitHub Releases API does not expose "the metrics file from commit X" directly;
  the simplest durable channel is a release asset named `metrics-baseline.json`
  attached at publish time (a follow-up to `release.script.ts`, not part of this
  proposal's slices — documented here so it is not lost). `get-baseline.script.ts`
  resolves `GET /repos/:owner/:repo/releases/latest`, finds that asset, and
  downloads it; `no-previous-release` / `no-snapshot-asset` are both treated as
  "skip the gate", not as fatal errors, matching R1.
- **Bytes/call and ms/call, not raw totals**: the persisted `metrics` snapshot
  already aggregates `totalBytes`/`totalMs` across the *whole process* lifetime,
  which depends on how many times each tool was called. Diffing raw totals would
  conflate "the gate called the tool more times" with "the tool got more
  expensive". Normalising to bytes-per-call / ms-per-call before diffing isolates
  the per-call cost regression the gate is meant to catch (the real proxy for
  token cost per AGENTS.md M12).
- **`collect-candidate.script.ts` calls only `_overview` and `_compact_status`-like
  tools repeatedly**: calling every tool in the swarm preset (some of which
  mutate state, e.g. `agent_lock`) would pollute the candidate run with
  side-effecting calls unrelated to the regression being measured. The gate's
  scope (per the proposal's `Why`) is "overview / auto_work / any single tool" —
  the compact, read-only entry points are the ones whose token cost actually
  drives the swarm's per-turn budget; covering every write tool is future work,
  not a regression in this slice's scope.
- **SOLID applied**: `get-baseline.script.ts` (fetch a baseline),
  `diff-snapshots.script.ts` (pure diff + render), and
  `collect-candidate.script.ts` (drive a live server) are three modules with
  exactly one reason to change each (network/auth, comparison math, MCP client
  orchestration). `diffSnapshots` takes its `IThresholds` as a parameter
  (dependency inversion) instead of reading `process.env` internally, which is
  what makes 7 of its 12 test cases pure-function unit tests with zero mocking.
