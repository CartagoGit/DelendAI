---
id: x00167
title: "test-convention's scan_drift silently scans 0 files in production — always reports false \"all clean\""
kind: fix
status: done
type: proposal
track: plugins+test-convention+dogfooding
date: 2026-07-29
shipped-in:
    - 3d48cf8e # S1 — recursive IScanReader port, fixes scannedFiles:0 in production
---

# x00167 — test-convention's scan_drift silently scans 0 files in production — always reports false "all clean"

## Goal

Independent automated audit (deliberately using a different methodology than a00083's manual code-read — actually invoking the project's own MCP tools live) found that `mcp-vertex_test-convention_scan_drift` — the tool whose entire job is to catch test-convention drift across the repo — has been silently non-functional in production for every host, including mcp-vertex's own dev repo. Root cause: `scanDrift` (plugins/test-convention/src/scan.ts) calls `reader.listDir('')` exactly ONCE, expecting a full recursive file listing, but the production `IFileReader` it receives (`createWorkspaceFileReader`, from `@mcp-vertex/core/public`) is backed by a single, deliberately-shallow `fs.readdir()` call — by design, since every OTHER consumer of that shared port correctly relies on its shallow semantics. Confirmed live: calling the real MCP tool against this repo returns `{"scannedFiles":0,"ok":true,...}` — a false "everything is clean" signal. The plugin's own unit tests never caught this because their fake reader's `listDir` returns the full flat file-path list directly, papering over the exact recursive-walk requirement the real reader never satisfies. `@mcp-vertex/conventions` solved this identical problem correctly (its own `IDirReader`/`IDirEntry` port + a real recursive walk via `readdir(..., {withFileTypes:true})`); this fix gives `test-convention` the same proven shape rather than reusing the generic, intentionally-shallow `IFileReader`.

## why

The user asked for dogfooding to be tested exhaustively, plugin by plugin, with bugs fixed by actually checking things work as they should — not just reading code. This is a direct hit on that ask: a tool built specifically to catch drift was itself silently broken, in every host, forever, and would have kept reporting a false "all clean" indefinitely had nobody actually invoked it and looked at the real output instead of trusting its own green unit tests.

## non-goals

- Fixing the 507 real drift violations this scanner can now see across the repo (missing-top-level-describe, orphan-spec, etc.) — that is real, separate follow-up work; this proposal only fixes the scanner itself so that work becomes visible.
- Changing the shared @mcp-vertex/core IFileReader.listDir to be recursive — other consumers (agent-config-rules.ts, init-config-tool.ts, ci-rules.ts, skills/registry.ts) correctly rely on its shallow, single-level semantics; changing it globally would risk regressing them.
- Extracting a shared cross-plugin recursive-directory-walk utility into core — @mcp-vertex/conventions already has its own working, unexported implementation; duplicating the same small, proven shape locally in test-convention is lower-risk than a larger core refactor for this fix.

## Slices

- global_gate: type

### S1 — Give scan_drift its own recursive, isDirectory-aware reader port
- **Status**: done
- **Implementation**: implemented exactly per the acceptance criteria below. Confirmed live via a direct script (`scanDrift` + `createFsScanReader` against this repo's real filesystem, bypassing the MCP host — which is running stale pre-fix code this session, a known discrepancy): before the fix, the live tool call returned `{"scannedFiles":0,"ok":true}`; after the fix, a direct invocation returns `scannedFiles: 500` (hit the default cap), `ok: false`, `507` real errors + `183` warnings — genuine drift findings (missing-top-level-describe, orphan-spec, etc.) across the repo that this scanner had never surfaced before. Those 507 findings are real, separate follow-up work (this proposal's own non-goals), not fixed here.
- **Files**: `plugins/test-convention/src/scan.ts`, `plugins/test-convention/src/fs-scan-reader.ts`, `plugins/test-convention/src/index.ts`, `plugins/test-convention/src/lib/tools/scan-drift.ts`, `plugins/test-convention/src/public/index.ts`, `plugins/test-convention/tests/src/lib/scan.spec.ts`
- **Gate**: type
- acceptance:
  - "scan.ts defines IDirEntry/IScanReader (list + readFile) and a walkFiles() breadth-first walker (skipping node_modules/dist/.git/.cache/build), mirroring @mcp-vertex/conventions's IDirReader pattern; scanDrift's single reader.listDir('') call is replaced with walkFiles(reader)."
  - "fs-scan-reader.ts provides createFsScanReader(rootDir), a node:fs-backed IScanReader using readdir(..., {withFileTypes:true}), workspace-contained via resolveWorkspaceContained."
  - "index.ts wires createFsScanReader(ctx.workspace.root) into buildScanDrift specifically, leaving detectRunner/renderRunnersMarkdown on the original shallow IFileReader (they only ever call exists()/readFile(), never listDir, so they are correctly unaffected)."
  - "scan.spec.ts's fakeReader simulates a real directory tree (isDirectory per entry, recursive list()) from the flat path->content test fixtures instead of returning every key from one listDir('') call."
  - "Reproduced live: a direct script invocation of scanDrift + createFsScanReader against this repo's real filesystem now returns scannedFiles > 0 with real violations (was scannedFiles:0, ok:true before the fix) — not just asserted in a unit test with a fake reader."

## acceptance

- scan.ts defines IDirEntry/IScanReader (list + readFile) and a walkFiles() breadth-first walker (skipping node_modules/dist/.git/.cache/build), mirroring @mcp-vertex/conventions's IDirReader pattern; scanDrift's single reader.listDir('') call is replaced with walkFiles(reader).
- fs-scan-reader.ts provides createFsScanReader(rootDir), a node:fs-backed IScanReader using readdir(..., {withFileTypes:true}), workspace-contained via resolveWorkspaceContained.
- index.ts wires createFsScanReader(ctx.workspace.root) into buildScanDrift specifically, leaving detectRunner/renderRunnersMarkdown on the original shallow IFileReader (they only ever call exists()/readFile(), never listDir, so they are correctly unaffected).
- scan.spec.ts's fakeReader simulates a real directory tree (isDirectory per entry, recursive list()) from the flat path->content test fixtures instead of returning every key from one listDir('') call.
- Reproduced live: a direct script invocation of scanDrift + createFsScanReader against this repo's real filesystem now returns scannedFiles > 0 with real violations (was scannedFiles:0, ok:true before the fix) — not just asserted in a unit test with a fake reader.
