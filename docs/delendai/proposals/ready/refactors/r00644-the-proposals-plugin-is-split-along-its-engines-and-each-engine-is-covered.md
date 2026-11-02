---
id: r00644
title: "The proposals plugin is split along its engines, and each engine is covered"
kind: refactor
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# r00644 — The proposals plugin is split along its engines, and each engine is covered

## goal

The four largest proposals files are split by responsibility below the 800-line mark, the coordination engines and core's forge-governance and integration-engine get named specs, the plugin's size is measured with one published definition, and the alias and bridge CLI commands get their specs.

## why

Joint audit a00095. G2: plugins/proposals is a monolith; authoring.tool.ts is 3,014 lines, proposal-transition.tool.ts 2,239, auto-work.tool.ts 1,502, index.ts 1,462. G3: swarm-hygiene-engine.ts (509 lines), branch-gc-engine.ts (481) and branch-status-engine.ts have one spec each. D15: core's forge-governance/ (29 files, remote forge writes, merges, ref GC) has no spec per file and integration-engine/ (32 files) has 10. G18: the process machinery grows faster than the product. G43: the size figures behind G2/G18 were not reproducible (LOC with and without tests, no definition). G67: the alias and bridge CLI commands have no colateral spec.

## non-goals

- Behaviour changes: every split is a move with its specs green before and after.
- Moving proposals code into core.

## slices

- global_gate: type

### S1 — authoring.tool.ts by tool
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring/close-slice-support.tool.ts`, `plugins/proposals/src/lib/tools/authoring/close-slice.tool.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal-document.tool.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`, `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/src/lib/tools/authoring/review-evidence.tool.ts`, `plugins/proposals/src/lib/tools/authoring/review-round.tool.ts`, `plugins/proposals/src/lib/tools/authoring/review-verdict-support.tool.ts`, `plugins/proposals/src/lib/tools/authoring/slice-block.tool.ts`, `plugins/proposals/src/lib/contracts/constants/review-tool-schema.constant.ts`, `plugins/proposals/src/lib/contracts/constants/create-proposal-schema.constant.ts`, `plugins/proposals/src/lib/contracts/constants/close-slice-validation.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/authoring-tool.interface.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-round.interface.ts`
- **Gate**: type
- acceptance:
  - "create_proposal, proposal_review and the other tools registered in authoring.tool.ts live in one file each under lib/tools/authoring/, none above 800 lines; the registration order and the tools/list output are byte-identical before and after."

### S2 — proposal-transition.tool.ts by step
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/src/lib/tools/transition/delivery-evidence.tool.ts`, `plugins/proposals/src/lib/tools/transition/dfa.tool.ts`, `plugins/proposals/src/lib/tools/transition/idempotency.tool.ts`, `plugins/proposals/src/lib/tools/transition/move.tool.ts`, `plugins/proposals/src/lib/tools/transition/peer-review-gate.tool.ts`, `plugins/proposals/src/lib/tools/transition/plan-closure.tool.ts`, `plugins/proposals/src/lib/tools/transition/run-transition.tool.ts`, `plugins/proposals/src/lib/tools/transition/validate-evidence.tool.ts`, `plugins/proposals/src/lib/contracts/constants/proposal-transition-schema.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposal-transition-tool.interface.ts`
- **Gate**: type
- acceptance:
  - "Each numbered step of the transition (DFA, evidence, plan closure, move) is its own module under lib/tools/transition/, none above 800 lines; the transition specs pass unchanged."

### S3 — auto-work and the plugin entry
- **Status**: pending
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/lib/tools/auto-work/hygiene-rendering.tool.ts`, `plugins/proposals/src/lib/tools/auto-work/planning.tool.ts`, `plugins/proposals/src/lib/wiring/proposals-knowledge.service.ts`, `plugins/proposals/src/lib/wiring/proposals-persist.service.ts`, `plugins/proposals/src/lib/wiring/proposals-tools.register.ts`, `plugins/proposals/src/lib/wiring/proposals-work.prompt.ts`, `plugins/proposals/src/lib/contracts/constants/auto-work-tool.constant.ts`, `plugins/proposals/src/lib/contracts/constants/proposals-name-pool.constant.ts`, `plugins/proposals/src/lib/contracts/constants/proposals-options-schema.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/auto-work-tool.interface.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposals-wiring.interface.ts`, `tools/scripts/lint/effect-boundaries.baseline.json`, `tools/scripts/lint/no-duplicate-implementation.baseline.json`, `tools/scripts/lint/solid-compliance.baseline.json`, `tools/scripts/lint/types-in-contracts.baseline.json`
- **Gate**: type
- acceptance:
  - "index.ts only composes registrations; the option plumbing moves to lib/wiring/. auto-work.tool.ts splits planning from rendering. Neither file exceeds 800 lines."

### S4 — Coordination engines and core governance get named specs
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/shared/swarm-hygiene-engine.spec.ts`, `plugins/proposals/tests/src/lib/shared/swarm-hygiene-harness.ts`, `plugins/proposals/tests/src/lib/shared/branch-gc-engine.spec.ts`, `plugins/proposals/tests/src/lib/shared/branch-status-engine.spec.ts`, `packages/cli/src/commands/alias.command.spec.ts`, `packages/cli/src/commands/bridge.command.spec.ts`, `packages/core/tests/src/lib/forge-governance/redact-secrets.spec.ts`, `packages/core/tests/src/lib/integration-engine/critical-section.spec.ts`, `packages/core/tests/src/lib/integration-engine/identity.spec.ts`
- **Gate**: type
- acceptance:
  - "Each engine's decision branches (keep, delete, unknown) have a case each (G3)."
  - "alias and bridge have colateral specs covering their argument parsing and exit codes (G67)."
  - "forge-governance/ and integration-engine/ files without a nominal spec are listed in the closing evidence with the spec that covers each, or get one (D15)."

### S5 — One published size measure
- **Status**: pending
- **Files**: `tools/scripts/report/plugin-size-report.script.ts`, `tools/scripts/report/plugin-size-report.script.spec.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "A report script prints source and test LOC per package with the definition it uses; the numbers G2, G18 and G43 argue about are reproducible from it at any commit."

## acceptance

- create_proposal, proposal_review and the other tools registered in authoring.tool.ts live in one file each under lib/tools/authoring/, none above 800 lines; the registration order and the tools/list output are byte-identical before and after.
- Each numbered step of the transition (DFA, evidence, plan closure, move) is its own module under lib/tools/transition/, none above 800 lines; the transition specs pass unchanged.
- index.ts only composes registrations; the option plumbing moves to lib/wiring/. auto-work.tool.ts splits planning from rendering. Neither file exceeds 800 lines.
- Each engine's decision branches (keep, delete, unknown) have a case each (G3).
- alias and bridge have colateral specs covering their argument parsing and exit codes (G67).
- forge-governance/ and integration-engine/ files without a nominal spec are listed in the closing evidence with the spec that covers each, or get one (D15).
- A report script prints source and test LOC per package with the definition it uses; the numbers G2, G18 and G43 argue about are reproducible from it at any commit.

## notes

- S1 — authoring.tool.ts is now a barrel; create_proposal, close_slice and proposal_review live under `lib/tools/authoring/` (the review round is its own module), every file below 800 lines, schemas and shapes in `contracts/`. Registration order is untouched.
- S2 — each step of the transition (DFA, validate evidence, idempotent replay, delivery evidence, plan closure, the closing peer-review gate, the move) is a module under `lib/tools/transition/`; `recovery-tools.ts` now imports the DFA's `isKnownStatus` instead of keeping a second copy.
- S3 — `index.ts` composes registrations; the options schema, the name pool, the tool list, the prompts, the knowledge entries and the persist-mode helpers moved to `lib/wiring/` and `contracts/`. `auto-work.tool.ts` keeps the run and its registration; planning (claim readiness, orchestration policy) and the hygiene rendering are their own modules. Six moved modules still exceed the 400-line solid floor and were re-keyed in its baseline, replacing four larger entries.
- S4 — each engine's keep, delete and unknown branches have a case (hygiene: smoke residual, unreadable tip, snapshot failure; GC: untracked, age from the label; status: unreadable status, time and counts). alias and bridge have argument and exit-code specs. Closing evidence for core: of the 29 forge-governance and 32 integration-engine files, the unmatched implementation files were `redact-secrets`, `critical-section` and `identity`, which now have nominal specs; `apply-desired-state`, `diff-contracts`, `inspect-desired-vs-live`, `verify-desired-state` and `provider-contracts` are covered by `tri-state-verdict.spec.ts`, `credential-seam` by `credential-safety.spec.ts`, `github-adapter` by `github-live-read.spec.ts` and `github-payloads.spec.ts`, `governance-contracts` and `strictness` by `build-desired-state.spec.ts`, `merge-step`, `pull-request-step` and `rebase-step` through `run-cycle` in `pull-request-cycle.spec.ts` and `strict-latest.spec.ts`, `cleanup-step` by `cleanup-and-progress.spec.ts`, `validation-step` by `validation.spec.ts`, `git-operations` by `merge-commit.spec.ts`; the remaining files are interfaces and constants. The `alias remove` outcome reports `created` as its action (the manager returns it); the spec pins the resulting state, not that word.
- S5 — `bun run report:plugin-size` prints source and test lines per package with the definition it counts under (tracked `.ts`/`.tsx`, physical lines, no declarations or generated files), for the working tree or `--ref=<rev>`.
