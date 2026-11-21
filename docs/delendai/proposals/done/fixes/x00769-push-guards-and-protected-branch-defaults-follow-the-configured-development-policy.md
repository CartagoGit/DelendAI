---
id: x00769
title: "Push guards and protected-branch defaults follow the configured development policy"
kind: fix
status: done
type: proposal
track: general
date: 2026-09-30
last-transition-id: e73669b6-7ede-4c8d-b207-0f6c067bde62
last-correlation-id: e73669b6-7ede-4c8d-b207-0f6c067bde62
last-transition-from: review
shipped-in:
  - "e01ad21c5"
---

# x00769 — Push guards and protected-branch defaults follow the configured development policy

## Goal

The commit-policy push driver, the protected-branch defaults of the proposals, git and commit-policy plugins, and the startup alignment check must enforce and describe the configured development profile, never the branch names or the pull-request flow of this repository. A direct push to the integration branch is refused with the remedy of the resolved profile (merge, pull request or none). The release branch is protected from branches.release and only when it differs from the integration branch. Protected-branch defaults derive from the policy, and an explicit setting that contradicts the policy is reported at startup.

## why

A consumer on the merge profile was told to open a pull request, projects with integration on main could not push at all, and three plugins defaulted to main and master regardless of the policy.

## non-goals

- declare-workflow wording
- doctor and init
- branch-literal defaults of the proposals plugin outside the protected-branch default
- single-branch resolution in core

## Slices

- global_gate: none

### S1 — Policy-derived push refusal, protected-branch defaults and alignment warnings
- **Status**: done
- **Files**: `packages/core/src/lib/development-policy/protected-branches.ts`, `packages/core/src/lib/development-policy/validate.ts`, `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/development-policy/protected-branches.spec.ts`, `packages/core/tests/src/lib/development-policy/validate.spec.ts`, `plugins/commit-policy/src/lib/services/push-driver.ts`, `plugins/commit-policy/src/lib/contracts/branch.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`, `plugins/commit-policy/tests/src/lib/services/push-driver-integration-branch.spec.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/auto-work-persist.ts`, `plugins/git/src/index.ts`, `plugins/git/src/lib/tools/write-tools.ts`, `tools/scripts/lint/commit-push-strictness.script.ts`
- **Gate**: lint
- acceptance:
  - "Merge profile push to integration names merging, not a pull request"
  - "Direct profile with integration main can push to main"
  - "Release branch protected from branches.release, integration rules apply when they are equal"
  - "Contradicting protectedBranches, push and cadence settings are reported by validatePolicyAlignment"
- shipped-in: `e01ad21c5a21`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at e01ad21c5, validate exit 0, tests 63/63 — Delivered by #690 and #783. protected-branches + validate specs 44/44, commit-policy branch-policy specs 11/11, push-driver-profiles 8/8.

## acceptance

- Merge profile push to integration names merging, not a pull request
- Direct profile with integration main can push to main
- Release branch protected from branches.release, integration rules apply when they are equal
- Contradicting protectedBranches, push and cadence settings are reported by validatePolicyAlignment
