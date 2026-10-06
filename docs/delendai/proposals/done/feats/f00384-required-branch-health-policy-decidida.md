---
id: f00384
title: "required branch health policy decidida."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#required-branch-health-policy-decidida
shipped-in: ["1f82d68b"]
last-transition-id: 59ad47a1-8ef7-4134-9052-afede3a59804
last-correlation-id: 59ad47a1-8ef7-4134-9052-afede3a59804
last-transition-from: review
---

# f00384 — required branch health policy decidida.

## Goal

Migrated work item: required branch health policy decidida..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00384-required-branch-health-policy-decidida.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed c00010 is retired with an explicit paused-reason citing q00005/c00017/c00018, c00017/c00018 are done and shipped in 1f82d68b, and .github/workflows/verify-develop-health.yml exists as the operational side of that decision. CI-001 is satisfied.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md#required-branch-health-policy-decidida` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

### Independently verified 2026-09-01

The prior `review-log` below was false. Source recovered from commit
`11130767c`: CI-001, `develop` has no required checks/branch
protection; decide a health policy (GitHub required checks / bot
revert / deployment gate / branch-health lock / no-`done`-on-red)
explicitly rather than leaving it undecided. This was decided, twice,
on the record: `c00010` ("CI — required checks en develop branch
policy") is retired with an explicit `paused-reason`: "Superseded:
q00005/c00017/c00018 established that develop remains intentionally
unprotected; required checks belong to the protected release/staging
flow." `c00017` ("branch protection real via API GitHub — evidencia,
CI-005") and `c00018` ("develop nunca rojo — diseño de integración,
CI-006") are both `done`, shipped in `1f82d68b`, and record the
actual chosen design (shared-worktree direct pushes stay allowed;
"develop never red" is enforced by other means, not GitHub required
checks) plus the concrete constraints that ruled out required checks.
`.github/workflows/verify-develop-health.yml` exists as the
operational side of that decision. Closing on that evidence, not on
the placeholder review-log.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: approved by sonnet-reviewer-12 — confirmed c00010 is retired with an explicit paused-reason citing q00005/c00017/c00018, c00017/c00018 are done and shipped in 1f82d68b, and .github/workflows/verify-develop-health.yml exists as the operational side of that decision. CI-001 is satisfied.
