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

No entry carries a date. A date nobody can audit is a hope, not a
deadline; an estimate goes in only with where it comes from.
