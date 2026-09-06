---
adr_id: 0019
title: "Branch model: develop is the lab, main is publication"
status: Accepted
date: 2026-08-29
deciders:
  - operador (commit 20c699a9)
  - independent audit Claude Opus 5 (AUD-A01)
supersedes: null
superseded_by: null
related_proposals:
  - d00013
  - x00273
related_audit:
  - docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
---

# ADR 0019 — Branch model: `develop` is the lab, `main` is publication

> Status: **Accepted**.
> Date: 2026-08-29.

## Numbering note

This proposal (`d00013`) was written to reserve `ADR 0018`, and
`x00273` (the guard that implements this decision, already shipped in
`6ff19f8d`) cites "ADR 0018" in its own text because at that moment
that was the next free number. Between `2026-08-30` (ship of
`x00273`) and `2026-08-29`→`2026-09-02` (actual drafting of this ADR),
other work took `0018` (`docs/delendai/adr/0018-managed-lazy-loading-is-all-or-nothing.md`,
committed `2026-09-02`). This document is registered as **ADR 0019**
in its place; mentions of "ADR 0018" inside `x00273` refer to this
decision, not to managed-lazy-loading.

## Context

The repository went through two successive branch governance postures:

1. **Initial posture (audited snapshot):** `develop` was declared
   protected in `.github/branch-protection.ts`, but with no actual
   protection applied in GitHub — an asymmetry between the declared
   and the effective state that the independent audit (AUD-A01) flagged
   as a BUG.
2. **Correction, and over-correction:** commit `20c699a9` tells the
   story in its own message: *"I got this wrong earlier: I
   protected develop and routed everything through pull requests...
   I changed governance without reading the backlog."* The operator
   had protected `develop` without knowing the backlog (`c00156`), which
   introduced friction into the daily workflow unnecessarily —
   `develop` is, in this repository, the working space of a
   single human operator, not a trunk shared by a team.
3. **Current posture (what this ADR fixes):** the same commit
   `20c699a9` introduces an explicit `protected` flag per branch in
   `IBranchPolicy`: `develop: protected: false` on purpose, `main:
   protected: true` with `required_checks: ['ci-complete']`. The
   audit reclassified the original asymmetry from BUG to "open design
   risk": the underlying decision was never recorded outside the code
   and a commit message.

Verified in the source session (2026-08-29) and again when writing this
ADR: GitHub does not require pull request to land in `main`. The
response from `gh api repos/CartagoGit/delendai/branches/main/protection`
does not include the `required_pull_request_reviews` key at all — the
toggle is not disabled; it was never configured. A SHA that already has
`ci-complete` green on another branch can land in `main` by fast-forward
without any pull request ever existing.

## Decision

`develop` is the operator's working lab: no GitHub protection, direct
push allowed, no mandatory GitHub checks. The only lock that applies
to `develop` is local and asymmetric by role:
`push-to-develop-discipline.script.ts` blocks an **agent** from pushing
directly — agent work goes through `wip/*` + pull request — but does
not restrict the human operator.

`main` is the publication branch: protected in GitHub
(`required_status_checks: ci-complete`, `enforce_admins: true`,
`required_linear_history: true`, no force-push or deletion). No
direct push to `main` — human or agent — is intended as a valid path;
every change enters via pull request.

This asymmetry is deliberate, not drift: a single operator gains
nothing from a protected `develop` beyond friction, while `main`
does need the lock because it is the point from which versioning
and publishing are derived.

## Consequences

### Positive

- The operator works without friction in their own repository; they do
  not need to open a pull request for their own lab work.
- `main` remains trustworthy as the release point: everything landing
  there passed `ci-complete` green and, on the intended path, review.
- The asymmetry is declared in writing instead of living only in a
  commit message — the next session (agent or human) has a document
  to point to before "correcting" the policy again.

### Negative

- `develop` can stay red indefinitely with no GitHub gate preventing it
  — mitigated by health verification (`verify:*`), not by branch protection.
- **Real gap, already known and already closed on the local side:**
  without "Require a pull request before merging" enabled in GitHub for
  `main`, a SHA with `ci-complete` green on another branch could, in
  theory, land in `main` by fast-forward without a pull request. The
  side this repository can control without depending on a manual
  adjustment in the GitHub UI is closed by `x00273` (local guard +
  `release-pr-gate` gate in pre-push and CI). Enabling the toggle in
  the GitHub UI remains a manual action pending from the operator.

## Trigger for reversal

| #   | Condition                                                                       | Metric                                                    | State                                                    |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| 1   | A second human contributor starts working on `develop`                          | number of distinct authors in `git log develop`           | measure quarterly                                        |
| 2   | `develop` accumulates >5 consecutive red commits                                | `gh api .../commits/{sha}/check-runs`                     | blocking — reopen protection of `develop`                |
| 3   | A direct push to `main` lands with no associated pull request                   | `gh api .../commits/{sha}/pulls` empty on a `main` commit | blocking — investigate the guard (`x00273`)              |
| 4   | GitHub adds "Require a pull request" with exception for the operator themselves | GitHub changelog                                          | reassess whether enabling without friction is worthwhile |

If trigger 2 or trigger 3 materialize, reopen `x00273` with
expanded scope.

## Verification

- `gh api repos/CartagoGit/delendai/branches/main/protection` —
  confirms what GitHub requires today for `main`; absence of
  `required_pull_request_reviews` is the known gap (trigger 4).
- `tools/scripts/lint/push-to-develop-discipline.script.ts` — confirms
  that an agent cannot push directly to `develop`.
- `tools/scripts/lint/release-pr-gate.script.ts` (via `x00273`) —
  confirms that neither human nor agent can push directly to `main`
  from the side the repository controls.

## References

- `d00013` — proposal that originated this ADR.
- `x00273` — direct-push-to-`main` guard that implements this
  decision (cites "ADR 0018"; see "Numbering note" above).
- `docs/delendai/GOVERNANCE-BRANCH-PROTECTION.md` — declarative policy
  and operational playbook to apply/verify the actual GitHub protection.
- `docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md`
  (AUD-A01) — original finding of the asymmetry without a written decision.
