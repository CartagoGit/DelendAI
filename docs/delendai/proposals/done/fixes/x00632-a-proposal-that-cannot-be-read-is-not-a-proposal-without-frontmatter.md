---
id: x00632
title: "A proposal that cannot be read is not a proposal without frontmatter"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-24
shipped-in: ["2e443b638"]
last-transition-id: 2a71dcaf-5f53-4574-bf40-55bdaec758ab
last-correlation-id: 2a71dcaf-5f53-4574-bf40-55bdaec758ab
last-transition-from: review
---

# x00632 — A proposal that cannot be read is not a proposal without frontmatter

## goal

Reading a proposal file gives one of four answers, and each is handled
as what it is: read, missing, unreadable, or (once read) invalid.

## why

Reported by an external review on 2026-09-24 and confirmed in the code.
`readProposalText` turned every read failure into an empty string, and
the callers then classified that string:

- `readProposalFile` returned `no_frontmatter`, so an `EACCES` or `EIO`
  on a proposal was quarantined as a malformed proposal;
- the folder reconciler did the same for new-system files;
- the duplicate-id scan skipped the file, so an unreadable duplicate was
  reported as "no duplicates";
- `reconcileAndArchiveCompletedRootProposals` said in a comment that "a
  real read failure throws and propagates", and then caught every error
  from the directory listing and returned.

## why this design

- `readProposalText` returns `read`, `missing` (ENOENT) or `unreadable`
  (anything else), and every caller decides per answer.
- The index scan turns an unreadable file into a warning of the sync,
  never a quarantine entry.
- The folder reconciler leaves an unreadable file where it is.
- The duplicate-id scan fails on an unreadable file, since it could be
  the duplicate; the sync records that as "duplicate-id check
  incomplete" rather than failing the whole sync.
- The legacy archival pass lets a real directory or file read failure
  propagate, as its contract says; a missing directory is still empty.

## non-goals

- Changing what counts as invalid frontmatter.

## Slices

- global_gate: none

### S1 — Missing, unreadable, empty and invalid are four answers

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/unreadable-proposal.spec.ts`
- **Files**: `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`,
  `plugins/proposals/tests/src/lib/proposals/unreadable-proposal.spec.ts`
- With a proposal file at mode 000: the sync reports it as unreadable and
  quarantines nothing as `no_frontmatter`; the duplicate-id scan fails;
  the archival pass fails on an unreadable directory and still treats a
  missing one as empty. Three of the four cases fail on the old code.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué df0b67e1a (atomic) y shipped-in 2e443b638. readProposalText devuelve read|missing|unreadable; cada caller decide. Acceptance: no read failure se registra como missing frontmatter (test 1); duplicate-id scan falla en unreadable (test 2); legacy archival pass falla en unreadable directory (test 3); missing directory tratado como empty (test 4). Gate npx vitest run plugins/proposals/tests/src/lib/proposals/unreadable-proposal.spec.ts = 4/4 passed, exit 0. Sin cambios fuera de alcance.
- review-attribution: claude-opus-5-5 from commit 2e443b6381b3 names refs/heads/delendai/wip/claude-opus-5-5/x00632-S1-g1/a-proposal-that-cannot-be-read-is-not-one-without-frontmatter (2e443b6381b38143368ee4318a21c3dfa94c7a34), opened by minimax-3
## acceptance

- No read failure is ever recorded as missing frontmatter.
- A check that could not read everything says so.
