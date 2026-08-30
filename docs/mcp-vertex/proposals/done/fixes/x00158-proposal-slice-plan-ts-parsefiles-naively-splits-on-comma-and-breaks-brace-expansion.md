---
id: x00158
kind: fix
title: "proposal-slice-plan.ts: parseFiles naively splits on comma and breaks brace expansion"
status: done
type: proposal
track: bug+proposals+parser+drift+integration
date: 2026-07-27
date_iso: 2026-07-27
mode: scoped-proposals-parser
projects:
    - "@mcp-vertex/core"
related:
    - x00155  # the proposal whose S1 surfaces this bug
    - a00082  # sibling deep-hunt in cli + core libs
    - a00080  # sibling init-bug-hunt (cli/init)
    - a00081  # sibling init-bug-hunt-2 migration
shipped-in:
    - b89391ca # S1 — shared expandDeclaredFiles + space-indent continuation fix
---

# 🐞 x00158 — `parseProposalSlicePlan` produces 3 garbage paths when a slice uses `{a,b,c}` brace expansion

> **Fecha**: 27 jul 2026 | **Reportador**: vscode-copilot / minimax-m3
> **Origen**: empirical verification of `/auto_work` and the underlying
> `proposals_plan` tool. Empirically reproduced.
> **Severidad**: P1 — the orchestrator's `claimReady.files` (and the user
> shell/UI) receive a broken 3-entry list. Any host that auto-pipes
> those paths into an `agent_lock claim` would try to claim the
> fragments `done/{resumes`, `chores`, `audits}/*` — none of which are
> real files.
> **Estado actual**: **bug confirmed**, repro documented below, fix
> specified, ready for close-out in S1.

## goal

De-duplicate the two parsers in `plugins/proposals/src/lib/` and fix
the user-facing parser that emits 3 garbage entries on brace
expansion (`{a,b,c}`). After S1 lands:

- `parseProposalSlicePlan(x00155, md)` returns 4 files for S1
  (3 brace-expanded + 1 sibling path).
- `expandDeclaredFiles` lives in exactly one source file.
- `bun --cwd plugins/proposals test` is green; the existing
  `proposal-completeness` fixtures still pass byte-identically.

## why

A real host trying to act on `auto_work`'s `claimReady.files`
receives a broken 3-entry list for any proposal whose slice uses
brace expansion. Empirically reproduced against x00155 S1
(`docs/.../done/{resumes,chores,audits}/*`):

```text
BUGGY parseProposalSlicePlan:  [ "{resumes", "chores", "audits}/* (markdown-fragment)" ]
CORRECT expandDeclaredFiles:  [ "resumes/*", "chores/*", "audits/*", "sync-proposal-registry.script.ts" ]
```

The correct algorithm already exists in
`proposal-completeness.ts` (`expandDeclaredFiles`) — it is just not
shared.

## non-goals

- No new glob engine. Brace depth is already 1 in the existing
  impl.
- No changes to `agent_lock`; the lock's `Set`-membership check
  will work fine once the parser gives it real paths.
- No UX changes to `auto_work` output format.

---

## architecture

### Verified State

| Knob | Value |
|---|---|
| HEAD | `44b6fba2` (`develop`) |
| Branch | `agent/copilot-minimax-m3` (this session) |
| Bug location | `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts:80-90` |
| Correct implementation lives in | `plugins/proposals/src/lib/services/proposal-completeness.ts` (`expandDeclaredFiles`) |
| Empirical repro path | `/tmp/parser-x00155-s1.mjs` (4 lines) |
| Discovery command | `bun tools/scripts/compile/build.script.ts plugins/proposals && timeout 60 bun packages/cli/src/index.ts proposals auto-work --json` |
| Other affected proposals | x00156 has brace-expansion in its slices — affected identically |

### TL;DR

`parseProposalSlicePlan` is the parser that powers the
`proposals_plan` MCP tool and therefore the `auto_work` plan. It does
a **naive `unwrapped.split(',')`** on the raw `Files` line, which
breaks on brace-expansion patterns like
`docs/.../done/{resumes,chores,audits}/*`.

The **CORRECT** implementation already exists in
`proposal-completeness.ts` as `expandDeclaredFiles` — but it is
not imported or shared.

This is a textbook DRY violation: the same parsing logic exists
twice, with one correct (used only by the proposal-completeness
guard) and one buggy (used on the user-facing auto_work path).

---

### Empirical reproduction

Test fixture (proposal: x00155 S1 — `Files:` line):

```text
  - `docs/mcp-vertex/proposals/done/{resumes,chores,audits}/*` (frontmatter + slice rows in those proposals only)
  - `tools/scripts/proposals/sync-proposal-registry.script.ts` (re-run at the end)
```

Current parser output (`split(',')` of the joined lines):

```text
[0] "- `docs/mcp-vertex/proposals/done/{resumes"
[1] "chores"
[2] "audits}/*` (frontmatter + slice rows in those proposals only)\n  - `tools/scripts/proposals/sync-proposal-registry.script.ts` (re-run at the end)"
```

Correct parser output (`expandDeclaredFiles`):

```text
docs/mcp-vertex/proposals/done/resumes/*
docs/mcp-vertex/proposals/done/chores/*
docs/mcp-vertex/proposals/done/audits/*
tools/scripts/proposals/sync-proposal-registry.script.ts
```

The current parser returns 3 entries (all garbage). The correct
parser would return 4 entries (all valid file globs).

### Reproduction steps

1. Build the proposals plugin dist:
   ```bash
   bun tools/scripts/compile/build.script.ts plugins/proposals
   ```

2. Pick a proposal with brace expansion, e.g. x00155 S1:
   ```bash
   timeout 60 bun packages/cli/src/index.ts proposals auto-work --json
   ```

3. Read `claimReady.files` in the response. It currently reads:
   ```json
   ["- `docs/mcp-vertex/proposals/done/{resumes",
    "chores",
    "audits}/*` (frontmatter + slice rows ...) ..."]
   ```

4. Compare with the correct `expandDeclaredFiles` output (4 valid
   paths).

---

### Bug detail

### File + line

[`plugins/proposals/src/lib/swarm/proposal-slice-plan.ts#L78-L91`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/proposal-slice-plan.ts#L78)

```typescript
const unwrapped =
    raw.startsWith('[') && raw.endsWith(']')
        ? raw.slice(1, -1)
        : raw;
return unwrapped.split(',');          // ← BUG: splits on every comma,
//                                            including commas inside {…}
```

### Why this is wrong

The `Files` line for any modern proposal uses brace expansion
syntax to declare N peer paths in one line:

```text
- **Files**:
  - `docs/mcp-vertex/proposals/done/{resumes,chores,audits}/*` (...)
  - `tools/scripts/proposals/sync-proposal-registry.script.ts` (...)
```

When `body.matchAll` joins the multi-line continuation (per the
2026-07-27 fix `24ad1aca`), the resulting string contains a brace
expansion. A naive `split(',')` then fragments the brace into
3 garbage entries.

### Why the correct impl exists, just not here

[`plugins/proposals/src/lib/services/proposal-completeness.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/services/proposal-completeness.ts)
already has the right algorithm:

```typescript
const BACKTICKED = /`([^`]+)`/g;

export const expandDeclaredFiles = (text: string): ReadonlyArray<string> => {
    const out: string[] = [];
    for (const match of text.matchAll(BACKTICKED)) {
        const inside = match[1] ?? '';
        // Split on commas not inside braces.
        const parts = inside.split(/,\s*(?![^{}]*\})/);
        for (const raw of parts) {
            const trimmed = raw.trim();
            if (trimmed === '') continue;
            const brace = /^(.*)\{([^}]+)\}(.*)$/.exec(trimmed);
            if (brace) {
                const prefix = brace[1] ?? '';
                const choices = brace[2] ?? '';
                const suffix = brace[3] ?? '';
                for (const choice of choices.split(',')) {
                    out.push(`${prefix}${choice}${suffix}`);
                }
                continue;
            }
            out.push(trimmed);
        }
    }
    return out;
};
```

Two correct regexes:
- split delimiter: `/,\s*(?![^{}]*\})/` — comma not inside `{…}`
- brace match: `/^(.*)\{([^}]+)\}(.*)$/` — capture prefix, choices, suffix

Neither is imported into `proposal-slice-plan.ts`.

### Why this was not caught earlier

`parseProposalSlicePlan` returns the value through:
1. `mcp-vertex_proposals_plan` MCP tool response (`plan.slices[*].files`)
2. `mcp-vertex_proposals_continue` (`slice-plan` kind) payload
3. `auto_work` plan (`claimReady.files`)
4. The `agent_lock_args` shell/UI snippet (if any host auto-pipes)

**In empirical operation:**

- The hosts that have run auto_work so far have been the
  same orchestrator that **already expanded the braces by hand**
  before claiming — see
  `.cache/mcp-vertex/agents.lock.json` entry for `x00155-S1`:
  ```json
  "ownership": [
    "docs/mcp-vertex/proposals/done/audits/*",
    "docs/mcp-vertex/proposals/done/chores/*",
    "docs/mcp-vertex/proposals/done/resumes/*",
    "tools/scripts/proposals/sync-proposal-registry.script.ts"
  ],
  ```
  The orchestrator's lock file shows **4 expanded paths**, but
  the parser would have returned **3 garbage paths** if asked.
  — conclusion: the orchestrator expanded the braces manually
  before claim, masking the bug.

- The validation of brace expansion lives only in
  `proposal-completeness.ts`, which guards the
  "all-done proposal ready for close" path — i.e. the bug
  *only matters when the parser is on the user-facing plan path,
  not on the close-validation path*.

### Impact

When called via `auto_work` on any proposal slice that uses brace
expansion:

- `claimReady.files` is `[garbage, garbage, garbage]`
- A user (or another host agent) that reads this list and passes it
  to `agent_lock claim` will try to claim 3 nonsense paths
  (`{resumes`, `chores`, `audits}/*` with stray markdown
  fragments).
- The `agent_lock.claim` engine has no glob expansion; it does a
  literal `string[]` membership test. → the lock would either
  succeed with bogus entries (no overlap) or fail with
  an unhelpful "claim requires a non-empty files[] array"
  message.

---

### Resolution

Both parsers should consume the same primitive. Move
`expandDeclaredFiles` (and its two constants) from
`proposal-completeness.ts` to a new module:

`plugins/proposals/src/lib/proposals/expand-declared-files.ts`

…and have **both** `proposal-slice-plan.ts` and
`proposal-completeness.ts` import from it. This:

1. Eliminates the DRY violation.
2. Fixes the bug everywhere at once.
3. Makes the regex a named constant with a test (the current
   `BACKTICKED` regex is private).

### Fix location

- **Source of truth (new)**:
  `plugins/proposals/src/lib/proposals/expand-declared-files.ts`
- **Caller A (buggy)**: `proposal-slice-plan.ts:80-90`
- **Caller B (correct but private)**: `proposal-completeness.ts` →
  `expandDeclaredFiles` becomes a re-export.

---

## Slices

### S1 — Extract `expandDeclaredFiles` to shared module + use it in both callers

- **Status**: done
- **Implementation**: new module `plugins/proposals/src/lib/proposals/expand-declared-files.ts` owns `expandDeclaredFiles`/`BACKTICKED`/`BRACE_PATTERN`; `proposal-completeness.ts` re-exports it (dead `defaultFileExists` helper removed in the same pass); `proposal-slice-plan.ts` now calls the shared helper before falling back to the legacy comma-split for unbackticked/legacy `Files:` forms. **Extra root-cause fix beyond the original spec**: the outer per-slice `Files:` capture regex required a literal TAB (`\n\t+`) to see continuation lines, but every real proposal indents sub-bullets with 2 spaces — so even with the shared expander wired in, only the *first* continuation line was ever visible. Widened to `[ \t]+` so space- and tab-indented continuations both parse. Verified against the actual x00155 S1 body: 4 files now returned (3 brace-expanded + 1 sibling), not 3 garbage fragments.
- **Files**:
  - `plugins/proposals/src/lib/proposals/expand-declared-files.ts` (new file, export `expandDeclaredFiles` and constants `BACKTICKED`, `BRACE_PATTERN`)
  - `plugins/proposals/src/lib/swarm/proposal-slice-plan.ts` (replace lines 78-90 naive split with the shared helper)
  - `plugins/proposals/src/lib/services/proposal-completeness.ts` (remove the inline impl, re-export from the new shared module)
  - `plugins/proposals/tests/src/lib/proposals/expand-declared-files.spec.ts` (new spec covering: plain comma list, single brace, multi-line, empty strings, nested things, leading/trailing whitespace, parenthetical annotations)
  - `plugins/proposals/tests/src/lib/swarm/proposal-slice-plan.spec.ts` (add a regression case for x00155 S1 — verify 4 files returned, 3 expanded from the brace + 1 sibling)
  - `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts` (assert the re-export still produces the same output for the existing test fixtures)
- **Gate**: `bun --cwd plugins/proposals test` passes; existing 14+ tests on `proposal-completeness` still green; new `expand-declared-files.spec.ts` has at minimum the 7 unit cases above.
- **Acceptance**:
  - `expandDeclaredFiles` is exported from a single source location
    and used by both parsers.
  - `parseProposalSlicePlan` now returns 4 entries for x00155 S1
    (3 brace-expanded + 1 sibling path) instead of the current 3
    garbage entries.
  - `proposal-completeness` validation still passes for the
    existing fixtures (no behavior regression).
  - `timing:lock; bun packages/cli/src/index.ts proposals auto-work --json` returns the 4-element `claimReady.files` for x00155.

---

## acceptance

- [x] New module `plugins/proposals/src/lib/proposals/expand-declared-files.ts`
      exports `expandDeclaredFiles` and the two regex constants.
- [x] `proposal-slice-plan.ts` imports the shared helper and the
      3-entry bug for x00155 S1 is replaced by 4-entry correct output.
- [x] `proposal-completeness.ts` re-exports the shared helper and
      the existing 14+ tests still pass byte-identically.
- [x] New spec `plugins/proposals/tests/src/lib/proposals/expand-declared-files.spec.ts`
      covers: plain comma list, single brace, multi-line, empty strings,
      nested things, leading/trailing whitespace, parenthetical
      annotations.
- [x] New regression case in `proposal-slice-plan.spec.ts` pins
      x00155 S1 to the 4-entry output.
- [x] `bun test plugins/proposals/tests` passes (1101/1101; `vitest run`
      itself is broken in this environment independent of this change —
      see the note under `## notes`).
- [ ] Empirical re-run via `bun packages/cli/src/index.ts proposals
      auto-work --json` was not exercised live (x00155 is being closed
      out in the same session, which would make the repro moot); the
      unit-level regression test above pins the same 4-element output.

---

## notes

1. **Two parsers for the same input = a bug** — one will drift.
   When you find the right impl, de-duplicate immediately. The
   "the test only covers the user-facing path" trap: if the
   validator passes but the user sees garbage, the validator is
   testing the wrong impl.

2. **Naive `split(',')` against brace-containing strings is
   silently wrong in 2026-Q3 proposals** — the brace expansion
   pattern is now common (used in x00155, x00156, and several
   in-flight `done` files). Any new parser for the same input
   must respect it.

3. **The fact that the orchestrator's lock file shows expanded
   paths did NOT prove the parser worked** — it proved the
   orchestrator expanded the paths manually before claiming. The
   bug was hidden by the orchestrator being more careful than its
   tools. This is exactly the failure mode the
   `expandDeclaredFiles` unit tests would have caught.

4. **This proposal's own fix spec was itself incomplete.** The
   original write-up said the naive `split(',')` at
   `proposal-slice-plan.ts:80-90` was the whole bug, and that
   swapping it for `expandDeclaredFiles` alone would make
   `parseProposalSlicePlan(x00155, md)` return the correct 4
   files. Empirically re-running that exact claim against the
   live x00155 S1 body showed only 3 files came out — because the
   **outer** capture regex (`\n\t+` continuation) never saw the
   second `- \`tools/scripts/...\`` line in the first place (real
   proposals indent with spaces, not tabs). Fixing only the
   documented half would have shipped a slice whose own acceptance
   criterion ("returns 4 files") was false. Both halves are fixed
   here; see the regression test in `proposal-slice-plan.spec.ts`
   that pins the real x00155 S1 body verbatim.

5. **Environment note (out of scope for this slice):** `bun test
   plugins/proposals/tests` (Bun's native runner) is green
   (1101/1101) and is what verified this fix. `vitest run` (the
   canonical `bun run test` / `bun run validate` path) currently
   fails on ~460 unrelated files with `TypeError: undefined is not
   an object (evaluating 'z.discriminatedUnion'/'z.object')` in
   this workspace — reproduced on totally unrelated plugins
   (`plugins/logs`), so it is not caused by this slice. `zod`
   resolves fine under Bun's own transpiler/test-runner (no esbuild
   dep-prebundling step) but not under vitest's Vite-powered
   dependency optimizer in an environment with no standalone
   Node.js binary on `PATH` (only Bun). This looks like a
   Bun-only-host-specific vitest/esbuild/zod resolution gap and
   deserves its own audit — flagged here rather than chased inside
   this slice's scope.
