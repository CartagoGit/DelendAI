---
id: c00017
title: "branch protection real vía API GitHub — evidencia (CI-005)"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "CI-005 — La policy declarativa existe, pero `develop` no estaba protegido realmente"
shipped-in:
    - 1f82d68b # docs(proposals): Track I evidence + explicit CI-005/CI-006 decisions (c00017, c00018)
---

# c00017 — branch protection real vía API GitHub — evidencia (CI-005)

## Goal

Confirm — with real GitHub API evidence, not just the presence of a YAML
file — whether `develop` is actually protected, and produce the exact,
reviewed command to close the gap.

## why

CI-005 (P2): `.github/branch-protection.yml` exists but nothing applies
it to the real repo. A declarative file nobody runs is not protection.

## Evidence gathered (this session, real API calls)

```
$ gh api repos/CartagoGit/mcp-vertex/branches/develop --jq '{protected: .protected}'
{"protected": false}
$ gh api repos/CartagoGit/mcp-vertex/branches/develop/protection
{"message":"Branch not protected", ...}  (HTTP 404)
$ gh api repos/CartagoGit/mcp-vertex/rulesets
[]
```

**CI-005 is confirmed still open**: zero real protection exists on
`develop` as of this session — the audit's finding was accurate and
still is.

## Decision — NOT applied this session (human blocker, see below)

`.github/branch-protection.yml` already declares the target state
(`enforce_admins: true`, no required PR reviews — consistent with this
repo's actual workflow: `agentWorktree: false`, agents commit directly
to `develop`, no per-agent branches) and lists every CI job as a
required status check, including ones that are **currently red for
reasons unrelated to any single proposal** (see c00018 and this
session's own CI reality-gate findings: a proposal-folder-duplication
drift from concurrent swarm work, a Node/`dist` module-resolution bug
matching x00193's reopened territory, and `apps/web`'s manifest
generation in `lint-docs`).

Applying that exact config to the real repo **right now**, while:
- multiple agents are actively pushing directly to `develop` in this
  same session, and
- CI is red across several jobs for reasons spanning multiple other
  tracks not yet closed,

is a real-infrastructure change with repo-wide blast radius that I am
not making unilaterally. This is exactly the class of action the swarm
rules reserve for an explicit human call ("never merge anything this
repo's real conventions gate behind a human/CI... state clearly if
you're unsure and leave it ready instead of doing it").

## Ready-to-execute plan (for the human to run, or to hand to an agent
once the sequencing below is satisfied)

```bash
gh api --method PUT repos/CartagoGit/mcp-vertex/branches/develop/protection \
  -f enforce_admins=true \
  -F required_status_checks='{"strict":true,"contexts":["lint-biome","lint-architecture","lint-presets","lint-security","typecheck","verify-runtime","tokens-budget-real","manifests-check","generated-artifacts-check"]}' \
  -F required_pull_request_reviews=null \
  -F restrictions=null
```

Note this list is **narrower** than `.github/branch-protection.yml`'s —
see c00018 for why (sequencing: only gate on jobs that are reliably
green today; widen the list as each currently-red job is fixed for
real, verified on 2+ consecutive green runs, not just once).

## Slices

- global_gate: none

### S1 — Evidence + decision (this proposal)
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/c00017-...md` (this file)
- **Gate**: none

### S2 — Apply real protection (BLOCKED on human decision)
- **Status**: blocked
- **Files**: none yet — the `gh api` call above, run by a human or an
  agent explicitly told to proceed
- **Gate**: none
- **Blocker**: needs (a) a human decision on which check list to require
  first (the narrow one above vs. the full `.github/branch-protection.yml`
  list), and (b) confirmation this doesn't conflict with any other
  agent's in-flight push at the moment it's applied.

## acceptance

- Real API evidence gathered and recorded (done, above).
- A concrete, reviewed `gh api` command exists, ready to run (done).
- Actually applying it is explicitly deferred to a human decision —
  documented as a genuine blocker, not silently skipped.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
