---
id: x01109
title: "The promotion to the release branch is always declared under land, and it carries the dependency alerts the integration branch already fixes"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-21
---

# x01109 — The promotion to the release branch is always declared under land, and it carries the dependency alerts the integration branch already fixes

## goal

Targets @delendai/core 0.3.0. With development.integration.engine land the roadmap promotion schedule is declared and a lint holds it; open-promotion says why it does nothing; the promotion body lists the open Dependabot alerts on the release branch whose patched version is already on the integration branch, and reports those with no fix.

## why

Dependabot alerts on main (astro #84-87) never close because no promotion develop to main opens. Commit 4cbf96af6 (2026-11-11, integration pause) removed roadmap.options.promotion.schedule on-ready; when land was re-activated nobody restored it, so open-promotion returns nothing-declared silently on every land-promote run (e.g. 44849180793). land.yml's promote job already runs open-promotion, and the governance generator renders no hourly open-promotion workflow when the engine is land, so restoring the schedule creates no second opener.

## non-goals

- Do not add an hourly open-promotion workflow: land promotes.
- Do not merge, bump or tag from open-promotion.

## slices

- global_gate: none

### S1 — Restore the schedule and hold it by a spec
- **Status**: pending
- **Files**: `delendai.config.json`, `tools/scripts/forge/promotion-declared.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "tools/scripts/forge/promotion-declared.spec.ts: with engine land the repository config declares a promotion schedule"

### S2 — open-promotion says why it does nothing and lists the alerts the integration branch fixes
- **Status**: pending
- **Files**: `tools/scripts/forge/dependabot-fixes.lib.ts`, `tools/scripts/forge/dependabot-fixes.lib.spec.ts`, `tools/scripts/forge/open-promotion.script.ts`, `tools/scripts/forge/open-promotion.script.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "tools/scripts/forge/open-promotion.script.spec.ts: nothing-declared prints the reason (no schedule, one branch, unparsable config)"
  - "tools/scripts/forge/dependabot-fixes.lib.spec.ts: an alert whose patched version is in the integration lockfile is listed as fixed; one without a fix is reported unfixed"
  - "tools/scripts/forge/open-promotion.script.spec.ts: the opened pull request body carries the fixed alerts and the output names the unfixed"

## acceptance

- tools/scripts/forge/promotion-declared.spec.ts: with engine land the repository config declares a promotion schedule
- tools/scripts/forge/open-promotion.script.spec.ts: nothing-declared prints the reason (no schedule, one branch, unparsable config)
- tools/scripts/forge/dependabot-fixes.lib.spec.ts: an alert whose patched version is in the integration lockfile is listed as fixed; one without a fix is reported unfixed
- tools/scripts/forge/open-promotion.script.spec.ts: the opened pull request body carries the fixed alerts and the output names the unfixed
