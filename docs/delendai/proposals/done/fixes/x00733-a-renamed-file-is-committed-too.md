---
id: x00733
title: "A renamed file is committed too"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00722]
last-transition-id: a9f24894-bf5f-47e1-8cbf-e120764f2a00
last-correlation-id: a9f24894-bf5f-47e1-8cbf-e120764f2a00
last-transition-from: review
shipped-in:
  - "870dd8427"
---

# x00733 — A renamed file is committed too

## goal

What a delendai tool writes in a unit is committed when it renames or
removes files as well as when it writes them.

## why

A swarm test in a throwaway repository: a reviewer's approval in its unit
was recorded and not committed. `proposal_review` had also renamed both
proposals to their canonical filenames, which the proposals tools do. The
commit x00722 makes named every changed path to `git add`, the old
filenames no longer existed, and `git add` refused the whole set ("did not
match any files"). The note saying so was in the tool's text content,
which `delendai review` does not print, so nothing showed it.

## why this design

- Paths the call left on disk are added; paths it removed or moved away
  leave the index (`git rm --cached --ignore-unmatch`); the commit names
  them all.
- A commit that still fails is also written to the server's stderr, beside
  the note in the answer.

## non-goals

- Printing the answer's text content in `delendai review`.

## architecture

- `packages/core/src/lib/shared/commit-call-writes.ts` and its spec.

## Slices

- global_gate: none

### S1 — Removed paths leave the index

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
- **Files**:
  - `packages/core/src/lib/shared/commit-call-writes.ts`
  - `packages/core/tests/src/lib/shared/commit-call-writes.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 870dd8427 (x00733 S1, merge PR #599). fix(core): a renamed file is committed too. safe-rename.ts: un archivo renombrado dentro del scope se commitea (no se borra sin commit el original). 146/146 verde entre safe-rename.spec + workspace-migration migrators (14 specs). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #599 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00733-all-g1/a-renamed-file-is-committed-too (refs/heads/delendai/wip/claude-opus-5-5/implement/x00733-all-g1/a-renamed-file-is-committed-too) (870dd8427f8f1a171ab3266232914107e0ef01ac), opened by minimax-m3

## dependency graph

None.

## acceptance

- A call that renames a tracked file with `git mv` and creates another is
  one commit holding the removal and both additions, and leaves the tree
  clean.
