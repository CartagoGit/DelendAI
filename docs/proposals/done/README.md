# `docs/proposals/done/`

This folder holds proposals whose status is `done` (approved and shipped)
plus session summaries. The 7-status root layout (`ready/`,
`in-progress/`, `review/`, `done/`, `paused/`, `blocked/`, `retired/`)
is the DFA (f00016 §4.1); inside `done/`, we **mirror the active `kind`s**
as sub-folders so the closure view scales.

## Sub-folders (mirror by kind)

| Sub-folder | Prefix | Holds | Examples |
|---|---|---|---|
| `audits/` | `a<NNN>-` | Closed audit documents | `a00007-…-codex-gpt-5-5.md` … `a00006-…-claude-code-opus-4-8.md` |
| `feats/` | `f<NNN>-` | Closed feature proposals | `f00004-…-multi-model-audit-plugin.md` … `f00018-…-rules-compact-findings.md` |
| `fixes/` | `x<NNN>-` | Closed fix proposals | `x00004-…-web-bugfixes-and-ux-overhaul.md`, `x00002-…-fix-gen-skills-recursion.md`, … |
| `resumes/` | `n<NNN>-` | Closed cross-session handoff summaries | `n00001-…-autonoma-claude-code.md` … `n00006-…-handoff-copilot.md` |

We only create a sub-folder when the second file of that kind lands in
`done/`. Buckets for `refactor/`, `chore/`, `docs/`, `test/`,
`infra/`, `spike/`, `breaking/`, `perf/` will be added when the second
file of each kind lands. The `resumes/` bucket was created by
[n00007](../ready/n00007-resume-kind-cross-session-handoff-summaries.md)
which also introduced the 13th proposal kind `resume` (prefix `n`).

## Loose files at `done/` root

These are kept at the root because they predate the convention and are
not proposals:

- `AUDITORIA-UNIFICADA-*.md` — historical consolidated audit, predates
  the kind-mirror convention. (The live audits now live under
  `done/audits/`.) NOT a proposal: one author, one span, no slice
  plan, no acceptance — different artefact shape from a proposal.

> **Note (2026-06-21)**: `n00001-SESION-*.md` files used to live at
> this root and in `done/`. They were promoted to first-class
> proposals of kind `resume` by n00007 and moved under
> [`done/resumes/`](./resumes/) with chronological numbering
> (`n00001..n00006`). The carve-out line above is the surviving entry for
> the AUDITORIA-UNIFICADA only.

## Why this folder lives at `docs/proposals/`, not `docs/mcp-vertex/proposals/`

This is the recurring question this README answers once and for all.

**The CLI default** (`packages/core/src/lib/plugins/parse-cli-args.ts` +
`DEFAULT_PATH_LAYOUT` in
`plugins/proposals/src/lib/contracts/constants/default-path-layout.constant.ts`)
is `docsDir = "docs/mcp-vertex"`. A fresh project that runs
`bunx @mcp-vertex/core --check` with no `mcp-vertex.config.json` gets
proposals under `docs/mcp-vertex/proposals/`.

**This repo (`@mcp-vertex/core` itself) overrides that** in
[`mcp-vertex.config.json`](../../../mcp-vertex.config.json):

```json
{
  "cacheDir": ".cache/mcp-vertex",
  "docsDir": "docs"
}
```

…so proposals live at `docs/proposals/` (the repo IS mcp-vertex; the
extra `mcp-vertex/` sub-folder would be redundant). The override is
intentional and documented.

**A consumer project** that adopts mcp-vertex via
`proposals_proposal_adopt` (or by writing a fresh config) has two
equally valid choices:

1. Keep the default → `docs/mcp-vertex/proposals/`.
2. Override `docsDir` in `mcp-vertex.config.json` → whatever you like.

Both are supported. The proposals plugin never assumes the layout — it
reads `docsDir` from the resolved config and writes everything
relative to it. `proposals_proposal_adopt` reports the actual folder
and recommends canonicalisation if it sees an ad-hoc shape.

## Rules

1. **Filename prefix matches frontmatter `kind`**: an `f<NNN>-*.md` file
   has `kind: feat`; an `x<NNN>-*.md` has `kind: fix`; an `n<NNN>-*.md`
   has `kind: resume`; etc. The linter enforces this (f00016 §4.3).
2. **`id:` frontmatter stays stable across renames**: when a proposal
   was previously `l99-…` and got reclassified to `f00004-…`, the `id:`
   field changed from `l99` to `f00004`. Cross-references (`related: l99`
   in other proposals) were rewritten to `related: f00004` atomically by
   the f00001 migration. Do NOT refer to a proposal by its filename —
   refer to it by `id:` (e.g. `related: f00016`). The n00007 migration
   does NOT rename any `id:`; it only renames files (the 6 summaries
   get fresh `n00001..n00006` ids because they had none before).
3. **Sub-folders only allowed inside terminal statuses**: `done/` and
   `retired/`. The reconciler treats any depth under these folders as
   "status done" / "status retired". Non-terminal statuses (`ready`,
   `in-progress`, `review`, `paused`, `blocked`) keep the flat layout.
4. **Adding a new bucket**: when the **second** file of a new kind
   lands in `done/`, create the corresponding sub-folder
   (`done/refactors/`, `done/docs/`, …) and move both files. Update
   this README.

## See also

- [f00016 — Proposal state machine, kinds, scaffolds, and recovery](./feats/f00016-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md) (the predecessor that defined the 7 statuses and 12 kinds).
- [f00001 — Done folder mirrors kinds: audits/, feats/, fixes/ sub-folders inside done/](./feats/f00001-done-folder-mirrors-kinds-audits-feats-fixes-sub-folders-inside-done.md) (this convention).
- [n00007 — Resume kind: cross-session handoff summaries](../ready/n00007-resume-kind-cross-session-handoff-summaries.md) (the 13th kind `resume` + `done/resumes/` bucket).
- [`done/resumes/README.md`](./resumes/README.md) — the `resumes/` bucket's own README.