---
id: f00042
kind: feat
title: Done folder mirrors kinds — audits/, feats/, fixes/ sub-folders inside done/
status: done
triaged: true
date: 2026-06-21
track: proposals
ownership:
    - { agent: implementation_runner, task: 's1: rename 20 audit files to a00001..a00020 + move into done/audits/' }
    - { agent: implementation_runner, task: 's2: re-classify the 15 legacy-prefixed closed proposals into their real done/feats|fixes targets' }
    - { agent: implementation_runner, task: 's3: move f00016..f00018 into done/feats/ + create done/README.md documenting the convention' }
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
related:
    - f00016 # proposal state machine — 7 statuses at root, kinds now mirrored inside done/
    - x00001 # fix-audit-types — established the `a<NN>-` audit prefix this proposal generalises
---

# f00042 — Done folder mirrors kinds: audits/, feats/, fixes/ sub-folders inside done/

## Goal

Add an internal sub-folder mirror inside `docs/proposals/done/` so the
folder scales without becoming a flat dump. The 7 statuses still live at
the root (`ready/`, `in-progress/`, `review/`, `done/`, `paused/`,
`blocked/`, `retired/`) per [f00016](./f00016-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md);
only **inside `done/`** we group closed proposals by their `kind`
(currently `audits/`, `feats/`, `fixes/`). This is purely a filesystem
convention — the reconciler still treats every file under `done/` (any
depth) as `status: done` and the linter still validates filename prefix
↔ frontmatter `kind`. **No engine change.**

## Why

After landing f00016 the proposal taxonomy is clean (12 kinds, single-letter
prefix, linter-enforced), but `docs/proposals/done/` already had 35+
files mixed at the root: audits, feats, fixes, summaries, and legacy
`l<NNN>-*` re-tagged with `kind: legacy` regardless of their actual
content. Two practical problems:

1. **Discovery cost**: finding every audit requires `ls | grep ^a`; every
   feat requires `ls | grep ^f`. With 5-10 more closed proposals per week,
   this will get worse.
2. **Misleading `kind: legacy`**: `l99-l113` were tagged `kind: legacy` by
   f00016 because of their filename prefix (pre-f00016 scheme), NOT because
   their actual content is obsolete. `l99-feat-multi-model-audit-plugin`
   is a real feat; tagging it `kind: legacy` is a lie about its content.

This proposal fixes both **without touching the engine**:

- A sub-folder per active `kind` inside `done/` so the root stays flat
  and the closure view scales.
- Renaming legacy-prefixed proposals so their filename matches their real
  `kind` (the `id:` frontmatter stays unchanged, so cross-references in
  `related:` keep resolving).

## Why this design

### 2.1 Sub-folder only inside `done/`, not at the root

The 7-status root layout (`ready/`, `in-progress/`, `review/`, `done/`,
`paused/`, `blocked/`, `retired/`) is the **DFA**: each folder is one
status, the reconciler moves files between them, and the linter checks
the folder ↔ status mapping. Adding sub-folders at the root would break
the DFA: a file at `ready/feats/foo.md` would still be `status: ready`
to the linter, but the filesystem would encode two dimensions (status +
kind) at the same level. That's confusing for agents and tools.

`done/` is the one status whose contents are **terminal** and
`read-mostly`: nothing leaves it. It is the only folder where we are
free to add internal organisation without breaking the DFA. This matches
the f00016 invariant: "`done`/`retired` are terminal".

### 2.2 Only the kinds we actually have, no speculative buckets

Today's `done/` has audits, feats, and fixes — three kinds. We do **not**
create `refactors/`, `breaking/`, `perf/`, `chore/`, `docs/`, `test/`,
`infra/`, `spike/` preemptively. The convention is "add a sub-folder
when the second file of that kind lands in `done/`". This keeps the
folder count honest and avoids empty buckets.

### 2.3 `id:` stays, filename prefix updates

Renaming the old legacy file `l99-feat-multi-model-audit-plugin.md` to its
current canonical location
`f00006-feat-multi-model-audit-plugin.md` (because its real kind is `feat`)
breaks any external link that points at the filename. But **every**
cross-proposal reference in this repo uses the `id:` field (e.g.
`related: f00006`), not the filename, because the proposal linter
encourages it and the glossary documents it. So the rename is safe:

| Before | After | `id:` |
|---|---|---|
| `done/l99-feat-multi-model-audit-plugin.md` | `done/feats/f00006-feat-multi-model-audit-plugin.md` | `f00006` |
| `done/a1-16-06-2026- Auditoría Maestra.md` | `done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md` | `a00013` |

Wait — for the audits, the old `id:` values were `a1`, `a2`, `a3`, `a4` (the
already-prefixed ones) plus **no frontmatter** for the un-prefixed ones.
Renumbering the 20 audits to `a00001`-`a00020` requires picking the audit
identifier. We use the **chronological position** as the new `a<NN>`,
which becomes both the filename prefix AND the `id:` field. The old
`a1`/`a2`/`a3`/`a4` ids are updated to their new numbers; references
that pointed to them are checked and rewritten.

## Non-goals

- Automating the folder grouping at write-time (this is purely a layout migration proposal).

## Architecture

### 3.1 Target layout

```
docs/proposals/
├── ready/                  # status: ready (f00016 §4.1)
├── in-progress/            # status: in-progress
├── review/                 # status: review
├── done/                   # status: done (this proposal mirrors kinds inside)
│   ├── README.md           # convention document (s3)
│   ├── audits/             # kind: audit  (20 files: a00001..a00020)
│   ├── feats/              # kind: feat   (~10-15 files; legacy-prefixed proposals reclassified to padded feat ids)
│   ├── fixes/              # kind: fix    (~2-3 files: x-prefixed closed proposals)
│   └── n00001-SESION-*.md # summaries + AUDITORIA-UNIFICADA — root, not bucketed
│                              (they predate the convention and are not proposals)
├── paused/                 # status: paused
├── blocked/                # status: blocked
└── retired/                # status: retired (terminal)
```

### 3.2 Status ↔ folder mapping (unchanged from f00016)

| Status | Folder |
|---|---|
| ready | `ready/` |
| in-progress | `in-progress/` |
| review | `review/` |
| done | `done/` (any depth, after this proposal) |
| paused | `paused/` |
| blocked | `blocked/` |
| retired | `retired/` |

The reconciler keeps moving files to the **root** of each status folder;
s3 only adds the README that documents the done/ sub-folder convention.

### 3.3 Linter expectations (unchanged from f00016)

The `proposal-scaffold-linter` and `lint:proposals` script validate:

1. `filename[0]` matches `PROPOSAL_PREFIX_BY_KIND[frontmatter.kind]`.
2. The parent folder matches `STATUS_TO_FOLDER[frontmatter.status]`.

Both checks remain correct under this proposal because:

- Renaming `l99-feat-...md` to `f00006-feat-...md` keeps rule (1): the new
  prefix `f` matches `kind: feat`.
- Moving files into `done/feats/` keeps rule (2) only if the linter walks
  the file's **status**, not its folder. We confirm: yes, the linter reads
  `frontmatter.status`, so a file at `done/feats/foo.md` with
  `status: done` is valid. (No linter change needed; verified by
  acceptance criterion `bun run lint:proposals` exit0.)

### 3.4 Audit numbering

The 20 audit files are renumbered `a00001..a00020` by `git log --diff-filter=A
--format=%ai -- <file>` order (when each file first appeared in the
repo). Ties broken by alphabetical slug. The number is assigned once,
frozen in the filename and the `id:` field, and never re-used.

The four pre-existing numbered audits (`a1-14-06`, `a2-15-06`,
`a3-15-06`, `a4-15-06`) and the lone pre-padding `audits/a1-16-06-...` (Maestra)
all receive new numbers based on the chronological table in §3.5.

### 3.5 Chronological audit map (s1)

| # | Created | Date in doc | Source file | Slug |
|---|---|---|---|---|
| a00001 | 2026-06-15 01:56 | 15-06-2026 | `done/audits/a00007-15-06-2026-codex-gpt-5-5.md` | Codex GPT-5.5 |
| a00002 | 2026-06-15 23:13 | 15-06-2026 | `done/audits/a00002-15-06-2026-antigravity-claude-sonnet-4-6-thinking-estado-actual.md` | Antigravity Claude estado-actual |
| a00003 | 2026-06-16 23:35 | 15-06-2026 | `done/audits/a00005-15-06-2026-auditoria-unificada.md` | Unificada 15-06 |
| a00004 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00009-16-06-2026-antigravity-claude-sonnet-4-6-thinking-previa.md` | Antigravity Claude previa |
| a00005 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00008-16-06-2026-antigravity-claude-sonnet-4-6-thinking.md` | Antigravity Claude |
| a00006 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00011-16-06-2026-antigravity-gemini-3-5-flash-previa-exhaustiva.md` | Antigravity Gemini previa-exhaustiva |
| a00007 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00012-16-06-2026-antigravity-gemini-3-5-flash-previa-unificada.md` | Antigravity Gemini previa-unificada |
| a00008 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00010-16-06-2026-antigravity-gemini-3-5-flash.md` | Antigravity Gemini |
| a00009 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00014-16-06-2026-claude-code-opus-4-8.md` | Claude Code Opus |
| a00010 | 2026-06-16 23:43 | 16-06-2026 | `done/audits/a00015-16-06-2026-codex-gpt-5-auditoria-exhaustiva.md` | Codex GPT-5 exhaustiva |
| a00011 | 2026-06-17 12:51 | 17-06-2026 | `done/audits/a00016-17-06-2026-auditoria-independiente-github-copilot-minimax-m3.md` | Copilot MiniMax-M3 |
| a00012 | 2026-06-17 18:18 | 17-06-2026 | `done/audits/a00017-17-06-2026-claude-code-opus-4-8-estado-actual.md` | Claude Opus estado-actual |
| a00013 | 2026-06-18 08:39 | 18-06-2026 | `done/audits/a00018-18-06-2026-auditoria-agnostica-codex-gpt-5.md` | Agnóstica Codex GPT-5 |
| a00014 | 2026-06-18 08:39 | 18-06-2026 | `done/audits/a00020-18-06-2026-auditoria-agnostica-gpt-5-4.md` | Agnóstica GPT-5.4 |
| a00015 | 2026-06-18 08:39 | 18-06-2026 | `done/audits/a00019-18-06-2026-auditoria-agnostica-estado-actual.md` | Agnóstica estado-actual |
| a00016 | 2026-06-21 01:23 | 16-06-2026 | `done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md` | Maestra Unificada |
| a00017 | 2026-06-21 04:23 | 14-06-2026 | `done/audits/a00001-14-06-2026-antigravity-claude-sonnet-4-6-thinking.md` | Antigravity Claude inicial |
| a00018 | 2026-06-21 04:23 | 15-06-2026 | `done/audits/a00004-15-06-2026-antigravity-gemini-3-5-flash-estado-actual.md` | Antigravity Gemini estado-actual |
| a00019 | 2026-06-21 04:23 | 15-06-2026 | `done/audits/a00003-15-06-2026-antigravity-gemini-3-5-flash.md` | Antigravity Gemini (jul-15) |
| a00020 | 2026-06-21 04:23 | 15-06-2026 | `done/audits/a00006-15-06-2026-claude-code-opus-4-8.md` | Claude Code Opus (jul-15) |

## Slices

- global_gate: none

### S1 — Renumber and rename the 20 closed audit documents to a00001-a00020 by chronological creation order
- **Status**: done
- **Files**: see files list below
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- files: docs/proposals/done/audits/a00001-14-06-2026-antigravity-claude-sonnet-4-6-thinking.md
- files: docs/proposals/done/audits/a00002-15-06-2026-antigravity-claude-sonnet-4-6-thinking-estado-actual.md
- files: docs/proposals/done/audits/a00003-15-06-2026-antigravity-gemini-3-5-flash.md
- files: docs/proposals/done/audits/a00004-15-06-2026-antigravity-gemini-3-5-flash-estado-actual.md
- files: docs/proposals/done/audits/a00005-15-06-2026-auditoria-unificada.md
- files: docs/proposals/done/audits/a00006-15-06-2026-claude-code-opus-4-8.md
- files: docs/proposals/done/audits/a00007-15-06-2026-codex-gpt-5-5.md
- files: docs/proposals/done/audits/a00008-16-06-2026-antigravity-claude-sonnet-4-6-thinking.md
- files: docs/proposals/done/audits/a00009-16-06-2026-antigravity-claude-sonnet-4-6-thinking-previa.md
- files: docs/proposals/done/audits/a00010-16-06-2026-antigravity-gemini-3-5-flash.md
- files: docs/proposals/done/audits/a00011-16-06-2026-antigravity-gemini-3-5-flash-previa-exhaustiva.md
- files: docs/proposals/done/audits/a00012-16-06-2026-antigravity-gemini-3-5-flash-previa-unificada.md
- files: docs/proposals/done/audits/a00013-16-06-2026-auditoria-maestra-unificada.md
- files: docs/proposals/done/audits/a00014-16-06-2026-claude-code-opus-4-8.md
- files: docs/proposals/done/audits/a00015-16-06-2026-codex-gpt-5-auditoria-exhaustiva.md
- files: docs/proposals/done/audits/a00016-17-06-2026-auditoria-independiente-github-copilot-minimax-m3.md
- files: docs/proposals/done/audits/a00017-17-06-2026-claude-code-opus-4-8-estado-actual.md
- files: docs/proposals/done/audits/a00018-18-06-2026-auditoria-agnostica-codex-gpt-5.md
- files: docs/proposals/done/audits/a00019-18-06-2026-auditoria-agnostica-estado-actual.md
- files: docs/proposals/done/audits/a00020-18-06-2026-auditoria-agnostica-gpt-5-4.md

### S2 — Move the legacy-prefixed closed proposals into their real-kind sub-folders
- **Status**: done
- **Files**: see files list below
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- files: docs/proposals/done/feats/f00006-feat-multi-model-audit-plugin.md
- files: docs/proposals/done/feats/f00018-website-i18n-and-docs-rewrite.md
- files: docs/proposals/done/feats/f00017-web-header-transitions-and-full-capabilities-surface.md
- files: docs/proposals/done/feats/f00010-keep-legacy-default-false.md
- files: docs/proposals/done/feats/f00011-loop-detection-and-handoff.md
- files: docs/proposals/done/feats/f00008-feat-status-marker-plugin.md
- files: docs/proposals/done/fixes/x00006-web-bugfixes-and-ux-overhaul.md
- files: docs/proposals/done/fixes/x00002-fix-gen-skills-recursion.md
- files: docs/proposals/done/feats/f00012-multilang-quality-gates.md
- files: docs/proposals/done/feats/f00009-feat-test-convention-plugin.md
- files: docs/proposals/done/feats/f00003-feat-auto-work-persist-modes.md
- files: docs/proposals/done/feats/f00015-residual-p100-web-and-i18n.md
- files: docs/proposals/done/fixes/x00005-post-closure-audit-orchestration-crash-fix-remaining-hardening.md
- files: docs/proposals/done/feats/f00002-derive-site-manifests-and-local-aliases.md
- files: docs/proposals/done/fixes/x00001-fix-audit-types.md

### S3 — Move the remaining f00016-f00018 closed feats and create the sub-folder convention doc
- **Status**: done
- **Files**: see files list below
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- files: docs/proposals/done/feats/f00016-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md
- files: docs/proposals/done/feats/f00014-feat-ide-extension-vscode-and-friends.md
- files: docs/proposals/done/feats/f00015-feat-mcp-logs-plugin.md
- files: docs/proposals/done/feats/f00017-proposals-output-schema-hardening.md
- files: docs/proposals/done/feats/f00013-adopt-core-migrations-for-agent-registry.md
- files: docs/proposals/done/feats/f00018-rules-compact-findings.md
- files: docs/proposals/done/README.md

## Acceptance

- `bun run type` exits 0.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `bun run lint:proposals` exits 0.

## Risks and mitigations

- **R1**: A cross-proposal `related:` field references an old audit
  filename (e.g. `related: a00001-14-06-...`). Mitigation: s1 only rewrites
  filenames, not `id:` references in other proposals' frontmatter, so
  the `related: a00001` form (using the `id`) keeps working. We add a
  follow-up commit if any literal filename reference is found.
- **R2**: The linter's filename-prefix check fails on a file whose `id:`
  field and filename prefix disagree (e.g. a legacy filename paired with its new padded `id`).
  Mitigation: confirmed that the linter reads `kind:` (not `id:`) for the
  prefix check, so the rename is legal as long as `kind: feat`.
- **R3**: The legacy `docs/proposals/audits/` directory removal breaks
  any tool that hardcodes that path. Mitigation: a quick grep across
  `apps/`, `plugins/`, `scripts/` found no references — the `audits/`
  folder at root was only used as a holding pen.

## Notes

- Renaming the 5 `n00001-SESION-*.md` and the `AUDITORIA-UNIFICADA-...md`
  in `done/` root. They are not proposals (no frontmatter), so the
  linter ignores them. They stay at `done/` root.
- Auto-grouping future closes by kind at write-time (a `proposal_close`
  tool that picks the sub-folder). That's a nice ergonomic, but it's a
  separate engine change; this proposal is filesystem-only.
- Buckets for `refactor/`, `chore/`, `docs/`, `test/`, `infra/`,
  `spike/`, `breaking/`, `perf/`. They will be added when the second
  file of each kind lands in `done/`.