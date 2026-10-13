---
id: a00058
title: "17-07-2026b audit — the dev-preview browser bundle was silently broken; permanent verify:dev-bundles gate"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing a00058 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 7b249ed1 # fix(search,docs): a00062 — search/docs returned zero results for every mcp-verte
  - 7aaa10fd # fix(cli): a00061 — mcpv init/init:default silently ignored --workspace and wrote
  - f7238422 # fix(cli): a00060 — mcpv doctor was silent by default and always reported 0 tools
  - 06e5720d # fix(web): a00059 — 937 tool/plugin detail pages shipped as bare unstyled fragmen
  - 50906f38 # fix(dev): a00058 — dev-preview browser bundles were silently broken since an unk
---

# a00058 — 17-07-2026b claude-round-2 audit — the dev-preview browser bundle was silently broken; permanent verify:dev-bundles gate

## Goal

CLAUDE.md requires visually testing UI changes in a browser before calling them done. Tried to do exactly that for f00118's new Spend panel via `bun run dev:ide` and found both dev-preview commands (`dev:ide` port 5100, `dev:vscode` port 5200) have been silently crashing: `Bun.build({target:'browser'})` failed with "Browser build cannot require() Node.js builtin: child_process" because `cross-spawn` (a transitive dependency of `@modelcontextprotocol/sdk`'s stdio client transport, reached through `@mcp-vertex/client`'s `McpStdioClient` barrel export, which `packages/ui-extension/src/settings/settings-schema.ts` pulls in for pure constants like `DEFAULT_EXTENSION_SETTINGS`) does an old-style bare `require('child_process')` that the existing `external: ['node:*', 'vscode']` glob does not match (the glob only covers the `node:`-prefixed spelling). Nobody could actually preview the dashboard/webviews in a browser for an unknown period, which is exactly the kind of blind spot that lets proposal Files:-doc drift (a00057) and unnoticed visual regressions accumulate. Fixed by completing the external list with the full bare Node builtin set (`tools/scripts/dev/browser-externals.ts`) and reusing it in both `dev.script.ts` and a new standing verify gate (`verify:dev-bundles`) so this class of regression fails `bun run validate` automatically instead of requiring someone to manually launch a dev server and notice.

## why

User directive: keep pushing every dimension to 11/10. CLAUDE.md's own instruction ("start the dev server and use the feature in a browser before reporting complete") cannot be honored if the dev server itself is broken — this blocked verifying f00118's Spend tab and silently would have blocked every future UI review.

## non-goals

- No change to @mcp-vertex/client's public package boundary (adding a narrower subpath export for settings constants) — the dev-tooling-level external-list fix is lower blast radius and does not touch a committed package contract.
- No attempt to make Bun.build callable from vitest specs — confirmed the global Bun object is unavailable under vitest's Node-based test runner, so this verify script follows the existing external-install-smoke.script.ts precedent (no .spec.ts companion, validated by direct execution).

## Slices

- global_gate: e2e

### S1 — Root-cause the crash, fix the external list, add a permanent verify:dev-bundles gate
- **Status**: done
- **Files**: `tools/scripts/dev/browser-externals.ts`, `tools/scripts/dev/dev.script.ts`, `tools/scripts/verify/dev-bundles-verify.script.ts`, `package.json`
- **Gate**: e2e
- acceptance:
  - "Bisected the failure to cross-spawn's bare require('child_process') via @mcp-vertex/client's McpStdioClient export, reached transitively from packages/ui-extension/src/settings/settings-schema.ts."
  - "BARE_NODE_BUILTINS (full public Node builtin list, bare form) + BROWSER_BUILD_EXTERNALS shared between dev.script.ts and the new verify script — single source of truth."
  - "verifyDevBundles(root) Bun.builds both real dev-preview entries (packages/ui-extension/src/dev/entry.ts, extensions/vscode/src/dev/entry.ts) against the real repo tree and reports failures; wired into package.json as verify:dev-bundles and into the validate chain."
  - "Manually confirmed both bun run dev:ide and bun run dev:vscode now serve a clean browser bundle (entry.js containing the real Spend panel markup/i18n keys), where they previously crashed."
  - "bun run typecheck clean; bun run verify:dev-bundles green."

## acceptance

- Bisected the failure to cross-spawn's bare require('child_process') via @mcp-vertex/client's McpStdioClient export, reached transitively from packages/ui-extension/src/settings/settings-schema.ts.
- BARE_NODE_BUILTINS (full public Node builtin list, bare form) + BROWSER_BUILD_EXTERNALS shared between dev.script.ts and the new verify script — single source of truth.
- verifyDevBundles(root) Bun.builds both real dev-preview entries (packages/ui-extension/src/dev/entry.ts, extensions/vscode/src/dev/entry.ts) against the real repo tree and reports failures; wired into package.json as verify:dev-bundles and into the validate chain.
- Manually confirmed both bun run dev:ide and bun run dev:vscode now serve a clean browser bundle (entry.js containing the real Spend panel markup/i18n keys), where they previously crashed.
- bun run typecheck clean; bun run verify:dev-bundles green.

## Verified State

| Verification | Value |
|---|---|
| Repro (before fix) | `bun run dev:ide` → `[dev] entry bundle failed: ResolveMessage: Browser build cannot require() Node.js builtin: "child_process"`, same for `dev:vscode` |
| Root cause (isolated via `bun build` bisection of `packages/ui-extension/src/public/index.ts`, binary-search over its ~180 re-export lines) | `settings/settings-schema.ts` imports `DEFAULT_EXTENSION_SETTINGS` etc. from `@mcp-vertex/client` (bare specifier) → `packages/client/src/public/index.ts`'s first export is `McpStdioClient` from `../lib/transport/mcp-stdio-client` → `@modelcontextprotocol/sdk`'s stdio transport → `cross-spawn@7.0.6` → `require('child_process')` (bare form, no `node:` prefix) |
| Existing `external` config (`tools/scripts/dev/dev.script.ts`, pre-fix) | `['node:*', 'vscode']` — the glob matches `node:child_process` but not bare `child_process` |
| Fix verified | `bun tools/scripts/verify/dev-bundles-verify.script.ts` → `✓ dev-bundles-verify: 2 dev-preview entries bundle clean for the browser target.` |
| Fix verified live | `bun run dev:ide` served `/__entry.js` (4 560 645 B, unminified) containing `panel-spend` and `dashboard.spend.totalCost`; `bun run dev:vscode` served `/__entry.js` (26 958 B) — both previously crashed at build time before any bytes were served |
| `bun run typecheck` | clean (0 errors) |
| Confirmed NOT vitest-testable | `Bun.build` throws `ReferenceError: Bun is not defined` under `vitest run` (Node-based test workers) — matches the existing `external-install-smoke.script.ts` precedent of no `.spec.ts` companion for Bun-native verify scripts |

## Findings

### 1. Dev-preview browser bundles (`dev:ide`, `dev:vscode`) were silently broken (P0 · UI-verification blind spot)
**File**: [`tools/scripts/dev/dev.script.ts#L258`](../../../../../tools/scripts/dev/dev.script.ts#L258) (pre-fix), root cause in [`packages/client/src/public/index.ts#L1-L6`](../../../../../packages/client/src/public/index.ts#L1-L6) + [`packages/ui-extension/src/settings/settings-schema.ts#L1-L9`](../../../../../packages/ui-extension/src/settings/settings-schema.ts#L1-L9).
**Impact**: CLAUDE.md requires visually verifying UI work in a browser before calling it done; with the dev server crashing at build time, that instruction was impossible to honor for an unknown span of sessions — every dashboard/webview change (including f00118's Spend panel, built entirely from specs this round) shipped unverified in an actual browser. This is very likely a contributing cause behind the class of proposal `Files:` drift a00057 found: authors couldn't easily preview their own work, so the written record and the shipped code diverged unchecked.
**Resolution**: [RESUELTO] — `tools/scripts/dev/browser-externals.ts` (new) completes the `external` list with the full bare Node builtin set; `dev.script.ts` and the new `verify:dev-bundles` gate share the one constant. Verified live against both real entries (see Verified State).

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| Dev-preview browser build (`dev:ide`/`dev:vscode`) | 0/10 — crashed at build time, zero bytes ever served | 10/10 — both build clean, verified live with real content |
| Standing regression gate for this class of bug | none | `verify:dev-bundles` in `bun run validate` |
| Overall (delta on top of a00057's audit) | — | this finding closed; no other findings opened this pass |
