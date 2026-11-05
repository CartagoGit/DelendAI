---
id: d00417
title: "Docs, skills and the roadmap describe the tree as it is"
kind: docs
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: b9db8d4a-5444-4288-bdb9-d8bbf286f1d7
last-correlation-id: b9db8d4a-5444-4288-bdb9-d8bbf286f1d7
last-transition-from: review
last-transition-at: 2026-11-03T04:25:35.163Z
shipped-in:
  - "350ba7dfb7b4"
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
- **Files**: `docs/delendai/CROSS-IDE.md`, `docs/delendai/ROADMAP.md`, `tools/scripts/lint/doc-links.script.ts`, `tools/scripts/lint/doc-links.script.spec.ts`, `tools/scripts/gen/provenance-truth.script.ts`, `tools/scripts/gen/provenance-truth.spec.ts`, `tools/scripts/catalog/render-host-hints.script.ts`, `docs/delendai/generated/observability-provenance.generated.md`, `docs/delendai/host-hints/agent-instructions.generated.md`, `docs/delendai/wiki/00-glossary.md`, `docs/delendai/wiki/02-our-infrastructure.md`, `docs/delendai/wiki/09-plugin-auto-agent-selector.md`, `docs/delendai/wiki/migration-to-delendai.md`, `docs/delendai/wiki/external/README.md`, `docs/delendai/examples/host-checkpoint-adapter.md`, `docs/delendai/plugins/logs/AUTHORING.md`, `docs/external-mcps/README.md`
- **Gate**: type
- acceptance:
  - "link-check over docs/ finds no broken internal link (D14)."
  - "ROADMAP states each track from its gate proposal's status (D37)."
- shipped-in: `5343646ab6a0`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S1, the links and the roadmap.

WHAT IS WRONG. The second criterion is not delivered. The roadmap states each track by hand instead of from its gate proposal's status, and the hand-written states contradict the proposals they name.

WHERE. docs/delendai/ROADMAP.md:130 says the file is the authority and that the data is edited by hand; each entry carries a literal `state:` field, for example :10 `state: in-progress`. The gate evaluator does read a proposal's status, plugins/roadmap/src/lib/gates/gate-evaluator.service.ts:33 `const status = evidence.proposalStatus?.(target);`, but it produces a gate verdict and never writes that field.

HOW TO REPRODUCE. Read the eleven entries of the roadmap's data block and compare each `state:` with the status of the gate proposal it names: roadmap is in-progress while f00756 is done, style-surface is proposed while f00548 is done, capability-contract is proposed while f00550 is done, docker-tools is proposed while f00543 is done, fast-flow is committed while v00144 is ready, and batuta-works is committed while x00988 is in review. The slice's commit, 5343646ab6a0, touches no roadmap file, and the proposal's own notes say the roadmap half of the slice is still open.

WHAT MUST HOLD. The roadmap states each track from its gate proposal's status: the `state:` of every entry is derived from that proposal's status rather than typed by hand, and a check fails when the two disagree. A hand-written roadmap that has drifted from its gates is what the criterion forbids.

The first criterion is delivered for the scope the linter covers and is recorded as such: the check reaches every depth under docs/ and reports a broken internal link, the run reports 237 documents with every internal link resolved, and the two generators now resolve their targets. One limit is recorded, not blocking the verdict: the check leaves out the proposals subtree, which is where the remaining broken links are.

The type gate exited 0 and the linter's spec passes 2 of 2.

### S2 — Skills match the tools
- **Status**: pending
- **Files**: `packages/core/skills/delendai-token-budget-playbook/SKILL.md`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`, `plugins/proposals/skills/concurrency-patterns/SKILL.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `plugins/quality/skills/quality-and-rules-gates/SKILL.md`, `packages/core/skills/token-budget-discipline/SKILL.md`, `tools/scripts/lint/check-skills.script.ts`
- **Gate**: type
- acceptance:
  - "check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01)."
  - "Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04)."
- shipped-in: `cf6a616354bb`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — Changes requested on slice S2, the skills that name tools.

WHAT IS WRONG. The criterion asks that check-skills fail on a tool name or an argument a skill uses that no server registers. The detector for the tool name was written and never wired in, and the argument half was never written.

WHERE. tools/scripts/lint/check-skills.script.ts:143 exports checkSkillToolNames and :152 gives it the kind `unregistered-tool`; the only check the command runs is at :192, `const issues = checkSkillsManifest(manifest, onDisk);`, and the kinds at :42-48 have no argument variant and no tool's input schema is ever read.

HOW TO REPRODUCE. `git grep -n checkSkillToolNames` answers the script and its spec and nothing else, so the function has no caller on the executable path. Run `bun tools/scripts/lint/check-skills.script.ts` after naming an unregistered tool in a skill: the run still prints that the skills match the manifest.

WHAT MUST HOLD. The command calls the detector with the set of tools the server registers and fails with the skill and the name it names, and a second check fails on an argument that no registered tool's schema declares, with a spec for each. A detector nothing calls is not a gate.

The second criterion is not delivered either, in the slice's own file list. The workflow playbook still opens its decision tree with "creates the per-agent worktree" (plugins/proposals/skills/proposals-workflow-playbook/SKILL.md:22) and keeps an explicit `agent_worktree create` step (:87-90), while the criterion asks that the coordination skills describe work units and not per-agent worktrees; the other two coordination skills do. And one link in the skills does not resolve: plugins/rules/skills/rules-solid-architecture/SKILL.md:11 points at a proposal that has moved to docs/delendai/proposals/legacy/closed/feats/.

The type gate exited 0 and the linter's spec passes 9 of 9.

### S3 — Manifest, rules and release skills
- **Status**: done
- **Files**: `plugins/rules/skills/rules-solid-architecture/SKILL.md`, `packages/core/skills/conventional-commits-and-release/SKILL.md`
- **Gate**: type
- acceptance:
  - "The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06)."
- shipped-in: `7724c3db2751`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 350ba7dfb7b4, validate exit 0 and tests 9/9 claimed, no recorded run cited; acceptance 1/1: (1) At 7724c3db the storm-repair skill is in the manifest and the file it names exists: packages/core/skills/manifest.json:312-318 lists the id `delendai-read-stde… — Approved on the delivered state of 7724c3db2751. The storm-repair skill is in the manifest, the rules skill describes the factory list the registry holds, and the release skill describes release:prepare and the GitHub Release flow with the commands that exist. The type gate exited 0 and the manifest's check passes 9 of 9. Two residuals, recorded and not blocking: the manifest entry for the storm-repair skill was added by 2417963b2, an ancestor of this slice, so the clause holds by the tree and not by this slice's own commit, and the rules skill this slice edited still carries a link to a proposal that has moved, which the previous slice's SKILL-04 clause names and this verdict leaves to that request.

## acceptance

- link-check over docs/ finds no broken internal link (D14).
- ROADMAP states each track from its gate proposal's status (D37).
- check-skills fails on a tool name or argument a skill uses that no server registers (SKILL-01).
- Coordination skills describe work units, not per-agent worktrees (SKILL-02); links resolve (SKILL-04).
- The storm-repair skill is in the manifest (SKILL-03); the rules skill describes the factory list (SKILL-05); the release skill describes release:prepare and the GitHub Release flow (SKILL-06).

## notes

- S1, links, 2026-11-02: `doc-links` checked only the repository root and one level of `docs/` (53 documents). Over every doc but the proposals it found 18 broken links and 4 broken anchors: proposals that moved folder, source links carrying `:line` ranges or the wrong depth, renamed pages, and two generators writing stale targets (provenance hard-coded f00392's old path; host hints linked a root-relative path from `docs/delendai/host-hints/`). Each is fixed, the generators resolve the target, and the gate now holds 237 documents. The roadmap half of S1 is still open.
