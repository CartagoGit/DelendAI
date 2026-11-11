---
id: x00183
title: "a00083 — fix core durability, scaffold template outputSchema, and genericity leaks in packages/core"
kind: fix
status: done
type: proposal
track: core+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit that surfaced these findings
shipped-in:
    - 537aa741 # S1+S3+S4 — batch-writer/scaffold rollback + Claude-alias + subscription-union genericity fixes
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
- **Status**: done
- **Files**: `packages/core/src/lib/shared/batch-atomic-writer.ts`, `packages/core/tests/src/lib/shared/batch-atomic-writer.spec.ts`, `packages/core/src/lib/scaffold/scaffold-tool.ts`, `packages/core/tests/src/lib/scaffold/scaffold-tool.spec.ts`
- **Gate**: test
- acceptance:
  - "batch-atomic-writer.ts serializes via withFileMutex(workspaceRoot, ...) instead of a process-local promise chain, and writes via writeFileAtomic instead of plain writeFile"
  - "scaffold-tool.ts compensates a failed batch by moving every relocated keepLegacy original back to its pre-call path, instead of reordering (reordering alone would let the batch writer's existing rm-based rollback delete pre-existing content rather than restore it)"
  - "New/updated specs cover both: a cross-process-simulating two-independent-writer-instances multi-file race, and a batch-write-failure-restores-the-original scaffold test"

### S3 — genericity: open the Claude alias list
- **Status**: done
- **Files**: `packages/core/src/lib/scaffold/scaffold-host.ts`, `packages/core/src/lib/scaffold/scaffold-tool.ts`, `packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts`
- **Gate**: test
- acceptance:
  - "CLAUDE_MODEL_ALIASES moved into IScaffoldHostOptions.claudeModelAliases?: readonly string[] (default: none supplied = empty)"
  - "claudeModelField falls through to the generic claude- prefix check when no alias list is supplied"
  - "IScaffoldToolOptions gained a passthrough claudeModelAliases field (the two caller locations named in the original finding, extensions/vscode/src/commands/ and tools/scripts/init/, do not exist in this repo — scaffold-tool.ts is the real, only caller)"

### S4 — genericity: open the provider subscription union
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`, `packages/core/src/lib/plugins/config-file-schema.ts`, `packages/core/schema/mcp-vertex.config.schema.json`, `plugins/orchestrator-runner/src/lib/options.ts`, `plugins/orchestrator-runner/tests/src/lib/options.spec.ts`
- **Gate**: test
- acceptance:
  - "IProviderInvoke.subscription.tool is KnownSubscriptionTool | (string & {}) — any string accepted, literals kept for autocomplete"
  - "config-file-schema.ts's PROVIDER_INVOKE_SCHEMA and orchestrator-runner's own InvokeSchema (a second, independent copy of the same enum) both widened to z.string().min(1) — the TS-level fix alone would have been hollow, since these zod schemas are the actual runtime parsers for the same field"
  - "New smoke test proves a brand-new, never-seen-before host id round-trips through ProviderSchema"

## Notes

**S2 reviewed and NOT implemented** (retired, not silently dropped): the finding's own "why" — "every non-mcp-vertex adopter... will hit a wrong default" — does not actually hold. `defaultTargetDir`'s check is `analysis.name === '@mcp-vertex/core-monorepo'`, an EXACT string match against this repo's own root `package.json#name`. No other real adopter's package would ever carry that literal name, so the branch can only ever fire for mcp-vertex's own repo — it is not a genericity leak that harms adopters.

More importantly, it is not accidental leftover: **3 separate, deliberately-named tests** encode this as an intentional feature —
`build-blueprint.spec.ts`'s "derives the canonical self-host namespace and package target", `adoption-modes.e2e.spec.ts`'s "dogfoods the real repository identity without targeting libs/mcp-project", and `recommend-plan`'s analogous test (`recommend-plan.ts` has the identical hardcode at its own `defaultTargetDir`, not just `build-blueprint.ts` — the finding only cited one of the two occurrences). Removing the branch would make mcp-vertex's own self-scaffold default silently change from `packages/core` to `.` (repo root) and break all 3 tests. Since the check can never fire for a real adopter, this is dogfooding support, not a genericity bug — implementing it as literally specified would have traded a real, tested, intentional feature for a hypothetical harm that cannot occur. Left both occurrences untouched.

- a00083 — full-project audit (source of these findings)
- a2f3fa73 — shipped the easy findings (F4 scaffold template `outputSchema`, F1 init_config mutex, etc.)

## acceptance

- batch-atomic-writer.ts serializes via withFileMutex(workspaceRoot, ...) instead of a process-local promise chain, and writes via writeFileAtomic instead of plain writeFile
- scaffold-tool.ts compensates a failed batch by moving every relocated keepLegacy original back to its pre-call path
- CLAUDE_MODEL_ALIASES moved into IScaffoldHostOptions.claudeModelAliases?: readonly string[]
- IProviderInvoke.subscription.tool accepts any string; both real zod parsers (core + orchestrator-runner) widened to match
- S2 reviewed and retired with documented reasoning (see Notes) rather than implemented or silently dropped
