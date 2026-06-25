---
id: x00050
status: done
type: proposal
track: repo-hygiene+ci+lint+docs+extensions/vscode
date: 2026-06-23
kind: fix
title: Quick wins from the 2026-06-23 audit — fix the corrupted gate, kill scratch files, close the cheap hygiene/CI/docs gaps
runner: copilot
model: minimax-m3
scope: quick-wins
shipped-in: []
related:
    - f00049 # conventions unification — S1 also renumbers the duplicate a00034 (this proposal's S3 is the minimal subset; coordinate so only one lands)
    - f00047 # apps/shared i18n — owns the TODO(f00047) markers this proposal's S7 resolves
    - f00037 # file/folder conventions — context for the lint:* wiring in S4
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run lint:tools, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
---

# x00050 — Quick wins from the 2026-06-23 audit

## goal

Package the 10 **Quick wins** (severity NICE / MEJORABLE, effort **S**) identified by the
2026-06-23 repository audit into independently shippable slices. Each slice is one PR's
worth of work, gated by `bun run validate`, and constrained to the smallest set of files so
a parallel agent can claim a single slice without blocking the rest.

The headline is **S1**: the `validate` gate is silently corrupted and runs the test suite
~4× while filtering to a subset (~1684 tests) instead of the full suite. It "passes" by
accident. S1 ships first because it gates the acceptance criteria of every other slice.

## why

These are the lowest-cost, highest-signal findings of the audit. None is a deep refactor;
together they remove the most embarrassing rough edges (a gate that doesn't gate, scratch
files committed to the repo root, a duplicate audit id, an empty `activationEvents`, two
stale `TODO(f00047)` markers, missing supply-chain CI, drifting plugin counts, and 36
audits with no index). Shipping them clears the deck before the larger `f00049` conventions
work lands.

## non-goals

- **No semantic rewrites.** S2/S3/S10 are delete / rename / index-only; no logic changes.
- **No overlap with f00049 beyond S3.** f00049 S1 also renumbers the duplicate `a00034`.
  This proposal's S3 is the minimal subset (rename + `lint:audit-ids`). Whichever lands
  first wins; the other drops its S1/S3 to a no-op. Coordinate before claiming.
- **No new public types.** S6/S7 stay inside `extensions/vscode` (the only host that may
  import `vscode`); S5 only adds metadata fields to the root manifest.

## slices

### S1 — Fix the corrupted `validate` script

- **Status**: done
- **Files**: package.json
- **Gate**: lint
- depends_on: []
- acceptance:
    - "package.json#scripts.validate runs the vitest suite exactly once (no doubled `bun run test bun run test`)"
    - "bun run validate executes the FULL spec set (test count == plain `vitest run`, not the accidental ~1684 filtered subset)"
    - "bun run validate exits 0"

### S2 — Delete the 5 root scratch files

- **Status**: done
- **Files**: list-unmatched.ts
- **Files**: test-ts.ts
- **Files**: unmatched_plugins.txt
- **Files**: plugins-unmatched.txt
- **Files**: renames.json
- **Gate**: none
- depends_on: [S1]
- acceptance:
    - "none of the five scratch files exist at the repo root"
    - "no source file imports or references the deleted scratch files"
    - "bun run validate stays green after removal"

### S3 — Renumber the duplicate audit id + add `lint:audit-ids`

- **Status**: done
- **Files**: docs/proposals/done/audits
- **Files**: package.json
- **Files**: tools/scripts/lint/audit-ids.script.ts
- **Gate**: lint
- depends_on: [S1]
- acceptance:
    - "only one audit file carries each `a000NN` id (the deepmind + gemini-3-5-flash a00034 collision is resolved; renumber the second to the next free id)"
    - "bun run lint:audit-ids exits 0 and fails on a duplicate-id fixture"
    - "package.json#scripts.lint:audit-ids invokes the new script"

### S4 — Wire `lint:tools`, `lint:proposals`, `lint:scaffolds`, `lint:agents` into `validate`

- **Status**: done
- **Files**: package.json
- **Gate**: lint
- depends_on: [S1, S3]
- acceptance:
    - "package.json#scripts.validate runs lint:tools, lint:proposals, lint:scaffolds and lint:agents"
    - "each wired lint script exists and exits 0 on the current tree"
    - "bun run validate exits 0 with the new lints included"

### S5 — Add `engines` and `packageManager` to the root `package.json`

- **Status**: done
- **Files**: package.json
- **Gate**: type
- depends_on: [S1, S4]
- acceptance:
    - "root package.json declares an `engines` field matching the CI runtime (bun, and node if used)"
    - "root package.json declares a `packageManager` field pinned to the bun version backing bun.lock"
    - "bun install --frozen-lockfile still resolves cleanly"

### S6 — Declare `activationEvents` in `extensions/vscode/package.json`

- **Status**: done
- **Files**: extensions/vscode/package.json
- **Gate**: type
- depends_on: [S1]
- acceptance:
    - "extensions/vscode/package.json declares activationEvents covering the contributed mcp-vertex views (e.g. `onView:mcp-vertex.*`), replacing the empty array at line 19"
    - "the packaged extension activates on the declared views (no implicit `*` activation)"
    - "bun run --cwd extensions/vscode check:i18n stays green"

### S7 — Resolve the two `TODO(f00047)` hardcoded-language markers

- **Status**: done
- **Files**: extensions/vscode/src/commands/setup-github.ts
- **Files**: extensions/vscode/src/commands/open-toolbar.ts
- **Gate**: type
- depends_on: [S1]
- acceptance:
    - "neither setup-github.ts nor open-toolbar.ts contains a `TODO(f00047)` marker"
    - "the previously hardcoded language is resolved through the shared locale/i18n source (no literal locale string left in either command)"
    - "bun run validate exits 0"

### S8 — Add `.github/dependabot.yml` + CodeQL workflow

- **Status**: done
- **Files**: .github/dependabot.yml
- **Files**: .github/workflows/codeql.yml
- **Gate**: none
- depends_on: [S1]
- acceptance:
    - ".github/dependabot.yml schedules updates for the package ecosystem (npm/bun) and for github-actions"
    - ".github/workflows/codeql.yml runs CodeQL analysis on push and pull_request targeting main"
    - "both files are valid YAML and parse without error"

### S9 — Reconcile the plugin count (9 / 14 / 16) against the live registry

- **Status**: done
- **Files**: AGENTS.md
- **Files**: .github/copilot-instructions.md
- **Files**: docs/ARCHITECTURE.md
- **Gate**: none
- depends_on: [S1]
- acceptance:
    - "the plugin count stated in AGENTS.md, .github/copilot-instructions.md and docs/ARCHITECTURE.md matches the number of plugins registered by the live registry"
    - "a single source-of-truth statement (or a generated count) is referenced so the three documents cannot drift independently again"

### S10 — Navigable index for `docs/troubleshooting/` and `docs/proposals/done/audits/`

- **Status**: done
- **Files**: docs/troubleshooting/README.md
- **Files**: docs/proposals/done/audits/README.md
- **Gate**: none
- depends_on: [S1]
- acceptance:
    - "docs/troubleshooting/ has a README that links every troubleshooting document in the folder"
    - "docs/proposals/done/audits/ has a README that links all 36 audits (id, date, runner/model, scope)"
    - "every link in both indexes resolves to an existing file"

## acceptance

Each slice ships with `bun run validate` green. Whole proposal done when:

- `bun run typecheck` exits 0.
- `bun run lint` exits 0 (biome + vscode i18n).
- `bun run lint:cli-imports`, `lint:cli-coverage`, `lint:cli:i18n` exit 0.
- `bun run lint:scss`, `lint:brand-hex`, `lint:setup` exit 0.
- `bun run lint:tools`, `lint:proposals`, `lint:scaffolds`, `lint:agents`, `lint:audit-ids` exit 0 (newly wired in S4).
- `bun run test` runs the **full** vitest suite exactly once (S1 invariant).

## notes

Four slices edit the **root `package.json`** (S1 fixes the `validate` chain, S3 adds the
`lint:audit-ids` script, S4 wires the `lint:*` scripts into `validate`, S5 adds
`engines`/`packageManager`). They are intentionally serialized via `depends_on` so the
`overlap-in-progress` guard claims them one at a time.

Migration order: S1 first (gates every other slice's `bun run validate` acceptance); S3 →
S4 → S5 are serialized on the root `package.json`; S2, S6, S7, S8, S9, S10 are independent
and claimable in parallel by separate worktrees once S1 is `done`.

### see also

- [`f00049`](f00049-conventions-unification-r10-slices.md) — conventions unification; its
  S1 also renumbers the duplicate `a00034` (coordinate with this proposal's S3).
- [`AGENTS.md`](../../AGENTS.md) — §"Audit Proposal Lifecycle" + §"Audits File Naming".
- [`skills/proposals-workflow-playbook/SKILL.md`](../../skills/proposals-workflow-playbook/SKILL.md)
  — the compact claim → implement → validate → close → sync workflow.
