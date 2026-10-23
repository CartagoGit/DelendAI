---
id: d00417
title: "Docs, skills and the roadmap describe the tree as it is"
kind: docs
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `docs/delendai/CROSS-IDE.md`, `docs/delendai/ROADMAP.md`
- **Gate**: type
- acceptance:
  - "link-check over docs/ finds no broken internal link (D14)."
  - "ROADMAP states each track from its gate proposal's status (D37)."

### S2 — Skills match the tools
- **Status**: pending
- **Files**: `packages/core/skills/delendai-token-budget-playbook/SKILL.md`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`, `plugins/proposals/skills/concurrency-patterns/SKILL.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `plugins/quality/skills/quality-and-rules-gates/SKILL.md`, `packages/core/skills/token-budget-discipline/SKILL.md`, `tools/scripts/lint/check-skills.script.ts`
- **Gate**: type
- acceptance:
  - "check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01)."
  - "Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04)."

### S3 — Manifest, rules and release skills
- **Status**: pending
- **Files**: `packages/core/skills/manifest.json`, `packages/core/src/lib/cli/assemble-skills.ts`, `plugins/commit-policy/skills/read-stderr-storm/SKILL.md`, `plugins/rules/skills/rules-solid-architecture/SKILL.md`, `packages/core/skills/conventional-commits-and-release/SKILL.md`, `packages/core/skills/operator/SKILL.md`
- **Gate**: type
- acceptance:
  - "The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06)."

## acceptance

- link-check over docs/ finds no broken internal link (D14).
- ROADMAP states each track from its gate proposal's status (D37).
- check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01).
- Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04).
- The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06).
