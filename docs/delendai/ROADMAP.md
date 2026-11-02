---
schemaVersion: 1
horizons:
  - version: 0.2.0
    bumpHint: minor
    entries:
      - id: roadmap
        title: A versioned roadmap that says what a version promised
        kind: feature
        state: in-progress
        gates:
          - kind: proposal-done
            target: f00756
        proposals:
          - f00756
      - id: state-shadow
        title: The SQLite state driver runs as a shadow, its parity sampled
        kind: feature
        state: in-progress
        gates:
          - kind: proposal-done
            target: q00019
        proposals:
          - q00019
      - id: style-surface
        title: Who may define a selector, and what breaks when it changes
        kind: feature
        state: proposed
        gates:
          - kind: proposal-done
            target: f00548
        proposals:
          - f00548
      - id: capability-contract
        title: The project's contract between an agent and every external capability
        kind: feature
        state: proposed
        gates:
          - kind: proposal-done
            target: f00550
        proposals:
          - f00550
      - id: docker-tools
        title: Docker as a tool, autodetected and safe by default
        kind: feature
        state: proposed
        gates:
          - kind: proposal-done
            target: f00543
        proposals:
          - f00543
      - id: batuta
        title: Multi-account orchestration through the existing plugin and MCP
        kind: feature
        state: proposed
        gates:
          - kind: proposal-done
            target: f00551
        proposals:
          - f00551
  - version: 0.3.0
    bumpHint: minor
    entries:
      - id: fast-flow
        title: A pull request is proved locally and checks only what its change reaches
        kind: feature
        state: committed
        gates:
          - kind: proposal-done
            target: v00144
          - kind: proposal-done
            target: v00145
          - kind: proposal-done
            target: v00146
        proposals:
          - v00144
          - v00145
          - v00146
      - id: any-host-follows-the-flow
        title: Every agent, whatever its host or model, is held to its unit, its slice and its name
        kind: feature
        state: committed
        gates:
          - kind: proposal-done
            target: x00990
          - kind: proposal-done
            target: x00992
        proposals:
          - x00990
          - x00992
      - id: plugins-connect
        title: Every plugin a project loads connects, or says why it cannot
        kind: feature
        state: committed
        gates:
          - kind: proposal-done
            target: f00792
          - kind: proposal-done
            target: x00997
        proposals:
          - f00792
          - x00997
      - id: audit-settled
        title: Every finding of the joint audit is fixed, merged into another, or rejected with its reason
        kind: feature
        state: committed
        gates:
          - kind: proposal-done
            target: q00035
        proposals:
          - q00035
      - id: batuta-works
        title: Batuta delegates real work across hosts and BYOK models within the quota it can see
        kind: feature
        state: committed
        gates:
          - kind: proposal-done
            target: x00988
          - kind: proposal-done
            target: f00790
          - kind: proposal-done
            target: f00793
        proposals:
          - x00988
          - f00790
          - f00793
---
# Roadmap

This file is the authority for what each version of delendai promises.
The data is the block above; edit it by hand or with `roadmap_plan_init`
and `roadmap_plan_close`, and it is reviewed in the pull request like any
other change. Everything that shows it — the page on the site, the
editor view, `apps/web/src/data/roadmaps.json` — is regenerated from it,
and the timeline beside it records when each entry changed and why.

The first horizon was seeded on 2026-10-11 from the feature proposals
then in flight. An entry in `proposed` is a candidate, not a commitment:
moving it to `committed`, or withdrawing it with a reason, is the
owner's decision.

The 0.3.0 horizon was committed by the owner on 2026-10-29: the version
ships when the whole system works as it should — a fast, cheap, reliable
flow, plugins that connect, Batuta working, every host or model held to
the workflow, and every finding of the joint audit settled.

No entry carries a date. A date nobody can audit is a hope, not a
deadline; an estimate goes in only with where it comes from.
