---
id: x00161
title: "plugin_add always describes monorepo-only wiring steps even when called from an adopter project that has none of those six touchpoints"
kind: fix
status: done
type: proposal
track: core+registry+adopter-experience
date: 2026-07-27
---

# x00161 — plugin_add always describes monorepo-only wiring steps even when called from an adopter project that has none of those six touchpoints

## Goal

`buildPluginAddRecipe` (the `plugin_add` MCP tool's planning engine) always emits a "wire" step reading "Wire into the six monorepo points (tsconfig, vitest, plugin-defaults, preset-catalog, publish-order, regenerated tool-outputs)" — regardless of whether the caller is mcp-vertex's own monorepo (where those six touchpoints genuinely exist) or an external adopter project that merely depends on `@mcp-vertex/core` as an npm package (where none of them exist). An agent in an adopter project following this recipe literally is given wrong, monorepo-only instructions. Make the wording (and the underlying step) conditional on the actual caller context.

## why

Found 2026-07-28 while investigating a user report that "plugins are not managed correctly in other projects using mcp-vertex," alongside x00160's orchestrator-subagent gap. `packages/core/src/lib/registry/plugin-add.ts`'s header comment itself frames the tool around wiring "the six monorepo points" -- vocabulary that only makes sense for mcp-vertex's own first-party-plugin development workflow, not for an adopter enabling an already-published plugin package in their separate project. There is no `isMonorepoDev`/context flag anywhere in `plugin-add.ts`, `plugin-add.tool.ts`, or any caller -- the "wire" step's summary text is unconditional. Not yet reproduced against a live adopter session (this proposal documents the code-level finding; a follow-up should reproduce it end-to-end from a real adopter workspace).

## non-goals

- Changing the actual monorepo-wiring behavior for mcp-vertex's own plugin development — that path is correct and stays as-is.
- A full host/workspace auto-detection heuristic — start with an explicit caller-supplied context flag (default: adopter-safe wording); auto-detection can be a follow-up once the flag's plumbing is proven.
- The install/config steps (steps 1 and 3) — only the "wire" step's monorepo-specific wording is in scope.

## Slices

- global_gate: type

### S1 — Add an explicit monorepoDev context flag to buildPluginAddRecipe and make the wire step's wording conditional
- **Status**: done
- **Implementation**: added `IPluginAddOptions.monorepoDev?: boolean` (default `false`); the "wire" step's summary is now conditional — the monorepo wording is preserved byte-for-byte when `true`, and the adopter-safe wording (enable via config/host plugin list, no monorepo touchpoints) is used by default. Threaded through `plugin_add`'s MCP tool schema as an explicit, documented `monorepoDev` input so a caller (mcp-vertex's own orchestrator, when adding a first-party plugin to itself) can opt in; every other caller gets the correct wording with zero extra effort.
- **Files**: `packages/core/src/lib/registry/plugin-add.ts`, `packages/core/src/lib/registry/plugin-add.tool.ts`, `packages/core/tests/src/lib/registry/plugin-add.spec.ts` (new — no spec existed for this module before)
- **Gate**: type
- acceptance:
  - "buildPluginAddRecipe accepts an options.monorepoDev?: boolean (default false)."
  - "When false (the adopter default), the wire step describes only what actually applies to a package consumer (npm dependency + mcp-vertex.config.json plugin entry) and does NOT mention tsconfig/vitest/preset-catalog/publish-order/tool-outputs."
  - "When true, the existing six-monorepo-points wording is preserved byte-for-byte so mcp-vertex's own plugin_add usage is unaffected."
  - "New test pins both wordings; existing plugin-add tests (monorepoDev defaulted/omitted) still pass with the new adopter-safe default."

## acceptance

- buildPluginAddRecipe accepts an options.monorepoDev?: boolean (default false).
- When false (the adopter default), the wire step describes only what actually applies to a package consumer (npm dependency + mcp-vertex.config.json plugin entry) and does NOT mention tsconfig/vitest/preset-catalog/publish-order/tool-outputs.
- When true, the existing six-monorepo-points wording is preserved byte-for-byte so mcp-vertex's own plugin_add usage is unaffected.
- New test pins both wordings; existing plugin-add tests (monorepoDev defaulted/omitted) still pass with the new adopter-safe default.
