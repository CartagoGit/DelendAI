---
id: x00053
status: done
type: proposal
track: plugins/proposals+docs+repo-hygiene
date: 2026-06-27
kind: fix
title: Doc-drift from x00052 — stale `docs/.../index.json` references in 2 skills, 6 source doc-comments, and the CORE_DOCS default that silently hashes the wrong path
runner: copilot
model: minimax-m3
scope: repo-hygiene
recan:
    - x00052 # the move that exposed the drift; x00053 finishes the cleanup
related:
    - r00004 # declutter + centralized cache — same "one source of truth" line
ownership:
    - { agent: implementation_runner, task: 'S1: in `plugins/proposals/src/lib/swarm/round-context-types.ts`, replace the hardcoded `docs/mcp-vertex/proposals/index.json` in `CORE_DOCS` with `.cache/mcp-vertex/proposals/index.json` and update the JSDoc block above it; add a unit test that builds the default `CORE_DOCS` against a fixture where the cache-path index exists and asserts no `rh-missing` value' }
    - { agent: implementation_runner, task: 'S2: in 6 source doc-comments, replace `docs/mcp-vertex/proposals/index.json` with the cache path: `sync-proposal-registry.ts` (the `tracked, Biome-linted file` block, line ~589), `proposal-transition.tool.ts` (line ~67), `plan-closure.resolvers.ts` (line ~90), `locate.ts` (header, line ~8), `index-reader.ts` (header, line ~4), `worktree-sync-coordinator.ts` (line ~7)' }
    - { agent: proposal_guardian,    task: 'S3: in `plugins/proposals/skills/legacy-proposal-migration/SKILL.md`, update the "rebuild `docs/mcp-vertex/proposals/index.json`" line and the "Never hand-edit `docs/.../index.json`" rule to point at `<cacheDir>/proposals/index.json`; the migration flow ends with the same `proposals_sync_proposals` call but the artifact it rebuilds is now in `.cache/`' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,          expect: exit0 }
    - { command: bun run test,               expect: exit0 }
    - { command: bun run lint:tools,         expect: exit0 }
    - { command: bun run lint:proposals,     expect: exit0 }
    - { command: bun run validate,           expect: exit0 }
    - { command: grep -rn "docs/mcp-vertex/proposals/index.json" plugins/proposals/src plugins/proposals/skills packages/core/src packages/core/skills, expect: only in x00053 sources (locate.spec.ts comment, blocked-by.spec.ts const, layout-relocation.spec.ts F3 — pre-existing intentional cases) and the .gitignore rule }
---

# x00053 — Doc-drift from x00052: stale `docs/.../index.json` references

## goal

Close the documentation debt that x00052 left behind. When the
proposals registry index moved from `docs/mcp-vertex/proposals/index.json`
to `<cacheDir>/proposals/index.json`, **9 production doc-comments and 1
skill** kept referring to the old path. Six are cosmetic; two are
**functional foot-guns**:

- **`plugins/proposals/src/lib/swarm/round-context-types.ts#CORE_DOCS`**
  still hardcodes the old path as the default. The hash helper at
  `round-context-hash.ts:67-78` returns `'rh-missing'` whenever the
  path does not resolve; in the default case (no host-injected
  `coreDocs`) the index is **always** missing, so its digest is
  frozen at `'rh-missing'`. Today the production wiring in
  `plugins/proposals/src/index.ts:222` overrides the default with
  the correct `layout.proposalIndexFile`, so the visible behaviour
  is fine — but a host that does not inject its own list, a test
  that uses the default, or a future refactor that drops the
  override, would silently stop tracking the index in its
  `round_context` digest. This is exactly the failure mode
  x00052 was supposed to make impossible (the system silently
  reads from the wrong path, no error raised).
- **`plugins/proposals/skills/legacy-proposal-migration/SKILL.md`**
  tells the operator: *"Never hand-edit `docs/mcp-vertex/proposals/
  index.json` after migrating"*. The file no longer exists. An
  operator following the skill will look for a file the system
  does not write to.

The other 6 references are JSDoc / header comments that mislead the
reader about where the index lives. They are easy to fix and the
fix protects against future regressions (any new dev reading those
files is told the wrong thing).

## why

`x00052` moved a file. The repo's own rule from AGENTS.md — "if you
move a config or path, update every reference in one PR" — was
followed for code (the path layout constant + the 4 tools that read
it) but **not for documentation**. The grep I ran after x00052
landed found 11 hits across 2 skills, 7 source files, and 4 spec
files. Most are doc-comments; two are user-facing skills; one is
the `CORE_DOCS` default that ships in the public barrel of the
plugin.

The reason this is the same family as x00051/x00052 (and not just
"tidying docs") is that **doc-comments are how future contributors
discover the contract**. A JSDoc that says "absolute path to
`docs/mcp-vertex/proposals/index.json`" is a recipe for a future
contributor to wire their code against the wrong path. The
`CORE_DOCS` bug is even more direct: a host that does not inject
its own list will today silently hash a missing file as the
default — the contract is broken, the type-checker is happy, no
test catches it, and the only signal is a digest that never
changes.

## non-goals

- **No behaviour change for the production wiring.** `index.ts:222`
  already passes the correct `layout.proposalIndexFile` — the
  CORE_DOCS change only affects the *fallback* default. The hash
  of the index in the live `round_context` is unchanged for the
  production path.
- **No change to the migration scripts.** The 3 scripts in the
  legacy-migration skill (migrate-legacy, rewrite-refs,
  normalize-legacy) operate on proposal files, not on the index.
  Only the prose in the skill that mentions the index path
  needs to move.
- **No docs site / web copy change.** The docs site generates
  from the live tool registry; the index path does not appear in
  user-facing copy.

## slices

### S1 — fix `CORE_DOCS` default + add a unit test

File: `plugins/proposals/src/lib/swarm/round-context-types.ts`.

- Replace `'docs/mcp-vertex/proposals/index.json'` in `CORE_DOCS` with
  `'.cache/mcp-vertex/proposals/index.json'`.
- Update the JSDoc above `CORE_DOCS` to drop the line that names
  the old path; the new comment should just enumerate the two
  default docs (`README.md` and the cache-relative index) and
  note that the production wiring in `index.ts:222` overrides
  this default with `layout.proposalIndexFile`.
- Add a new unit test in
  `plugins/proposals/tests/src/lib/swarm/round-context-hash.spec.ts`
  (create if absent) that:
  1. Sets up a `mkdtempSync` workspace with
     `.cache/mcp-vertex/proposals/index.json` (cache path) and
     seeds it with a small JSON payload.
  2. Calls `computeCoreDocHashes(workspace)` with no
     `coreDocs` argument, exercising the default.
  3. Asserts the returned `result['.cache/mcp-vertex/proposals/index.json']`
     is a real hash, **not** `'rh-missing'`.
  4. Bonus: assert that the same test with a
     `docs/mcp-vertex/proposals/index.json` only (cache file
     absent) does produce `'rh-missing'`, pinning the
     pre-fix behaviour as the regression we are guarding.

### S2 — fix 6 source doc-comments

These are pure prose changes; no behaviour change, no test needed
beyond `bun run lint:tools` to ensure the JSDoc still parses.

- `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
  (line ~589): the `tracked, Biome-linted file` block. The
  sentence "`docs/mcp-vertex/proposals/index.json` is a tracked,
  Biome-linted file" is **factually wrong now** (it is
  untracked, in `.cache/`, and not Biome-formatted — Biome
  doesn't run on JSON anyway). Replace with prose that matches
  the current reality: the index is a regenerable cache
  artefact, lives under `<cacheDir>/proposals/index.json`, and
  is formatted with 4-space JSON indent to match the
  pre-x00052 wire format (a real consideration when a host
  diffs two regenerations).
- `plugins/proposals/src/lib/proposals/locate.ts` (header,
  line ~8): the JSDoc says `locateByIndex` reads
  `docs/mcp-vertex/proposals/index.json`. Update to
  `<cacheDir>/proposals/index.json`.
- `plugins/proposals/src/lib/proposals/index-reader.ts` (header,
  line ~4): the file comment says
  `Pure async readers for the proposal index
  (docs/mcp-vertex/proposals/index.json)`. Update to
  `<cacheDir>/proposals/index.json`.
- `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  (line ~67): the `indexPathAbs` JSDoc says
  `absolute path to docs/mcp-vertex/proposals/index.json`. Update
  to `<cacheDir>/proposals/index.json` and add a one-line
  cross-reference to x00052.
- `plugins/proposals/src/lib/swarm/plan-closure.resolvers.ts`
  (line ~90): the `IDiskPlanResolverOptions.indexPathAbs` JSDoc.
  Same change.
- `plugins/proposals/src/lib/agents/worktree-sync-coordinator.ts`
  (line ~7): the file header says
  `reads + rewrites docs/mcp-vertex/proposals/index.json`. Update
  to `<cacheDir>/proposals/index.json`.

### S3 — update `legacy-proposal-migration` skill

File: `plugins/proposals/skills/legacy-proposal-migration/SKILL.md`.

- Line ~39: the "rebuild `docs/mcp-vertex/proposals/index.json`"
  reference. Replace with
  "rebuild `<cacheDir>/proposals/index.json`".
- Line ~100: the "Never hand-edit
  `docs/mcp-vertex/proposals/index.json`" rule. Update to
  "Never hand-edit `<cacheDir>/proposals/index.json`".
- No other change to the skill — the 3 scripts and the migration
  flow are unaffected.

### S4 — pin the pre-existing intentional cases (acceptance)

Two pre-existing test references to `docs/.../index.json` are
**intentional** and must stay:

- `plugins/proposals/tests/src/lib/proposals/blocked-by.spec.ts:41`
  is a fake path constant used as a stub for `readProposalIndex`
  in unit tests — the literal value is irrelevant.
- `plugins/proposals/tests/src/lib/swarm/layout-relocation.spec.ts:58`
  is the F3 test that asserts the index no longer lands in
  `docs/proposals/` after the layout moves.

The acceptance check (`grep -rn "docs/mcp-vertex/proposals/index.json"`)
excludes these and the `.gitignore` rule from the failure list, so
the only hits that survive are the intentional ones.

## acceptance criteria

- `bun run validate` is green.
- `grep -rn "docs/mcp-vertex/proposals/index.json"` over
  `plugins/proposals/src/`, `plugins/proposals/skills/`,
  `packages/core/src/`, `packages/core/skills/` returns only
  the 3 intentional cases listed in S4 and the `.gitignore`
  rule.
- The new test in `round-context-hash.spec.ts` passes; its
  companion "regression pin" test (cache file absent ⇒
  `rh-missing`) also passes, proving we did not accidentally
  weaken the `'rh-missing'` branch.
- Manual smoke: a host that does not inject its own `coreDocs`
  now hashes the real index file in its `round_context` digest.

## risks

- **The CORE_DOCS change touches the public type** (`ICoreDocRelPath`
  is just `string`, but `CORE_DOCS` is exported and may be
  consumed by tests or downstream plugins). A `grep -rn "CORE_DOCS"
  plugins/ packages/` confirms the only in-repo consumer is
  `round-context-hash.ts` and its tests. External consumers
  (none registered in this monorepo) would see a one-line
  change to the default — the type is unchanged.
- **The `round-context` digest value for the index changes.**
  A host that re-computes its digest and compares it to a
  cached value will see a one-time change. This is exactly the
  intent: the digest is *supposed* to reflect the index; the
  default was previously wrong.
