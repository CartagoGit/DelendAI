---
adr_id: 0020
title: "Branch model: develop integrates through pull requests"
status: Accepted
date: 2026-09-10
deciders:
  - operador
  - independent audit ChatGPT (2026-09-10, finding P1)
supersedes: 0019
superseded_by: null
related_proposals:
  - d00013
  - x00273
---

# ADR 0020 — Branch model: `develop` integrates through pull requests

> Status: **Accepted**. Supersedes ADR 0019.
> Date: 2026-09-10.

## Context

ADR 0019 decided that `develop` was a laboratory: deliberately
unprotected, with direct operator pushes, and `main` as the only review
boundary. That was a reasonable answer to the problem it faced — an
earlier posture had *declared* `develop` protected while GitHub applied
nothing, and the correction was to stop pretending.

The `shared-checkout-pr` migration changes the problem. `develop` is now
the branch that certified work lands on, and the live repository
enforces it: protected, pull request required, linear history, no force
push, no deletions, administrators included.

ADR 0019 was left `Accepted`, with `superseded_by: null`.

## Why this is a defect and not just stale prose

Two agents reading the repository correctly could reach incompatible
conclusions and both believe they were following instructions:

- one reads the effective configuration and the resolved development
  policy: work reaches `develop` only through a pull request;
- the other reads an `Accepted` ADR: `develop` is a lab, direct push is
  the expected operator path.

In a single-human repository that is a documentation smell. In a
multi-agent one it is a coordination fault, because the ADR is not
commentary — it is an input agents are told to obey. This is the same
class as the governance drift the migration has been closing all along,
one layer up: several documents answering one question differently.

It was found by an independent audit and classified P1 for exactly that
reason.

## Decision

1. `develop` is the **integration branch**. Work reaches it through a
   pull request that passes the required checks. There is no expected
   direct-push path, for operators or for agents.
2. `main` remains the **release boundary**, strictly stronger than
   integration: the same checks plus the release gate, and a human
   approval.
3. ADR 0019 is `superseded_by: 0020`.

## Consequences

The branch shape itself is not restated here, and that is the point.
`delendai.config.json` carries the canonical development policy;
`.github/settings.yml`, `.github/branch-protection.yml` and
`.github/branch-protection.ts` are generated from it, and
`lint:forge-settings --check` fails when a committed projection drifts.

An ADR that repeated the check names or the approval counts would become
a fifth place to disagree — which is what produced this one. It records
the DECISION (integration happens through pull requests) and delegates
every parameter to the policy.

The audit's own recommendation was that branch-protection documentation
be generated from the same typed structure that produces the real
policy. It now is; this ADR is the part that cannot be generated,
because "why" is not derivable from a config file.
