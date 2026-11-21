---
id: x01107
title: "Fix four open CodeQL alerts on develop (493, 494, 495, 492)"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: d9948468-ff0a-4086-bb14-ded83e4e2e03
last-correlation-id: d9948468-ff0a-4086-bb14-ded83e4e2e03
last-transition-from: ready
last-transition-at: 2026-11-21T01:31:42.113Z
---

# x01107 — Fix four open CodeQL alerts on develop (493, 494, 495, 492)

## goal

Close CodeQL alerts #493 #494 (polynomial ReDoS in git diff header parsing), #495 (http-to-file-access in verify-develop-health) and #492 (no-op identity replace in a spec) at the root, before develop is promoted to main.

## why

The alerts are open on develop and block promotion. #493/#494: two copies of a backtracking regex over untrusted diff text; one linear parser in @delendai/git replaces both. #495: an API-derived dashboard is written to a caller-supplied path; the path must be validated and only the known serialised shape written. #492: SCOPED.replace('x00001-S1-G2','x00001-S1-G2') is a no-op so the test never exercised a spelling variant. Finding on why they reached develop: the required CodeQL check only proves the analysis job ran; no code-scanning result gate (only the branch-namespace ruleset exists), and the alerts first appeared on develop at merge commit 4f6a215fe. No fix in this proposal.

## non-goals

- Dismissing alerts
- Adding a code-scanning merge gate (finding only)
- Changing the diff-path semantics of either plugin

## slices

- global_gate: none

### S1 — Shared linear git diff path parser
- **Status**: pending
- **Files**: `plugins/git/src/lib/services/git.ts`, `plugins/git/src/public/index.ts`, `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`, `new:plugins/git/tests/src/lib/diff-paths.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "plugins/git/tests/src/lib/diff-paths.spec.ts: parseDiffFilePaths in @delendai/git reads diff --git headers with lastIndexOf and +++ b/ lines, no backtracking regex"
  - "plugins/git/tests/src/lib/diff-paths.spec.ts passes with both plugin specs; alerts 493 and 494 close"
  - "diff-paths.spec.ts: an adversarial 100k-char header finishes in well under 100ms"

### S2 — verify-develop-health output path validation
- **Status**: pending
- **Files**: `tools/scripts/ci/verify-develop-health.script.ts`, `new:tools/tests/ci/verify-develop-health-output.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "tools/tests/ci/verify-develop-health-output.spec.ts: --output is resolved and must stay inside the workspace (or be an explicit absolute path accepted deliberately), otherwise exit 2"
  - "verify-develop-health.spec.ts still passes: only the serialised known dashboard shape is written"
  - "verify-develop-health-output.spec.ts covers traversal rejection and valid path; alert 495 closes"

### S3 — Fix no-op replace in work-unit-generation e2e spec
- **Status**: pending
- **Files**: `packages/core/tests/src/lib/work-units/work-unit-generation.service.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "work-unit-generation.service.e2e.spec.ts after PR 3149 (merged): develop already reads `const scoped = SCOPED;`, so nothing is left to change here"
  - "work-unit-generation.service.e2e.spec.ts passes; alert 492 closes"

## acceptance

- parseDiffFilePaths in @delendai/git reads diff --git headers with lastIndexOf and +++ b/ lines, no backtracking regex
- plugins/git/tests/src/lib/diff-paths.spec.ts passes with both plugin specs; alerts 493 and 494 close
- diff-paths.spec.ts: an adversarial 100k-char header finishes in well under 100ms
- tools/tests/ci/verify-develop-health-output.spec.ts: --output is resolved and must stay inside the workspace (or be an explicit absolute path accepted deliberately), otherwise exit 2
- verify-develop-health.spec.ts still passes: only the serialised known dashboard shape is written
- verify-develop-health-output.spec.ts covers traversal rejection and valid path; alert 495 closes
- work-unit-generation.service.e2e.spec.ts after PR 3149 (merged): develop already reads `const scoped = SCOPED;`, so nothing is left to change here
- work-unit-generation.service.e2e.spec.ts passes; alert 492 closes
