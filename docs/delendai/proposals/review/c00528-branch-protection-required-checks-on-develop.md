---
id: c00528
title: "Branch protection — required checks on develop"
kind: chore
status: ready
type: proposal
track: operations
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-BRANCH-PROTECTION-039
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - c00528
---

# c00528 — Branch protection on develop

## Goal

Enable GitHub branch protection on develop so the only merges are
either from a passing `validate` run or from a review-approved PR.
Combined with the SQLite migration (q00022), this is the operational
backbone that prevents concurrent agents from silently corrupting the
operational state.

## Why

The audit was very direct:

> Aquí encontré un problema de proceso bastante claro: el snapshot
> inspeccionado de develop aparecía como rama no protegida. Con
> agentes autónomos yo exigiría al menos:
>   - required test
>   - required typecheck
>   - required migration test
>   - required reconcile test
>   - required invariant test
> antes de poder integrar. Y, si se permite escribir directamente en
> develop, establecería como mínimo un sistema de lease o PRs/colas
> para las partes críticas.

Today develop is open: any agent (or human) can `git push` after a
local `validate`. That is exactly the situation the audit warns
against: with multiple agents concurrently committing, the SQLite
truth model that the rest of the migration is building is unprotected
against a buggy commit.

## Why this design

**Required checks from `bun run validate`.** The branch protection
config requires every status check the existing `ci.yml` workflow
runs (typecheck, lint, tests, drift, etc.) to pass before a PR is
mergeable.

**No direct pushes to develop.** Direct pushes are blocked; merges
flow through PRs. The existing lefthook discipline
(`push-to-develop-discipline`) becomes redundant for merges, but the
hook stays for the rare cases where it adds value.

**Bot bypass preserved.** Repo bots (Copilot, Renovate, etc.) keep a
bypass list because their commits are auto-generated and trusted. The
list is auditable in the GitHub UI.

**Documented in `AGENT-BOOTSTRAP.md`.** The bootstrap points at this
proposal's accepted slice as the canonical "before pushing to
develop, do this" reference.

## non-goals

- Do NOT change the `main` branch protection rules in this proposal
  (they already exist and are stricter).
- Do NOT introduce CODEOWNERS changes; the existing owners stay.
- Do NOT change the lefthook pre-push guard (it remains a belt-and-
  suspenders check).

## Slices

- global_gate: lint

### S1 — .github/settings.yml: branch requires status checks

- **Status**: pending
- **Files**:
  - `.github/settings.yml` (new — Probot settings repo)
  - `docs/delendai/AGENT-BOOTSTRAP.md` (modified — adds the link
    to this proposal as the canonical reference)
  - `tools/scripts/lint/branch-protection-guard.script.ts` (new —
    CI lint that fetches develop protection rules via `gh api`
    and asserts they match this proposal)
- **Gate**: type
- acceptance:
  - `.github/settings.yml` declares develop as a protected branch
    with `required_status_checks` referencing the existing CI
    jobs.
  - Direct push to develop is rejected for non-bypass users.
  - The lint script verifies the rules from CI.
  - `bun run validate` is green.

### S2 — delendai-validate summary check aggregates the existing gates

- **Status**: pending
- **Files**:
  - `.github/workflows/ci.yml` (modified — adds a single
    delendai-validate job that depends on every existing
    typecheck / lint / test / drift job and that is the one the
    branch protection actually checks)
  - `tools/scripts/ci/validate-summary.script.ts` (new — helper
    that the workflow uses to assemble the summary)
  - `tools/tests/ci/validate-summary.script.spec.ts` (new)
- **Gate**: type
- acceptance:
  - The workflow defines a single delendai-validate job whose
    only `if` is `success()` of every other gate.
  - Branch protection refers to this single job name.
  - Local `bun run validate` already exits with the right code;
    this slice only changes the CI surface.

## acceptance

- All S1-S2 slices land.
- The develop branch is protected; pushes that bypass CI are
  rejected.
- The audit invariant on "no develop libre con múltiples agentes"
  is demonstrably satisfied.

## notes

- This proposal owns GitHub-side configuration, which the
  repo-owner needs to merge. The slice list is sized for one
  reviewer pass.