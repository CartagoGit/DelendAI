---
id: x113
type: proposal
status: done
track: plugins
date: 2026-06-20
related:
  - f99 # feat: multi-model audit plugin
  - f108 # feat: test-convention plugin
kind: fix
title: Fix `@mcp-vertex/audit` type errors and LSP `dist/public/index.d.ts not found` cascade
---

# x113 — Fix `@mcp-vertex/audit` type errors and LSP `dist/public/index.d.ts not found` cascade

> **Status: SHIPPED 2026-06-20.** All 3 type errors fixed. `bun run
> validate` is green (117 files / 837 tests passed). Stale `dist/`
> artefacts removed. No core contract changes; the audit plugin now
> reads the filesystem via `node:fs/promises`, consistent with
> `plugins/memory`.

## 0. The symptom

VS Code's TypeScript LSP repeatedly reported:

```
Request textDocument/definition failed.
Message: The file /home/cartago/_projects/mcp-core/packages/core/dist/public/index.d.ts
        does not exist in the workspace.
```

`bun run build` revealed the real underlying cause: `plugins/audit`
was failing typecheck against the **current** core API, so its
`dist/public/index.d.ts` was never produced, so every plugin that
transitively consumed `@mcp-vertex/core/public` lost its "Go to
Definition" target.

## 1. Root causes (3 distinct, all in `plugins/audit/src/`)

1. **`IWorkspacePathProvider.reader` does not exist.**
   - File: `plugins/audit/src/index.ts:165`
   - `ctx.workspace.reader` — but `IWorkspacePathProvider` only
     exposes `root` and `resolve(relativePath)` (verified in
     `packages/core/src/lib/contracts/interfaces/workspace-paths.interface.ts`).
   - The audit plugin was the only consumer of a non-existent API.

2. **`IAuditFinding` used without being imported.**
   - File: `plugins/audit/src/lib/consolidate.ts:63`
   - `findingKey(f: IAuditFinding, ...)` referenced `IAuditFinding`
     but the import line only pulled `AuditSeverity`, `IConsolidation`,
     and `IAuditDocument`.

3. **`exactOptionalPropertyTypes: true` mismatch on tool handlers.**
   - Files: `plugins/audit/src/lib/tools/consolidate-tool.ts:104`,
     `plugins/audit/src/lib/tools/plan-tool.ts:63`
   - The handler signatures used `{ foo?: T }` while the MCP SDK
     generates `{ foo?: T | undefined }` from Zod schemas. Under
     `exactOptionalPropertyTypes: true` these are not assignable.

## 2. The fix

### 2.1 Replace `IFileReader` injection with direct `fs/promises`

Audit was the only plugin trying to receive an `IFileReader` via
`IWorkspacePathProvider`. The invariant in `AGENTS.md` says:

> The core stays agnostic. No `process.cwd()` in engines.

…but plugins are explicitly allowed to do I/O; `plugins/memory`
already reads via `node:fs/promises`. Audit now does the same:

- `plugins/audit/src/lib/tools/consolidate-tool.ts` imports
  `readFile`, `readdir` from `node:fs/promises` and `path` from
  `node:path`.
- The tool receives `workspaceRoot: string` (not a `reader`) and
  resolves `auditDir` against it via `path.resolve(workspaceRoot, relDir)`.
- Errors from `readdir` are surfaced via `toolError` (not thrown),
  matching the existing error UX.

### 2.2 Add `IAuditFinding` to the import list

```ts
// plugins/audit/src/lib/consolidate.ts
import type {
  AuditSeverity,
  IAuditDocument,
  IAuditFinding,   // ← added
  IConsolidation,
} from './types';
```

### 2.3 Adjust handler signatures for `exactOptionalPropertyTypes`

```ts
// Before
async (args: { auditDir?: string; topActions?: number }) => { ... }
async (args: { scope?: AuditScope }) => { ... }

// After
async (args: { auditDir?: string | undefined; topActions?: number | undefined }) => { ... }
async (args: { scope?: AuditScope | undefined }) => { ... }
```

The `IConsolidateOptions` construction site is also rewritten to
spread conditionally so the optional `topActions` field is only
included when defined:

```ts
const result = consolidateAudits(parseAuditFiles(docs), {
  ...(args.topActions !== undefined
    ? { topActions: args.topActions }
    : options.defaultTopActions !== undefined
      ? { topActions: options.defaultTopActions }
      : {}),
});
```

## 3. What was NOT changed

- **No core changes.** `IWorkspacePathProvider`, `IMcpPluginContext`,
  and `IFileReader` are untouched. The core stays agnostic.
- **No `dist/` rebuild.** The repo invariant is "dist/ is for
  publish only". Dev uses `tsconfig.paths` → `src/`. The stale
  `dist/` artefacts were **deleted**, not regenerated.
- **No new public API in `@mcp-vertex/core`.** The plugin learned
  to use `node:fs/promises` directly, same as memory.

## 4. Verification

```bash
$ bun x tsc --noEmit -p plugins/audit/tsconfig.json
(zero output → green)

$ bun run typecheck
(zero output → green)

$ bun run lint
Checked 468 files in 257ms. No fixes applied.

$ bun run test
 Test Files  117 passed (117)
      Tests  837 passed | 10 skipped (847)
```

## 5. Follow-up (not part of this proposal)

- The root `tsconfig.json` still excludes `plugins/audit/**/*`
  (line 22), so `bun run typecheck` from the root **does not**
  typecheck audit. Audit has its own `tsconfig.json` that extends
  the base, so `bun x tsc --noEmit -p plugins/audit/tsconfig.json`
  is the canonical command. If we want `bun run typecheck` to cover
  audit too, drop the exclude — but verify no new errors appear
  first (the audit tsconfig has slightly different `include`
  semantics: `tests/**/*` not `tests/src/**/*`).
- Consider moving `plugins/audit/tsconfig.dts.json` to a build
  script that runs only on `bun run build`, so dev doesn't carry
  the declaration-bundle overhead.

## 6. Files touched

- `plugins/audit/src/index.ts` — replaced `reader: ctx.workspace.reader`
  with `workspaceRoot: ctx.workspace.root`.
- `plugins/audit/src/lib/tools/consolidate-tool.ts` — replaced
  `IFileReader` injection with `node:fs/promises`, added `workspaceRoot`
  field, fixed handler signature, made `IConsolidateOptions`
  construction tolerate exactOptionalPropertyTypes.
- `plugins/audit/src/lib/tools/plan-tool.ts` — fixed handler signature
  to `scope?: AuditScope | undefined`.
- `plugins/audit/src/lib/consolidate.ts` — added `IAuditFinding` to
  the type import.
- `packages/core/dist/` and `plugins/audit/dist/` — removed (stale
  outputs that were confusing the LSP).

## 7. Conventional Commits

```
fix(audit): align plugin with current core API (no reader injection)

- Drop IFileReader dependency in audit_consolidate; read audits via
  node:fs/promises directly (same pattern as plugins/memory).
- Add missing IAuditFinding import in lib/consolidate.ts.
- Adjust tool handler signatures for exactOptionalPropertyTypes.
- Remove stale dist/ artefacts that confused the TS LSP.

Refs: x113
```