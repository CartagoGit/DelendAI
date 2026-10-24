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
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`
- **Gate**: type
- acceptance:
  - "create_proposal, proposal_review and the other tools registered in authoring.tool.ts live in one file each under lib/tools/authoring/, none above 800 lines; the registration order and the tools/list output are byte-identical before and after."

### S2 — proposal-transition.tool.ts by step
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
- **Gate**: type
- acceptance:
  - "Each numbered step of the transition (DFA, evidence, plan closure, move) is its own module under lib/tools/transition/, none above 800 lines; the transition specs pass unchanged."

### S3 — auto-work and the plugin entry
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "index.ts only composes registrations; the option plumbing moves to lib/wiring/. auto-work.tool.ts splits planning from rendering. Neither file exceeds 800 lines."

### S4 — Coordination engines and core governance get named specs
- **Status**: pending
- **Files**: `plugins/proposals/tests/src/lib/shared/swarm-hygiene-engine.spec.ts`, `plugins/proposals/tests/src/lib/shared/branch-gc-engine.spec.ts`, `plugins/proposals/tests/src/lib/shared/branch-status-engine.spec.ts`, `packages/cli/src/commands/alias.command.spec.ts`, `packages/cli/src/commands/bridge.command.spec.ts`
- **Gate**: type
- acceptance:
  - "Each engine's decision branches (keep, delete, unknown) have a case each (G3)."
  - "alias and bridge have colateral specs covering their argument parsing and exit codes (G67)."
  - "forge-governance/ and integration-engine/ files without a nominal spec are listed in the closing evidence with the spec that covers each, or get one (D15)."

### S5 — One published size measure
- **Status**: pending
- **Files**: `tools/scripts/report/plugin-size-report.script.ts`, `tools/scripts/report/plugin-size-report.script.spec.ts`
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
