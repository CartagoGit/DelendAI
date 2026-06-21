# `docs/proposals/done/resumes/`

Closed **cross-session handoff summaries** — proposals of kind
[`resume`](../../../ready/n00007-resume-kind-cross-session-handoff-summaries.md)
(prefix `n`). Created by proposal **n00007**.

## Why a 13th kind

Until 2026-06-21, summaries lived as loose `n00001-SESION-*.md` files that
the linter intentionally skipped — they had no `id`, no `status`, no
frontmatter, and weren't visible to `sync_proposals`, `proposal_board` or
`auto_work`. n00007 promotes them to first-class proposals under their own
bucket:

- **Frontmatter** (`id`, `kind: resume`, `status: done`, `title`, `date`,
  `track`) so the index, linter and registry see them like any other
  proposal.
- **Own prefix `n`** (single lowercase letter, unique across all 13
  kinds) so the filename + linter + glossary agree on the kind without
  ambiguity. Chosen after `m` because no existing kind used it.
- **Own sub-folder `done/resumes/`** following the f00001 mirror-by-kind
  convention (`audits/`, `feats/`, `fixes/` are the precedent).
- **Chronological numbering**: the first commit that added each file
  (`git log --diff-filter=A --format=%ai`) determines its number.
  n00001 is the earliest summary, n00006 the most recent.

## Scaffold

A resume-kind proposal has these canonical sections (linter-enforced by
`scripts/lint-proposals.ts` once the kinds plugin is loaded):

| Section | Required? | Purpose |
|---|---|---|
| `## Goal` | **yes** | one-line summary of what this session aimed at |
| `## Why` | no | the decision of fondo / context (optional) |
| `## Why this design` | no | why this approach was chosen (optional) |
| `## Non-goals` | no | what was explicitly out of scope (optional) |
| `## Architecture` | no | code/docs structure produced (optional) |
| `## Slices` | no | if the session worked on a proposal's slices, list them |
| `## Acceptance` | no | what would prove the session shipped |
| `## Risks and mitigations` | no | concerns + how they were addressed |
| `## Notes` | no | links to related proposals / docs / sessions |

The 6 summaries migrated by n00007 were written before the scaffold existed
and therefore keep their original section titles (e.g. `## ✅ Hecho (con
tests)`, `## 🔖 Cómo continuar`, `## Estado de la cola`). Those are
**legacy warnings** (`WARN (legacy)`) by the linter, never fatal — same
tier as `kind: legacy` (prefix `l`) per f00016 §4.3.

## Files

| # | File | Date | Author | Session |
|---|---|---|---|---|
| n00001 | `n00001-15-06-2026-resumen-sesion-autonoma-claude-code.md` | 2026-06-15 madrugada → ~08:05 | Claude Code · Opus 4.8 | autónoma (sin supervisión) |
| n00002 | `n00002-15-06-2026-resumen-sesion-oficina-claude-code.md` | 2026-06-15 08:55 → 20:10 | Claude Code · Sonnet 4.6 + Opus 4.8 | oficina (con revisión) |
| n00003 | `n00003-16-06-2026-resumen-sesion-2a-ronda-claude-code.md` | 2026-06-15 noche → 06-16 | Claude Code · Opus 4.8 | 2ª ronda (consolidación 2 auditorías) |
| n00004 | `n00004-16-06-2026-resumen-sesion-3a-ronda-claude-code.md` | 2026-06-16 08:27 → ~13:50 | Claude Code · Opus 4.8 | 3ª ronda (N16/N17/N19) |
| n00005 | `n00005-16-06-2026-resumen-sesion-4a-ronda-claude-code.md` | 2026-06-16 tarde/noche | Claude Code · Opus 4.8 | 4ª ronda (N20 + SDK de tipos → 11/10) |
| n00006 | `n00006-17-06-2026-resumen-sesion-handoff-copilot.md` | 2026-06-17 (casa → oficina) | GitHub Copilot · MiniMax-M3 | handoff cross-agent |

## How to write a new one

1. Run `proposals_create_proposal` with `kind: 'resume'`, `title: '...'`.
   The tool allocates the next free `n<NNN>` id via the race-safe allocator
   (s1 of n00007).
2. Fill the canonical sections. Most important: `## Goal` (1 paragraph),
   `## State at close` (what shipped, what's left), `## How to continue`
   (the exact next-step a future agent should run, ideally with the exact
   command).
3. The linter will accept the new file. The index regenerates on next
   `sync_proposals` run.

## See also

- [n00007 — Resume kind: cross-session handoff summaries](../../../ready/n00007-resume-kind-cross-session-handoff-summaries.md)
  (the proposal that defined this kind + bucket)
- [f00016 — Proposal state machine, kinds, scaffolds, and recovery](../../in-progress/f00016-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md)
- [f00001 — Done folder mirrors kinds: audits/, feats/, fixes/ sub-folders inside done/](../../in-progress/f00001-done-folder-mirrors-kinds-audits-feats-fixes-sub-folders-inside-done.md)
