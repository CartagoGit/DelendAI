---
id: r00007
status: ready
type: proposal
kind: refactor
track: repo-layout+tooling+dx
date: 2026-06-30
title: Rename the relocatable-config home `configs/` → `config/` (singular), export surface included
shipped-in: []
recan: []
related:
    - r00004 # originally introduced `configs/` as the home for relocatable tool configs; this flips the name to singular without changing its intent
    - f00064 # repo-layout contracts that reference `configs/` paths (path refs updated, design untouched)
    - f00065 # skill ownership glob references `configs/external/**` (path ref updated, design untouched)
    - f00068 # external-tool seeds that live under `configs/external/` (content untouched, only relocated)
    - f00083 # anti-duplication guard mentions `configs/external/<host>/` as out-of-scope (path ref updated)
ownership:
    - { agent: implementation_runner, task: 'S1: `git mv configs config`; update package.json typedoc `--options` paths and the typedoc.json relative `out`/`tsconfig`/`entryPoints` (unchanged — they are `../`-relative and survive the rename)' }
    - { agent: implementation_runner, task: 'S2: update every live path reference to `configs/` → `config/` outside historical done-proposals (AGENTS.md, AGENT-BOOTSTRAP.md, wiki, README contents, the two READY proposals f00064/f00065 — path refs only)' }
    - { agent: proposal_guardian,     task: 'S3: verify no live `configs/` path reference remains; `bun run validate` green; catalog regenerated in a separate chore commit if `catalog:check` demands it' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
---

# r00007 — Rename `configs/` → `config/` (singular)

## goal

The maintainer wants the repo-root relocatable-config home to be **singular**:
"quiero que la carpeta `configs` sea `config` en singular y cuando se exporte
se haga igual también." So the directory `configs/` at the repo root becomes
`config/`, and **every place the name is exposed, exported, written, or
scaffolded** is updated to match — not just the on-disk folder.

This is a pure rename. No file *content* of the moved tree changes (typedoc
config and the `external/` seeds are byte-identical after the move); only the
directory name and the references to it change.

## why

`r00004` introduced `configs/` as the home for tool configs that accept an
explicit config path (in practice only `typedoc.json` landed there, plus the
`external/<tool>/` agent-seed tree from the f00068 line). The folder name was
chosen as a plural collection. The maintainer prefers the singular `config/`,
consistent with the common single-purpose-directory convention, and wants the
singular form to be the one that shows up anywhere the name is surfaced
(scripts, the typedoc invocation, docs, and any export/scaffold path).

## why this design

"cuando se exporte se haga igual" is interpreted conservatively as: every
**emitted / exposed** occurrence of the directory name must also be singular.
Audited surfaces:

- **package.json scripts** — `docs:api` / `docs:api:watch` pass
  `--options configs/typedoc.json`; both become `--options config/typedoc.json`.
- **npm `exports` / `files`** — there is **no** `exports` or `files` field in
  the root `package.json` that references `configs/`; nothing to change there.
- **apps/web build output** — the web build emits to `build/`; it does not emit
  a `configs/`-named directory. The web `configs` mentions are all the
  `IAreaRules.configs` field / "IDE configs" prose, not the directory.
- **init CLI / scaffold templates (f00084)** — no scaffold, template, or path
  constant emits a literal `configs/` directory string. The code occurrences of
  `configs` are the rules `IAreaRules.configs` field, ESLint `js.configs.*`, and
  "agent configs" prose — none are the directory. Nothing to change in code.
- **typedoc `out`** — typedoc writes to `../build/docs-api` (relative to the
  config file); that path is unaffected by renaming the folder the config lives
  in, and the `../`-relative `entryPoints`/`tsconfig` continue to resolve.

So the only *export-surface* edits are the two package.json typedoc script
paths; the rest is on-disk move plus documentation/path-reference updates.

## non-goals

- **No content change** to `config/external/**` — those are external-tool seeds
  on the f00068 line (aider/cursor/mcp + README). They are only relocated.
- **No design change** to f00064 / f00065 — only their `configs/` path strings
  are flipped to `config/`; their contracts, slices, and acceptance stand.
- **Historical done-proposals and audits are left as-is.** Files under
  `proposals/done/**` (notably `r00004`, `a00039`, `x00052`, `f00083`,
  `f00051`) narrate the *history* of `configs/`; rewriting them would falsify
  the record. Their `configs/` mentions are historical and stay. `r00007`'s
  `related: r00004` preserves the trail.

## slices

### S1 — Move the directory and fix the export/script paths
- **Files**: package.json, configs/** → config/**
- **Gate**: type
- **Status**: done
- **Acceptance**:
  - "`git mv configs config` preserves history; `config/typedoc.json` and
    `config/external/{mcp,aider,cursor,README.md}` exist, byte-identical."
  - "`package.json` `docs:api` and `docs:api:watch` point at
    `config/typedoc.json`; `bun run docs:api` still produces `build/docs-api`."

### S2 — Update every live path reference
- **Files**: AGENTS.md, docs/mcp-vertex/AGENT-BOOTSTRAP.md,
  docs/mcp-vertex/wiki/01-the-problem.md, config/external/README.md,
  docs/mcp-vertex/proposals/ready/f00064-*.md,
  docs/mcp-vertex/proposals/ready/f00065-*.md
- **Gate**: type
- **Status**: done
- **Acceptance**:
  - "Every `configs/` *path* reference outside `proposals/done/**` reads
    `config/`; prose like 'tool configs' / 'agent configs' that does not name
    the directory is left unchanged."
  - "f00064 / f00065 keep their design; only the literal path strings change."

### S3 — Verify and gate
- **Files**: (none — verification + optional catalog regen)
- **Gate**: validate
- **Status**: done
- **Acceptance**:
  - "A final `grep -rn 'configs/'` outside `node_modules|build|dist|.git` and
    outside `proposals/done/**` returns no live path reference."
  - "`bun run validate` exits 0. If `catalog:check` requires it, the catalog is
    regenerated in a separate `chore(catalog):` commit."

## acceptance

- `bun run validate` is green (exit 0).
- The repo root shows `config/` (singular); `configs/` no longer exists.
- No live `configs/` path reference remains outside historical done-proposals.
- The typedoc export still emits `build/docs-api` via `config/typedoc.json`.
