---
id: f00792
title: "A foreign project gets an init sized to its stack and an availability record for every plugin it loads"
kind: feat
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# f00792 — A foreign project gets an init sized to its stack and an availability record for every plugin it loads

## goal

In a project that is not DelendAI, init activates the plugins its detected stack needs and writes no integration policy it did not choose, the instructions it renders name that project's paths, and every plugin the project loads, lazy ones included, has an availability record saying how it was verified.

## why

Split out of x00958, whose other findings shipped there. G125: init:default activates all 61 plugins and writes 396 lines of config. G80: auto-adoption writes an integration policy the project never chose. G81: the preset decides which plugins reach a project. G126: what init delivers assumes DelendAI's structure. G84: availability records cover 2 of the 19 plugins loaded in a foreign project, because a managed-lazy plugin writes its record only when it registers on first use. G97: plugin doctor reports 1 of 61 plugins verified. G98: this repository configures 39 of 61 plugins and 22 are never loaded in its own CI. Each needs a design decision (which plugins a stack needs, how a lazy plugin is verified without loading it) that x00958 did not make.

## non-goals

- Migrations of existing projects (x00945, x00946).
- plugin doctor's --workspace and the forge and context layouts (shipped in x00958).

## slices

- global_gate: none

### S1 — init writes what the project needs
- **Status**: pending
- **Files**: `packages/core/src/lib/development-policy/profiles.ts`, `packages/core/src/lib/development-policy/served-work-model.ts`, `packages/core/src/lib/workspace-migration/migrators/development-policy.migrator.ts`, `plugins/rules/src/lib/frameworks/online-preset.ts`, `packages/core/src/lib/tools/overview-tool.ts`
- **Gate**: none
- acceptance:
  - "init on a fixture Node project activates the plugins its detected stack needs, not 61, and writes no integration policy unless asked (G125, G80, G81)."
  - "The instructions and overview it renders name that project's paths, not packages/core or plugins/* (G126)."

### S2 — Every loaded plugin has an availability record
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/plugin-availability-record.service.ts`, `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts`, `packages/cli/src/commands/groups/plugins.ts`
- **Gate**: none
- acceptance:
  - "Every plugin the workspace loads, managed-lazy ones included, has an availability record with how it was verified, or plugin doctor lists it as not yet registered with when it will be (G84, G97)."
  - "A report lists the plugins this repository never loads in its own CI (G98)."

## acceptance

- init on a fixture Node project activates the plugins its detected stack needs, not 61, and writes no integration policy unless asked (G125, G80, G81).
- The instructions and overview it renders name that project's paths, not packages/core or plugins/* (G126).
- Every plugin the workspace loads, managed-lazy ones included, has an availability record with how it was verified, or plugin doctor lists it as not yet registered with when it will be (G84, G97).
- A report lists the plugins this repository never loads in its own CI (G98).
