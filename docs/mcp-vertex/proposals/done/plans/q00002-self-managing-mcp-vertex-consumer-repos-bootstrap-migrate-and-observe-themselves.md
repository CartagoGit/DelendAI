---
id: q00002
status: done
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
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 3 commits referencing q00002 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 3-commit batch
shipped-in:
  - 61e33d69 # feat(proposals): a00057 — Files: doc drift is a recurring class; permanent ratch
  - 3cfe944e # fix(proposals): q00002 peer review round found stale f00118 Files/acceptance tex
  - 3950150c # feat(proposals): q00002 plan — self-managing mcp-vertex (f00116 bootstrap+migrat
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
- review-state: done
- review-implementer: claude-round-2
- review-reviewer: independent-reviewer-a7efefaa
- review-log: requested_changes by independent-reviewer-a48b3ed9 — Code/tests/validate all green (547 files, 4574 tests, typecheck/lint/i18n/catalog clean) and the f00118 re-scope claims (topSkills impossible, plugin enable/disable pre-existing) verified true against the live code. BUT f00118's own proposal doc is stale: S1 (line 33) and S2 (line 42) Files: lists reference telemetry.service.ts/telemetry.service.spec.ts/telemetry-charts.ts/telemetry-section.ts which were never created — real shipped files are dashboard.service.ts/render-panel-spend.ts/dashboard-spend.service.spec.ts/render-panel.spec.ts. S2 acceptance text also claims all-12-languages while the bottom acceptance block (accurate) says en+es only. Fix: rewrite S1/S2 Files/acceptance to match what was actually built before re-submitting.
- review-log: approved by independent-reviewer-a7efefaa — Fresh reviewer (no prior involvement): verified every S1/S2 Files: path exists on disk, acceptance text consistent with bottom-level en+es-only i18n scope, lint:proposals green, and independently confirmed getSpendModel/buildSpendModel genuinely exist+export in dashboard.service.ts with graceful degradation. APPROVE.
## acceptance

- All three contained proposals are `done` and peer-reviewed
  (closureGate), and `bun run validate` is green at the closing commit.
