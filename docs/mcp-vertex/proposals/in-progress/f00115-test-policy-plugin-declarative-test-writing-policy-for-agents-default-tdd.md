---
id: f00115
title: "test-policy plugin — declarative test-writing policy for agents (default TDD)"
kind: feat
status: in-progress
type: proposal
track: plugins+presets
date: 2026-07-14
---

# f00115 — test-policy plugin — declarative test-writing policy for agents (default TDD)

## Goal

New plugin @mcp-vertex/test-policy that lets a workspace declare HOW the LLM must handle tests, and surfaces that policy to every agent at orientation. Four modes: tdd (write failing tests first, prove red, implement to green — THE DEFAULT), tests-after (implement, then cover before closing), free (the agent decides and states its choice), none (no new tests; existing ones must still pass). Precedence: runtime override (set tool, persisted in the plugin cache) > mcp-vertex.config.json options.mode > default tdd. Active by default: member of the standard preset delta (so standard/swarm/full inherit), of the vertex preset, and of mcp-vertex.config.json.

## why

User request 2026-07-14: "un plugin activo por defecto para decir si queremos que el llm no haga tests, que los haga a su rollo, TDD primero, o tests después. Por defecto TDD." Today nothing encodes the test-writing contract; every agent improvises. A declarative policy with per-mode guidance makes agent behaviour deterministic across LLMs/IDEs and is enforceable at orientation via a knowledge entry.

## non-goals

- No enforcement hooks — like status-marker, enforcement is agent-driven until the core grows onBeforePrompt/onAfterRespond hooks.
- No per-path/per-package policies in v1 — one policy per workspace.
- No coupling with test-convention — that plugin says WHERE/HOW specs are written; this one says WHEN/WHETHER.

## Slices

- global_gate: e2e

### S1 — Policy engine + durable override store
- **Status**: pending
- **Files**: `plugins/test-policy/src/lib/policy.ts`, `plugins/test-policy/src/lib/policy-store.ts`, `plugins/test-policy/tests/src/lib/policy.spec.ts`, `plugins/test-policy/tests/src/lib/policy-store.spec.ts`, `plugins/test-policy/package.json`, `plugins/test-policy/tsconfig.json`, `plugins/test-policy/vitest.config.ts`, `plugins/test-policy/LICENSE`
- **Gate**: e2e
- acceptance:
  - "TEST_POLICY_MODES = ['tdd','tests-after','free','none']; per-mode guidance table (agent-actionable, imperative steps); resolveTestPolicy({configMode, override}) returns {mode, source: 'override'|'config'|'default'} with default tdd."
  - "Store: read/write override under the plugin cache via withFileMutex + writeFileAtomic; corrupt file quarantined and treated as absent (corrupt ≠ empty), covered by a corruption spec per the repo rule for new persisted state."

### S2 — Tools (get/set) + knowledge + plugin entry + public barrel
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/test-policy/src/index.ts`, `plugins/test-policy/src/lib/tools/get-policy.tool.ts`, `plugins/test-policy/src/lib/tools/set-policy.tool.ts`, `plugins/test-policy/src/public/index.ts`, `plugins/test-policy/tests/src/lib/tools/policy-tools.spec.ts`, `plugins/test-policy/README.md`
- **Gate**: e2e
- acceptance:
  - "get_test_policy {} → {mode, source, guidance, extraGuidance?}; set_test_policy {mode, reason?} persists the override and returns the new policy; options {mode?, extraGuidance?, allowSetTool?=true}; allowSetTool:false makes set return a structured toolError instead of writing."
  - "Both tools declare outputSchema; plugin registers a knowledge entry ('Test policy — when/whether to write tests') rendering the active mode + guidance so agents see it at orientation."
  - "Options parsed through the Zod schema with safeParse and a hard boot error on misconfig (test-convention idiom)."

### S3 — Default-on wiring: presets, project config, workspace symlink, generated artifacts
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `packages/core/src/lib/plugins/preset-catalog.ts`, `mcp-vertex.config.json`, `package.json`
- **Gate**: e2e
- acceptance:
  - "preset-catalog: test-policy added to the standard delta (standard/swarm/full inherit) and to the vertex independent members; preset-catalog.spec + no-preset-drift lint stay green."
  - "mcp-vertex.config.json declares plugins.test-policy (empty options = default tdd); root package.json gains @mcp-vertex/test-policy workspace:* devDependency so bun symlinks the dependent-less plugin (agent-lock lesson: plugins without dependents never link)."
  - "bun run types:generate + catalog:generate regenerated; token-budget e2e still under ceilings (or ceilings re-measured honestly in the same commit); bun run validate green."

## acceptance

- TEST_POLICY_MODES = ['tdd','tests-after','free','none']; per-mode guidance table (agent-actionable, imperative steps); resolveTestPolicy({configMode, override}) returns {mode, source: 'override'|'config'|'default'} with default tdd.
- Store: read/write override under the plugin cache via withFileMutex + writeFileAtomic; corrupt file quarantined and treated as absent (corrupt ≠ empty), covered by a corruption spec per the repo rule for new persisted state.
- get_test_policy {} → {mode, source, guidance, extraGuidance?}; set_test_policy {mode, reason?} persists the override and returns the new policy; options {mode?, extraGuidance?, allowSetTool?=true}; allowSetTool:false makes set return a structured toolError instead of writing.
- Both tools declare outputSchema; plugin registers a knowledge entry ('Test policy — when/whether to write tests') rendering the active mode + guidance so agents see it at orientation.
- Options parsed through the Zod schema with safeParse and a hard boot error on misconfig (test-convention idiom).
- preset-catalog: test-policy added to the standard delta (standard/swarm/full inherit) and to the vertex independent members; preset-catalog.spec + no-preset-drift lint stay green.
- mcp-vertex.config.json declares plugins.test-policy (empty options = default tdd); root package.json gains @mcp-vertex/test-policy workspace:* devDependency so bun symlinks the dependent-less plugin (agent-lock lesson: plugins without dependents never link).
- bun run types:generate + catalog:generate regenerated; token-budget e2e still under ceilings (or ceilings re-measured honestly in the same commit); bun run validate green.
