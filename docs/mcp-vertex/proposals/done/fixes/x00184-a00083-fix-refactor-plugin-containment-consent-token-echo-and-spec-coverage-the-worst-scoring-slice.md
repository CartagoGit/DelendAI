---
id: x00184
title: "a00083 — fix refactor plugin: containment, consent-token echo, and spec coverage (the worst-scoring slice)"
kind: fix
status: done
type: proposal
track: plugins+audit-followup
date: 2026-07-29
related:
    - a00083 # full-project audit
shipped-in:
    - 70a79a20 # S1+S2 — nav/rename containment + consentToken echo + spec coverage
---

# x00184 — a00083 — fix refactor plugin: containment, consent-token echo, and spec coverage (the worst-scoring slice)

## Goal

Resolve findings F17, F18, F19 from a00083 (29-07-2026). The refactor plugin scored **5.8 / 10** overall — the worst of the 22 audited slices — with containment at 3/10 and tests at **1/10** (2868 LOC, 0 specs). This proposal:

- **F17** `plugins/refactor/src/lib/tools/refactor-nav.tool.ts#L49` — `resolve(root, path)` accepts absolute paths outside the workspace. Route every user path through `resolveWorkspaceContained(workspaceRootAbs, relPath)`; reject escapes with a structured `toolError`.
- **F18** `plugins/refactor/src/lib/tools/refactor-rename.tool.ts#L78` — `APPLY_OUTPUT_SCHEMA` omits the contract-promised `consentToken` echo, and `resolvePath` lets a hostile caller pass an arbitrary `root`. Add `consentToken` to the output schema (echo the input verbatim), and re-route `resolvePath` through `resolveWorkspaceContained`.
- **F19** 2868 LOC, 0 specs. Land the first batch of specs (containment, consent, rename hunk apply, codemod safety).

## why

`refactor_navigation` is read-only but lets a host enumerate `~/.ssh`, `/etc/shadow`, etc. `refactor_apply` is mutation-capable and currently has no consent echo AND no workspace containment — the most dangerous tool surface in the monorepo. Combined with 0 spec coverage, every existing slice claim that the plugin "works" is unverified. Until this slice ships, **`bun run refactor_rename …` in a hostile host can write outside the workspace** without the host ever seeing the token it was supposed to echo.

## non-goals

- Replacing the AST-backed rename implementation. The current `refactor_rename.tool.ts` uses the language-server refactor providers correctly; only the **input/output contract** and the **path resolver** need fixing.
- Adding S3 rule-based codemods. That work is tracked separately under `f00123`.

## slices

### S1 — containment + consent
- **Status**: done
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **Files**: `plugins/refactor/src/lib/tools/refactor-nav.tool.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.ts`.
- Add `resolveWorkspaceContained` to every user-path entry in nav (`refactor_definition`, `refactor_references`, `refactor_symbols`).
- Add `consentToken` to `APPLY_OUTPUT_SCHEMA` (the input `args.consentToken` echoed back verbatim on success).
- Replace `resolvePath(root, path)` with the contained path resolver; on `contained.ok === false`, return `toolError(...)` with the same envelope shape as other plugins use for workspace escapes.
- **Acceptance**: every nav + apply tool rejects `path.startsWith('/')` or `..`-escapes with `toolError`. Add a spec per tool that asserts the contract.

### S2 — first batch of specs
- **Status**: done
- **Files**: <see slice body below>
- **Gate**: test
  acceptance:

- **Files**: `plugins/refactor/src/lib/tools/refactor-nav.tool.spec.ts`, `plugins/refactor/src/lib/tools/refactor-rename.tool.spec.ts` (co-located specs, this plugin's actual convention — see Notes for why the originally-named path assumption was stale).
- Cases: containment rejection (absolute + `../` escape, both tools), consent-token echo, happy-path rename hunk apply. `refactor_codemod` never had a consent gate to begin with (it never writes to disk, confirmed in Notes) so "codemod refusal on missing consent" doesn't apply.
- **Acceptance**: `bun test plugins/refactor/tests/` exits 0 with at least 6 specs.

## Notes

Implementation notes (delivery deviates from the literal S1/S2 text where the
original audit's assumptions were stale):

- S1 also fixed `refactor_apply`'s `root` itself: the original code only
  checked that `file.path` resolved inside `rootAbs`, but never verified
  `rootAbs` (derived from `args.root`) was inside the workspace — so
  `root: "/etc"` + `file.path: "passwd"` passed containment and wrote to
  `/etc/passwd`. Both `root` and `file.path` are now independently
  contained via `resolveWorkspaceContained`.
- `refactor_rename`'s `root`/`scopePaths` had the identical unguarded
  `resolvePath` bug (shared helper) and are fixed the same way, even
  though F17/F18 only named `refactor-nav.tool.ts` and the apply half of
  `refactor-rename.tool.ts`.
- S2's acceptance named new files under a tests/src/lib subdirectory
  — that directory shape doesn't match this plugin's actual convention
  (co-located `*.tool.spec.ts` next to each tool, already used by all 3
  existing tool spec files). Coverage was added to the existing co-located
  specs instead of creating a parallel tests directory tree. The "2868 LOC, 0
  specs" premise was also stale: 7 spec files already existed pre-fix
  (nav-engine, rename-planner, codemod-runner, recipes, and all 3 tool
  files) — likely a symptom of the same `scan_drift`-style scanner
  undercount already fixed in x00167, not an actual coverage gap.
- `refactor_codemod`'s hand-rolled `resolvePath`/`isContainedPath` was
  checked for the same bug class: it resolves+normalizes before the
  prefix check, so both absolute and `../`-relative escapes are correctly
  rejected today. Left as-is (a DRY nit against the shared helper, not a
  security bug) — out of scope here.

- a00083 — full-project audit (source of these findings)
- f00123 — refactor plugin charter (S1+S2 covered here; S3 codemods separate)

## acceptance

Every slice lands with its acceptance bullets green and `bun run validate` exits 0 on a clean checkout of develop (the gate itself ships in x00189 s4).
