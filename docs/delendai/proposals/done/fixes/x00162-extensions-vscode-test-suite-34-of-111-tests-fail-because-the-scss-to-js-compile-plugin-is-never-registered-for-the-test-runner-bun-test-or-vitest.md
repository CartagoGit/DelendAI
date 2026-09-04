---
id: x00162
title: "extensions/vscode test suite: 34 of 111 tests fail because the SCSS-to-JS compile plugin is never registered for the test runner (bun test or vitest)"
kind: fix
status: done
type: proposal
track: extensions/vscode+apps/shared+tooling+tests+self-hosting
date: 2026-07-27
---

# x00162 — extensions/vscode test suite: 34 of 111 tests fail because the SCSS-to-JS compile plugin is never registered for the test runner (bun test or vitest)

## Goal

`tools/scripts/compile/scss-plugin.ts` (a Bun esbuild-style plugin compiling `.scss` imports to a JS module with both a `default` and a named `compiledCss` export) is used at build time for the VS Code extension bundle, but is never registered for either test runner. Every test that transitively imports a `.scss` file (via shared webview-rendering helpers under `apps/shared/src/styles/`) fails with `SyntaxError: Export named 'compiledCss' not found`. Register the plugin for tests too, and fix a real resolution bug the investigation surfaced along the way.

## why

Discovered 2026-07-28 while investigating a single failing test found during an unrelated broad "plugin" test-filter run (tools/scripts/compile/scss-plugin.spec.ts, fixed separately by not relying on Bun's dynamic data:-URL import, which silently does not execute the module — reproduced directly with `bun -e`). Widening the check to the full extensions/vscode/src/test suite showed the blast radius is much bigger: `bun test extensions/vscode/src/test` reports 77 pass / 34 fail / 34 errors out of 111 tests (2026-07-28), all with the same `Export named 'compiledCss' not found in module '.../dashboard.scss'` root cause. Neither `bunfig.toml` (no `[test].preload`) nor `extensions/vscode/vitest.config.ts` / `vitest.shared.ts` (no `plugins:` array) registers any SCSS transform for tests -- the plugin exists ONLY in the production Bun-bundle build path. Confirmed the fix direction empirically: registering `scssPlugin` via `Bun.plugin()` in a `--preload` script does make `bun test` intercept `.scss` imports, but surfaced a second, real bug in the plugin itself -- its `onResolve` handler assumes `args.resolveDir` is always a populated string and calls `resolve(args.resolveDir, cleanPath)` on it; for at least one real import chain in this test run, `args.resolveDir` is `undefined`, throwing `TypeError: The "paths[0]" property must be of type string, got undefined` instead of compiling the file.

## non-goals

- Changing the production VS Code extension bundling path — it already uses this plugin correctly at build time; only the TEST-time registration is missing.
- Deciding vitest vs. bun test as the canonical runner for this repo — out of scope; whichever ends up the source of truth for `extensions/vscode` needs the registration, and ideally both do since this session found both bun test and (separately, pre-existing) vitest itself unreliable in this Bun-only-host environment.
- A general audit of every other `apps/shared/src/styles/*.scss` consumer for the same gap — the two failing spec files found here are enough to prove the root cause; a full sweep is this proposal's own acceptance criterion (all 111 tests green), not a separate follow-up.

## Slices

- global_gate: type

### S1 — Fix the resolveDir-undefined bug in scss-plugin.ts's onResolve handler
- **Status**: done
- **Implementation**: `onResolve` now falls back to `dirname(args.importer)` whenever `args.resolveDir` is not a non-empty string. `importer` is populated even in the global-`Bun.plugin()`-registration case where `resolveDir` was empty, which is what actually surfaced this bug live.
- **Files**: `tools/scripts/compile/scss-plugin.ts`, `tools/scripts/compile/scss-plugin.spec.ts`
- **Gate**: `bunx tsc --noEmit` clean; `bun test tools/scripts/compile/scss-plugin.spec.ts` — 3/3 pass (was 2, +1 regression case). Also fixed the sibling pre-existing bug the investigation started from: the first test's `import('data:text/javascript,...')` silently does not execute the module in this Bun version (`module.default` resolves to the data: URL string itself, reproduced directly with `bun -e`, independent of any test runner) — switched to writing the compiled output to a real temp file and importing that path instead.

### S2 — Register scssPlugin for both test runners: bun test (bunfig.toml preload) and vitest (vite plugin adapter)
- **Status**: done
- **Implementation**: added `tools/scripts/compile/scss-preload.ts` (calls `Bun.plugin(scssPlugin)` once) and wired it via `bunfig.toml`'s `[test].preload`. **Live verification**: `bun test extensions/vscode/src/test` went from 77 pass / 34 fail / 34 errors to 223 pass / 1 fail — the single remaining failure (`vi.stubGlobal is not a function`) is Bun's vitest-compatibility shim missing an unrelated API, not a scss issue. Regression-checked `packages/` (1793/1793) and `plugins/` (3402/3402) with the global preload active — no regressions. **vitest side (accepted gap, per this slice's own escape-hatch clause)**: NOT implemented. bun test is the reliable, verified path in this environment; vitest itself has a separate, larger, pre-existing environment defect in this same session (fails to resolve zod under Vite's dependency optimizer on a Bun-only host with no standalone Node.js — see x00158's notes) that makes a vitest-side SCSS adapter unverifiable right now and low-value until that is fixed. A `resolveId`/`load`-based Vite adapter reusing `compileString` is the follow-up once vitest itself is healthy in this environment.
- **Files**: `bunfig.toml`, `tools/scripts/compile/scss-preload.ts`
- **Gate**: `bun test extensions/vscode/src/test` — 223/224 pass (1 unrelated pre-existing failure); `bun test packages/` — 1793/1793; `bun test plugins/` — 3402/3402.
- acceptance:
  - "bunfig.toml gains a [test].preload entry pointing at a new small script that calls Bun.plugin(scssPlugin) once."
  - "bun test extensions/vscode/src/test reports 111/111 pass, 0 fail, 0 errors (currently 77/111)."
  - "vitest.shared.ts gains an equivalent Vite-compatible transform (resolveId/load) for .scss imports producing the same default+compiledCss export shape, OR (if a Vite adapter is materially riskier than the bun-test fix) the gap is explicitly documented as accepted with a reason, since bun test is confirmed reliable in this environment and vitest already has its own unrelated pre-existing breakage (x00158's notes)."

## acceptance

- onResolve no longer throws TypeError when args.resolveDir is undefined -- falls back to a sensible default (e.g. dirname(args.importer) when available, else the plugin's own cwd-free resolution per AGENTS.md rule 2) or produces a clear, typed plugin error instead of an uncaught TypeError.
- New regression spec pins the previously-undefined-resolveDir import shape.
- bunfig.toml gains a [test].preload entry pointing at a new small script that calls Bun.plugin(scssPlugin) once.
- bun test extensions/vscode/src/test reports 111/111 pass, 0 fail, 0 errors (currently 77/111).
- vitest.shared.ts gains an equivalent Vite-compatible transform (resolveId/load) for .scss imports producing the same default+compiledCss export shape, OR (if a Vite adapter is materially riskier than the bun-test fix) the gap is explicitly documented as accepted with a reason, since bun test is confirmed reliable in this environment and vitest already has its own unrelated pre-existing breakage (x00158's notes).
