---
id: x00168
title: "6 tools bypass workspace containment on LLM-supplied path arguments (i18n, diagram, perf, env, security, forge)"
kind: fix
status: done
type: proposal
track: security+plugins+containment
date: 2026-07-29
shipped-in:
    - fc93b326 # S1-S5 — contain path arguments across i18n, diagram, perf, env, security, forge
---

# x00168 — 6 tools bypass workspace containment on LLM-supplied path arguments (i18n, diagram, perf, env, security, forge)

## Goal

Independent parallel audit (4 subagents, each briefed on REPO-RULES.md rule 5 — "workspace-scoped path inputs must be contained via resolveWorkspaceContained") found and live-reproduced 6 real path-containment bypasses across 5 plugins, all sharing the same root cause: an LLM-supplied tool-input path argument reaches real filesystem I/O with zero call to `resolveWorkspaceContained`/`resolveAgainstRoots`. Verified each personally before filing: (1) `i18n_check`/`i18n_validate`'s `localesDir` reaches `joinUnderRoot` — a helper whose OWN docstring says "never use this for a path that originates from an LLM tool argument" — reproduced live reading a file outside the workspace and echoing a marker key back in the tool output; (2) `diagram_modules`'s `packageRoot` reaches `readdir`/`readFile` with zero containment primitive anywhere in the file — reproduced live listing an out-of-workspace directory's contents as graph nodes; (3) `perf_profile`'s `cwd` reaches a spawned `node --prof` process argument with zero containment; (4) `env_check`'s `path` hand-rolls the exact unsafe `isAbsolute(p) ? p : join(root,p)` shape (same bug class as #1, reimplemented locally) with zero containment; (5) `security_sast`'s `cwd` has the identical unguarded `args.cwd ?? workspaceRootAbs` shape as `security_deps`'s already-filed F16 (that fix is tracked separately under x00185, owned by a concurrent agent — NOT touched here to avoid duplicating their work; `security_sast` itself was never covered by that or any other filed proposal); (6) `forge`'s `proposalId` (used by `pr_create`) reaches a bare `path.join` with zero containment, and — uniquely severe among these six — the resulting file content is embedded verbatim into a PR body and POSTED to the real, public origin forge, making this an actual exfiltration channel for any `*.md` file readable by the host process, not just an information-disclosure-via-tool-response like the other five.

## why

The user asked for dogfooding to be verified exhaustively, plugin by plugin, so that every part works correctly regardless of which LLM drives it, "sin posibilidad de bugs." A tool argument that silently escapes the workspace is exactly the class of bug that behaves identically no matter which model calls it — any LLM, weak or strong, that passes a plausible-looking `cwd`/`path`/`localesDir`/`proposalId` gets the same silent security failure. The `forge` finding is the most serious: it is not just an information-disclosure-via-tool-response like the other five, it is a genuine exfiltration channel (arbitrary `.md` file content posted verbatim into a real, public PR on the origin forge).

## non-goals

- Fixing security_deps.tool.ts's identical cwd issue (F16) — already filed as part of x00185 by a concurrent agent working the same repo; touching it here would duplicate/conflict with their in-flight work.
- A general security re-audit of every plugin's every path-shaped option — this proposal fixes the 6 concrete, reproduced instances found by this pass; a broader systematic sweep is a separate, larger initiative if the user wants one.
- Changing diagram_modules's default (no-override) packageRoot behavior — the plugin-configured absolute default (modulePackageRootAbs) is a trusted config value, not LLM input, and stays as-is per the same trusted-vs-untrusted distinction resolveWorkspaceContained's own docs draw.

## Slices

- global_gate: type

### S1 — Contain i18n_check/i18n_validate's localesDir
- **Status**: done
- **Implementation**: both tools now validate `localesDir` via `resolveWorkspaceContained(options.workspaceRootAbs, localesDir)` before constructing `realI18nDeps` — but only when `options.deps` is not already overridden (tests that inject their own fake deps never touch the filesystem, so they are unaffected). An escaping/absolute `localesDir` returns a `toolError` with the containment `reason`. The default case (`localesDir` omitted, defaulting to `'locales'`) resolves to the same contained relative path as before, byte-identical behavior.
- **New tests**: 4 new cases (2 per tool) prove an out-of-workspace (`../../../../etc`) and an absolute (`/etc`) `localesDir` are both rejected with `isError: true` when no `deps` override is supplied; all existing happy-path tests (which always supply `deps`) stay green.
- **Files**: `plugins/i18n/src/lib/tools/i18n-check.tool.ts`, `plugins/i18n/src/lib/tools/i18n-validate.tool.ts`
- **Gate**: type
- acceptance:
  - "Both tools call resolveWorkspaceContained(options.workspaceRootAbs, localesDir) before constructing realI18nDeps; an escaping/absolute localesDir returns a toolError instead of reading the path."
  - "A contained localesDir (the common case, default 'locales') behaves byte-identically to before."
  - "New tests: an out-of-workspace localesDir is rejected with a clear error for both tools; the existing happy-path tests stay green."

### S2 — Contain diagram_modules's packageRoot
- **Status**: done
- **Implementation**: an explicit `packageRoot` now goes through `resolveWorkspaceContained(options.workspaceRootAbs, explicitRoot)`; an escaping/absolute value returns a `toolError` instead of reaching `readdir`/`readFile`. The description now says `packageRoot` is workspace-relative (e.g. `plugins/foo`), a deliberate, necessary tightening of the input contract from the old (vulnerable) "pass an absolute path" shape. The no-override default (`modulePackageRootAbs`, a trusted plugin-config value) is untouched.
- **New tests**: new file `diagram-graph.tool.spec.ts` (none existed before) — an out-of-workspace `packageRoot` is rejected AND its directory contents never leak into the response; a `../../../../etc`-style traversal is rejected; a genuine workspace-relative override (`packages/demo`) still works end-to-end (real files written to a tmp workspace, graph correctly built).
- **Files**: `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`, `plugins/diagram/tests/src/lib/tools/diagram-graph.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "An explicit packageRoot is validated via resolveWorkspaceContained(options.workspaceRootAbs, explicitRoot) before use; the tool's description is updated to say packageRoot is workspace-relative (not absolute) since resolveWorkspaceContained rejects absolute paths by design."
  - "An escaping/absolute packageRoot returns a toolError instead of listing the directory."
  - "The no-override default path (modulePackageRootAbs, a trusted plugin-config value) is unaffected."
  - "New test: an out-of-workspace packageRoot is rejected; existing tests updated to pass a workspace-relative override instead of an absolute one."

### S3 — Contain perf_profile's cwd and env_check's path
- **Status**: done
- **Implementation**: `perf_profile` validates `args.cwd` via `resolveWorkspaceContained` before it ever reaches `runProfileCapture`/the spawned `node --prof` process; an escaping value returns a `toolError`. `env_check` validates `path` at the tool boundary the same way (only when no `deps` override is supplied), AND `real-deps.ts`'s `readEnv` itself was rewritten to drop the hand-rolled `isAbsolute(path) ? path : join(root, path)` shape entirely in favor of `resolveWorkspaceContained`, as defense-in-depth for any other caller of that exported adapter.
- **New tests**: a new containment case in `perf-profile.tool.spec.ts`; a brand-new `env-check.tool.spec.ts` (none existed before) with 3 cases — reads a real `.env` in a tmp workspace when `path` is omitted, rejects an escaping relative path, rejects an absolute path.
- **Files**: `plugins/perf/src/lib/tools/perf-profile.tool.ts`, `plugins/env/src/lib/env/real-deps.ts`, `plugins/env/src/lib/tools/env-check.tool.ts`, `plugins/perf/tests/src/lib/tools/perf-profile.tool.spec.ts`, `plugins/env/tests/src/lib/tools/env-check.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "perf_profile validates args.cwd via resolveWorkspaceContained before passing it into runProfileCapture; an escaping cwd returns a toolError."
  - "env_check's realEnvDeps.readEnv (or its caller) validates path via resolveWorkspaceContained instead of the hand-rolled isAbsolute(path) ? path : join(root, path) shape; an escaping path returns undefined (matching its existing 'never throws, missing file = skipped' contract) OR a clear error at the tool boundary if that is more consistent with the plugin's existing error conventions (check env-check.tool.ts's existing error shape first)."
  - "New tests for both proving an out-of-workspace path is rejected/ignored instead of read."

### S4 — Contain security_sast's cwd
- **Status**: done
- **Implementation**: `args.cwd` now goes through `resolveWorkspaceContained(options.workspaceRootAbs, cwd)` before reaching `detectStack`/`runSastRunner`; an escaping value returns a `toolError`. Deliberately left `security_deps.tool.ts`'s identical, still-open issue (F16) untouched — that fix is tracked separately under x00185, owned by a concurrent agent.
- **New tests**: new file `security-sast.tool.spec.ts` (none existed before) — happy path with fake `detectStack`/`runSastRunner`, an out-of-workspace `cwd` rejected, an absolute `cwd` rejected.
- **Files**: `plugins/security/src/lib/tools/security-sast.tool.ts`, `plugins/security/tests/src/lib/tools/security-sast.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "args.cwd is validated via resolveWorkspaceContained(options.workspaceRootAbs, cwd) before being passed to detectStack/the SAST runner; an escaping cwd returns a toolError."
  - "New test: an out-of-workspace cwd is rejected."

### S5 — Contain forge's proposalId (the exfiltration-severity finding)
- **Status**: done
- **Implementation**: added `isSafeProposalIdStem` (`/^[a-z][a-z0-9-]*$/i`) — a proposal id is always a flat filename stem, never a path, so this is stricter than plain `resolveWorkspaceContained` (which would still permit an embedded `/`). `proposalPathsFor` returns `[]` for an unsafe stem, so `readProposalMarkdown` naturally falls through to its existing `undefined` ("not found in any lifecycle folder") contract — no new error path needed. Confirmed the caller (`createPr` → `buildPrBody`) already degrades gracefully: `trimOrEmpty(undefined)` returns `''`, so the "Linked Proposal" section is silently omitted rather than embedding anything.
- **New tests**: 2 new cases in `forge-write.spec.ts` — a `../../../../outside/secret` proposalId and a `foo/bar` (path-separator) proposalId both resolve to `undefined` with **zero** `readFile` calls (proving the unsafe path is never even attempted, not just that its content is discarded).
- **Files**: `plugins/forge/src/lib/services/forge-write.ts`, `plugins/forge/tests/src/lib/services/forge-write.spec.ts`
- **Gate**: type
- acceptance:
  - "proposalPathsFor/readProposalMarkdown validates the normalised proposalId via resolveWorkspaceContained (or an equivalent stem-shape allowlist, e.g. requiring it to match the existing proposal-id pattern) before joining any path; an escaping proposalId returns undefined (matching the existing 'try next lifecycle folder, undefined if none found' contract) instead of reading an arbitrary .md file."
  - "New test: a proposalId containing path traversal (e.g. '../../../outside/secret') does not read any file outside docs/mcp-vertex/proposals/, and createPr's resulting PR body does not embed its content."
  - "Reproduced: the live PoC the audit used (an out-of-workspace .md file with a marker string) is confirmed NOT reachable after the fix."

## acceptance

- Both tools call resolveWorkspaceContained(options.workspaceRootAbs, localesDir) before constructing realI18nDeps; an escaping/absolute localesDir returns a toolError instead of reading the path.
- A contained localesDir (the common case, default 'locales') behaves byte-identically to before.
- New tests: an out-of-workspace localesDir is rejected with a clear error for both tools; the existing happy-path tests stay green.
- An explicit packageRoot is validated via resolveWorkspaceContained(options.workspaceRootAbs, explicitRoot) before use; the tool's description is updated to say packageRoot is workspace-relative (not absolute) since resolveWorkspaceContained rejects absolute paths by design.
- An escaping/absolute packageRoot returns a toolError instead of listing the directory.
- The no-override default path (modulePackageRootAbs, a trusted plugin-config value) is unaffected.
- New test: an out-of-workspace packageRoot is rejected; existing tests updated to pass a workspace-relative override instead of an absolute one.
- perf_profile validates args.cwd via resolveWorkspaceContained before passing it into runProfileCapture; an escaping cwd returns a toolError.
- env_check's realEnvDeps.readEnv (or its caller) validates path via resolveWorkspaceContained instead of the hand-rolled isAbsolute(path) ? path : join(root, path) shape; an escaping path returns undefined (matching its existing 'never throws, missing file = skipped' contract) OR a clear error at the tool boundary if that is more consistent with the plugin's existing error conventions (check env-check.tool.ts's existing error shape first).
- New tests for both proving an out-of-workspace path is rejected/ignored instead of read.
- args.cwd is validated via resolveWorkspaceContained(options.workspaceRootAbs, cwd) before being passed to detectStack/the SAST runner; an escaping cwd returns a toolError.
- New test: an out-of-workspace cwd is rejected.
- proposalPathsFor/readProposalMarkdown validates the normalised proposalId via resolveWorkspaceContained (or an equivalent stem-shape allowlist, e.g. requiring it to match the existing proposal-id pattern) before joining any path; an escaping proposalId returns undefined (matching the existing 'try next lifecycle folder, undefined if none found' contract) instead of reading an arbitrary .md file.
- New test: a proposalId containing path traversal (e.g. '../../../outside/secret') does not read any file outside docs/mcp-vertex/proposals/, and createPr's resulting PR body does not embed its content.
- Reproduced: the live PoC the audit used (an out-of-workspace .md file with a marker string) is confirmed NOT reachable after the fix.
