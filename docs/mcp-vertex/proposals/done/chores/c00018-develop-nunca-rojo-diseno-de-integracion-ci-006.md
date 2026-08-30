---
id: c00018
title: "develop nunca rojo — diseño de integración (CI-006)"
kind: chore
status: done
type: proposal
track: ci
date: 2026-08-25
parent-plan: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "CI-006 — Direct pushes + CI post-push no garantizan que `develop` nunca quede rojo"
shipped-in:
    - 1f82d68b # docs(proposals): Track I evidence + explicit CI-005/CI-006 decisions (c00017, c00018)
---

# c00018 — develop nunca rojo — diseño de integración (CI-006)

## Goal

Pick, explicitly, which of CI-006's integration designs this project
wants, given the *actual observed* workflow — not a hypothetical one.

## why

CI-006 (P2): direct pushes + CI-after-the-fact cannot, by construction,
prevent a broken commit from becoming `develop`'s HEAD — CI only reports
red *after* the push already landed. This session reproduced that
concretely: 3 of my own commits (`c24a89d8`, `a23f45d4`, `0bd0d1a9`)
each landed on `develop` immediately, and only became known-red or
known-green minutes later once CI finished.

## Real, observed constraints (gathered this session — not assumed)

- `agentWorktree: false` (`docs/mcp-vertex/AGENT-BOOTSTRAP.md` /
  `mcp-vertex.config.json`): every agent shares one working directory
  and commits directly to `develop`. No per-agent branches exist today.
- Multiple agents pushed to `develop` concurrently throughout this very
  session (confirmed via `git log`, overlapping proposal-file churn, and
  CI runs for interleaved SHAs).
- `develop`'s CI has been red across **several unrelated jobs at once**
  for most of this session — not one blocking bug but a pile of
  independent ones (a proposal-folder-duplication drift from concurrent
  proposal work; a Node/`dist` module-resolution failure matching
  x00193's territory, affecting `pack smoke`, `metrics longitudinal
  regression gate`, and cascading into `web site build`; `apps/web`'s
  generated manifests missing in `lint-docs`; `proposals`-plugin test
  regressions in `tests`/`quality-gate`). None of these are related to
  each other, and none are addressed by this proposal — see the
  session's own findings, reported separately.

## Decision

Given the above, a **PR + human review** gate (option 3) is explicitly
**not** a fit: it would contradict the project's own stated model
(agents commit directly, no per-agent branches exist to open PRs from
today) and CI-006 itself says not to impose human review if that isn't
already the goal.

Recommended: **staging-ref → CI → bot fast-forwards `develop`** (option
2), because it preserves the direct-push-feeling workflow (agents still
push immediately, to a staging ref) while making the promotion to
`develop` itself conditional on green CI — closing exactly the gap this
finding describes, without inventing per-agent branches or a merge
queue this project doesn't otherwise need.

**Not implemented in this session** — this is a real change to how
every agent in this swarm integrates work, decided while several agents
were actively mid-flight on `develop` itself. Flipping the integration
model out from under concurrent, uncoordinated agents (some of whom
would need to switch from pushing `develop` to pushing a staging ref
mid-session) is exactly the kind of repo-wide behavioral change that
needs the human's go-ahead and a coordinated rollout window, not a
unilateral agent decision. Recorded as the decision + rationale; the
build-out (staging ref, the promotion bot/workflow, updating
`AGENT-BOOTSTRAP.md`'s contract, updating `agent_worktree`/`sync_proposals`
tooling that assumes direct `develop` pushes today) is follow-on work
for whenever the human confirms the rollout window.

## non-goals

- Does not implement the staging-ref promotion mechanism itself (that's
  the follow-on work above).
- Does not touch `c00017`'s branch-protection settings (sequenced
  separately; a staging-ref model changes *what* gets protected).
- Does not impose PR-based human review.

## Slices

- global_gate: none

### S1 — Explicit decision recorded
- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/c00018-...md` (this file)
- **Gate**: none

### S2 — Build the staging-ref → CI → fast-forward mechanism
- **Status**: blocked
- **Files**: TBD (`.github/workflows/*.yml` promotion workflow,
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md` contract update, proposals-plugin
  tooling that currently assumes direct `develop` pushes)
- **Gate**: none
- **Blocker**: needs the human to confirm the rollout window (this
  changes how every concurrently-active agent pushes) and to sequence
  it against c00017 (protection settings depend on which ref is
  "the branch that must stay green").

## acceptance

- An explicit design decision is recorded, with real observed evidence
  for why (not a hypothetical justification).
- A broken commit still cannot silently become `develop`'s integrated
  HEAD once S2 ships — deferred, not silently dropped.
- Agent velocity is preserved: the chosen design does not add a human
  review gate the project doesn't already have.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
