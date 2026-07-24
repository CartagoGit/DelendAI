---
id: a00060
title: "17-07-2026d claude-round-2 audit — mcpv doctor was silent by default and always reported 0 tools; silence-console-setup didn't actually cover stderr"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
---

# a00060 — 17-07-2026d claude-round-2 audit — mcpv doctor was silent by default and always reported 0 tools; silence-console-setup didn't actually cover stderr

## Goal

Continuing the "actually run it" theme (a00058, a00059), built packages/cli's real dist and ran `mcpv doctor`/`mcpv overview` against this repo. Two real defects found and fixed, one user-confirmed via AskUserQuestion (doctor's silence was ambiguous — could have been deliberate CLI policy):
1. `mcpv doctor` (documented as a "sectioned health report") printed ABSOLUTELY NOTHING (stdout or stderr) in its default invocation, only an exit code — `index.ts`'s stdout policy suppresses the JSON dump for data()-returning commands unless `--json`, a deliberate fix for a past duplicate-output bug in `init`, but `doctor` never grew its own human-readable recap the way `init` did (`printInitHumanSummary`). User confirmed this was unintended for doctor specifically and asked for the same treatment as init. Added `renderDoctorSummary` (pure) + a stderr print gated on `!ctx.globals.json`, matching init's exact pattern.
2. While verifying the fix, found `doctor`'s "tools" section always reported 0 regardless of real tool count: `overview.tools` is a union (`Array<...> | Record<string, string[]>` per the GENERATED SDK type `McpVertexToolOutputs['mcp-vertex_overview']` — compact mode groups by plugin) but doctor's hand-rolled `IOverviewish.tools?: readonly unknown[]` only matched the array shape, so `.length` silently read `undefined` → 0 against the real Record shape. Same drift class x00105/f00118 already fixed elsewhere in this repo — fixed by switching to the generated type + a `countTools()` helper that sums both shapes correctly. Verified live: went from "0 tool(s) registered" (false warn) to the real "92 tool(s) registered" (ok).
3. While adding a doctor test that calls the real stderr-printing path, discovered `tools/scripts/lib/silence-console-setup.ts`'s docstring has always claimed it silences `process.stdout.write`/`stderr.write` "for the whole test run", but the actual code only ever patched `console.*` methods — a code/doc mismatch (again the same class a00057-a00059 found). Fixed to actually patch `process.stdout.write`/`process.stderr.write` too, matching its own documented contract; full 548-file/4583-test suite re-verified green with no new console noise.
4. Also found (mechanically, via the newly-fixed silence setup exposing it): `tools/scripts/lint/cli-shape.script.ts` scanned `.spec.ts` files under `commands/groups/` as if they were real command-group definitions (its file filter was only `endsWith('.ts')`, which matches `.spec.ts` too) — a new doctor test fixture object with a `name: 'tools'` key tripped a false "missing-action" finding. Fixed the filter to exclude `.spec.ts`/`.test.ts`.

## why

User directive: keep pushing every dimension to 11/10. Continuing a00058/a00059's discipline of actually running the artifact instead of trusting specs/typecheck alone — this time on the CLI's real built dist rather than the web/dev-preview surfaces.

## non-goals

- No broader redesign of the CLI's data/text/--json output policy for OTHER read-only commands (overview, status, metrics) — explicitly scoped to doctor only per the user's answer; the policy itself may be intentional for machine-oriented commands.
- No retroactive audit of every other command-group file for the same hand-rolled-overview-shape drift — fixed the one found in doctor.ts; a repo-wide grep for similar patterns is a reasonable future follow-up but out of scope here.

## Slices

- global_gate: e2e

### S1 — Fix doctor's silence + tool-miscount, the test-silencer gap, and the cli-shape scanner's spec-file leak
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/doctor.ts`, `packages/cli/src/commands/groups/doctor.spec.ts`, `tools/scripts/lib/silence-console-setup.ts`, `tools/scripts/lint/cli-shape.script.ts`
- **Gate**: e2e
- acceptance:
  - "renderDoctorSummary (pure) + a stderr print in doctorCommand.run gated on !ctx.globals.json; --json mode unaffected (structured stdout only, confirmed by a spec asserting stderr.write is NOT called)."
  - "countTools() correctly sums McpVertexToolOutputs['mcp-vertex_overview']['tools'] in both its array and Record<string,string[]> shapes; new spec locks in the Record shape (previously silently miscounted as 0)."
  - "silence-console-setup.ts install()/uninstall() now also patch process.stdout.write/stderr.write, matching its pre-existing (previously false) docstring claim."
  - "cli-shape.script.ts's groups-dir scan excludes *.spec.ts/*.test.ts."
  - "Verified live against the real built packages/cli/dist: `mcpv doctor` (default) now prints a human summary and correctly reports live tool counts (92, not 0); `mcpv doctor --json` unchanged. Full bun run test: 548/548 files, 4583/4583 tests green, no leaked console/stderr noise."

## acceptance

- renderDoctorSummary (pure) + a stderr print in doctorCommand.run gated on !ctx.globals.json; --json mode unaffected (structured stdout only, confirmed by a spec asserting stderr.write is NOT called).
- countTools() correctly sums McpVertexToolOutputs['mcp-vertex_overview']['tools'] in both its array and Record<string,string[]> shapes; new spec locks in the Record shape (previously silently miscounted as 0).
- silence-console-setup.ts install()/uninstall() now also patch process.stdout.write/stderr.write, matching its pre-existing (previously false) docstring claim.
- cli-shape.script.ts's groups-dir scan excludes *.spec.ts/*.test.ts.
- Verified live against the real built packages/cli/dist: `mcpv doctor` (default) now prints a human summary and correctly reports live tool counts (92, not 0); `mcpv doctor --json` unchanged. Full bun run test: 548/548 files, 4583/4583 tests green, no leaked console/stderr noise.

## Verified State

| Verification | Value |
|---|---|
| Repro (before fix, `doctor` silence) | `node packages/cli/dist/index.js doctor --workspace=.` → empty stdout, empty stderr, exit 4 |
| Repro (before fix, `doctor --json`, confirms the underlying check worked) | `{"sections":[...,{"name":"tools","status":"warn","findings":["0 tool(s) registered"]}],"status":"warn"}` despite `mcp-vertex_overview --json` showing 92 real tools across 14 plugins |
| User decision | Asked via `AskUserQuestion` whether doctor's silence was intentional CLI policy or a bug; user chose "give doctor a human stderr summary like init, --json unaffected" — explicitly scoped to doctor only |
| Fix verified (after) | `doctor` (default): prints `doctor: ok` + per-section `(status)` + findings incl. `92 tool(s) registered`, exit 0; `doctor --json`: byte-identical structured envelope, no stderr output (confirmed by a spec asserting `process.stderr.write` is NOT called in json mode) |
| `silence-console-setup.ts` gap | Its own docstring already claimed `process.stdout.write`/`stderr.write` were silenced "for the whole test run" — grep of the actual `install()`/`uninstall()` showed only `console.*` was ever patched; confirmed by running the new doctor stderr-spy tests and seeing real terminal output leak before the fix |
| `cli-shape.script.ts` gap | `entry.name.endsWith('.ts')` matched `doctor.spec.ts` too; a new test fixture object literal (`{ name: 'tools', ... }`) in that file was misread as a `ICliCommand` registration missing an action — `bun run test` failed with `cli-shape.script.spec.ts > reports zero findings under the real command groups` before the filter fix |
| `bun run test` (full suite, after all 4 fixes) | 548/548 files, 4583/4583 tests green, no leaked stderr in the run output |
| `bun run --cwd packages/cli typecheck` | clean (0 errors) |

## Findings

### 1. `mcpv doctor` printed nothing by default (P1 · broken UX for its stated purpose)
**File**: [`packages/cli/src/commands/groups/doctor.ts#L53-L106`](packages/cli/src/commands/groups/doctor.ts) (pre-fix), [`packages/cli/src/index.ts#L99-L128`](packages/cli/src/index.ts) (the stdout policy that made the gap possible).
**Impact**: a command explicitly documented as a "sectioned health report" gave a human operator zero visible information unless they happened to add `--json` (undocumented requirement) — indistinguishable from the tool hanging or doing nothing.
**Resolution**: [RESUELTO] — `renderDoctorSummary` + gated stderr print, matching `init`'s established pattern; user-confirmed scope (doctor only).

### 2. `doctor`'s tool count was always 0 (P1 · false health signal)
**File**: [`packages/cli/src/commands/groups/doctor.ts#L112`](packages/cli/src/commands/groups/doctor.ts) (pre-fix: `overview.tools?.length ?? 0`).
**Impact**: the "tools" section of every `doctor` run reported `0 tool(s) registered` and a false `warn`, regardless of how many tools were actually loaded (92, in this repo) — the exact metric the command exists to check was silently broken since `overview.tools`'s compact-mode shape (`Record<string, string[]>`) was introduced, per the generated SDK type `McpVertexToolOutputs['mcp-vertex_overview']`.
**Resolution**: [RESUELTO] — switched to the generated type + `countTools()` summing both union shapes; live-verified 92/92.

### 3. `silence-console-setup.ts` didn't silence what it documented (P2 · test-noise risk)
**File**: [`tools/scripts/lib/silence-console-setup.ts#L10-L11`](tools/scripts/lib/silence-console-setup.ts) (docstring), `install()`/`uninstall()` (pre-fix: console-only).
**Impact**: any future test exercising a command that writes its human recap via `process.stdout.write`/`stderr.write` directly (the established `init`/now-`doctor` pattern) would leak real output into the `bun run validate` test stream — exactly the drowning-signal problem this setup file exists to prevent, per its own docstring.
**Resolution**: [RESUELTO] — `install()`/`uninstall()` now patch `process.stdout.write`/`stderr.write` too; full suite re-verified green and quiet.

### 4. `cli-shape.script.ts` scanned test files as command definitions (P2 · gate false positive)
**File**: [`tools/scripts/lint/cli-shape.script.ts#L106`](tools/scripts/lint/cli-shape.script.ts) (pre-fix: `entry.name.endsWith('.ts')`).
**Impact**: any `commands/groups/*.spec.ts` test fixture containing a `name: '...'` property matching one of the shape rules (e.g. a plugin-namespace pattern) would trip a false "missing-action" finding, blocking `bun run test`/`validate` for reasons unrelated to real CLI command shape.
**Resolution**: [RESUELTO] — filter now excludes `*.spec.ts`/`*.test.ts`.

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| `mcpv doctor` default-mode output | none (silent, exit-code only) | human-readable sectioned report on stderr |
| `mcpv doctor` tool-count accuracy | always 0 (false warn) | real count (92/92 verified) |
| Test-output silencer coverage | console.* only (docstring claimed more) | console.* + process.stdout/stderr.write, matching its own contract |
| `cli-shape` gate false-positive surface | scanned `.spec.ts` as command defs | source-only, test files excluded |
| Overall (delta on top of a00057-a00059) | — | 4 real findings closed, all user-scoped or mechanically forced; full suite green |
