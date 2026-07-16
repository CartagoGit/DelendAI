---
id: q00002
status: review
type: plan
track: adoption+extension
date: 2026-07-15
kind: plan
title: Self-managing mcp-vertex — consumer repos bootstrap, migrate and observe themselves
related:
    - f00089 # adoption umbrella (mcpv init foundations this plan builds on)
    - f00115 # test-policy plugin — the pattern for default-on agent guidance
contains:
    proposals:
        - id: f00116
          kind: feat
          required: true
        - id: f00117
          kind: feat
          required: true
        - id: f00118
          kind: feat
          required: true
closureGate:
    requirePeerReview: true
    requireAllChildrenDone: true
---

# q00002 — Self-managing mcp-vertex for consumer repos

## Goal

The owner's 2026-07-15 vision, structured: a repo that adopts mcp-vertex
should get the whole working system WITHOUT chasing it —

1. **The workflow bootstraps itself** (`f00116`): `proposal_adopt` stops
   being analysis-only — apply mode creates the canonical proposals store,
   and a migration engine converts foreign schemes (rfcs/, TODO lists,
   ad-hoc frontmatter) into canonical proposals with provenance.
2. **The server configures itself** (`f00117`): a core `init_config` tool
   derives a config from the live project analysis, so any MCP client —
   no CLI required — closes the setup loop in one call; the boot
   orientation names it whenever the config file is missing.
3. **The extension shows the truth and hands over the controls**
   (`f00118`): real telemetry (top tools/skills, tokens saved, accumulated
   spend from usage-tracking pricing) rendered with dependency-free SVG
   charts, plus plugin enable/disable persisted through a
   configuration_center write action.

## why

Adoption today still needs a human driving `mcpv init`, hand-creating the
proposals folders, and reading raw tool output to know whether mcp-vertex
is paying for itself. Each child proposal removes one of those chases; the
plan closes when a consumer repo can go from `bunx mcp-vertex` to a fully
organized, observable, self-tuning setup with zero out-of-band steps.

## non-goals

- No silent writes at boot anywhere — every bootstrap/migration/config
  write happens through an explicit tool call (the children restate this).
- No hot plugin reload; disable/enable signals restart-needed.
- External trackers (GitHub Issues) stay out of the migration scope.

## Slices

- global_gate: e2e

### S1 — Orchestrate the three children to done

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/q00002-self-managing-mcp-vertex-for-consumer-repos.md`
- **Gate**: e2e
- acceptance:
  - "f00116, f00117 and f00118 each reach done through the DFA with their own gates green; this plan tracks the roll-up and closes last (closureGate)."

## acceptance

- All three contained proposals are `done` and peer-reviewed
  (closureGate), and `bun run validate` is green at the closing commit.
