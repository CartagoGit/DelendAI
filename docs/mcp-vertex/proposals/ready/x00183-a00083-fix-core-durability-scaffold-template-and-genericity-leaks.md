---
id: x00183
title: "a00083 — fix core durability, scaffold template outputSchema, and genericity leaks in packages/core"
kind: fix
status: ready
type: proposal
track: core+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit that surfaced these findings
---

# x00183 — a00083 — fix core durability, scaffold template outputSchema, and genericity leaks in packages/core

## Goal

Resolve the seven `@mcp-vertex/core` findings from the full-project audit a00083 (29-07-2026 copilot-minimax-m3). Findings F1 was already shipped in the a00083 easy-fixes commit (`a2f3fa73`); this proposal covers the remaining six:

- **F2** `packages/core/src/lib/shared/batch-atomic-writer.ts` — the writer claims cross-process atomicity but uses a process-local promise-chain + plain `writeFile`. Replace with `withFileMutex` + `writeFileAtomic`.
- **F3** `packages/core/src/lib/scaffold/scaffold-tool.ts` — `keepLegacy` moves commit *before* the batch writer; on partial batch failure the original is gone but the new file was never written. Reorder or add rollback so the docstring's "no partial scaffold on disk" promise holds.
- **F5** `packages/core/src/lib/bootstrap/build-blueprint.ts#L91` — hardcoded `@mcp-vertex/core-monorepo` branch in the generic planner. Remove the host-specific exception; pick `libs/mcp-project` (or the configured `pluginPathsRoot`) uniformly.
- **F6** `packages/core/src/lib/scaffold/scaffold-host.ts#L273` — `CLAUDE_MODEL_ALIASES` baked into core. Move the alias list out of core into the host's `options.claudeModelAliases` (or wire the Claude-specific scaffold to a separate, opt-in helper).
- **F7** `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts#L71` — `IProviderInvoke.subscription.tool` is a closed union of 4 hosts (`vscode-copilot`, `claude-code`, `codex`, `cursor`). Open the union: keep the runtime-known 4 but type it as `string & { readonly __brand: 'subscription-tool' }` (or split the per-host runners into registries owned by `orchestrator-runner`, not core).

(F4 was the scaffold-template `outputSchema` gap, shipped in `a2f3fa73`.)

## why

`@mcp-vertex/core` is supposed to be the project-agnostic spine — every first-party plugin and every adopter host depends on it. Three findings break that contract:

- **F2/F3 (durability)** — the scaffold and batch writer advertise atomicity they don't actually provide across processes. A multi-host `bun tools/scripts/scaffold/scaffold.script.ts` + `bun tools/scripts/init/init.script.ts` boot, or two parallel `scaffold-host` invocations, can leave the user's tree in a partial state with no rollback.
- **F5/F6/F7 (genericity)** — every non-mcp-vertex adopter that ever uses these surfaces will hit a wrong default (`packages/core` instead of their monorepo path), a missing Claude alias (their model is silently dropped), or a compile error when they try to add a subscription host. This is the #1 reason `@mcp-vertex/core` averages **6.2 / 10** in the a00083 scoreboard.

## non-goals

- Replacing the `createFileSystemBatchWriter` API surface. The fix keeps the function name and signature; the implementation swaps the in-process promise-chain for the cross-process `withFileMutex` primitive that the rest of core already uses (`init-config-tool.ts` shipped this pattern in `a2f3fa73`).
- Restructuring the provider-capabilities interface into a registry. The fix only opens the closed union so the orchestrator-runner plugin can extend it; the rest of the contract stays untouched.

## slices

### S1 — durability: batch-atomic-writer + scaffold rollback
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **Files**: `packages/core/src/lib/shared/batch-atomic-writer.ts`, `packages/core/src/lib/scaffold/scaffold-tool.ts`.
- Replace the in-process promise-chain in `batch-atomic-writer.ts` with `withFileMutex(workspaceRoot, …)` keyed on the workspace root (cross-process serialisation; the existing per-root map is preserved).
- Replace every `writeFile(absolute, op.content, 'utf8')` inside the writer with `writeFileAtomic(absolute, op.content)`.
- In `scaffold-tool.ts`, reorder the `keepLegacy` moves so they happen **after** a successful `batchWriter.writeAll` (or wrap them in a single transaction the writer owns); add a unit test that simulates a partial-batch failure and asserts the original target is still on disk.
- Update the writer's docstring to reflect that the mutex is now cross-process (was: process-local).
- **Acceptance**: `bun test packages/core/tests/src/lib/shared/batch-atomic-writer.spec.ts` (new), `packages/core/tests/src/lib/scaffold/scaffold-tool.spec.ts` (updated for the partial-failure test).

### S2 — genericity: remove `@mcp-vertex/core-monorepo` hardcode
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `packages/core/src/lib/bootstrap/build-blueprint.ts#L91`.
- Drop the `if (analysis.name === '@mcp-vertex/core-monorepo') return 'packages/core'` branch. The fallback chain becomes: `analysis.hasPackageJson ? '.' : 'libs/mcp-project'`, with the configured `convention.targetDir` (if any) winning over both.
- Update any tests that pinned the monorepo special-case.
- **Acceptance**: `bun test packages/core/tests/src/lib/bootstrap/build-blueprint.spec.ts`.

### S3 — genericity: open the Claude alias list
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `packages/core/src/lib/scaffold/scaffold-host.ts#L273`.
- Move `CLAUDE_MODEL_ALIASES` into `IScaffoldHostOptions.claudeModelAliases?: readonly string[]` (default: empty array, since the alias list is provider-specific and shouldn't be core's responsibility).
- In `claudeModelField`, treat an empty/undefined list as "no Claude-specific decision"; fall through to the generic model-field path.
- Update the two affected callers (the mcp-vertex host itself in `extensions/vscode/src/commands/` and the init scaffolding in `tools/scripts/init/`) to pass their alias lists explicitly.
- **Acceptance**: `bun test packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`, plus `bun biome ci packages/core/src/lib/scaffold` (no remaining Claude literals).

### S4 — genericity: open the provider subscription union
- **Status**: ready
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **File**: `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts#L71`.
- Change `IProviderInvoke.subscription.tool` from a closed union to `string` (kept as a string literal type for tooling autocomplete, but extendable by the orchestrator-runner plugin via a `ISubscriptionToolRegistry`).
- Update `plugins/orchestrator-runner/src/lib/...` to consume the registry instead of the closed union.
- **Acceptance**: `bun tsc --noEmit -p tsconfig.json` (must accept any subscription tool id), plus a smoke test that the orchestrator-runner plugin can register a new host.

## Notes



- a00083 — full-project audit (source of these findings)
- a2f3fa73 — shipped the easy findings (F4 scaffold template `outputSchema`, F1 init_config mutex, etc.)

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
