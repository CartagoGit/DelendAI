---
id: d00417
title: "Docs, skills and the roadmap describe the tree as it is"
kind: docs
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: f7297fdf-811f-41d0-937d-79fed966714f
last-correlation-id: f7297fdf-811f-41d0-937d-79fed966714f
last-transition-from: in-progress
last-transition-at: 2026-11-02T22:00:18.942Z
---

# d00417 — Docs, skills and the roadmap describe the tree as it is

## goal

Root docs have no broken internal links, the audit's Verified State and the roadmap reflect develop, and every skill names registered tools and arguments, the current development policy, live links, and current release behaviour, with the storm-repair skill in the manifest.

## why

Joint audit a00095 and gpt-6.1-sol. D14: 16 broken internal links in root docs, from renames not propagated (CROSS-IDE.md has 5). D35: the inherited Verified State of a00095 no longer describes the snapshot. D37: ROADMAP 0.2.0 marks done work as in-progress or proposed. SKILL-01: canonical skill examples disagree with registered tool names, arguments and the review prerequisite. SKILL-02: coordination skills prescribe obsolete per-agent worktrees. SKILL-03: the storm-repair skill is missing from the composed manifest. SKILL-04: skill links and source pointers no longer resolve. SKILL-05: the rules architecture skill says a barrel-only extension wires a language, but the factory has an explicit list. SKILL-06: the release skill describes ten packages and release-on-main.

## non-goals

- Rewriting audit content written by other reviewers.

## slices

- global_gate: type

### S1 — Links and the roadmap
- **Status**: review
- **Files**: `docs/delendai/CROSS-IDE.md`, `docs/delendai/ROADMAP.md`, `tools/scripts/lint/doc-links.script.ts`, `tools/scripts/lint/doc-links.script.spec.ts`, `tools/scripts/gen/provenance-truth.script.ts`, `tools/scripts/gen/provenance-truth.spec.ts`, `tools/scripts/catalog/render-host-hints.script.ts`, `docs/delendai/generated/observability-provenance.generated.md`, `docs/delendai/host-hints/agent-instructions.generated.md`, `docs/delendai/wiki/00-glossary.md`, `docs/delendai/wiki/02-our-infrastructure.md`, `docs/delendai/wiki/09-plugin-auto-agent-selector.md`, `docs/delendai/wiki/migration-to-delendai.md`, `docs/delendai/wiki/external/README.md`, `docs/delendai/examples/host-checkpoint-adapter.md`, `docs/delendai/plugins/logs/AUTHORING.md`, `docs/external-mcps/README.md`
- **Gate**: type
- acceptance:
  - "link-check over docs/ finds no broken internal link (D14)."
  - "ROADMAP states each track from its gate proposal's status (D37)."
- shipped-in: `5343646ab6a0`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Skills match the tools
- **Status**: review
- **Files**: `packages/core/skills/delendai-token-budget-playbook/SKILL.md`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`, `plugins/proposals/skills/concurrency-patterns/SKILL.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `plugins/quality/skills/quality-and-rules-gates/SKILL.md`, `packages/core/skills/token-budget-discipline/SKILL.md`, `tools/scripts/lint/check-skills.script.ts`
- **Gate**: type
- acceptance:
  - "check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01)."
  - "Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04)."
- shipped-in: `cf6a616354bb`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Manifest, rules and release skills
- **Status**: review
- **Files**: `plugins/rules/skills/rules-solid-architecture/SKILL.md`, `packages/core/skills/conventional-commits-and-release/SKILL.md`
- **Gate**: type
- acceptance:
  - "The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06)."
- shipped-in: `7724c3db2751`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- link-check over docs/ finds no broken internal link (D14).
- ROADMAP states each track from its gate proposal's status (D37).
- check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01).
- Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04).
- The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06).

## notes

- S1, links, 2026-11-02: `doc-links` checked only the repository root and one level of `docs/` (53 documents). Over every doc but the proposals it found 18 broken links and 4 broken anchors: proposals that moved folder, source links carrying `:line` ranges or the wrong depth, renamed pages, and two generators writing stale targets (provenance hard-coded f00392's old path; host hints linked a root-relative path from `docs/delendai/host-hints/`). Each is fixed, the generators resolve the target, and the gate now holds 237 documents. The roadmap half of S1 is still open.
