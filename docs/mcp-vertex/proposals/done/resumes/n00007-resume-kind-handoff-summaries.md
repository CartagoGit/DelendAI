---
id: n00007
kind: resume
title: Resume kind — cross-session handoff summaries
status: done
date: 2026-06-21
track: proposals
triaged: true
ownership:
    - { agent: implementation_runner, task: 's1: add resume kind (prefix n) to glossary + authoring tool enum' }
    - { agent: implementation_runner, task: 's2: scaffold this proposal in ready/ with canonical sections' }
    - { agent: implementation_runner, task: 's3: move 6 n00001-SESION-*.md into done/resumes/ with n00001..n00006 chronological numbering' }
    - { agent: implementation_runner, task: 's4: update done/README.md to document the new bucket + answer the docsDir question' }
    - { agent: implementation_runner, task: 's5: sync proposals index + run full validate (typecheck, lint, tests, lint:proposals)' }
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
related:
    - f00016 # proposal state machine — 7 statuses, 12 kinds (now 13 with `resume`)
    - f00001 # done/ folder mirrors kinds — the convention this proposal extends
    - x00001 # fix-audit-types — established the `a<NN>-` prefix pattern
    - f00023 # rename proposal IDs by creation date — orthogonal: this adds a 13th kind, not a new numbering scheme
---

# n00007 — Resume kind: cross-session handoff summaries

## Goal

Add a 13th proposal kind **`resume`** (single-letter prefix `n`) so cross-session handoff summaries live as first-class proposals under `docs/proposals/done/resumes/n<NNN>-*.md` and follow the same scaffold/linter as `a`/`f`/`x`/etc., instead of being loose `n00001-SESION-*.md` files the linter happens to skip. Move the 6 existing summaries into the new bucket with chronological numbering (`n00001..n00006`) and document the convention in `docs/proposals/done/README.md`.

## Why

Cross-session summaries are the single most important document for "pick up where I left off" workflows (home → office, context-restart, agent hand-off). Today they have three real problems:

1. **No first-class identity.** They live as loose `.md` files (`n00001-SESION-*.md`) outside the proposal state machine — `scripts/lint-proposals.ts` *intentionally* skips them (the walker filters by `^[a-z]\d+-…` and the test "ignores non-proposal documents" enshrines the behaviour). They have no `id`, no `status`, no frontmatter. Tools that read the proposals index (`sync_proposals` → `index.json`, `proposal_board`, `auto_work`) can't see them.

2. **No scaffold.** Each summary is hand-rolled; sections drift between sessions (`Cronología`, `Cronología de sesiones`, `Qué se hizo`, `Hecho`, mixed English/Spanish headings). Future agents retype the format instead of inheriting it.

3. **No home.** The 6 existing summaries are split: 1 at `docs/proposals/n00001-SESION-2026-06-17.md` (loose at root) and 5 at `docs/proposals/done/n00001-SESION-*.md` (the `done/` README explicitly carves them out as "loose files that predate the convention"). That carve-out was right at the time — there was no kind for them — but it's time to give them one.

This proposal fixes all three by treating summaries as proposals of a 13th kind, `resume`. Same linter, same index, same scaffold. No new tool: `create_proposal` learns the kind, the existing file walker picks them up automatically, and `proposal_board`/`auto_work` can eventually include them in the actionable list (out of scope for this proposal — flagged in §"non-goals").

The 6 existing summaries already follow a remarkably consistent structure (state-at-close, what was done, how to continue). Codifying it as a scaffold means the next agent writing one doesn't have to remember the format — they fill in the template.

## Why this design

### 2.1 `resume` as a 13th kind, not a flag on existing kinds

Alternatives considered:

- **A boolean flag (`handoff: true`) on existing kinds**: hides the convention in frontmatter; doesn't show in filenames or `proposal_board`; no scaffold; no `index.json` entry. Worst of all worlds.
- **A separate top-level folder `docs/handoffs/` outside `proposals/`**: bypasses the proposal state machine; the linter, registry and `auto_work` never see it. Future agents won't find it unless they already know.
- **A 13th kind, prefix `n`**: makes them first-class proposals with their own prefix, scaffold, registry entry and bucket folder. Reuses every existing tool with one additive change (the glossary entry + an authoring-tool enum extension). One new bucket folder inside `done/` matches the f00001 convention exactly.

Picking the kind. The 12 existing kinds are: `feat` (f), `breaking` (b), `fix` (x), `refactor` (r), `perf` (v), `audit` (a), `chore` (c), `docs` (d), `test` (t), `infra` (i), `spike` (s), `legacy` (l). `n` is the first free letter (alphabetically after `l`, skipping `m` which we'll keep free for future `memory`-style kinds). `resume` is a good name (not "summary" — "summary" suggests partial; "resume" matches the action the file enables, picking work back up). Prefix `n` doesn't clash with any existing kind; `prefixForKind('resume')` returns `'n'`; `PROPOSAL_KIND_BY_PREFIX['n']` resolves to `'resume'`.

`conventionalCommitType: ''` and `bump: 'none'` — a summary is not code, it doesn't version the package. Same as `spike`. `glyph: '🧭'` (the compass) signals "navigation / orientation" (matching the `buildResumeHint` already used in `plugins/proposals/src/lib/swarm/round-context-resume.ts` — different concept, same metaphor).

### 2.2 Sub-folder `done/resumes/` follows the f00001 mirror convention

f00001 already established that `done/` mirrors kinds as sub-folders (`audits/`, `feats/`, `fixes/`), created only when the **second** file of that kind lands. By the time s3 finishes there will be 6 — so the sub-folder is justified. The pattern:

```
done/
├── README.md           # convention doc (updated in s4)
├── audits/             # a<NNN>-...
├── feats/              # f<NNN>-...
├── fixes/              # x<NNN>-...
└── resumes/            # n<NNN>-...   ← NEW (this proposal)
    ├── README.md       # bucket-specific doc
    ├── .gitkeep        # keeps the empty folder under git
    └── n00001-...md ... n00006-...md
```

The `done/README.md` carve-out line "`n00001-SESION-*.md` — session notes (not a proposal)" is **removed** by this proposal; they ARE proposals now (kind: resume). Same for `AUDITORIA-UNIFICADA-*.md` — it stays loose at `done/` root because it's a historical consolidated doc, not a proposal-shaped work record (one author, one span, no slice plan, no acceptance). Different artefact, different rule.

### 2.3 Chronological numbering via `git log --diff-filter=A`

The 6 existing summaries span `2026-06-15 → 2026-06-17`. Same ordering rule as f00001 §3.5: the **first commit that added each file** determines its number. Ties broken by alphabetical slug. Result:

| New filename | Date | Original |
|---|---|---|
| `n00001-15-06-2026-resumen-sesion-autonoma-claude-code.md` | 2026-06-15 | `n00001-SESION-AUTONOMA-2026-06-15.md` |
| `n00002-15-06-2026-resumen-sesion-oficina-claude-code.md` | 2026-06-15 | `n00001-SESION-OFICINA-2026-06-15.md` |
| `n00003-15-06-2026-resumen-sesion-2a-ronda-claude-code.md` | 2026-06-15 | `n00001-SESION-2A-RONDA-2026-06-15.md` |
| `n00004-16-06-2026-resumen-sesion-3a-ronda-claude-code.md` | 2026-06-16 | `n00001-SESION-3A-RONDA-2026-06-16.md` |
| `n00005-16-06-2026-resumen-sesion-4a-ronda-claude-code.md` | 2026-06-16 | `n00001-SESION-4A-RONDA-2026-06-16.md` |
| `n00006-17-06-2026-resumen-sesion-handoff-copilot.md` | 2026-06-17 | `n00001-SESION-2026-06-17.md` |

(The exact controller+model per session is read from each file's body in s3 — the slug above is a placeholder until s3 runs `git log` + `head -10` on each file.)

**`id:` stays in the new filename**, because we add frontmatter (status: done, kind: resume, etc.) — the file becomes a proper proposal, not a renamed loose `.md`. The new id (n00001..n00006) is the **chronological position**, not the original filename.

### 2.4 Linter behaviour: nothing to change

The walker in `scripts/lint-proposals.ts` already filters by `^[a-z]\d+-…`. With the new kind registered in `PROPOSAL_KINDS`, a file `n00001-…md` with `kind: resume` passes `lintProposalMarkdown` and is linted like any other proposal (frontmatter shape, body section order, slice discipline). No linter change beyond the glossary entry.

The existing carve-out in the walker (skip non-proposals) stays — `n00001-SESION-*.md` no longer matches it because the new files don't start with `n00001-`. The "ignores non-proposal documents" test continues to pass: a stray README, an AUDITORIA-UNIFICADA, an `index.json` are still skipped.

The carve-out comment in `scripts/lint-proposals.ts` (lines 37-49) gets updated to reflect that summaries are no longer "non-proposal documents" — they're proposals of kind `resume`.

### 2.5 Authoring tool enum

`create_proposal`'s input schema has a hard-coded `z.enum([…12 kinds…])`. Adding `resume` is a one-line change. Tests in `proposals_create_proposal.spec.ts` (the test that asserts the enum list) need the new value added.

## Non-goals

- **No `proposal_board` / `auto_work` integration.** The summaries live under `done/` (terminal status); `auto_work` already skips `done`. Adding summaries to the actionable list is *useful* but out of scope — that needs a "include historical summaries" mode that this proposal doesn't touch.
- **No `session_status` tool.** A tool that lists "the latest `n<NNN>-*.md` resume" or "the resume referenced by the current proposal's `supersedes:` field" would be helpful for `auto_work` to surface "pick up at session X" automatically. Deferred to a follow-up proposal.
- **No automatic frontmatter generation from a blank `n00001-…md`.** This proposal documents the scaffold and migrates the 6 existing summaries by hand; it does NOT auto-generate frontmatter from arbitrary markdown.
- **No rewrite of prose.** The summaries are historical records; their bodies stay byte-for-byte identical. Only filenames + added frontmatter change.
- **No backwards-compat alias.** Old `n00001-SESION-*.md` paths are gone; this is internal repo state, not a published contract.

## Architecture

### 3.1 New glossary entry

```ts
// plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts
export type IProposalKind =
  | 'feat' | 'breaking' | 'fix' | 'refactor' | 'perf' | 'audit'
  | 'chore' | 'docs' | 'test' | 'infra' | 'spike' | 'legacy'
  | 'resume';   // ← NEW (13th)

export const PROPOSAL_KINDS = {
  // …existing 12 unchanged…
  resume: {
    prefix: 'n',
    glyph: '🧭',
    conventionalCommitType: '',
    bump: 'none',
  },
} as const;
```

The reverse map `PROPOSAL_KIND_BY_PREFIX` is derived from `PROPOSAL_KINDS` at module load, so it picks up `'n' → 'resume'` automatically. No second site to keep in sync.

### 3.2 Authoring tool enum (1-line extension)

```ts
// plugins/proposals/src/lib/tools/authoring.tool.ts
kind: z.enum([
  'feat', 'breaking', 'fix', 'refactor', 'perf', 'audit',
  'chore', 'docs', 'test', 'infra', 'spike', 'legacy',
  'resume',   // ← NEW
]).optional(),
```

### 3.3 Scaffold canonical sections for `kind: resume`

The existing `PROPOSAL_CANONICAL_ORDER` covers `feat`/`fix`/etc.; `AUDIT_CANONICAL_ORDER` covers `audit`. We add a third ordering for `resume` — shorter, tuned for handoff docs:

```ts
const RESUME_CANONICAL_ORDER = [
  'goal',
  'context',
  'state at close',
  'what was done',
  'state at close (git)',
  'how to continue',
  'see also',
] as const;

const RESUME_REQUIRED_SECTIONS = [
  'goal',
  'state at close',
  'how to continue',
] as const;
```

This matches what the existing summaries already use (loosely) and formalises it. The 6 migrated files will need their bodies lightly sectioned to satisfy the linter — each gets a 1-paragraph `## Goal`, an `## State at close`, and a `## How to continue` (lifted from their existing "Cómo continuar" / "Punto de continuación" sections). Other prose stays byte-identical.

### 3.4 Bucket README + done/README update

- `docs/proposals/done/resumes/README.md` — short doc explaining the kind, the scaffold, the numbering rule (chronological), and a link to the new kind entry in the glossary. Same shape as `done/feats/README.md` if it exists, else mirrors the pattern from `done/README.md`.
- `docs/proposals/done/README.md` — extended sub-folder table with `resumes/`, and a short "Why this folder lives at `docs/proposals/` (not `docs/mcp-vertex/proposals/`)" note answering the recurring question.

### 3.5 Why `docs/proposals/` and not `docs/mcp-vertex/proposals/`

This is the question this proposal's `done/README.md` update addresses once and for all. The answer (also valid for any consumer of mcp-vertex):

- The CLI default is `docsDir = "docs/mcp-vertex"` (see `packages/core/src/lib/plugins/parse-cli-args.ts` and `DEFAULT_PATH_LAYOUT` in `plugins/proposals/src/lib/contracts/constants/default-path-layout.constant.ts`). A fresh project that runs `bun @mcp-vertex/core --check` with no config gets proposals under `docs/mcp-vertex/proposals/`.
- This repo (`@mcp-vertex/core` itself) sets `"docsDir": "docs"` in `mcp-vertex.config.json` because it **is** the canonical proposals store — there's no point in the extra `mcp-vertex/` sub-folder when the repo IS mcp-vertex.
- A consumer project that adopts mcp-vertex the normal way either keeps the default (`docs/mcp-vertex/proposals/`) or overrides `docsDir` to point wherever they like. The proposals plugin never assumes — `proposal_adopt` reports the existing layout and recommends canonicalisation.

So: **if you're a consumer, you get `docs/mcp-vertex/proposals/`; if you ARE mcp-vertex, you override to `docs/proposals/`.** Both are correct; the proposals plugin supports both.

## Slices

- global_gate: e2e

### S1 — Add kind 'resume' (prefix n) to glossary + authoring tool kind enum + scaffold linter enum

- **Status**: pending
- **Files**: [`plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`](../../plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts), [`plugins/proposals/src/lib/tools/authoring.tool.ts`](../../plugins/proposals/src/lib/tools/authoring.tool.ts), [`plugins/proposals/tests/src/lib/contracts/constants/proposal-glossary.constant.spec.ts`](../../plugins/proposals/tests/src/lib/contracts/constants/proposal-glossary.constant.spec.ts)
- **Command**: `bun run type`
- **Expect**: exit0
- **acceptance**:
  - `PROPOSAL_KINDS` has `'resume'` with `prefix: 'n'`, `glyph: '🧭'`, `conventionalCommitType: ''`, `bump: 'none'`
  - `PROPOSAL_KIND_BY_PREFIX['n']` resolves to `'resume'`
  - `prefixForKind('resume')` returns `'n'`
  - `create_proposal`'s `kind` input schema accepts `'resume'`
  - Existing glossary spec passes with the count updated from 12 to 13
- **Note**: `proposal-scaffold-linter.ts` does NOT need a change — the new prefix is auto-registered via `PROPOSAL_KIND_BY_PREFIX`.

### S2 — Rewrite this proposal as `n00007` with full canonical sections, in `ready/`

- **Status**: pending
- **Files**: [`docs/proposals/ready/n00007-resume-kind-handoff-summaries.md`](../../docs/proposals/ready/n00007-resume-kind-handoff-summaries.md), [`docs/proposals/n00001-resume-kind-cross-session-handoff-summaries.md`](../../docs/proposals/n00001-resume-kind-cross-session-handoff-summaries.md) (delete the auto-created stub at root)
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- **depends_on**: [s1]
- **acceptance**:
  - This proposal lives at `docs/proposals/ready/n00007-...md` with `id: n00007`, `kind: resume`, `status: ready`, all canonical `## Goal / ## Why / ## Why this design / ## Non-goals / ## Architecture / ## Slices / ## Acceptance` sections present and ordered
  - The auto-created stub at `docs/proposals/n00001-...md` is deleted (the `create_proposal` tool wrote it before `kind: resume` existed; it has incomplete frontmatter + missing sections)
  - `bun run lint:proposals` reports `1 file checked, 0 fatal, 0 legacy warnings`

### S3 — Move 6 `n00001-SESION-*.md` to `done/resumes/` with `n00001..n00006` chronological numbering + bucket README

- **Status**: pending
- **Files**:
  - `docs/proposals/n00001-SESION-2026-06-17.md` (move from root)
  - `docs/proposals/done/n00001-SESION-AUTONOMA-2026-06-15.md`
  - `docs/proposals/done/n00001-SESION-OFICINA-2026-06-15.md`
  - `docs/proposals/done/n00001-SESION-2A-RONDA-2026-06-15.md`
  - `docs/proposals/done/n00001-SESION-3A-RONDA-2026-06-16.md`
  - `docs/proposals/done/n00001-SESION-4A-RONDA-2026-06-16.md`
  - `docs/proposals/done/resumes/.gitkeep` (new)
  - `docs/proposals/done/resumes/README.md` (new)
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- **depends_on**: [s2]
- **gate**: e2e
- **acceptance**:
  - All 6 files moved into `docs/proposals/done/resumes/` with new names `n00001-…-autonoma-…md` … `n00006-…-handoff-…md` ordered by `git log --diff-filter=A` first-appeared-at; ties broken by alphabetical slug
  - Each moved file has new YAML frontmatter (id, kind: resume, title, status: done, date, track) prepended to its existing body — the body itself stays byte-identical
  - `docs/proposals/done/resumes/README.md` documents the kind, scaffold, and numbering rule
  - `docs/proposals/done/resumes/.gitkeep` keeps the empty-folder case under git (the 6 files satisfy that already, but the `.gitkeep` is the documented convention from f00001)
  - `bun run lint:proposals` exit0 (each moved file lints as a valid proposal — frontmatter ok, required sections present, body order canonical)

### S4 — Update `docs/proposals/done/README.md` for the new bucket + answer the `docsDir` question

- **Status**: pending
- **Files**: [`docs/proposals/done/README.md`](../../docs/proposals/done/README.md)
- **Command**: `bun run lint:proposals`
- **Expect**: exit0
- **depends_on**: [s3]
- **acceptance**:
  - The "Sub-folders (mirror by kind)" table has a `resumes/` row (prefix `n`, kind `resume`) with the 6 example filenames
  - The "Loose files at `done/` root" carve-out removes `n00001-SESION-*.md` (they ARE proposals now); `AUDITORIA-UNIFICADA-*.md` stays
  - A new "Why this folder lives at `docs/proposals/`, not `docs/mcp-vertex/proposals/`" section explains the `docsDir` default + the override in `mcp-vertex.config.json` of this repo
  - Rule about "only create the sub-folder when the second file of that kind lands" stays valid (6 files > 2)

### S5 — Sync proposals index + validate end-to-end

- **Status**: pending
- **Files**: [`docs/proposals/index.json`](../../docs/proposals/index.json)
- **Command**: `bun run validate`
- **Expect**: exit0
- **depends_on**: [s1, s4]
- **gate**: e2e
- **acceptance**:
  - `bun run type` — exit0
  - `bun run lint` — exit0
  - `bun run test` — exit0 (all existing tests still pass; the 3 changed test files have updated assertions for the new kind)
  - `bun run lint:proposals` — exit0 (the new `n00007` proposal + the 6 moved `n00001..n00006` summaries + the unchanged f00001/f00016 etc. all pass)
  - `docs/proposals/index.json` (regenerated by `sync_proposals`) reflects all 7 new entries (1 in `ready/`, 6 in `done/resumes/`); the 2 entries that previously sat under `done/` (loose `n00001-SESION-*`) are gone

## Acceptance

- [ ] `bun run type` exit0
- [ ] `bun run lint` exit0
- [ ] `bun run test` exit0 (incl. the new `resume kind uses prefix n` test)
- [ ] `bun run lint:proposals` exit0 (the new `n00007` proposal + 6 moved `n00001..n00006` summaries all pass)
- [ ] `docs/proposals/index.json` (regenerated by `sync_proposals`) reflects all 7 new entries

## Risks and mitigations

- **ID collision with the auto-created `n00001` stub at `docs/proposals/` root.** The `create_proposal` tool wrote a stub at root before `kind: resume` existed; it has `id: n00001` and an incomplete body. **Mitigation**: S2 explicitly deletes the stub and creates the properly-numbered `n00007` at `ready/` instead. The stub has no committed state worth preserving.
- **f00023 lock on `proposal-glossary.constant.ts`.** S1 needs that file; f00023 (rename IDs by creation date) is held by the orchestrator with last-heartbeat fresh. **Mitigation**: S1 is delegated to a subagent with its own worktree (`agent/implementation_runner-n00007-s1`), so the lock conflict is contained. The subagent waits for `lock-released` notification if necessary; if f00023's change conflicts with `resume` (it shouldn't — different concerns), the subagent re-runs after f00023 ships.
- **Linter regression.** Adding a 13th kind could break callers that hard-code 12 (the glossary spec asserts `length === 12`). **Mitigation**: the spec is updated to `13` in S1, with a comment explaining why. All other consumers read `PROPOSAL_KINDS` dynamically.
- **Body re-sectioning during migration.** Each moved file needs minimal frontmatter + section edits; risk of typos in the 6 bodies. **Mitigation**: bodies stay byte-identical; only frontmatter is prepended. The 3 `RESUME_REQUIRED_SECTIONS` (`goal`, `state at close`, `how to continue`) are checked for by the linter — if any file lacks them, S3 fails fast with a precise line number and the migration is fixed manually (it's a literal rename + 2-line frontmatter, not a rewrite).

## Notes

- [`f00016`](../feats/f00016-feat-proposal-state-machine-kinds-scaffolds-and-recovery.md) — the predecessor that defined the 7 statuses and the original 12 kinds
- [`f00001`](../feats/f00001-done-folder-mirrors-kinds-audits-feats-fixes-sub-folders-inside-done.md) — the convention this proposal extends (sub-folders inside `done/` mirror active kinds)
- [`AGENTS.md`](../../AGENTS.md) — repo rules: definition of done (`bun run validate` green), Conventional Commits, durable writes via `withFileMutex`
- [`plugins/proposals/README.md`](../../plugins/proposals/README.md) — the proposals plugin (workflow, `auto_work`, `create_proposal`, `close_slice`)
- The 6 summaries this proposal migrates, in their new home:
  [`docs/proposals/done/resumes/`](../../docs/proposals/done/resumes/) (after S3 lands)
