---
id: x00958
title: "A foreign project gets the plugins, policy and diagnostics that fit it"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: d46746ca-f770-4a23-af2f-a549e738791a
last-correlation-id: d46746ca-f770-4a23-af2f-a549e738791a
last-transition-from: review
last-transition-at: 2026-10-28T09:07:37.665Z
shipped-in:
  - "bd5c4d8a3b37"
---

# x00958 — A foreign project gets the plugins, policy and diagnostics that fit it

## goal

In a project that is not DelendAI, plugin doctor reads that workspace, and context and forge tools work with its layout and its forge host; init sizing and lazy availability records move to f00792.

## why

Joint audit a00095 (probes in a throwaway consumer project). G79: plugin doctor reads the cwd, not --workspace. G80: auto-adoption writes an integration policy into delendai.config.json the project never chose. G81: the preset decides which plugins reach a project; 15 saving and spending plugins live only in some presets. G82: context-for-change searches the monorepo roots only and returns nothing elsewhere. G84: availability records cover 2 of the 19 plugins loaded in a foreign project. G97: plugin doctor reports 1 of 61 plugins verified; the rest are "registered". G98: the project that validates itself configures 39 of 61 plugins; 22 are never loaded in its own CI. G125: init:default activates all 61 plugins and writes 396 lines of config. G126: what init:default delivers assumes DelendAI's structure. D21: forge auto-detects only github.com and gitlab.com, not GitHub Enterprise or self-hosted GitLab.

## non-goals

- Migrations of existing projects (x00945, x00946).
- init sized to the detected stack and an availability record for every loaded plugin (G125, G80, G81, G126, G84, G97, G98): they need design decisions and moved to f00792.

## slices

- global_gate: type

### S2 — Diagnostics read the workspace
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/plugins.spec.ts`, `packages/cli/src/commands/groups/plugins.ts`
- **Gate**: type
- acceptance:
  - "plugin doctor --workspace=<dir> reports that workspace (G79)."

- shipped-in: `bd5c4d8a3b37`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at bd5c4d8a3b37, validate exit 0 and tests 4/4 claimed, no recorded run cited; acceptance 1/1: (1) packages/cli/src/commands/groups/plugins.ts:116 reads the workspace from the context globals and parser.service.ts:217 resolves the --workspace flag; plugins.s… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice spec: 1 file / 4 tests, exit 0. The slice's files were shipped by the same merge that carries S3's work.

### S3 — Context and forge in other layouts and hosts
- **Status**: done
- **Files**: `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/context-for-change/src/lib/services/project-roots.helper.ts`, `plugins/context-for-change/tests/src/lib/services/project-roots.helper.spec.ts`, `plugins/forge/src/index.ts`, `plugins/forge/src/lib/detect.spec.ts`, `plugins/forge/src/lib/detect.ts`, `plugins/forge/src/lib/services/forge.ts`, `plugins/forge/tests/src/lib/services/forge-gitlab.spec.ts`
- **Gate**: type
- acceptance:
  - "context-for-change reads the project's workspaces or root (G82)."
  - "A configured forge host (GHE, self-hosted GitLab) is detected (D21)."
- shipped-in: `bd5c4d8a3b37`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at bd5c4d8a3b37, validate exit 0 and tests 15/15 claimed, no recorded run cited; acceptance 2/2: (1) context-for-change/src/lib/services/project-roots.helper.ts:22-56 reads the manifest through the safe workspace reader, so a malformed or absent manifest yield… (2) forge.ts:481-492 consults the configured hosts, populated from the plugin options at index.ts:32, before the label heuristic, and both entry points share it (f… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 3 files / 15 tests, exit 0. The shipped-in sha is the merge of the pull request, which also carries the three branch commits behind this slice's files.

## acceptance

- plugin doctor --workspace=<dir> reports that workspace (G79).
- context-for-change reads the project's workspaces or root (G82).
- A configured forge host (GHE, self-hosted GitLab) is detected (D21).
