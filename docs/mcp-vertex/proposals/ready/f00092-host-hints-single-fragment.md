---
id: f00092
status: ready
type: proposal
kind: feat
track: agent-discovery+host-bootstrap+lint
date: 2026-07-01
title: Collapse the three host-hint fragments to a single canonical fragment
shipped-in: []
recan: []
related:
    - f00056 # agent discovery catalog — the bootstrap is the canonical surface
    - f00083 # anti-duplication guard — lint that ensures the host files point at the bootstrap, not at each other
    - f00084 # `bunx @mcp-vertex/core init` — S4 host-instructions centralizer needs to know which fragment to copy
ownership:
    - { agent: proposal_guardian,    task: 'S1: collapse the three per-host fragments to a single `agent-instructions.generated.md` and move the host-specific footnote into the hand-edited host files (`.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`) between their `<!-- mcp-vertex:begin/end -->` markers' }
    - { agent: implementation_runner, task: 'S2: rewrite `tools/scripts/catalog/render-host-hints.script.ts` to emit a single fragment, drop `HOST_FOOTNOTE` and the per-host render functions; add a guard that fails the script if the output dir ever holds more than one `*.generated.md`' }
    - { agent: implementation_runner, task: 'S3: rewrite `tools/scripts/lint/host-hints-fragments.script.ts` to assert the single-fragment invariant (HOST_HINT_FRAGMENTS = [agent-instructions.generated.md]) and to walk the dir for stray `*.generated.md` files; rename script to `agent-instructions-fragments.script.ts` and migrate the spec' }
    - { agent: implementation_runner, task: 'S4: update `lefthook.yml` glob + `docs/mcp-vertex/CROSS-IDE.md` "Host discovery surface" section + `packages/cli/src/commands/init/init-render.ts` HOST_INSTRUCTIONS_BLOCKS to point at the single fragment filename' }
    - { agent: delivery_verifier,    task: 'S5: run `bun run catalog:hints` and `bun tools/scripts/lint/host-hints-fragments.script.ts` and prove (a) only `agent-instructions.generated.md` is on disk, (b) the three hand-edited host files now embed their host-specific footnote inline, and (c) `bun run validate` is green' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
    - { command: bun run catalog:hints:check, expect: exit0 }
    - { command: bun tools/scripts/lint/host-hints-fragments.script.ts --check, expect: exit0 }
---

# f00092 — collapse the three host-hint fragments to a single fragment

## goal

Today the host-instruction fragment generator (`tools/scripts/catalog/render-host-hints.script.ts`) writes
**three** near-identical fragments under `docs/mcp-vertex/host-hints/`:

| File | Differs from `claude.generated.md` by |
|---|---|
| `agents.generated.md` | 1-line header label + 1-line footnote |
| `claude.generated.md` | (the reference) |
| `copilot-instructions.generated.md` | 1-line header label + 1-line footnote |

**17 of 19 lines are bit-exact across all three files.** The 2-line diffs
encode the host-specific footnote, but the footnote text itself is just a
pointer to a section that already exists in the canonical bootstrap
(`AGENT-BOOTSTRAP.md` §7 for AGENTS consumers, §8.1 for Copilot,
§8.2 for Claude). The bootstrap is the only source of truth for what
those rules actually are; the fragment only re-asserts "this section is
in effect".

After this slice lands:

- **One fragment on disk** — `docs/mcp-vertex/host-hints/agent-instructions.generated.md`.
- **The 3 hand-edited host files** (`.github/copilot-instructions.md`,
  `CLAUDE.md`, `AGENTS.md`) embed their host-specific footnote **inline**
  between the `<!-- mcp-vertex:begin -->` /
  `<!-- mcp-vertex:end -->` markers — exactly the place where the rest of
  the host file already lives. No host file references a different
  fragment than the other two.
- **The renderer is single-source-of-truth**: it overwrites the same
  one file on every run. A regression test fails the build if the output
  dir ever holds more than one `*.generated.md`.

## why

1. **The three fragments drift by definition.** The fragment is regenerated from
   the canonical first-move template + a host footnote, but the footnote is
   a 1-line summary of a §X reference inside the bootstrap itself. Any time
   the bootstrap renumbers its sections (e.g. adding §8.3 "generic LLM hosts"
   in 2026-06, moving §7 from repo-rules into a new chapter), the footnote
   goes stale and the agent on that host reads the wrong reference until a
   human notices the diff in a pre-commit hook. We have caught exactly zero
   of these in production because the diff is 1 line and the human reviewer
   rarely reads the generated file.
2. **The host files already have a hand-edited block.** The 3 host files all
   carry a `<!-- mcp-vertex:begin -->` / `<!-- mcp-vertex:end -->` region
   that the rest of the file lives next to. Moving the host-specific footnote
   into that region is the natural place — the agent on that host reads the
   whole block as one chunk, and the footnote sits next to the comment that
   already says "this file is the mcp-vertex block".
3. **The lint and the cross-IDE doc both carry 3× the surface they need.**
   `host-hints-fragments.script.ts` walks 3 paths; `CROSS-IDE.md` lists 3
   paths; `lefthook.yml` globs 3 paths; the init CLI's
   `HOST_INSTRUCTIONS_BLOCKS` table iterates 3 paths. After the refactor
   there is 1 path in each, and the script + lint + docs have half the
   branches.
4. **The agent catalog is the only source of truth for everything else.**
   This is the bootstrap's own rule: "tools, skills, and proposal ids are
   NEVER enumerated here — they are served live by `mcp-vertex_agent_catalog`".
   The footnote is a 1-line summary of a section reference, which is the
   same shape as enumerating an id: a hand-maintained string the agent
   could just look up. Single-fragment + footnote in the hand-edited
   block is the version of the model where the only moving piece lives
   where the agent reads it.

## why this design

- **One fragment, one source of truth.** `agent-instructions.generated.md`
  is overwritten on every `bun run catalog:hints` run from a single
  template. There is no per-host render function to drift; the only
  variable in the renderer is the constant header label and the
  constant CANONICAL_FIRST_MOVE block.
- **The footnote is the host's problem.** The footnote is host-specific
  by definition (it says "this appendix is in effect for you"). It
  belongs in the hand-edited host file, where the rest of the host file
  lives. The init CLI (f00084 S4) already knows how to write into the
  `<!-- mcp-vertex:begin -->` region; the new footnote rides the same
  idempotent append/overwrite path.
- **A guard catches re-splitting.** The renderer asserts the output
  directory contains exactly one `*.generated.md` file at the end of
  the run; the lint asserts exactly one entry in `HOST_HINT_FRAGMENTS`
  AND walks the dir to fail on any other `*.generated.md` that may have
  been hand-dropped. Both checks run on every `bun run catalog:hints` /
  `bun tools/scripts/lint/host-hints-fragments.script.ts` invocation.
- **The 3 host files diverge again only in the one line that has to.**
  After S1, the 3 host files carry their own footnote inline. The diff
  between them is 1 line each, but that 1 line is *hand-edited* and
  *lives in the hand-edited region* — there is no generated artifact
  to drift between hosts.

## non-goals

- **No new fragment shape, no new tool name, no change to the bootstrap
  itself.** The bootstrap is canonical and the agent already reads it.
- **No removal of the `<!-- mcp-vertex:begin/end -->` markers** — those
  are the boundary `init` (f00084) uses for idempotent append/overwrite,
  and the new host-specific footnote MUST live between them.
- **No change to the `MAX_FRAGMENT_BYTES` budget** — 1300B was set
  against the 3-fragment model; the single fragment is even smaller
  (the 3 fragments average ~1100B; collapsing to 1 brings the same
  content down to ~700B) so the budget is naturally respected.
- **No re-renaming of `host-hints/` directory** — the directory is
  referenced from `init-render.ts` and `host-instructions.script.ts`;
  renaming would force a coordinated edit of those plus a migration of
  any consumer whose `init` wrote the path before. The directory is
  fine; only the contents change.

## slices

### S1 — collapse the fragments + inline the footnotes

- **Status**: pending
- **Files**: `docs/mcp-vertex/host-hints/agent-instructions.generated.md` (new),
  `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md`
- **Gate**: typecheck
- **Acceptance**:
  - "The 3 old fragments are deleted; `agent-instructions.generated.md`
    is the only file under `docs/mcp-vertex/host-hints/`."
  - "Each of the 3 hand-edited host files references
    `docs/mcp-vertex/host-hints/agent-instructions.generated.md` AND
    carries its host-specific footnote inline (e.g. `Bootstrap §8.1
    (Copilot close-marker contract) is in effect.`), all between
    `<!-- mcp-vertex:begin -->` and `<!-- mcp-vertex:end -->`."
  - "The fragment itself does NOT carry the host footnote; it points
    only at the universal bootstrap."

### S2 — rewrite the renderer to a single fragment

- **Status**: pending
- **Files**: `tools/scripts/catalog/render-host-hints.script.ts`,
  `tools/scripts/catalog/render-host-hints.spec.ts`
- **Gate**: typecheck
- **Acceptance**:
  - "`HOST_FRAGMENTS` is a single-element array
    `{ id: 'agent-instructions', filename: 'agent-instructions.generated.md',
    render }`; `HOST_FOOTNOTE` and the per-host render functions are
    gone."
  - "After the script writes the fragment, it asserts the output
    directory contains exactly one `*.generated.md` file. The assertion
    fails with an actionable error message that points at this slice."
  - "`renderHostHints` returns a 1-element array; the spec is updated
    to match (no `agents`, `claude`, `copilot` split in the test)."

### S3 — collapse the lint to a single-fragment guard

- **Status**: pending
- **Files**: `tools/scripts/lint/host-hints-fragments.script.ts`,
  `tools/scripts/lint/host-hints-fragments.script.spec.ts`
- **Gate**: typecheck
- **Acceptance**:
  - "`HOST_HINT_FRAGMENTS` is `[ 'docs/mcp-vertex/host-hints/agent-instructions.generated.md' ]`;
    the lint walks the dir and fails if any OTHER `*.generated.md`
    appears (with a fix message pointing at this slice)."
  - "All existing tests are updated to use the single fragment; the
    `3 canonical fragments` test is replaced with a `1 canonical
    fragment + no stray siblings` test."
  - "The lint script is renamed
    `tools/scripts/lint/agent-instructions-fragment.script.ts` AND
    `tools/scripts/lint/agent-instructions-fragment.script.spec.ts`
    (the spec is moved, not just renamed — the `package.json`
    `lint:host-hints-fragments` script is updated to call the new
    path)."

### S4 — wire the new fragment into cross-IDE doc + lefthook + init

- **Status**: pending
- **Files**: `docs/mcp-vertex/CROSS-IDE.md`,
  `lefthook.yml`,
  `packages/cli/src/commands/init/init-render.ts`
- **Gate**: typecheck
- **Acceptance**:
  - "`docs/mcp-vertex/CROSS-IDE.md` §Host discovery surface lists
    exactly `docs/mcp-vertex/host-hints/agent-instructions.generated.md`
    (the 3-line bullet list collapses to 1 line)."
  - "`lefthook.yml` `host-hints-drift-check` glob_filter contains
    exactly one `host-hints/*.generated.md` pattern (the rest of the
    inputs are unchanged)."
  - "`packages/cli/src/commands/init/init-render.ts`
    `HOST_INSTRUCTIONS_BLOCKS` table carries a single `relPath +
    body` entry that all 3 host files write the same block into
    (the host-specific footnote is added by a new helper
    `appendHostFootnote` that takes the host id and injects the
    right line after the canonical first-move block)."

### S5 — verify end-to-end

- **Status**: pending
- **Files**: the 8 files above + a single new fragment
- **Gate**: validate
- **Acceptance**:
  - "`ls docs/mcp-vertex/host-hints/` shows exactly
    `agent-instructions.generated.md`."
  - "`bun run catalog:hints` regenerates the fragment byte-identical
    to what's on disk (no drift under `--check`)."
  - "`bun tools/scripts/lint/host-hints-fragments.script.ts --check`
    exits 0 (or its renamed equivalent)."
  - "`bun run validate` is green: typecheck + lint + tests + 3
    fragment-lint scripts (host-hints, host-instructions, no-internal-core-imports) + i18n."

## acceptance

- `bun run validate` is green (exit 0).
- The 3 host files carry their own host-specific footnote inline
  (between `<!-- mcp-vertex:begin -->` and `<!-- mcp-vertex:end -->`).
- Only `docs/mcp-vertex/host-hints/agent-instructions.generated.md`
  exists on disk under `docs/mcp-vertex/host-hints/`.
- The renderer and the lint both assert the single-fragment invariant
  and fail with an actionable fix if a second fragment appears.
- `init` (f00084 S4) now writes the same canonical block into the 3
  host files, with a host-specific footnote injected from a small
  helper table.
