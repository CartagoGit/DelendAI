# `docs/proposals/done/`

This folder holds proposals whose status is `done` (approved and shipped)
plus session summaries. The 7-status root layout (`ready/`,
`in-progress/`, `review/`, `done/`, `paused/`, `blocked/`, `retired/`)
is the DFA (f113 §4.1); inside `done/`, we **mirror the active `kind`s**
as sub-folders so the closure view scales.

## Sub-folders (mirror by kind)

| Sub-folder | Prefix | Holds | Examples |
|---|---|---|---|
| `audits/` | `a<NNN>-` | Closed audit documents | `a001-…-codex-gpt-5-5.md` … `a020-…-claude-code-opus-4-8.md` |
| `feats/` | `f<NNN>-` | Closed feature proposals | `f99-…-multi-model-audit-plugin.md` … `f118-…-rules-compact-findings.md` |
| `fixes/` | `x<NNN>-` | Closed fix proposals | `x105-…-web-bugfixes-and-ux-overhaul.md`, `x106-…-fix-gen-skills-recursion.md`, … |

We only create a sub-folder when the second file of that kind lands in
`done/`. Buckets for `refactor/`, `chore/`, `docs/`, `test/`,
`infra/`, `spike/`, `breaking/`, `perf/` will be added when the second
file of each kind lands.

## Loose files at `done/` root

These are kept at the root because they predate the convention and are
not proposals:

- `RESUMEN-SESION-*.md` — session notes (not a proposal).
- `AUDITORIA-UNIFICADA-*.md` — historical consolidated audit, predates
  the kind-mirror convention. (The live audits now live under
  `done/audits/`.)

## Rules

1. **Filename prefix matches frontmatter `kind`**: an `f<NNN>-*.md` file
   has `kind: feat`; an `x<NNN>-*.md` has `kind: fix`; etc. The linter
   enforces this (f113 §4.3).
2. **`id:` frontmatter stays stable across renames**: when a proposal
   was previously `l99-…` and got reclassified to `f99-…`, the `id:`
   field changed from `l99` to `f99`. Cross-references (`related: l99`
   in other proposals) were rewritten to `related: f99` atomically by
   the f119 migration. Do NOT refer to a proposal by its filename —
   refer to it by `id:` (e.g. `related: f113`).
3. **Sub-folders only allowed inside terminal statuses**: `done/` and
   `retired/`. The reconciler treats any depth under these folders as
   "status done" / "status retired". Non-terminal statuses (`ready`,
   `in-progress`, `review`, `paused`, `blocked`) keep the flat layout.
4. **Adding a new bucket**: when the **second** file of a new kind
   lands in `done/`, create the corresponding sub-folder
   (`done/refactors/`, `done/docs/`, …) and move both files. Update
   this README.

## See also

- [f113 — Proposal state machine, kinds, scaffolds, and recovery](../in-progress/f113-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md) (the predecessor that defined the 7 statuses and 12 kinds; archived once f119 lands).
- [f119 — Done folder mirrors kinds: audits/, feats/, fixes/ sub-folders inside done/](../in-progress/f119-done-folder-mirrors-kinds-audits-feats-fixes-sub-folders-inside-done.md) (this convention).